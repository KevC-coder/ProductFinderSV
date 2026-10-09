import { EventEmitter } from 'node:events';
import type { Store } from '../db/store.js';
import type { Settings } from '../db/settings.js';
import { SCHEDULE_FIELDS, type SessionState, type Watcher, type WatcherInput } from '../domain/types.js';
import { BrowserQueue } from '../runner/browser-queue.js';
import { runWatcher, type RunSummary } from '../runner/run-watcher.js';
import type { Scraper } from '../scraper/scraper.js';
import { computeBackoff, computeNextRun, type Random } from './schedule.js';

export type BlockedReason =
  | 'disabled' // el usuario apagó el bot
  | 'logged_out' // falta iniciar sesión en Facebook
  | 'paused' // pausa automática tras un checkpoint
  | 'rate_limit' // se alcanzó el tope de corridas por hora
  | 'cooldown' // pausa mínima entre corridas
  | 'busy'; // el navegador está ocupado

export interface BotStatus {
  sessionState: Settings['sessionState'];
  schedulerEnabled: boolean;
  pausedUntil: string | null;
  blockedReason: BlockedReason | null;
  runsLastHour: number;
  maxRunsPerHour: number;
  /** Búsqueda que se está ejecutando ahora mismo, si hay una. */
  searchingWatcherId: number | null;
  /** Hay una ventana de inicio de sesión de Facebook abierta. */
  loggingIn: boolean;
  nextRun: { watcherId: number; name: string; at: string } | null;
}

export interface BotEvents {
  'run:started': [{ watcherId: number }];
  'run:finished': [RunSummary];
  'session:changed': [SessionState];
}

export interface BotOptions {
  queue?: BrowserQueue;
  now?: () => Date;
  random?: Random;
  /** Cada cuánto revisa si hay búsquedas pendientes. */
  tickMs?: number;
}

const HOUR = 3_600_000;
// Etiquetas de la cola: detalle interno del Bot (hacia afuera se exponen campos con tipo).
const WATCHER_JOB_PREFIX = 'watcher:';
const watcherJob = (id: number) => `${WATCHER_JOB_PREFIX}${id}`;
const LOGIN_JOB = 'login';

/**
 * Orquesta todo lo que usa el navegador: corridas programadas, "probar ahora" y login.
 * Las corridas pasan por una cola serial, así nunca hay dos navegadores a la vez.
 */
