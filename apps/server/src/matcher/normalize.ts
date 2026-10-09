/**
 * Normaliza texto para comparar keywords:
 * minúsculas, sin acentos, "+" y signos → espacio, y separa números de letras
 * ("128GB" → "128 gb", "iphone13" → "iphone 13") para que coincidan todas las variantes.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Busca la keyword como palabra(s) completa(s): "13" no coincide con "130". */
export function containsKeyword(normalizedText: string, keyword: string): boolean {
  const kw = normalizeText(keyword);
  if (!kw) return false;
  return ` ${normalizedText} `.includes(` ${kw} `);
}
