import type { RunStatus } from '../domain/types.js';
import type { Db } from './database.js';

export interface Run {
  id: number;
  watcherId: number | null;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  foundCount: number;
  newCount: number;
  detailsFetched: number;
  errorMessage: string | null;
}

export interface RunOutcome {
  status: Exclude<RunStatus, 'running'>;
  foundCount?: number;
  newCount?: number;
  detailsFetched?: number;
  errorMessage?: string | null;
}

const SELECT = `SELECT id, watcher_id AS watcherId, started_at AS startedAt, finished_at AS finishedAt, status,
  found_count AS foundCount, new_count AS newCount, details_fetched AS detailsFetched,
  error_message AS errorMessage FROM runs`;

export class RunRepo {
  constructor(private readonly db: Db) {}

  start(watcherId: number, now = new Date().toISOString()): number {
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO runs (watcher_id, started_at, status) VALUES (?, ?, 'running')")
      .run(watcherId, now);
    return Number(lastInsertRowid);
  }

  finish(id: number, o: RunOutcome, now = new Date().toISOString()): void {
    this.db
      .prepare(
        `UPDATE runs SET finished_at = :now, status = :status, found_count = :found, new_count = :new,
           details_fetched = :details, error_message = :error WHERE id = :id`,
      )
      .run({
        id,
        now,
        status: o.status,
        found: o.foundCount ?? 0,
        new: o.newCount ?? 0,
        details: o.detailsFetched ?? 0,
        error: o.errorMessage ?? null,
      });
  }

  list(opts: { watcherId?: number; limit?: number } = {}): Run[] {
    return this.db
      .prepare(`${SELECT} WHERE (:w IS NULL OR watcher_id = :w) ORDER BY started_at DESC, id DESC LIMIT :limit`)
      .all({ w: opts.watcherId ?? null, limit: opts.limit ?? 50 }) as unknown as Run[];
  }

  lastFinished(watcherId: number): Run | null {
    return (
      (this.db
        .prepare(`${SELECT} WHERE watcher_id = ? AND status <> 'running' ORDER BY started_at DESC, id DESC LIMIT 1`)
        .get(watcherId) as unknown as Run | undefined) ?? null
    );
  }

  countStartedSince(since: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM runs WHERE started_at >= ?').get(since) as { n: number }).n;
  }

  /** Fin de la última corrida de cualquier búsqueda (para respetar la pausa entre corridas). */
  lastFinishedAt(): string | null {
    const row = this.db.prepare('SELECT MAX(finished_at) AS t FROM runs').get() as { t: string | null };
    return row.t;
  }

  /** Corridas que quedaron "running" si la app se cerró a la mitad. */
  failStale(now = new Date().toISOString()): void {
    this.db
      .prepare("UPDATE runs SET status = 'error', finished_at = ?, error_message = 'interrumpida' WHERE status = 'running'")
      .run(now);
  }
}
