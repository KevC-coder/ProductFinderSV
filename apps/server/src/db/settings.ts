import type { Db } from './database.js';
import type { BrowserMode, NotifyMode, SessionState } from '../domain/types.js';

export interface Settings {
  // ---- Editables desde el panel ----
  /** Interruptor general del bot: si está apagado no corre ninguna búsqueda automática. */
  schedulerEnabled: boolean;
  /** Cómo se abre Edge en las búsquedas (el login siempre es visible). */
  browserMode: BrowserMode;
  /** Tope global de corridas por hora entre todas las búsquedas. */
  maxRunsPerHour: number;
  /** Separación mínima entre corridas de una misma búsqueda. */
  minIntervalMinutes: number;
  /** Variación aleatoria del intervalo entre corridas (±%). */
  jitterPercent: number;
  /** Pausa mínima entre dos corridas cualesquiera (para no encadenar búsquedas). */
  minGapSeconds: number;
  /** Cuánto se pausa el bot cuando Facebook pide una verificación de seguridad. */
  checkpointPauseHours: number;
  /** Espera tras el primer error de una búsqueda; se duplica con cada error seguido. */
  errorBackoffMinutes: number;
  maxBackoffMinutes: number;
  /** Publicaciones a leer por corrida (más = más scroll en Facebook). */
  maxResultsPerRun: number;
  /** Qué resultados generan un aviso de Windows. */
  notifyMode: NotifyMode;
  /** El usuario aceptó el aviso de riesgos del primer arranque (pantalla de bienvenida). */
  riskNoticeAccepted: boolean;

  // ---- Estado interno (solo lectura desde la API) ----
  /** Estado de la sesión de Facebook según la última corrida o login. */
  sessionState: SessionState | 'unknown';
  /** Hasta cuándo está pausado el bot (ISO) tras un checkpoint/captcha. */
  pausedUntil: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  schedulerEnabled: true,
  browserMode: 'offscreen',
  maxRunsPerHour: 12,
  minIntervalMinutes: 30,
  jitterPercent: 20,
  minGapSeconds: 90,
  checkpointPauseHours: 8,
  errorBackoffMinutes: 15,
  maxBackoffMinutes: 240,
  maxResultsPerRun: 60,
  notifyMode: 'all',
  riskNoticeAccepted: false,
  sessionState: 'unknown',
  pausedUntil: null,
};

/**
 * Los ajustes se leen en cada ciclo del bot y en cada petición de estado. Este proceso es el
 * único que escribe la tabla, así que se cargan una vez y se mantienen en memoria.
 */
export class SettingsRepo {
  private cache: Settings | null = null;

  constructor(private readonly db: Db) {}

  all(): Settings {
    this.cache ??= this.load();
    return { ...this.cache };
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    this.cache ??= this.load();
    return this.cache[key];
  }

  /** Guarda solo las claves conocidas cuyo valor cambió. */
  set(patch: Partial<Settings>): Settings {
    const current = this.all();
    const changed = Object.entries(patch).filter(
      ([key, value]) => key in DEFAULT_SETTINGS && JSON.stringify(value) !== JSON.stringify(current[key as keyof Settings]),
    );
    if (changed.length) {
      const stmt = this.db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      );
      for (const [key, value] of changed) stmt.run(key, JSON.stringify(value));
      this.cache = { ...current, ...Object.fromEntries(changed) };
    }
    return this.all();
  }

  private load(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const stored: Record<string, unknown> = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    // Versiones anteriores guardaban "headless: true/false".
    if (stored.browserMode === undefined && stored.headless === true) stored.browserMode = 'headless';
    const known = Object.entries(stored).filter(([k]) => k in DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(known) };
  }
}
