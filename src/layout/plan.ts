export type LayoutSettings = {
  maxColumns: number;
  extraPane: 'left' | 'right';
};

/** One column of the apps window: pane indexes (0-based, config order) top → bottom. */
export type Column = { panes: number[] };

/**
 * Distributes `n` panes over `min(maxColumns, n)` columns as evenly as possible.
 * Columns that need an extra pane get it starting from the `extraPane` side; panes fill column-first.
 */
export function planLayout(n: number, settings: LayoutSettings): Column[] {
  if (n < 1) return [];
  const cols = Math.min(Math.max(1, settings.maxColumns), n);
  const base = Math.floor(n / cols);
  const extra = n % cols;
  const columns: Column[] = [];
  let next = 0;
  for (let c = 0; c < cols; c++) {
    const getsExtra = settings.extraPane === 'left' ? c < extra : c >= cols - extra;
    const count = base + (getsExtra ? 1 : 0);
    columns.push({ panes: Array.from({ length: count }, () => next++) });
  }
  return columns;
}

/** Size of the split-off part so that `remaining` equal parts result: `(remaining-1)/remaining`. */
export function splitPercent(remaining: number): number {
  return Math.round(((remaining - 1) / remaining) * 100);
}
