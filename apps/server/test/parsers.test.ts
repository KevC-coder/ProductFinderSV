import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listingsFromText } from '../src/scraper/capture.js';
import { buildSearchUrl } from '../src/scraper/marketplace-search.js';
import { parseDomCard } from '../src/scraper/parsers/dom.js';
import { findListingNodes, parseFbJsonText } from '../src/scraper/parsers/fb-json.js';
import { mergeListings, normalizeListing, parsePriceText } from '../src/scraper/parsers/listing.js';
import { sessionStateFromUrl } from '../src/scraper/session.js';

// Estructura similar a la respuesta GraphQL de búsqueda de Marketplace.
const searchNode = {
  __typename: 'GroupCommerceProductItem',
  id: '1234567890',
  marketplace_listing_title: 'iPhone 13 128GB liberado',
  listing_price: { formatted_amount: '$350', amount: '350.00' },
  primary_listing_photo: { image: { uri: 'https://scontent.example/img.jpg' } },
  location: { reverse_geocode: { city: 'San Salvador', state: 'San Salvador' } },
  marketplace_listing_seller: { name: 'Juan' },
  is_sold: false,
  is_pending: false,
};
const searchResponse = {
  data: {
    marketplace_search: {
      feed_units: {
        edges: [
          { node: { __typename: 'MarketplaceFeedListingStoryObject', listing: searchNode } },
          { node: { listing: { ...searchNode, id: '999', marketplace_listing_title: 'Funda iPhone' } } },
        ],
      },
    },
  },
};

test('parseFbJsonText: prefijo for(;;) y varios documentos por línea', () => {
  const text = `for (;;);${JSON.stringify(searchResponse)}`;
  assert.equal(parseFbJsonText(text).length, 1);

  const multi = `${JSON.stringify(searchResponse)}\n${JSON.stringify({ extensions: {} })}\n{roto`;
  assert.equal(parseFbJsonText(multi).length, 2);
});

test('findListingNodes encuentra listings a cualquier profundidad', () => {
  const nodes = findListingNodes(searchResponse);
  assert.deepEqual(nodes.map((n) => n.id).sort(), ['1234567890', '999']);
});

test('normalizeListing mapea los campos de búsqueda', () => {
  const l = normalizeListing(searchNode);
  assert.ok(l);
  assert.equal(l.title, 'iPhone 13 128GB liberado');
  assert.equal(l.price, 350);
  assert.equal(l.currency, 'USD');
  assert.equal(l.location, 'San Salvador, San Salvador');
  assert.equal(l.url, 'https://www.facebook.com/marketplace/item/1234567890/');
  assert.equal(l.sellerName, 'Juan');
});

test('normalizeListing mapea los campos del detalle', () => {
  const l = normalizeListing({
    id: '1234567890',
    marketplace_listing_title: 'iPhone 13',
    formatted_price: { text: '$1,250' },
    redacted_description: { text: 'Batería 90%, sin detalles' },
    location_text: { text: 'Santa Tecla' },
    creation_time: 1_760_000_000,
    attribute_data: [{ attribute_name: 'Condition', label: 'Usado - Como nuevo' }],
  });
  assert.ok(l);
  assert.equal(l.price, 1250);
  assert.equal(l.description, 'Batería 90%, sin detalles');
  assert.equal(l.location, 'Santa Tecla');
  assert.equal(l.condition, 'Usado - Como nuevo');
  assert.equal(l.listedAt, new Date(1_760_000_000_000).toISOString());
});

test('normalizeListing descarta ids no numéricos', () => {
  assert.equal(normalizeListing({ id: 'abc', marketplace_listing_title: 'x' }), null);
});

test('listingsFromText + mergeListings combinan búsqueda y detalle', () => {
  const fromSearch = listingsFromText(JSON.stringify(searchResponse));
  const detail = normalizeListing({
    id: '1234567890',
    marketplace_listing_title: 'iPhone 13 128GB liberado',
    redacted_description: { text: 'Como nuevo' },
  });
  assert.ok(detail);
  const merged = mergeListings([...fromSearch, detail]);
  assert.equal(merged.length, 2);
  const iphone = merged.find((l) => l.id === '1234567890');
  assert.equal(iphone?.description, 'Como nuevo');
  assert.equal(iphone?.price, 350);
});

test('parsePriceText', () => {
  assert.equal(parsePriceText('$350'), 350);
  assert.equal(parsePriceText('US$1,250.50'), 1250.5);
  assert.equal(parsePriceText('1.250,50 $'), 1250.5);
  assert.equal(parsePriceText('Gratis'), 0);
  assert.equal(parsePriceText('Consultar'), null);
  assert.equal(parsePriceText(null), null);
});

test('parseDomCard: precio, precio tachado, título y ubicación', () => {
  const l = parseDomCard({
    id: '42',
    imageUrl: null,
    lines: ['$300', '$350', 'iPhone 13 128GB', 'San Salvador, SS'],
  });
  assert.equal(l.price, 300);
  assert.equal(l.title, 'iPhone 13 128GB');
  assert.equal(l.location, 'San Salvador, SS');
});

test('buildSearchUrl', () => {
  const url = new URL(
    buildSearchUrl({ query: 'iphone 13', minPrice: 100, maxPrice: 400, daysSinceListed: 7, locationSlug: 'sansalvador' }),
  );
  assert.equal(url.pathname, '/marketplace/sansalvador/search/');
  assert.equal(url.searchParams.get('query'), 'iphone 13');
  assert.equal(url.searchParams.get('minPrice'), '100');
  assert.equal(url.searchParams.get('maxPrice'), '400');
  assert.equal(url.searchParams.get('daysSinceListed'), '7');
  assert.equal(url.searchParams.get('sortBy'), 'creation_time_descend');
  assert.equal(new URL(buildSearchUrl({ query: 'x' })).pathname, '/marketplace/search/');
});

test('sessionStateFromUrl', () => {
  assert.equal(sessionStateFromUrl('https://www.facebook.com/checkpoint/123'), 'checkpoint');
  assert.equal(sessionStateFromUrl('https://www.facebook.com/login/?next=x'), 'logged_out');
  assert.equal(sessionStateFromUrl('https://www.facebook.com/marketplace/search/?query=x'), null);
});
