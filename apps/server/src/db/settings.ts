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
  /**
   * Lo que eligió el usuario para "Iniciar con Windows" (null = todavía no eligió). Se guarda
   * aquí, además de en el registro de Windows, para restaurarlo si reinstala conservando datos.
   */
  autostartWanted: boolean | null;

  // ---- Telegram (se manejan desde /api/telegram; nunca se devuelven en /api/settings) ----
  /** Token del bot creado con @BotFather. Solo se guarda en esta PC. */
  telegramToken: string | null;
  telegramBotUsername: string | null;
  /** Chat vinculado: el único que recibe avisos y puede dar órdenes al bot. */
  telegramChatId: string | null;
  telegramChatName: string | null;
  /** Qué resultados se avisan por Telegram (aparte de los avisos de Windows). */
  telegramNotifyMode: NotifyMode;

  // ---- Estado interno (solo lectura desde la API) ----
  /** Estado de la sesión de Facebook según la última corrida o login. */
  sessionState: SessionState | 'unknown';
  /** Hasta cuándo está pausado el bot (ISO) tras un checkpoint/captcha. */
  pausedUntil: string | null;
}

/** Ajustes internos que no se exponen en /api/settings (secretos o con su propia API). */
const PRIVATE_KEYS = [
  'autostartWanted',
  'telegramToken',
  'telegramBotUsername',
  'telegramChatId',
  'telegramChatName',
  'telegramNotifyMode',
] as const satisfies readonly (keyof Settings)[];
type PrivateKey = (typeof PRIVATE_KEYS)[number];

/** Lo que ve el panel en /api/settings: sin el token de Telegram ni otros datos internos. */
export function publicSettings(s: Settings): Omit<Settings, PrivateKey> {
  const out: Partial<Settings> = { ...s };
  for (const k of PRIVATE_KEYS) delete out[k];
  return out as Omit<Settings, PrivateKey>;
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
  autostartWanted: null,
  telegramToken: null,
  telegramBotUsername: null,
  telegramChatId: null,
  telegramChatName: null,
  telegramNotifyMode: 'all',
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
