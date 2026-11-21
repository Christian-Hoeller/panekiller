export type Plain = Record<string, unknown>;

export function isPlainObject(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge: objects merge key by key, everything else (arrays included) is replaced. `undefined` is skipped. */
export function deepMerge<T extends Plain>(base: T, ...overrides: (Plain | undefined)[]): T {
  const out: Plain = { ...base };
  for (const o of overrides) {
    if (!o) continue;
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined) continue;
      const cur = out[k];
      out[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge(cur, v) : v;
    }
  }
  return out as T;
}
