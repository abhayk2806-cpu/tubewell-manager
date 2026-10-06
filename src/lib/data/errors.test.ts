import { describe, expect, it } from 'vitest';
import { DataError, toDataError } from './errors';

describe('toDataError', () => {
  it.each([
    ['check violation', { code: '23514', message: 'violates check constraint' }, undefined, 'constraint'],
    ['not null', { code: '23502', message: 'null value' }, undefined, 'constraint'],
    ['unique', { code: '23505', message: 'duplicate key' }, undefined, 'constraint'],
    ['foreign key', { code: '23503', message: 'fk' }, undefined, 'constraint'],
    ['string too long', { code: '22001', message: 'too long' }, undefined, 'constraint'],
    ['RLS / privilege', { code: '42501', message: 'permission denied' }, undefined, 'permission'],
    ['JWT expired', { code: 'PGRST301', message: 'JWT expired' }, 401, 'permission'],
    ['HTTP 401 without a code', { code: '', message: 'unauthorized' }, 401, 'permission'],
    ['HTTP 403 without a code', { message: 'forbidden' }, 403, 'permission'],
    ['single() found no row', { code: 'PGRST116', message: '0 rows' }, 406, 'not_found'],
    ['no response (status 0)', { code: '', message: 'TypeError: Failed to fetch' }, 0, 'network'],
    ['fetch failure message', { message: 'fetch failed' }, undefined, 'network'],
    ['other Postgres error', { code: 'XX000', message: 'internal' }, 500, 'unknown'],
  ])('%s', (_label, error, status, kind) => {
    expect(toDataError(error, status).kind).toBe(kind);
  });

  it('keeps the original code and message', () => {
    const e = toDataError({ code: '23514', message: 'new row violates check constraint "farmers_name_not_blank"' });
    expect(e).toBeInstanceOf(DataError);
    expect(e.code).toBe('23514');
    expect(e.message).toContain('farmers_name_not_blank');
  });

  it('maps a thrown TypeError from fetch to network, passes a DataError through, and handles non-objects', () => {
    expect(toDataError(new TypeError('Failed to fetch')).kind).toBe('network');
    const original = new DataError('not_found', 'no_rows', 'x');
    expect(toDataError(original)).toBe(original);
    const fromString = toDataError('boom');
    expect([fromString.kind, fromString.code, fromString.message]).toEqual(['unknown', null, 'boom']);
  });
});
