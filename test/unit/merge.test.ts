import { expect, test } from 'bun:test';
import { deepMerge, isPlainObject } from '../../src/util/merge';

test('deepMerge merges objects, replaces arrays, skips undefined', () => {
  expect(
    deepMerge({ a: { x: 1, y: 2 }, l: [1, 2] }, { a: { y: 3 }, l: [9] }, undefined, { z: undefined }),
  ).toEqual({
    a: { x: 1, y: 3 },
    l: [9],
  });
  expect(deepMerge<Record<string, unknown>>({ a: { x: 1 } }, { a: 5 })).toEqual({ a: 5 });
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(null)).toBe(false);
});
