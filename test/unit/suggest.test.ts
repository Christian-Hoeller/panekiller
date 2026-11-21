import { expect, test } from 'bun:test';
import { closest, levenshtein, unknownMessage } from '../../src/util/suggest';

test('levenshtein', () => {
  expect(levenshtein('', '')).toBe(0);
  expect(levenshtein('abc', '')).toBe(3);
  expect(levenshtein('kitten', 'sitting')).toBe(3);
  expect(levenshtein('clipbaord', 'clipboard')).toBe(2);
});

test('closest', () => {
  expect(closest('clipbaord', ['nms', 'clipboard', 'datejar'])).toBe('clipboard');
  expect(closest('clip', ['nms', 'clipboard'])).toBe('clipboard');
  expect(closest('zzzzzz', ['nms', 'clipboard'])).toBeUndefined();
  expect(closest('x', [])).toBeUndefined();
});

test('unknownMessage', () => {
  expect(unknownMessage('project', 'clipbaord', ['nms', 'clipboard'])).toBe(
    'Unknown project "clipbaord". Did you mean "clipboard"?\nValid projects: nms, clipboard',
  );
  expect(unknownMessage('layout', 'zzz', ['dev'], ' for project "x"')).toBe(
    'Unknown layout "zzz" for project "x".\nValid layouts: dev',
  );
  expect(unknownMessage('project', 'a', [])).toBe('Unknown project "a".\nNo projects configured.');
});
