/**
 * Facebook responde GraphQL como uno o varios documentos JSON (a veces uno por línea y a veces
 * con el prefijo anti-hijacking `for (;;);`). Devuelve todos los que se puedan parsear.
 */
export function parseFbJsonText(text: string): unknown[] {
  const cleaned = text.replace(/^\s*for \(;;\);/, '');
  try {
    return [JSON.parse(cleaned)];
  } catch {
    const docs: unknown[] = [];
    for (const line of cleaned.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        docs.push(JSON.parse(t));
      } catch {
        // línea parcial o no-JSON: se ignora
      }
    }
    return docs;
  }
}

/**
 * Recorre cualquier JSON y devuelve los objetos que parecen un listing de Marketplace.
 * No depende de la ruta exacta (data.marketplace_search.feed_units...), que Facebook cambia seguido.
 */
export function findListingNodes(root: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v !== 'object' || v === null || seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
      continue;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string' && 'marketplace_listing_title' in o) found.push(o);
    for (const key in o) stack.push(o[key]);
  }
  return found;
}
