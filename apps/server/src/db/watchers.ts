import type { Watcher, WatcherInput } from '../domain/types.js';
import type { Db } from './database.js';

type Row = Record<string, unknown>;

const fromRow = (r: Row): Watcher => ({
  id: r.id as number,
  name: r.name as string,
  query: r.query as string,
  mustKeywords: JSON.parse(r.must_keywords as string),
  mustMode: r.must_mode as Watcher['mustMode'],
  bonusKeywords: JSON.parse(r.bonus_keywords as string),
  excludeKeywords: JSON.parse(r.exclude_keywords as string),
  searchDescription: r.search_description === 1,
  minPrice: r.min_price as number | null,
  maxPrice: r.max_price as number | null,
  idealPrice: r.ideal_price as number | null,
  locationSlug: r.location_slug as string | null,
  radiusKm: r.radius_km as number | null,
  conditions: JSON.parse(r.conditions as string),
  maxAgeHours: r.max_age_hours as number | null,
  runsPerDay: r.runs_per_day as number,
  windowStart: r.window_start as string,
  windowEnd: r.window_end as string,
  maxDetails: r.max_details as number,
  active: r.active === 1,
  nextRunAt: r.next_run_at as string | null,
  consecutiveFailures: r.consecutive_failures as number,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toParams = (w: WatcherInput) => ({
  name: w.name,
  query: w.query,
  must_keywords: JSON.stringify(w.mustKeywords),
  must_mode: w.mustMode,
  bonus_keywords: JSON.stringify(w.bonusKeywords),
  exclude_keywords: JSON.stringify(w.excludeKeywords),
  search_description: w.searchDescription ? 1 : 0,
  min_price: w.minPrice,
  max_price: w.maxPrice,
  ideal_price: w.idealPrice,
  location_slug: w.locationSlug,
  radius_km: w.radiusKm,
  conditions: JSON.stringify(w.conditions),
  max_age_hours: w.maxAgeHours,
  runs_per_day: w.runsPerDay,
  window_start: w.windowStart,
  window_end: w.windowEnd,
  max_details: w.maxDetails,
  active: w.active ? 1 : 0,
});

const COLUMNS = Object.keys(toParams({} as WatcherInput));

export class WatcherRepo {
  constructor(private readonly db: Db) {}

  list(): Watcher[] {
    return (this.db.prepare('SELECT * FROM watchers ORDER BY id').all() as Row[]).map(fromRow);
  }

  get(id: number): Watcher | null {
    const row = this.db.prepare('SELECT * FROM watchers WHERE id = ?').get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  create(input: WatcherInput, now = new Date().toISOString()): Watcher {
    const sql = `INSERT INTO watchers (${COLUMNS.join(', ')}, created_at, updated_at)
                 VALUES (${COLUMNS.map((c) => `:${c}`).join(', ')}, :now, :now)`;
    const { lastInsertRowid } = this.db.prepare(sql).run({ ...toParams(input), now });
    return this.get(Number(lastInsertRowid))!;
  }

  /** Búsquedas activas cuya próxima corrida ya llegó, de la más atrasada a la más reciente. */
  due(now: string): Watcher[] {
    return (
      this.db
        .prepare('SELECT * FROM watchers WHERE active = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at')
        .all(now) as Row[]
    ).map(fromRow);
  }

  /** La próxima corrida programada entre las búsquedas activas. */
  nextScheduled(): { watcherId: number; name: string; at: string } | null {
    const row = this.db
      .prepare(
        `SELECT id, name, next_run_at FROM watchers
         WHERE active = 1 AND next_run_at IS NOT NULL ORDER BY next_run_at LIMIT 1`,
      )
      .get() as { id: number; name: string; next_run_at: string } | undefined;
    return row ? { watcherId: row.id, name: row.name, at: row.next_run_at } : null;
  }

  countActive(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM watchers WHERE active = 1').get() as { n: number }).n;
  }

  setSchedule(id: number, nextRunAt: string | null, consecutiveFailures?: number): void {
    this.db
      .prepare(
        `UPDATE watchers SET next_run_at = :next,
           consecutive_failures = COALESCE(:failures, consecutive_failures) WHERE id = :id`,
      )
      .run({ id, next: nextRunAt, failures: consecutiveFailures ?? null });
  }

  update(id: number, patch: Partial<WatcherInput>, now = new Date().toISOString()): Watcher | null {
    const current = this.get(id);
    if (!current) return null;
    const merged = { ...current, ...patch };
    const sql = `UPDATE watchers SET ${COLUMNS.map((c) => `${c} = :${c}`).join(', ')}, updated_at = :now
                 WHERE id = :id`;
    this.db.prepare(sql).run({ ...toParams(merged), now, id });
    return this.get(id);
  }

  delete(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM watchers WHERE id = ?').run(id).changes) > 0;
  }
}
