/** JSON Schemas de entrada. Fastify los valida y aplica los valores por defecto. */
import { BROWSER_MODES, ITEM_CONDITIONS, KEYWORD_MODES, MATCH_SORTS, MATCH_STATUSES, NOTIFY_MODES } from '../domain/types.js';

const keywordList = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 100 },
  maxItems: 50,
  default: [],
} as const;
const nullableNumber = (min = 0) => ({ type: ['number', 'null'], minimum: min, default: null }) as const;
const time = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' } as const;

const watcherProps = {
  name: { type: 'string', minLength: 1, maxLength: 100 },
  query: { type: 'string', minLength: 1, maxLength: 200 },
  mustKeywords: keywordList,
  mustMode: { type: 'string', enum: KEYWORD_MODES, default: 'all' },
  bonusKeywords: keywordList,
  excludeKeywords: keywordList,
  searchDescription: { type: 'boolean', default: true },
  minPrice: nullableNumber(),
  maxPrice: nullableNumber(),
  idealPrice: nullableNumber(),
  locationSlug: { type: ['string', 'null'], maxLength: 100, default: null },
  radiusKm: nullableNumber(1),
  conditions: {
    type: 'array',
    items: { type: 'string', enum: ITEM_CONDITIONS },
    uniqueItems: true,
    default: [],
  },
  maxAgeHours: nullableNumber(1),
  runsPerDay: { type: 'integer', minimum: 1, maximum: 48, default: 6 },
  windowStart: { ...time, default: '07:00' },
  windowEnd: { ...time, default: '23:00' },
  maxDetails: { type: 'integer', minimum: 0, maximum: 20, default: 5 },
  active: { type: 'boolean', default: true },
} as const;

/** Quita los "default" para que un PATCH no rellene campos que el usuario no envió. */
const withoutDefaults = Object.fromEntries(
  Object.entries(watcherProps as Record<string, Record<string, unknown>>).map(([k, { default: _ignored, ...rest }]) => [
    k,
    rest,
  ]),
);

/** Campos editables de una búsqueda (los que se exportan e importan). */
export const WATCHER_FIELDS = Object.keys(watcherProps) as (keyof typeof watcherProps)[];

export const createWatcherBody = {
  type: 'object',
  required: ['name', 'query'],
  additionalProperties: false,
  properties: watcherProps,
} as const;

export const patchWatcherBody = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: withoutDefaults,
} as const;

/** Identifica los archivos de búsquedas exportadas (para compartirlas entre amigos). */
export const EXPORT_FORMAT = 'productfindersv/busquedas';
export const EXPORT_VERSION = 1;

/** Acepta el archivo exportado tal cual ({ format, version, exportedAt, watchers }). */
export const importWatchersBody = {
  type: 'object',
  required: ['watchers'],
  additionalProperties: false,
  properties: {
    format: { type: 'string', const: EXPORT_FORMAT },
    version: { type: 'integer', minimum: 1, maximum: EXPORT_VERSION },
    exportedAt: { type: 'string' },
    watchers: { type: 'array', minItems: 1, maxItems: 100, items: createWatcherBody },
  },
} as const;

export const autostartBody = {
  type: 'object',
  required: ['enabled'],
  additionalProperties: false,
  properties: { enabled: { type: 'boolean' } },
} as const;

export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

export const matchesQuery = {
  type: 'object',
  properties: {
    watcherId: { type: 'integer', minimum: 1 },
    status: { type: 'array', items: { type: 'string', enum: MATCH_STATUSES } },
    minPrice: { type: 'number', minimum: 0 },
    maxPrice: { type: 'number', minimum: 0 },
    includeDuplicates: { type: 'boolean', default: false },
    sort: { type: 'string', enum: MATCH_SORTS, default: 'score' },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

export const patchMatchBody = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: { status: { type: 'string', enum: MATCH_STATUSES } },
} as const;

export const runsQuery = {
  type: 'object',
  properties: {
    watcherId: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
  },
} as const;

/** Ajustes editables desde el panel (sessionState y pausedUntil los maneja el bot). */
export const patchSettingsBody = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    schedulerEnabled: { type: 'boolean' },
    browserMode: { type: 'string', enum: BROWSER_MODES },
    maxRunsPerHour: { type: 'integer', minimum: 1, maximum: 60 },
    minIntervalMinutes: { type: 'integer', minimum: 15, maximum: 1440 },
    jitterPercent: { type: 'integer', minimum: 0, maximum: 50 },
    minGapSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
    checkpointPauseHours: { type: 'number', minimum: 1, maximum: 72 },
    errorBackoffMinutes: { type: 'integer', minimum: 5, maximum: 240 },
    maxBackoffMinutes: { type: 'integer', minimum: 15, maximum: 1440 },
    maxResultsPerRun: { type: 'integer', minimum: 10, maximum: 200 },
    notifyMode: { type: 'string', enum: NOTIFY_MODES },
    riskNoticeAccepted: { type: 'boolean' },
  },
} as const;
