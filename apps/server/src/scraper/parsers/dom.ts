import type { Page } from 'playwright-core';
import { defaults } from '../../config.js';
import { listingUrl, parsePriceText, type Listing } from './listing.js';

export interface RawDomCard {
  id: string;
  imageUrl: string | null;
  lines: string[];
}

/** Lee las tarjetas de resultados visibles (enlaces a /marketplace/item/<id>). */
export async function readDomCards(page: Page): Promise<RawDomCard[]> {
  return page.$$eval('a[href*="/marketplace/item/"]', (anchors) => {
    const out: { id: string; imageUrl: string | null; lines: string[] }[] = [];
    for (const a of anchors as HTMLAnchorElement[]) {
      const id = a.href.match(/\/marketplace\/item\/(\d+)/)?.[1];
      if (!id) continue;
      const lines = (a.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      out.push({ id, imageUrl: a.querySelector('img')?.src ?? null, lines });
    }
    return out;
  });
}

const PRICE_LINE = /^(US\s?)?\$\s?\d|^\d[\d.,]*\s?(US)?\$$|^(gratis|free)$/i;

/**
 * Una tarjeta típica trae: precio, [precio anterior tachado], título, ubicación.
 * El primer precio es el actual; las líneas que no son precio son título y ubicación.
 */
export function parseDomCard(card: RawDomCard): Listing {
  const prices = card.lines.filter((l) => PRICE_LINE.test(l));
  const rest = card.lines.filter((l) => !PRICE_LINE.test(l));
  const priceText = prices[0] ?? null;
  return {
    id: card.id,
    title: rest[0] ?? null,
    price: parsePriceText(priceText),
    priceText,
    currency: defaults.currency,
    location: rest[1] ?? null,
    imageUrl: card.imageUrl,
    url: listingUrl(card.id),
    sellerName: null,
    description: null,
    condition: null,
    listedAt: null,
    isSold: null,
    isPending: null,
  };
}
