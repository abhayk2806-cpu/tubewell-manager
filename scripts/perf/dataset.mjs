// Fictional datasets for the measurement, made with the Phase 9 verification generator's seeded
// helpers (src/lib/verification/generate.ts, loaded through Vite so TypeScript and "@/" resolve).
// Same seed, same rows. Shape follows the Phase 9 scale scenario: farmers, usage, payments.
import { createServer } from 'vite';

const SIZES = {
  // 30 rows: 3 farmers, 15 usage entries, 12 payments.
  small: { farmers: 3, usage: 15, payments: 12 },
  // 3,000 rows: 30 farmers, 2,000 usage entries (two pages), 970 payments.
  large: { farmers: 30, usage: 2000, payments: 970 },
};

const AUDIT = { created_by: null, updated_by: null, deleted_by: null };
const uuid = (prefix, i) => `${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`;

export async function makeDataset(size) {
  const shape = SIZES[size];
  if (!shape) throw new Error(`unknown dataset ${size}`);
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { rngFor, int, pick } = await vite.ssrLoadModule('/src/lib/verification/generate.ts');
    const rng = rngFor(size === 'small' ? 30 : 3000);
    const farmers = Array.from({ length: shape.farmers }, (_, i) => ({
      id: uuid('0000f000', i),
      name: `Kisan ${String(i + 1).padStart(2, '0')}`,
      mobile: null,
      notes: null,
      is_disabled: shape.farmers > 3 && i % 10 === 7,
      created_at: '2025-10-01T00:00:00Z',
      updated_at: '2025-10-01T00:00:00Z',
      deleted_at: shape.farmers > 3 && i % 10 === 9 ? '2026-09-01T00:00:00Z' : null,
      ...AUDIT,
    }));
    const start = Date.parse('2025-11-01T00:00:00Z');
    const when = () => new Date(start + int(rng, 0, 364 * 24 * 60) * 60_000).toISOString();
    const usage_entries = Array.from({ length: shape.usage }, (_, i) => {
      const hours = int(rng, 0, 12);
      const minutes = hours === 0 ? int(rng, 1, 59) : int(rng, 0, 59);
      return {
        id: uuid('0000e000', i),
        farmer_id: pick(rng, farmers).id,
        used_at: when(),
        hours,
        minutes,
        total_minutes: hours * 60 + minutes,
        rate_paise: pick(rng, [10000, 9999, 12345, 15050]),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: rng() < 0.05 ? '2026-10-01T00:00:00Z' : null,
        ...AUDIT,
      };
    });
    const payments = Array.from({ length: shape.payments }, (_, i) => ({
      id: uuid('0000d000', i),
      farmer_id: pick(rng, farmers).id,
      paid_at: when(),
      amount_paise: int(rng, 100, 200_000),
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      deleted_at: rng() < 0.05 ? '2026-10-01T00:00:00Z' : null,
      ...AUDIT,
    }));
    return { farmers, usage_entries, payments };
  } finally {
    await vite.close();
  }
}
