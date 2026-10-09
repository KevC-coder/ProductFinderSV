/*
 * Valores permitidos como constantes: de ellas salen los tipos y los `enum` de los JSON Schema
 * de la API, así no hay listas copiadas a mano.
 */
export const KEYWORD_MODES = ['all', 'any'] as const;
export type KeywordMode = (typeof KEYWORD_MODES)[number];

export const ITEM_CONDITIONS = ['new', 'used_like_new', 'used_good', 'used_fair'] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const MATCH_STATUSES = ['new', 'seen', 'favorite', 'dismissed'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_SORTS = ['score', 'newest', 'price'] as const;
export type MatchSort = (typeof MATCH_SORTS)[number];

/**
 * visible   → ventana normal en pantalla (la menos detectable; obligatoria para el login).
 * offscreen → ventana normal colocada fuera de la pantalla: igual de discreta para Facebook
 *             que "visible", pero el usuario no la ve.
 * headless  → sin ventana; un poco más fácil de detectar como bot.
 */
export const BROWSER_MODES = ['visible', 'offscreen', 'headless'] as const;
export type BrowserMode = (typeof BROWSER_MODES)[number];

export type SessionState = 'connected' | 'logged_out' | 'checkpoint';

/** Una búsqueda guardada que el bot ejecuta periódicamente. */
export interface Watcher {
  id: number;
  name: string;
  /** Texto que se envía al buscador de Marketplace. */
  query: string;
  /** Deben aparecer (todas o alguna, según mustMode). */
  mustKeywords: string[];
  mustMode: KeywordMode;
  /** Suben la puntuación, pero no son obligatorias. */
  bonusKeywords: string[];
  /** Si aparece cualquiera, se descarta la publicación. */
  excludeKeywords: string[];
  /** Buscar las keywords también en la descripción (requiere abrir el detalle). */
  searchDescription: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  /** Precio objetivo: lo que esté por debajo se marca como "precio ideal". */
  idealPrice: number | null;
  locationSlug: string | null;
  radiusKm: number | null;
  conditions: ItemCondition[];
  /** Antigüedad máxima de la publicación. */
  maxAgeHours: number | null;
  runsPerDay: number;
  /** "HH:MM" en hora local. */
  windowStart: string;
  windowEnd: string;
  /** Máximo de publicaciones a abrir en detalle por corrida. */
  maxDetails: number;
  active: boolean;
  /** Próxima corrida programada (ISO); la calcula el scheduler. */
  nextRunAt: string | null;
  /** Errores seguidos; define la espera antes de reintentar. */
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

/** Campos que edita el usuario. */
export type WatcherInput = Omit<Watcher, 'id' | 'nextRunAt' | 'consecutiveFailures' | 'createdAt' | 'updatedAt'>;

/** Campos que, si cambian, obligan a recalcular la próxima corrida. */
export const SCHEDULE_FIELDS = ['runsPerDay', 'windowStart', 'windowEnd', 'active'] as const;

export type RunStatus = 'running' | 'ok' | 'error' | 'checkpoint' | 'logged_out';
