/** Tipos de la API (espejo de apps/server). */

export type KeywordMode = 'all' | 'any';
export type ItemCondition = 'new' | 'used_like_new' | 'used_good' | 'used_fair';
export type MatchStatus = 'new' | 'seen' | 'favorite' | 'dismissed';
export type RunStatus = 'running' | 'ok' | 'error' | 'checkpoint' | 'logged_out';
export type SessionState = 'connected' | 'logged_out' | 'checkpoint' | 'unknown';
/** Cómo se abre Edge en las búsquedas (el login siempre es visible). */
export type BrowserMode = 'visible' | 'offscreen' | 'headless';
/** Avisos de Windows: todo lo nuevo, solo precio ideal o ninguno. */
export type NotifyMode = 'all' | 'ideal' | 'off';
export type BlockedReason = 'disabled' | 'logged_out' | 'paused' | 'rate_limit' | 'cooldown' | 'busy';

export interface WatcherInput {
  name: string;
  query: string;
  mustKeywords: string[];
  mustMode: KeywordMode;
  bonusKeywords: string[];
  excludeKeywords: string[];
  searchDescription: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  idealPrice: number | null;
  locationSlug: string | null;
  radiusKm: number | null;
  conditions: ItemCondition[];
  maxAgeHours: number | null;
  runsPerDay: number;
  windowStart: string;
  windowEnd: string;
  maxDetails: number;
  active: boolean;
}

export interface Watcher extends WatcherInput {
  id: number;
  nextRunAt: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

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

export type MatchCounts = Record<MatchStatus, number>;

export interface WatcherWithStats extends Watcher {
  lastRun: Run | null;
  matches: MatchCounts;
  queued: boolean;
}

export interface Listing {
  id: string;
  title: string | null;
  price: number | null;
  priceText: string | null;
  currency: string;
  location: string | null;
  imageUrl: string | null;
  url: string;
  sellerName: string | null;
  description: string | null;
  condition: string | null;
  listedAt: string | null;
  isSold: boolean | null;
  isPending: boolean | null;
  firstSeenAt: string;
  lastSeenAt: string;
  detailFetchedAt: string | null;
  previousPrice: number | null;
  priceDroppedAt: string | null;
}

export interface Match {
  id: number;
  watcherId: number;
  score: number;
  isIdealPrice: boolean;
  matchedKeywords: string[];
  status: MatchStatus;
  duplicateOf: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: Listing;
}

export interface MatchFilter {
  watcherId?: number;
  status?: MatchStatus[];
  minPrice?: number;
  maxPrice?: number;
  includeDuplicates?: boolean;
  sort?: 'score' | 'newest' | 'price';
  limit?: number;
  offset?: number;
}

export interface Settings {
  schedulerEnabled: boolean;
  browserMode: BrowserMode;
  maxRunsPerHour: number;
  minIntervalMinutes: number;
  jitterPercent: number;
  minGapSeconds: number;
  checkpointPauseHours: number;
  errorBackoffMinutes: number;
  maxBackoffMinutes: number;
  maxResultsPerRun: number;
  notifyMode: NotifyMode;
  /** Se aceptó el aviso de riesgos de la pantalla de bienvenida. */
  riskNoticeAccepted: boolean;
  sessionState: SessionState;
  pausedUntil: string | null;
}

/** Lo que se edita en Ajustes (el resto lo maneja el bot o la bienvenida). */
export type EditableSettings = Omit<Settings, 'sessionState' | 'pausedUntil' | 'riskNoticeAccepted'>;

export interface Status {
  version: string;
  /** El panel puede cerrar el servicio. */
  canShutdown: boolean;
  /** Corre como app de escritorio de Windows (bandeja, inicio con Windows). */
  desktop: boolean;
  sessionState: SessionState;
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
  activeWatchers: number;
  matches: MatchCounts;
}

export interface RunSummary {
  runId: number;
  watcherId: number;
  status: Exclude<RunStatus, 'running'>;
  foundCount: number;
  detailsFetched: number;
  newMatchIds: number[];
  priceDropMatchIds: number[];
  errorMessage: string | null;
  /** Pedida con "Probar ahora" (no automática). */
  manual: boolean;
}

/** Archivo de búsquedas exportadas (para compartir con amigos). */
export interface WatchersExport {
  format: string;
  version: number;
  exportedAt: string;
  watchers: WatcherInput[];
}
