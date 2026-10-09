import type { Watcher } from '../domain/types.js';
import type { Listing } from '../scraper/parsers/listing.js';
import { containsKeyword, normalizeText } from './normalize.js';

export type Verdict = 'match' | 'reject' | 'needs_detail';

export interface Evaluation {
  verdict: Verdict;
  /** 0–100; solo tiene sentido si verdict es "match" o "needs_detail". */
  score: number;
  matchedKeywords: string[];
  isIdealPrice: boolean;
  /**
   * Coincide por título, pero la descripción aún no se revisó y podría contener una
   * keyword excluida. Se muestra igual y se confirma cuando se abra el detalle.
   */
  descriptionPending: boolean;
  /** Motivo del rechazo, útil para depurar filtros desde el dashboard. */
  reason: string | null;
}

type WatcherRules = Pick<
  Watcher,
  | 'mustKeywords'
  | 'mustMode'
  | 'bonusKeywords'
  | 'excludeKeywords'
  | 'searchDescription'
  | 'minPrice'
  | 'maxPrice'
  | 'idealPrice'
  | 'maxAgeHours'
>;

const ageHours = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / 3_600_000;

const reject = (reason: string): Evaluation => ({
  verdict: 'reject',
  score: 0,
  matchedKeywords: [],
  isIdealPrice: false,
  descriptionPending: false,
  reason,
});

/**
 * Decide si una publicación cumple la búsqueda.
 * Devuelve "needs_detail" cuando las keywords obligatorias solo podrían estar en la descripción
 * y todavía no la tenemos.
 */
export function evaluateListing(listing: Listing, w: WatcherRules, now = new Date()): Evaluation {
  if (listing.isSold) return reject('vendido');

  const price = listing.price;
  if (price == null) {
    if (w.minPrice != null || w.maxPrice != null) return reject('sin precio');
  } else {
    if (w.minPrice != null && price < w.minPrice) return reject('precio menor al mínimo');
    if (w.maxPrice != null && price > w.maxPrice) return reject('precio mayor al máximo');
  }

  if (w.maxAgeHours != null && listing.listedAt) {
    if (ageHours(listing.listedAt, now) > w.maxAgeHours) return reject('publicación muy antigua');
  }

  const title = normalizeText(listing.title ?? '');
  const useDescription = w.searchDescription;
  const description = useDescription && listing.description ? normalizeText(listing.description) : null;
  const pendingDescription = useDescription && listing.description == null;
  const haystack = description ? `${title} ${description}` : title;

  const excluded = w.excludeKeywords.find((k) => containsKeyword(haystack, k));
  if (excluded) return reject(`contiene "${excluded}"`);

  const mustFound = w.mustKeywords.filter((k) => containsKeyword(haystack, k));
  const mustOk =
    w.mustKeywords.length === 0 ||
    (w.mustMode === 'all' ? mustFound.length === w.mustKeywords.length : mustFound.length > 0);
  const bonusFound = w.bonusKeywords.filter((k) => containsKeyword(haystack, k));

  const score = computeScore(listing, w, bonusFound.length, now);
  const isIdealPrice = w.idealPrice != null && price != null && price <= w.idealPrice;
  const matchedKeywords = [...mustFound, ...bonusFound];
  const base = { score, matchedKeywords, isIdealPrice, reason: null };

  if (!mustOk) {
    if (pendingDescription) return { ...base, verdict: 'needs_detail', descriptionPending: true };
    return reject('faltan keywords obligatorias');
  }
  return { ...base, verdict: 'match', descriptionPending: pendingDescription && w.excludeKeywords.length > 0 };
}

/**
 * Puntuación 0–100 para ordenar resultados:
 * base 50 · precio respecto al ideal (±30) · keywords deseables (+5 c/u, máx. 15) · frescura (+10/+5).
 */
export function computeScore(
  listing: Listing,
  w: Pick<WatcherRules, 'minPrice' | 'maxPrice' | 'idealPrice'>,
  bonusCount: number,
  now = new Date(),
): number {
  let score = 50;
  const price = listing.price;

  if (price != null && w.idealPrice != null && w.idealPrice > 0) {
    if (price <= w.idealPrice) {
      score += 20 + 10 * Math.min(1, (w.idealPrice - price) / w.idealPrice);
    } else {
      const ceiling = w.maxPrice != null && w.maxPrice > w.idealPrice ? w.maxPrice : w.idealPrice * 1.5;
      score -= 30 * Math.min(1, (price - w.idealPrice) / (ceiling - w.idealPrice));
    }
  } else if (price != null && w.maxPrice != null && w.maxPrice > (w.minPrice ?? 0)) {
    const min = w.minPrice ?? 0;
    score += 20 * (1 - (price - min) / (w.maxPrice - min));
  }

  score += Math.min(15, bonusCount * 5);

  if (listing.listedAt) {
    const age = ageHours(listing.listedAt, now);
    if (age < 2) score += 10;
    else if (age < 24) score += 5;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}
