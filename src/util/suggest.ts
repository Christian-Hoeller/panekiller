export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + cost);
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/** Closest candidate within a distance that still looks like a typo, else undefined. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  const max = Math.max(2, Math.floor(input.length / 3));
  let best: string | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = c.startsWith(input) || input.startsWith(c) ? 1 : levenshtein(input, c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return bestDist <= max ? best : undefined;
}

/** `Unknown project "clipbaord". Did you mean "clipboard"?\nValid projects: a, b` */
export function unknownMessage(
  kind: string,
  input: string,
  candidates: readonly string[],
  where = '',
): string {
  const lines = [`Unknown ${kind} "${input}"${where}.`];
  const guess = closest(input, candidates);
  if (guess) lines[0] += ` Did you mean "${guess}"?`;
  lines.push(candidates.length ? `Valid ${kind}s: ${candidates.join(', ')}` : `No ${kind}s configured.`);
  return lines.join('\n');
}
