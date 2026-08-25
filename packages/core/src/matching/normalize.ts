/** Text normalization for track matching. Pure functions, heavily unit-tested. */

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Lowercase, de-accent, strip punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return stripDiacritics(s.toLowerCase())
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A title reduced to its core: parenthesised/bracketed qualifiers and
 * " - ..." suffixes removed. "One (Remastered 2011) [Live]" → "One".
 * Matching compares both the full and the core form and keeps the better
 * score, so genuinely different versions still beat stripped-down lookalikes.
 */
export function coreTitle(s: string): string {
  const stripped = s
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();
  return stripped || s;
}

export function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

/** Sørensen–Dice similarity over token sets: 0 (disjoint) to 1 (identical). */
export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

export function textSimilarity(a: string, b: string): number {
  return diceCoefficient(tokenSet(a), tokenSet(b));
}
