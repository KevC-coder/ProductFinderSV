import type { BrowserMode, SessionState } from '../domain/types.js';
import { firstPage, openBrowser } from './browser.js';
import { pause } from './human.js';
import { fetchListingDetail } from './listing-detail.js';
import {
  searchMarketplace,
  type SearchOptions,
  type SearchParams,
  type SearchResult,
} from './marketplace-search.js';
import type { Listing } from './parsers/listing.js';
import { hasSessionCookie, interactiveLogin } from './session.js';

export interface ScrapeSession {
  search(params: SearchParams, opts?: SearchOptions): Promise<SearchResult>;
  detail(id: string): Promise<Listing | null>;
}

/** Abstracción del navegador: la lógica de negocio no conoce Playwright (y se puede probar sin él). */
export interface Scraper {
  /** Abre el navegador, verifica la sesión y ejecuta fn. Lanza SessionError si no hay sesión. */
  withSession<T>(fn: (session: ScrapeSession) => Promise<T>): Promise<T>;
  /** Abre una ventana visible para que el usuario inicie sesión. */
  login(): Promise<boolean>;
}

export class SessionError extends Error {
  constructor(readonly state: Exclude<SessionState, 'connected'>) {
    super(state === 'checkpoint' ? 'Facebook pide una verificación de seguridad' : 'No hay sesión de Facebook');
  }
}

export function createPlaywrightScraper(opts: { mode: () => BrowserMode }): Scraper {
  return {
    async withSession(fn) {
      const ctx = await openBrowser({ mode: opts.mode() });
      try {
        if (!(await hasSessionCookie(ctx))) throw new SessionError('logged_out');
        const page = await firstPage(ctx);
        return await fn({
          search: (params, searchOpts) => searchMarketplace(page, params, searchOpts),
          async detail(id) {
            await pause(3000, 7000);
            return fetchListingDetail(page, id);
          },
        });
      } finally {
        await ctx.close();
      }
    },
    login: () => interactiveLogin(),
  };
}
