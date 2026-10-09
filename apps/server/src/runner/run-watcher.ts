import { transaction } from '../db/database.js';
import type { Store } from '../db/store.js';
import type { RunStatus, Watcher } from '../domain/types.js';
import { evaluateListing, type Evaluation } from '../matcher/evaluate.js';
import type { SearchParams } from '../scraper/marketplace-search.js';
import { mergeListings, type Listing } from '../scraper/parsers/listing.js';
import { SessionError, type Scraper } from '../scraper/scraper.js';

export interface RunSummary {
  runId: number;
  watcherId: number;
  status: Exclude<RunStatus, 'running'>;
  foundCount: number;
  detailsFetched: number;
  newMatchIds: number[];
  priceDropMatchIds: number[];
  errorMessage: string | null;
}

/** Facebook solo filtra por 1, 7 o 30 días; el filtro exacto por horas se hace localmente. */
const FB_DAY_BUCKETS: [maxHours: number, days: 1 | 7][] = [
  [24, 1],
  [168, 7],
];

export function toSearchParams(w: Watcher): SearchParams {
  const h = w.maxAgeHours;
  return {
    query: w.query,
    minPrice: w.minPrice ?? undefined,
    maxPrice: w.maxPrice ?? undefined,
    daysSinceListed: h == null ? undefined : (FB_DAY_BUCKETS.find(([max]) => h <= max)?.[1] ?? 30),
    conditions: w.conditions.length ? w.conditions : undefined,
    locationSlug: w.locationSlug ?? undefined,
    radiusKm: w.radiusKm ?? undefined,
  };
}

interface Candidate {
  listing: Listing;
  ev: Evaluation;
  detailFetched: boolean;
}

/**
 * Ejecuta una búsqueda completa: buscar → filtrar por título/precio → abrir detalle de los
 * candidatos dudosos (con tope) → guardar listings y matches. Nunca lanza: el resultado
 * queda registrado en la tabla runs.
 */
export async function runWatcher(
  store: Store,
  scraper: Scraper,
  watcher: Watcher,
  opts: { now?: () => Date } = {},
): Promise<RunSummary> {
  const now = opts.now ?? (() => new Date());
  const runId = store.runs.start(watcher.id, now().toISOString());
  const summary: RunSummary = {
    runId,
    watcherId: watcher.id,
    status: 'ok',
    foundCount: 0,
    detailsFetched: 0,
    newMatchIds: [],
    priceDropMatchIds: [],
    errorMessage: null,
  };

  try {
    const candidates = await scraper.withSession(async (session) => {
      const maxResults = store.settings.get('maxResultsPerRun');
      const result = await session.search(toSearchParams(watcher), { maxResults });
      if (result.sessionState !== 'connected') throw new SessionError(result.sessionState);
      summary.foundCount = result.listings.length;

      const evaluated: Candidate[] = result.listings.map((l) => {
        const listing = withKnownDetail(store, l);
        return { listing, ev: evaluateListing(listing, watcher), detailFetched: false };
      });

      // Abrir detalle solo de los que dependen de la descripción, empezando por los de mejor puntuación.
      const needDetail = evaluated
        .filter((c) => c.ev.verdict !== 'reject' && c.ev.descriptionPending)
        .sort((a, b) => b.ev.score - a.ev.score)
        .slice(0, watcher.maxDetails);
      for (const c of needDetail) {
        const detail = await session.detail(c.listing.id);
        summary.detailsFetched++;
        const merged = mergeListings([c.listing, ...(detail ? [detail] : [])])[0]!;
        // Descripción vacía = "ya la revisamos", para no volver a abrirla en cada corrida.
        c.listing = { ...merged, description: merged.description ?? '' };
        c.ev = evaluateListing(c.listing, watcher);
        c.detailFetched = true;
      }
      return evaluated;
    });

    transaction(store.db, () => {
      for (const c of candidates) {
        // Guardamos los detalles revisados aunque no coincidan, como caché para la próxima corrida.
        if (c.ev.verdict !== 'match') {
          if (c.detailFetched) store.listings.upsert(c.listing, { detailFetched: true });
          // Se mostró antes (por su título o con reglas anteriores) y ya no cumple.
          if (c.ev.verdict === 'reject') store.matches.removeUnreviewed(watcher.id, c.listing.id);
          continue;
        }
        const up = store.listings.upsert(c.listing, { detailFetched: c.detailFetched });
        const duplicateOf = store.matches.findDuplicate(watcher.id, c.listing);
        const match = store.matches.upsert(watcher.id, c.listing.id, c.ev, { duplicateOf });
        if (match.isNew && !duplicateOf) summary.newMatchIds.push(match.id);
        else if (up.priceDropped) summary.priceDropMatchIds.push(match.id);
      }
    });
    store.settings.set({ sessionState: 'connected' });
  } catch (err) {
    if (err instanceof SessionError) {
      summary.status = err.state;
      store.settings.set({ sessionState: err.state });
    } else {
      summary.status = 'error';
    }
    summary.errorMessage = err instanceof Error ? err.message : String(err);
  }

  store.runs.finish(
    runId,
    {
      status: summary.status,
      foundCount: summary.foundCount,
      newCount: summary.newMatchIds.length,
      detailsFetched: summary.detailsFetched,
      errorMessage: summary.errorMessage,
    },
    now().toISOString(),
  );
  return summary;
}

/** Completa con la descripción/condición ya guardada para no abrir el detalle otra vez. */
function withKnownDetail(store: Store, l: Listing): Listing {
  const known = store.listings.get(l.id);
  if (!known?.detailFetchedAt) return l;
  return {
    ...l,
    description: l.description ?? known.description ?? '',
    condition: l.condition ?? known.condition,
  };
}
