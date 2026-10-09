import type { WatcherInput } from '../src/domain/types.js';
import type { SearchResult } from '../src/scraper/marketplace-search.js';
import { listingUrl, type Listing } from '../src/scraper/parsers/listing.js';
import type { Scraper } from '../src/scraper/scraper.js';

export function makeListing(overrides: Partial<Listing> & { id: string }): Listing {
  return {
    title: 'iPhone 13 128GB liberado',
    price: 300,
    priceText: '300 $',
    currency: 'USD',
    location: 'San Salvador',
    imageUrl: null,
    url: listingUrl(overrides.id),
    sellerName: 'Vendedor',
    description: null,
    condition: null,
    listedAt: null,
    isSold: false,
    isPending: false,
    ...overrides,
  };
}

export function watcherInput(overrides: Partial<WatcherInput> = {}): WatcherInput {
  return {
    name: 'iPhone 13',
    query: 'iphone 13',
    mustKeywords: [],
    mustMode: 'all',
    bonusKeywords: [],
    excludeKeywords: [],
    searchDescription: false,
    minPrice: null,
    maxPrice: null,
    idealPrice: null,
    locationSlug: null,
    radiusKm: null,
    conditions: [],
    maxAgeHours: null,
    runsPerDay: 6,
    windowStart: '07:00',
    windowEnd: '23:00',
    maxDetails: 5,
    active: true,
    ...overrides,
  };
}

/** Scraper falso: devuelve listings fijos y registra qué detalles se pidieron. */
export function fakeScraper(opts: {
  listings: Listing[] | (() => Listing[]);
  details?: Record<string, Partial<Listing>>;
  sessionState?: SearchResult['sessionState'];
  throwOnSearch?: Error;
}) {
  const detailCalls: string[] = [];
  const scraper: Scraper = {
    async withSession(fn) {
      return fn({
        async search() {
          if (opts.throwOnSearch) throw opts.throwOnSearch;
          const listings = typeof opts.listings === 'function' ? opts.listings() : opts.listings;
          return {
            url: 'https://www.facebook.com/marketplace/search/',
            finalUrl: 'https://www.facebook.com/marketplace/search/',
            sessionState: opts.sessionState ?? 'connected',
            listings,
            sources: { embedded: listings.length, graphql: 0, domOnly: 0 },
            rawTexts: [],
          };
        },
        async detail(id) {
          detailCalls.push(id);
          const d = opts.details?.[id];
          return d ? makeListing({ id, ...d }) : null;
        },
      });
    },
    login: async () => true,
  };
  return { scraper, detailCalls };
}
