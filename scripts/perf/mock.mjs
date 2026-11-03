// A mock of the two Supabase endpoints the app uses (auth and PostgREST), answered inside the
// browser through DevTools request interception. Fictional rows only; nothing leaves the machine.
import { randomUUID } from 'node:crypto';

export const MOCK_ORIGIN = 'https://perf-mock.supabase.test';
/** supabase-js stores the session under sb-<first host label>-auth-token. */
export const STORAGE_KEY = 'sb-perf-mock-auth-token';
const TABLES = ['farmers', 'usage_entries', 'payments'];

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A fake signed-in session for a fictional owner; it expires in a day, so no token refresh happens. */
export function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: '00000000-0000-4000-8000-00000000aaaa',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.test',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: now + 86400, iat: now })}.perf`;
  return { access_token: accessToken, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'perf-refresh', user };
}

export function createMock(dataset) {
  const tables = Object.fromEntries(TABLES.map((t) => [t, dataset[t].map((r) => ({ ...r }))]));
  const sorted = (t) => [...tables[t]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    /** Answers one request: { status, headers, body } (body is a string). */
    handle({ method, url, headers, postData }) {
      const u = new URL(url);
      const origin = headers.Origin ?? headers.origin ?? '*';
      const cors = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': headers['Access-Control-Request-Headers'] ?? headers['access-control-request-headers'] ?? 'authorization,apikey,content-type,prefer,accept-profile,content-profile,x-client-info',
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Type': 'application/json',
      };
      if (method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
      if (u.pathname.startsWith('/auth/v1/')) return { status: 200, headers: cors, body: JSON.stringify(fakeSession().user) };

      const table = u.pathname.replace('/rest/v1/', '');
      if (!TABLES.includes(table)) return { status: 404, headers: cors, body: JSON.stringify({ message: 'no table' }) };
      const prefer = headers.Prefer ?? headers.prefer ?? '';

      if (method === 'GET') {
        const all = sorted(table);
        const offset = Number(u.searchParams.get('offset') ?? 0);
        const limit = Number(u.searchParams.get('limit') ?? all.length);
        const page = all.slice(offset, offset + limit);
        const total = prefer.includes('count=exact') ? String(all.length) : '*';
        const range = page.length === 0 ? `*/${total}` : `${offset}-${offset + page.length - 1}/${total}`;
        return { status: 200, headers: { ...cors, 'Content-Range': range }, body: JSON.stringify(page) };
      }

      const single = (headers.Accept ?? headers.accept ?? '').includes('vnd.pgrst.object');
      const now = new Date().toISOString();
      if (method === 'POST') {
        const input = JSON.parse(postData ?? '{}');
        const row = { id: randomUUID(), created_at: now, updated_at: now, deleted_at: null, created_by: null, updated_by: null, deleted_by: null, ...input };
        if (table === 'usage_entries') row.total_minutes = Number(row.hours) * 60 + Number(row.minutes);
        if (table === 'payments') row.note = row.note ?? null;
        tables[table].push(row);
        return { status: 201, headers: cors, body: JSON.stringify(single ? row : [row]) };
      }
      if (method === 'PATCH') {
        const id = (u.searchParams.get('id') ?? '').replace(/^eq\./, '');
        const row = tables[table].find((r) => r.id === id);
        if (row === undefined) return { status: 406, headers: cors, body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) };
        Object.assign(row, JSON.parse(postData ?? '{}'), { updated_at: now });
        return { status: 200, headers: cors, body: JSON.stringify(single ? row : [row]) };
      }
      return { status: 405, headers: cors, body: '{}' };
    },
  };
}
