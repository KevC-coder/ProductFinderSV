import { defaults } from '../../config.js';

export interface Listing {
  id: string;
  title: string | null;
  price: number | null;
  priceText: string | null;
  currency: string;
  location: string | null;
  imageUrl: string | null;
  url: string;
  sellerName: string | null;
  description: string | null;
  condition: string | null;
  /** ISO 8601 si Facebook lo expone. */
  listedAt: string | null;
  isSold: boolean | null;
  isPending: boolean | null;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Lee una ruta tipo "a.b.0.c" sin lanzar errores. */
function pick(o: unknown, dotted: string): unknown {
  let cur: unknown = o;
  for (const key of dotted.split('.')) {
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (isObj(cur)) cur = cur[key];
    else return undefined;
  }
  return cur;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** "$1,250" → 1250 · "US$ 99.99" → 99.99 · "Gratis" → 0 · basura → null */
export function parsePriceText(text: string | null | undefined): number | null {
  if (!text) return null;
  if (/^\s*(gratis|free)\s*$/i.test(text)) return 0;
  const m = text.match(/\d[\d.,]*/);
  if (!m) return null;
  let num = m[0];
  // "1.250,50" (coma decimal) vs "1,250.50" (punto decimal)
  if (/,\d{1,2}$/.test(num) && num.includes('.')) num = num.replace(/\./g, '').replace(',', '.');
  else if (/,\d{1,2}$/.test(num)) num = num.replace(',', '.');
  else num = num.replace(/,/g, '');
  const n = Number.parseFloat(num);
  return Number.isFinite(n) ? n : null;
}

export const listingUrl = (id: string) => `https://www.facebook.com/marketplace/item/${id}/`;

function conditionFrom(o: Obj): string | null {
  const direct = str(o.condition);
  if (direct) return direct;
  const attrs = o.attribute_data;
  if (Array.isArray(attrs)) {
    for (const a of attrs) {
      if (isObj(a) && /condition|estado/i.test(String(a.attribute_name ?? ''))) {
        return str(a.label) ?? str(a.value);
      }
    }
  }
  return null;
}

/** Convierte un nodo de listing del JSON de Facebook (búsqueda o detalle) a nuestro formato. */
export function normalizeListing(o: Obj): Listing | null {
  const id = str(o.id);
  if (!id || !/^\d+$/.test(id)) return null;

  const priceText =
    str(pick(o, 'listing_price.formatted_amount')) ?? str(pick(o, 'formatted_price.text'));
  const amount = pick(o, 'listing_price.amount');
  const price =
    typeof amount === 'string' || typeof amount === 'number'
      ? Number.parseFloat(String(amount))
      : parsePriceText(priceText);

  const city = str(pick(o, 'location.reverse_geocode.city'));
  const state = str(pick(o, 'location.reverse_geocode.state'));
  const location =
    (city ? [city, state].filter(Boolean).join(', ') : null) ?? str(pick(o, 'location_text.text'));

  const created = pick(o, 'creation_time');

  return {
    id,
    title: str(o.marketplace_listing_title) ?? str(o.custom_title),
    price: Number.isFinite(price) ? price : null,
    priceText,
    currency: str(pick(o, 'listing_price.currency')) ?? defaults.currency,
    location,
    imageUrl:
      str(pick(o, 'primary_listing_photo.image.uri')) ?? str(pick(o, 'listing_photos.0.image.uri')),
    url: listingUrl(id),
    sellerName: str(pick(o, 'marketplace_listing_seller.name')),
    description: str(pick(o, 'redacted_description.text')),
    condition: conditionFrom(o),
    listedAt: typeof created === 'number' ? new Date(created * 1000).toISOString() : null,
    isSold: bool(o.is_sold),
    isPending: bool(o.is_pending),
  };
}

/** Une varias versiones parciales del mismo listing: gana el primer valor no nulo de cada campo. */
export function mergeListings(items: Iterable<Listing>): Listing[] {
  const byId = new Map<string, Listing>();
  for (const item of items) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, { ...item });
      continue;
    }
    for (const key of Object.keys(item) as (keyof Listing)[]) {
      if (prev[key] === null && item[key] !== null) (prev as unknown as Obj)[key] = item[key];
    }
  }
  return [...byId.values()];
}
