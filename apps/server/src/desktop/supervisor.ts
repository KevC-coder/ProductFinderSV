// Solo módulos nativos de Node: el lanzador del ejecutable importa este archivo.

/**
 * Códigos de salida del proceso del servicio que el supervisor entiende.
 * Cualquier otro (o terminar por una señal) es una caída y se reinicia.
 */
export const EXIT_CODES = {
  /** Cierre pedido por el usuario ("Cerrar ProductFinderSV"): no se reinicia. */
  shutdown: 0,
  /** Otro servicio ya usa el puerto (p. ej. dos arranques a la vez): no se reinicia. */
  alreadyRunning: 3,
  /**
   * No llegó a arrancar (runtime dañado, base de datos ilegible, puerto bloqueado…). Se reintenta
   * unas pocas veces y luego el supervisor se rinde: un fallo así no se arregla reintentando.
   */
  startupFailed: 4,
} as const;

/** Espera antes de reiniciar tras `crashes` caídas seguidas: 2 s, 5 s, 15 s, 1 min y luego 5 min. */
export function restartDelayMs(crashes: number): number {
  const steps = [2_000, 5_000, 15_000, 60_000, 300_000];
  return steps[Math.min(Math.max(crashes, 1), steps.length) - 1]!;
}

export interface WorkerHandle {
  kill(): void;
  /** code null = terminó por una señal (p. ej. lo mató el supervisor). */
  onExit(cb: (code: number | null) => void): void;
}

export interface SupervisorOptions {
  /** Lanza el proceso del servicio. `restarts` = reinicios automáticos hechos hasta ahora. */
  spawnWorker: (info: { restarts: number }) => WorkerHandle;
  /** true si el servicio responde (GET /api/status). */
  probe: () => Promise<boolean>;
  /**
   * true si el usuario cerró ProductFinderSV después de `t` (desde otro servicio, mientras este
   * supervisor esperaba para reiniciar): en ese caso no se reinicia.
   */
  stoppedByUserSince?: (t: number) => boolean;
  log: (msg: string) => void;
  now?: () => number;
  /** Temporizadores inyectables (tests). Devuelven la función para cancelarlos. */
  setTimer?: (fn: () => void, ms: number) => () => void;
  setRepeat?: (fn: () => void, ms: number) => () => void;
  /** Cada cuánto se comprueba que el servicio responde. */
  healthIntervalMs?: number;
  /** Tiempo que se le da al servicio para arrancar antes de empezar a comprobarlo. */
  startupGraceMs?: number;
  /** Comprobaciones fallidas seguidas para darlo por colgado. */
  maxMissedChecks?: number;
  /** Si el servicio funcionó al menos este tiempo, la siguiente caída vuelve a la espera corta. */
  stableAfterMs?: number;
  /** Arranques fallidos seguidos tras los que el supervisor se rinde. */
  maxStartupFailures?: number;
}

/**
 * Mantiene vivo el servicio en segundo plano, como haría Windows con un servicio real:
 * si el proceso se cae o deja de responder, lo reinicia con esperas crecientes. Termina
 * cuando el servicio se cierra a propósito (Cerrar ProductFinderSV), cuando ya hay otro
 * servicio respondiendo o cuando el servicio no consigue arrancar varias veces seguidas.
 */
export class Supervisor {
  private restarts = 0;
  private crashes = 0;
  private startupFailures = 0;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => () => void;
  private readonly setRepeat: (fn: () => void, ms: number) => () => void;

  constructor(private readonly o: SupervisorOptions) {
    this.now = o.now ?? Date.now;
    this.setTimer =
      o.setTimer ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      });
    this.setRepeat =
      o.setRepeat ??
      ((fn, ms) => {
        const t = setInterval(fn, ms);
        return () => clearInterval(t);
      });
  }

  /** Arranca el servicio y lo vigila. Se resuelve con el código final (shutdown, alreadyRunning o startupFailed). */
  run(): Promise<number> {
    return new Promise((resolve) => this.startWorker(resolve));
  }

  private startWorker(done: (code: number) => void): void {
    const healthIntervalMs = this.o.healthIntervalMs ?? 60_000;
    const startupGraceMs = this.o.startupGraceMs ?? 120_000;
    const maxMissed = this.o.maxMissedChecks ?? 3;
    const stableAfterMs = this.o.stableAfterMs ?? 10 * 60_000;

    const startedAt = this.now();
    const worker = this.o.spawnWorker({ restarts: this.restarts });
    let missed = 0;
    let checking = false;
    let hung = false;

    const stopChecks = this.setRepeat(() => {
      if (checking || this.now() - startedAt < startupGraceMs) return;
      checking = true;
      void this.o
        .probe()
        .catch(() => false)
        .then((ok) => {
          checking = false;
          missed = ok ? 0 : missed + 1;
          if (missed >= maxMissed && !hung) {
            hung = true;
            this.o.log(`el servicio no responde (${missed} comprobaciones seguidas); se reinicia`);
            worker.kill();
          }
        });
    }, healthIntervalMs);

    worker.onExit((code) => {
      stopChecks();
      const exitedAt = this.now();
      if (code === EXIT_CODES.shutdown || code === EXIT_CODES.alreadyRunning) {
        this.o.log(code === EXIT_CODES.shutdown ? 'servicio cerrado por el usuario' : 'ya había otro servicio en marcha');
        done(code);
        return;
      }
      if (code === EXIT_CODES.startupFailed) {
        this.startupFailures++;
        const max = this.o.maxStartupFailures ?? 4;
        if (this.startupFailures >= max) {
          this.o.log(`el servicio no pudo arrancar ${this.startupFailures} veces seguidas; el supervisor se detiene (ver server.log)`);
          done(code);
          return;
        }
      } else {
        this.startupFailures = 0;
      }
      if (exitedAt - startedAt >= stableAfterMs) this.crashes = 0;
      this.crashes++;
      this.restarts++;
      const delay = restartDelayMs(this.crashes);
      const why =
        code === EXIT_CODES.startupFailed
          ? 'no pudo arrancar'
          : hung
            ? 'no respondía'
            : code === null
              ? 'terminó de forma inesperada'
              : `terminó con código ${code}`;
      this.o.log(`el servicio ${why}; reinicio automático n.º ${this.restarts} en ${delay / 1000} s`);
      this.setTimer(() => void this.restartUnlessReplaced(exitedAt, done), delay);
    });
  }

  /**
   * Antes de reiniciar comprueba que nadie haya tomado el relevo mientras se esperaba: si el
   * usuario cerró ProductFinderSV desde otro servicio, o si ya hay otro servicio respondiendo
   * (p. ej. lo abrió de nuevo), este supervisor termina en lugar de lanzar un segundo servicio.
   */
  private async restartUnlessReplaced(exitedAt: number, done: (code: number) => void): Promise<void> {
    if (this.o.stoppedByUserSince?.(exitedAt)) {
      this.o.log('el usuario cerró ProductFinderSV mientras se esperaba para reiniciar; no se reinicia');
      done(EXIT_CODES.shutdown);
      return;
    }
    if (await this.o.probe().catch(() => false)) {
      this.o.log('ya hay otro servicio respondiendo; no se reinicia');
      done(EXIT_CODES.alreadyRunning);
      return;
    }
    this.startWorker(done);
  }
}
