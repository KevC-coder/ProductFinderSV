import type { Page } from 'playwright-core';
import { GraphqlCapture, listingsFromText, readEmbeddedJson } from './capture.js';
import { pause } from './human.js';
import { listingUrl, mergeListings, type Listing } from './parsers/listing.js';
import { sessionStateFromUrl } from './session.js';

/**
 * Abre la página de una publicación para obtener lo que la búsqueda no trae
 * (descripción, condición, fecha). Devuelve null si no se pudo leer.
 */
export async function fetchListingDetail(page: Page, id: string): Promise<Listing | null> {
  const capture = new GraphqlCapture(page);
  try {
    await page.goto(listingUrl(id), { waitUntil: 'domcontentloaded' });
    if (sessionStateFromUrl(page.url())) return null;
    await pause(2000, 4000);

    const embedded = (await readEmbeddedJson(page)).flatMap(listingsFromText);
    const matches = [...embedded, ...capture.listings].filter((l) => l.id === id);
    return mergeListings(matches)[0] ?? null;
  } finally {
    capture.stop();
  }
}
