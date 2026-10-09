import type { Page } from 'playwright-core';
import { GraphqlCapture, listingsFromText, readEmbeddedJson } from './capture.js';
import { humanScroll, pause } from './human.js';
import { parseDomCard, readDomCards } from './parsers/dom.js';
import { mergeListings, type Listing } from './parsers/listing.js';
import type { ItemCondition, SessionState } from '../domain/types.js';
import { sessionStateFromUrl } from './session.js';

export interface SearchParams {
  query: string;
  minPrice?: number;
  maxPrice?: number;
  /** Facebook solo acepta 1, 7 o 30. */
  daysSinceListed?: 1 | 7 | 30;
  conditions?: ItemCondition[];
  /** Slug o id de ciudad de Marketplace (p. ej. "sansalvador"). Sin él se usa la ubicación de la cuenta. */
  locationSlug?: string;
  radiusKm?: number;
}

export interface SearchOptions {
  /** Conservar las respuestas crudas de Facebook (solo para depurar el parser). */
  keepRaw?: boolean;
  maxResults?: number;
  maxScrolls?: number;
}

export interface SearchResult {
  url: string;
  finalUrl: string;
  sessionState: SessionState;
  listings: Listing[];
  /** De dónde salió cada dato; sirve para saber qué estrategia se rompió si Facebook cambia algo. */
  sources: { embedded: number; graphql: number; domOnly: number };
  rawTexts: string[];
}

export function buildSearchUrl(p: SearchParams): string {
  const base = p.locationSlug
    ? `https://www.facebook.com/marketplace/${encodeURIComponent(p.locationSlug)}/search/`
    : 'https://www.facebook.com/marketplace/search/';
  const url = new URL(base);
  url.searchParams.set('query', p.query);
  if (p.minPrice != null) url.searchParams.set('minPrice', String(Math.floor(p.minPrice)));
  if (p.maxPrice != null) url.searchParams.set('maxPrice', String(Math.ceil(p.maxPrice)));
  if (p.daysSinceListed != null) url.searchParams.set('daysSinceListed', String(p.daysSinceListed));
  if (p.conditions?.length) url.searchParams.set('itemCondition', p.conditions.join(','));
  if (p.radiusKm != null) url.searchParams.set('radius', String(p.radiusKm));
  url.searchParams.set('sortBy', 'creation_time_descend');
  url.searchParams.set('exact', 'false');
  return url.toString();
}

export async function searchMarketplace(
  page: Page,
  params: SearchParams,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const maxResults = opts.maxResults ?? 40;
  const maxScrolls = opts.maxScrolls ?? 5;
  const url = buildSearchUrl(params);
  const capture = new GraphqlCapture(page, { keepRaw: opts.keepRaw });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const blocked = sessionStateFromUrl(page.url());
    if (blocked) {
      return {
        url,
        finalUrl: page.url(),
        sessionState: blocked,
        listings: [],
        sources: { embedded: 0, graphql: 0, domOnly: 0 },
        rawTexts: [],
      };
    }

    await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 20_000 }).catch(() => {});
    await pause(1500, 3000);

    const embeddedTexts = await readEmbeddedJson(page);
    const embedded = embeddedTexts.flatMap(listingsFromText);

    for (let i = 0; i < maxScrolls; i++) {
      const seen = new Set([...embedded, ...capture.listings].map((l) => l.id));
      if (seen.size >= maxResults) break;
      await humanScroll(page);
      await pause(1500, 4000);
    }

    const jsonListings = mergeListings([...embedded, ...capture.listings]);
    const jsonIds = new Set(jsonListings.map((l) => l.id));
    const domListings = (await readDomCards(page)).map(parseDomCard);
    const domOnly = domListings.filter((l) => !jsonIds.has(l.id));

    // El JSON es más completo; el DOM solo rellena huecos o aporta ids que el JSON no trajo.
    const listings = mergeListings([...jsonListings, ...domListings]).slice(0, maxResults);

    return {
      url,
      finalUrl: page.url(),
      sessionState: 'connected',
      listings,
      sources: {
        embedded: new Set(embedded.map((l) => l.id)).size,
        graphql: new Set(capture.listings.map((l) => l.id)).size,
        domOnly: domOnly.length,
      },
      rawTexts: opts.keepRaw ? [...embeddedTexts, ...capture.rawTexts] : [],
    };
  } finally {
    capture.stop();
  }
}