export class Bot extends EventEmitter<BotEvents> {
  readonly queue: BrowserQueue;
  private readonly now: () => Date;
  private readonly random: Random;
  private readonly tickMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: Store,
    private readonly scraper: Scraper,
    opts: BotOptions = {},
  ) {
    super();
    this.queue = opts.queue ?? new BrowserQueue();
    this.now = opts.now ?? (() => new Date());
    this.random = opts.random ?? Math.random;
    this.tickMs = opts.tickMs ?? 15_000;
  }

  /** Programa las búsquedas activas que aún no tienen hora y arranca el ciclo. */
  start(): void {
    for (const w of this.store.watchers.list()) {
      if (w.active && !w.nextRunAt) this.scheduleFirst(w);
    }
    const loop = () => {
      void this.tick()
        .catch(() => {})
        .finally(() => {
          if (this.timer) this.timer = setTimeout(loop, this.tickMs);
        });
    };
    this.timer = setTimeout(loop, 1000);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Motivo por el que ahora mismo no se puede iniciar una corrida automática (null = se puede). */
  blockedReason(runsLastHour = this.runsLastHour()): BlockedReason | null {
    const s = this.store.settings.all();
    const now = this.now();
    if (!s.schedulerEnabled) return 'disabled';
    if (s.sessionState === 'logged_out') return 'logged_out';
    if (s.pausedUntil && Date.parse(s.pausedUntil) > now.getTime()) return 'paused';
    if (runsLastHour >= s.maxRunsPerHour) return 'rate_limit';
    const last = this.store.runs.lastFinishedAt();
    if (last && Date.parse(last) + s.minGapSeconds * 1000 > now.getTime()) return 'cooldown';
    if (this.isBusy()) return 'busy';
    return null;
  }

  /**
   * Revisa si toca correr alguna búsqueda e inicia como máximo una.
   * Devuelve la promesa de la corrida iniciada (útil en tests) o el motivo del bloqueo.
   */
  async tick(): Promise<{ started: Promise<RunSummary> } | { blocked: BlockedReason | 'nothing_due' }> {
    // Mientras una corrida dura (minutos), no hace falta consultar la base en cada ciclo.
    if (this.isBusy()) return { blocked: 'busy' };
    const blocked = this.blockedReason();
    if (blocked) return { blocked };
    const [due] = this.store.watchers.due(this.now().toISOString());
    if (!due) return { blocked: 'nothing_due' };
    return { started: this.enqueueRun(due) };
  }

  /** "Probar ahora": ignora horario y límites (es una acción explícita del usuario), pero usa la cola. */
  runNow(watcherId: number): Promise<RunSummary> | null {
    const w = this.store.watchers.get(watcherId);
    if (!w || this.queue.has(watcherJob(w.id))) return null;
    return this.enqueueRun(w);
  }

  isQueued(watcherId: number): boolean {
    return this.queue.has(watcherJob(watcherId));
  }

  /** Abre la ventana de login. Devuelve null si ya hay una abierta. */
  login(): Promise<boolean> | null {
    if (this.queue.has(LOGIN_JOB)) return null;
    return this.queue.run(LOGIN_JOB, async () => {
      const ok = await this.scraper.login();
      const state = ok ? 'connected' : 'logged_out';
      this.store.settings.set({ sessionState: state, ...(ok ? { pausedUntil: null } : {}) });
      this.emit('session:changed', state);
      return ok;
    });
  }

  /** Quita la pausa automática por checkpoint (cuando el usuario ya lo resolvió). */
  resume(): void {
    this.store.settings.set({ pausedUntil: null });
  }

  /** Llamar al crear/editar una búsqueda: recalcula su horario si cambió algo relevante. */
  onWatcherSaved(w: Watcher, patch?: Partial<WatcherInput>): void {
    if (!w.active) {
      this.store.watchers.setSchedule(w.id, null, 0);
      return;
    }
    const scheduleChanged = !patch || SCHEDULE_FIELDS.some((f) => f in patch);
    if (scheduleChanged || !w.nextRunAt) this.scheduleFirst(w);
  }

  status(): BotStatus {
    const s = this.store.settings.all();
    const runsLastHour = this.runsLastHour();
    const active = this.queue.status().active;
    return {
      sessionState: s.sessionState,
      schedulerEnabled: s.schedulerEnabled,
      pausedUntil: s.pausedUntil,
      blockedReason: this.blockedReason(runsLastHour),
      runsLastHour,
      maxRunsPerHour: s.maxRunsPerHour,
      searchingWatcherId: active?.startsWith(WATCHER_JOB_PREFIX) ? Number(active.slice(WATCHER_JOB_PREFIX.length)) : null,
      loggingIn: active === LOGIN_JOB,
      nextRun: this.store.watchers.nextScheduled(),
    };
  }

  // -------------------------------------------------------------------------------------

  private isBusy(): boolean {
    const q = this.queue.status();
    return q.active !== null || q.pending.length > 0;
  }

  private runsLastHour(): number {
    return this.store.runs.countStartedSince(new Date(this.now().getTime() - HOUR).toISOString());
  }

  private scheduleFirst(w: Watcher): void {
    const next = computeNextRun(w, this.now(), this.store.settings.all(), this.random, { first: true });
    this.store.watchers.setSchedule(w.id, next.toISOString(), 0);
  }

  private enqueueRun(w: Watcher): Promise<RunSummary> {
    return this.queue.run(watcherJob(w.id), async () => {
      // Releer por si el usuario la editó mientras esperaba en la cola.
      const watcher = this.store.watchers.get(w.id) ?? w;
      this.emit('run:started', { watcherId: watcher.id });
      const summary = await runWatcher(this.store, this.scraper, watcher, { now: this.now });
      this.afterRun(watcher, summary);
      this.emit('run:finished', summary);
      return summary;
    });
  }

  private afterRun(w: Watcher, summary: RunSummary): void {
    const settings = this.store.settings.all();
    const now = this.now();
    const current = this.store.watchers.get(w.id);
    if (!current) return; // la borraron mientras corría

    switch (summary.status) {
      case 'ok': {
        const next = current.active ? computeNextRun(current, now, settings, this.random) : null;
        this.store.watchers.setSchedule(w.id, next?.toISOString() ?? null, 0);
        break;
      }
      case 'error': {
        const failures = current.consecutiveFailures + 1;
        const next = current.active ? computeBackoff(current, now, failures, settings, this.random) : null;
        this.store.watchers.setSchedule(w.id, next?.toISOString() ?? null, failures);
        break;
      }
      case 'checkpoint': {
        // Facebook sospecha: pausar TODO el bot y reintentar recién cuando termine la pausa.
        const pausedUntil = new Date(now.getTime() + settings.checkpointPauseHours * HOUR);
        this.store.settings.set({ pausedUntil: pausedUntil.toISOString() });
        const next = computeNextRun(current, pausedUntil, settings, this.random, { first: true });
        this.store.watchers.setSchedule(w.id, next.toISOString());
        this.emit('session:changed', 'checkpoint');
        break;
      }
      case 'logged_out': {
        // Queda bloqueado hasta que el usuario inicie sesión; se mantiene el horario normal.
        const next = computeNextRun(current, now, settings, this.random);
        this.store.watchers.setSchedule(w.id, next.toISOString());
        this.emit('session:changed', 'logged_out');
        break;
      }
    }
  }
}
