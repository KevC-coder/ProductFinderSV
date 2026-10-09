/**
 * Fase 0: prueba de viabilidad. Busca en Marketplace con la sesión guardada e imprime lo extraído.
 *
 *   npm run spike -- --query "iphone 13" --min 100 --max 400 --days 7 --details 3
 *
 * Opciones: --query (obligatoria) --min --max --days (1|7|30) --location <slug> --radius <km>
 *           --limit <n> (default 20) --details <n> (default 0) --mode visible|offscreen|headless --save-raw
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { paths } from '../config.js';
import type { BrowserMode } from '../domain/types.js';
import { firstPage, openBrowser } from '../scraper/browser.js';
import { pause } from '../scraper/human.js';
import { fetchListingDetail } from '../scraper/listing-detail.js';
import { searchMarketplace, type SearchParams } from '../scraper/marketplace-search.js';
import { mergeListings } from '../scraper/parsers/listing.js';
import { hasSessionCookie } from '../scraper/session.js';

const { values: args } = parseArgs({
  options: {
    query: { type: 'string' },
    min: { type: 'string' },
    max: { type: 'string' },
    days: { type: 'string' },
    location: { type: 'string' },
    radius: { type: 'string' },
    limit: { type: 'string', default: '20' },
    details: { type: 'string', default: '0' },
    mode: { type: 'string', default: 'visible' },
    'save-raw': { type: 'boolean', default: false },
  },
});

if (!args.query) {
  console.error('Falta --query. Ejemplo: npm run spike -- --query "iphone 13" --max 400');
  process.exit(1);
}

const num = (v: string | undefined) => (v == null ? undefined : Number(v));
const days = num(args.days);
const params: SearchParams = {
  query: args.query,
  minPrice: num(args.min),
  maxPrice: num(args.max),
  daysSinceListed: days === 1 || days === 7 || days === 30 ? days : undefined,
  locationSlug: args.location,
  radiusKm: num(args.radius),
};
const limit = Number(args.limit);
const detailsCount = Number(args.details);

const ctx = await openBrowser({ mode: args.mode as BrowserMode });
try {
  if (!(await hasSessionCookie(ctx))) {
    console.error('❌ No hay sesión de Facebook en el perfil. Corre primero: npm run fb:login');
    process.exitCode = 1;
  } else {
    const page = await firstPage(ctx);
    const started = Date.now();
    const result = await searchMarketplace(page, params, { maxResults: limit, keepRaw: args['save-raw'] });
    console.log(`\nURL: ${result.url}`);
    console.log(`Estado de sesión: ${result.sessionState}`);

    if (result.sessionState !== 'connected') {
      console.error(`❌ Facebook redirigió a ${result.finalUrl}. Resuélvelo con: npm run fb:login`);
      process.exitCode = 1;
    } else {
      let listings = result.listings;

      for (const l of listings.slice(0, detailsCount)) {
        await pause(3000, 7000);
        const detail = await fetchListingDetail(page, l.id);
        console.log(`  detalle ${l.id}: ${detail?.description ? 'con descripción' : 'sin descripción'}`);
        if (detail) listings = mergeListings([...listings, detail]);
      }

      console.table(
        listings.map((l) => ({
          id: l.id,
          precio: l.priceText ?? l.price,
          titulo: l.title?.slice(0, 45),
          ubicacion: l.location?.slice(0, 25),
          desc: l.description ? `${l.description.slice(0, 30)}…` : '',
        })),
      );
      console.log(
        `Fuentes → embebido: ${result.sources.embedded}, graphql: ${result.sources.graphql}, solo DOM: ${result.sources.domOnly}`,
      );
      console.log(`Total: ${listings.length} publicaciones en ${((Date.now() - started) / 1000).toFixed(1)} s`);

      fs.mkdirSync(paths.debug, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outFile = path.join(paths.debug, `spike-${stamp}.json`);
      fs.writeFileSync(outFile, JSON.stringify({ params, result: { ...result, rawTexts: undefined }, listings }, null, 2));
      console.log(`Resultado guardado en ${outFile}`);

      if (args['save-raw']) {
        const rawFile = path.join(paths.debug, `spike-${stamp}-raw.txt`);
        fs.writeFileSync(rawFile, result.rawTexts.join('\n\n=====\n\n'));
        console.log(`Respuestas crudas guardadas en ${rawFile} (contienen datos de tu sesión: no compartir)`);
      }
    }
  }
} finally {
  await ctx.close();
}
