import type { Page, Response } from 'playwright-core';
import { findListingNodes, parseFbJsonText } from './parsers/fb-json.js';
import { normalizeListing, type Listing } from './parsers/listing.js';

const LISTING_MARKER = 'marketplace_listing_title';

/**
 * Escucha las respuestas GraphQL de la página mientras navegamos y guarda los listings que traen.
 */
export class GraphqlCapture {
  readonly listings: Listing[] = [];
  /** Respuestas crudas, solo con keepRaw (para depurar el parser); pueden pesar varios MB. */
  readonly rawTexts: string[] = [];
  private readonly handler = (res: Response) => void this.onResponse(res);

  constructor(
    private readonly page: Page,
    private readonly opts: { keepRaw?: boolean } = {},
  ) {
    page.on('response', this.handler);
  }

  stop(): void {
    this.page.off('response', this.handler);
  }

  private async onResponse(res: Response): Promise<void> {
    if (!res.url().includes('/api/graphql')) return;
    try {
      const text = await res.text();
      if (!text.includes(LISTING_MARKER)) return;
      if (this.opts.keepRaw) this.rawTexts.push(text);
      this.listings.push(...listingsFromText(text));
    } catch {
      // respuestas canceladas o redirecciones no tienen cuerpo
    }
  }
}

/**
 * La primera página de resultados no llega por GraphQL: viene embebida en el HTML dentro de
 * <script type="application/json">. Lee esos bloques.
 */
export async function readEmbeddedJson(page: Page): Promise<string[]> {
  return page.$$eval(
    'script[type="application/json"]',
    (els, m) => els.map((e) => e.textContent ?? '').filter((t) => t.includes(m)),
    LISTING_MARKER,
  );
}

export function listingsFromText(text: string): Listing[] {
  const out: Listing[] = [];
  for (const doc of parseFbJsonText(text)) {
    for (const node of findListingNodes(doc)) {
      const l = normalizeListing(node);
      if (l) out.push(l);
    }
  }
  return out;
}
