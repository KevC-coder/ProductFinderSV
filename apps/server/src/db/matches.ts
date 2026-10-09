import { MATCH_STATUSES, type MatchSort, type MatchStatus } from '../domain/types.js';
import type { Evaluation } from '../matcher/evaluate.js';
import type { Db } from './database.js';
import type { Listing } from '../scraper/parsers/listing.js';
import { listingFromRow, titleKey, type StoredListing } from './listings.js';

type Row = Record<string, unknown>;

export interface MatchView {
  id: number;
  watcherId: number;
  score: number;
  isIdealPrice: boolean;
  matchedKeywords: string[];
  status: MatchStatus;
  /** Id de otra publicación igual del mismo vendedor (republicación). */
  duplicateOf: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: StoredListing;
}

export interface MatchFilter {
  watcherId?: number;
  status?: MatchStatus[];
  minPrice?: number;
  maxPrice?: number;
  includeDuplicates?: boolean;
  sort?: MatchSort;
  limit?: number;
  offset?: number;
}

const SORTS: Record<MatchSort, string> = {
  score: 'm.score DESC, m.created_at DESC',
  newest: 'COALESCE(l.listed_at, m.created_at) DESC',
  price: 'l.price ASC',
};

// Las columnas de listings vienen con su nombre original; las de matches con prefijo m_.
const SELECT = `
  SELECT l.*, m.id AS m_id, m.watcher_id AS m_watcher_id, m.score AS m_score,
         m.is_ideal_price AS m_is_ideal_price, m.matched_keywords AS m_matched_keywords,
         m.status AS m_status, m.duplicate_of AS m_duplicate_of, m.notified_at AS m_notified_at,
         m.created_at AS m_created_at, m.updated_at AS m_updated_at
  FROM matches m JOIN listings l ON l.id = m.listing_id`;

const fromRow = (r: Row): MatchView => ({
  id: r.m_id as number,
  watcherId: r.m_watcher_id as number,
  score: r.m_score as number,
  isIdealPrice: r.m_is_ideal_price === 1,
  matchedKeywords: JSON.parse(r.m_matched_keywords as string),
  status: r.m_status as MatchStatus,
  duplicateOf: r.m_duplicate_of as string | null,
  notifiedAt: r.m_notified_at as string | null,
  createdAt: r.m_created_at as string,
  updatedAt: r.m_updated_at as string,
  listing: listingFromRow(r),
});

export class MatchRepo {
  constructor(private readonly db: Db) {}

  /** Crea o actualiza el match. Un match descartado por el usuario se mantiene descartado. */
  upsert(
    watcherId: number,
    listingId: string,
    ev: Evaluation,
    opts: { duplicateOf?: string | null; now?: string } = {},
  ): { id: number; isNew: boolean } {
    const now = opts.now ?? new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id FROM matches WHERE watcher_id = ? AND listing_id = ?')
      .get(watcherId, listingId) as { id: number } | undefined;
    const params = {
      score: ev.score,
      ideal: ev.isIdealPrice ? 1 : 0,
      keywords: JSON.stringify(ev.matchedKeywords),
      now,
    };
    if (existing) {
      this.db
        .prepare(
          `UPDATE matches SET score = :score, is_ideal_price = :ideal, matched_keywords = :keywords,
             updated_at = :now WHERE id = :id`,
        )
        .run({ ...params, id: existing.id });
      return { id: existing.id, isNew: false };
    }
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO matches (watcher_id, listing_id, score, is_ideal_price, matched_keywords,
           duplicate_of, created_at, updated_at)
         VALUES (:watcher_id, :listing_id, :score, :ideal, :keywords, :duplicate_of, :now, :now)`,
      )
      .run({ ...params, watcher_id: watcherId, listing_id: listingId, duplicate_of: opts.duplicateOf ?? null });
    return { id: Number(lastInsertRowid), isNew: true };
  }

  /** Busca un match previo del mismo watcher que sea la misma publicación republicada. */
  findDuplicate(watcherId: number, listing: Listing): string | null {
    const key = titleKey(listing.title);
    if (!listing.sellerName || !key || listing.price == null) return null;
    const row = this.db
      .prepare(
        `SELECT l.id FROM matches m JOIN listings l ON l.id = m.listing_id
         WHERE m.watcher_id = ? AND l.id <> ? AND m.duplicate_of IS NULL
           AND l.seller_name = ? AND l.title_key = ? AND l.price = ?
         ORDER BY m.created_at LIMIT 1`,
      )
      .get(watcherId, listing.id, listing.sellerName, key, listing.price) as { id: string } | undefined;
    return row?.id ?? null;
  }

  get(id: number): MatchView | null {
    const row = this.db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  list(f: MatchFilter = {}): { items: MatchView[]; total: number } {
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (f.watcherId != null) {
      where.push('m.watcher_id = :watcher_id');
      params.watcher_id = f.watcherId;
    }
    if (f.status?.length) {
      where.push(`m.status IN (${f.status.map((_, i) => `:status${i}`).join(', ')})`);
      f.status.forEach((s, i) => (params[`status${i}`] = s));
    } else {
      where.push("m.status <> 'dismissed'");
    }
    if (f.minPrice != null) {
      where.push('l.price >= :min_price');
      params.min_price = f.minPrice;
    }
    if (f.maxPrice != null) {
      where.push('l.price <= :max_price');
      params.max_price = f.maxPrice;
    }
    if (!f.includeDuplicates) where.push('m.duplicate_of IS NULL');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM matches m JOIN listings l ON l.id = m.listing_id ${whereSql}`).get(
        params,
      ) as { n: number }
    ).n;
    const rows = this.db
      .prepare(`${SELECT} ${whereSql} ORDER BY ${SORTS[f.sort ?? 'score']} LIMIT :limit OFFSET :offset`)
      .all({ ...params, limit: f.limit ?? 50, offset: f.offset ?? 0 }) as Row[];
    return { items: rows.map(fromRow), total };
  }

  /** Quita un match que el usuario todavía no tocó (estado "new"); respeta favoritos y vistos. */
  removeUnreviewed(watcherId: number, listingId: string): boolean {
    const { changes } = this.db
      .prepare("DELETE FROM matches WHERE watcher_id = ? AND listing_id = ? AND status = 'new'")
      .run(watcherId, listingId);
    return Number(changes) > 0;
  }

  setStatus(id: number, status: MatchStatus, now = new Date().toISOString()): MatchView | null {
    this.db.prepare('UPDATE matches SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    return this.get(id);
  }

  countByStatus(watcherId?: number): Record<MatchStatus, number> {
    // Dos consultas separadas: con "(:w IS NULL OR watcher_id = :w)" SQLite no usaría el índice.
    const rows = (
      watcherId == null
        ? this.db.prepare('SELECT status, COUNT(*) AS n FROM matches WHERE duplicate_of IS NULL GROUP BY status').all()
        : this.db
            .prepare(
              'SELECT status, COUNT(*) AS n FROM matches WHERE watcher_id = ? AND duplicate_of IS NULL GROUP BY status',
            )
            .all(watcherId)
    ) as { status: MatchStatus; n: number }[];
    const out = Object.fromEntries(MATCH_STATUSES.map((s) => [s, 0])) as Record<MatchStatus, number>;
    for (const r of rows) out[r.status] = r.n;
    return out;
  }
}
