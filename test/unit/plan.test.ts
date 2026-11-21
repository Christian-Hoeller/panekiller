import { describe, expect, test } from 'bun:test';
import { type LayoutSettings, planLayout, splitPercent } from '../../src/layout/plan';

const shape = (n: number, s: LayoutSettings) => planLayout(n, s).map((c) => c.panes.map((p) => p + 1));

describe('planLayout', () => {
  for (const maxColumns of [1, 2, 3]) {
    for (const extraPane of ['left', 'right'] as const) {
      for (let n = 1; n <= 8; n++) {
        test(`n=${n} maxColumns=${maxColumns} extraPane=${extraPane}`, () => {
          const cols = planLayout(n, { maxColumns, extraPane });
          expect(cols.length).toBe(Math.min(maxColumns, n));
          // every pane exactly once, column-first order
          expect(cols.flatMap((c) => c.panes)).toEqual(Array.from({ length: n }, (_, i) => i));
          const counts = cols.map((c) => c.panes.length);
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
          // extra panes sit on the configured side
          const big = Math.max(...counts);
          const bigIdx = counts.flatMap((c, i) => (c === big ? [i] : []));
          if (big !== Math.min(...counts)) {
            if (extraPane === 'left') expect(bigIdx).toEqual(bigIdx.map((_, i) => i));
            else expect(bigIdx).toEqual(bigIdx.map((_, i) => counts.length - bigIdx.length + i));
          }
        });
      }
    }
  }

  test('spec diagram (maxColumns 2, extra left)', () => {
    const s: LayoutSettings = { maxColumns: 2, extraPane: 'left' };
    expect(shape(1, s)).toEqual([[1]]);
    expect(shape(2, s)).toEqual([[1], [2]]);
    expect(shape(3, s)).toEqual([[1, 2], [3]]);
    expect(shape(4, s)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(shape(5, s)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  test('table snapshot', () => {
    const table: Record<string, number[][]> = {};
    for (const extraPane of ['left', 'right'] as const) {
      for (const maxColumns of [1, 2, 3]) {
        for (let n = 1; n <= 8; n++)
          table[`${n}/${maxColumns}/${extraPane}`] = shape(n, { maxColumns, extraPane });
      }
    }
    expect(table).toMatchSnapshot();
  });

  test('edge cases', () => {
    expect(planLayout(0, { maxColumns: 2, extraPane: 'left' })).toEqual([]);
    expect(shape(3, { maxColumns: 0, extraPane: 'left' })).toEqual([[1, 2, 3]]);
    expect(shape(3, { maxColumns: 2, extraPane: 'right' })).toEqual([[1], [2, 3]]);
  });

  test('splitPercent', () => {
    expect(splitPercent(2)).toBe(50);
    expect(splitPercent(3)).toBe(67);
    expect(splitPercent(4)).toBe(75);
  });
});
