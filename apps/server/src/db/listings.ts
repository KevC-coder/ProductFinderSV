import { normalizeText } from '../matcher/normalize.js';
import type { Listing } from '../scraper/parsers/listing.js';
import type { Db } from './database.js';

type Row = Record<string, unknown>;

export interface StoredListing extends Listing {
  firstSeenAt: string;
  lastSeenAt: string;
  detailFetchedAt: string | null;
  previousPrice: number | null;
  priceDroppedAt: string | null;
}

export interface UpsertResult {
  isNew: boolean;
  priceDropped: boolean;
  previousPrice: number | null;
}

const toBool = (v: unknown) => (v == null ? null : v === 1);
const toInt = (v: boolean | null) => (v == null ? null : v ? 1 : 0);

export const listingFromRow = (r: Row): StoredListing => ({
  id: r.id as string,
  title: r.title as string | null,
  price: r.price as number | null,
  priceText: r.price_text as string | null,
  currency: r.currency as string,
  location: r.location as string | null,
  imageUrl: r.image_url as string | null,
  url: r.url as string,
  sellerName: r.seller_name as string | null,
  description: r.description as string | null,
  condition: r.condition as string | null,
  listedAt: r.listed_at as string | null,
  isSold: toBool(r.is_sold),
  isPending: toBool(r.is_pending),
  firstSeenAt: r.first_seen_at as string,
  lastSeenAt: r.last_seen_at as string,
  detailFetchedAt: r.detail_fetched_at as string | null,
  previousPrice: r.previous_price as number | null,
  priceDroppedAt: r.price_dropped_at as string | null,
});

/** Clave para detectar republicaciones: mismo vendedor, mismo título normalizado y mismo precio. */
export const titleKey = (title: string | null) => (title ? normalizeText(title) : null);

export class ListingRepo {
  constructor(private readonly db: Db) {}

  get(id: string): StoredListing | null {
    const row = this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as Row | undefined;
    return row ? listingFromRow(row) : null;
  }

  /**
   * Inserta o actualiza una publicación. Los campos nulos no borran lo que ya teníamos
   * (la búsqueda no trae descripción, pero el detalle de una corrida anterior sí).
   */
  upsert(l: Listing, opts: { detailFetched?: boolean; now?: string } = {}): UpsertResult {
    const now = opts.now ?? new Date().toISOString();
    const prev = this.get(l.id);
    const params = {
      id: l.id,
      title: l.title,
      title_key: titleKey(l.title),
      description: l.description,
      price: l.price,
      price_text: l.priceText,
      currency: l.currency,
      location: l.location,
      image_url: l.imageUrl,
      url: l.url,
      seller_name: l.sellerName,
      condition: l.condition,
      listed_at: l.listedAt,
      is_sold: toInt(l.isSold),
      is_pending: toInt(l.isPending),
      now,
      detail_fetched_at: opts.detailFetched ? now : null,
    };

    if (!prev) {
      this.db
        .prepare(
          `INSERT INTO listings (id, title, title_key, description, price, price_text, currency, location,
             image_url, url, seller_name, condition, listed_at, is_sold, is_pending,
             first_seen_at, last_seen_at, detail_fetched_at)
           VALUES (:id, :title, :title_key, :description, :price, :price_text, :currency, :location,
             :image_url, :url, :seller_name, :condition, :listed_at, :is_sold, :is_pending,
             :now, :now, :detail_fetched_at)`,
        )
        .run(params);
      if (l.price != null) this.addPrice(l.id, l.price, now);
      return { isNew: true, priceDropped: false, previousPrice: null };
    }

    const priceChanged = l.price != null && prev.price != null && l.price !== prev.price;
    const priceDropped = priceChanged && l.price! < prev.price!;
    this.db
      .prepare(
        `UPDATE listings SET
           title = COALESCE(:title, title),
           title_key = COALESCE(:title_key, title_key),
           description = COALESCE(:description, description),
           price = COALESCE(:price, price),
           price_text = COALESCE(:price_text, price_text),
           currency = :currency,
           location = COALESCE(:location, location),
           image_url = COALESCE(:image_url, image_url),
           url = :url,
           seller_name = COALESCE(:seller_name, seller_name),
           condition = COALESCE(:condition, condition),
           listed_at = COALESCE(:listed_at, listed_at),
           is_sold = COALESCE(:is_sold, is_sold),
           is_pending = COALESCE(:is_pending, is_pending),
           last_seen_at = :now,
           detail_fetched_at = COALESCE(:detail_fetched_at, detail_fetched_at),
           previous_price = CASE WHEN :price_changed THEN price ELSE previous_price END,
           price_dropped_at = CASE WHEN :price_dropped THEN :now ELSE price_dropped_at END
         WHERE id = :id`,
      )
      .run({ ...params, price_changed: priceChanged ? 1 : 0, price_dropped: priceDropped ? 1 : 0 });
    if (priceChanged) this.addPrice(l.id, l.price!, now);
    return { isNew: false, priceDropped, previousPrice: priceChanged ? prev.price : null };
  }

  priceHistory(id: string): { price: number; seenAt: string }[] {
    return this.db
      .prepare('SELECT price, seen_at AS seenAt FROM price_history WHERE listing_id = ? ORDER BY seen_at')
      .all(id) as { price: number; seenAt: string }[];
  }

  private addPrice(id: string, price: number, now: string): void {
    this.db.prepare('INSERT INTO price_history (listing_id, price, seen_at) VALUES (?, ?, ?)').run(id, price, now);
  }
}
