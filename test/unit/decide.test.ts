import { expect, test } from 'bun:test';
import { decide, parseAnswer, promptText } from '../../src/commands/decide';

test('decide: full truth table', () => {
  const rows: [boolean, boolean, boolean, boolean, string][] = [
    // exists, fresh, attach, tty → decision
    [false, false, false, false, 'create'],
    [false, false, false, true, 'create'],
    [false, true, false, false, 'create'],
    [false, true, false, true, 'create'],
    [false, false, true, false, 'create'],
    [false, false, true, true, 'create'],
    [true, false, false, false, 'error'],
    [true, false, false, true, 'prompt'],
    [true, true, false, false, 'recreate'],
    [true, true, false, true, 'recreate'],
    [true, false, true, false, 'attach'],
    [true, false, true, true, 'attach'],
  ];
  for (const [exists, fresh, attach, tty, want] of rows) {
    expect(decide(exists, { fresh, attach }, tty)).toBe(want as ReturnType<typeof decide>);
  }
});

test('parseAnswer', () => {
  expect(parseAnswer('')).toBe('attach');
  expect(parseAnswer(' A ')).toBe('attach');
  expect(parseAnswer('attach')).toBe('attach');
  expect(parseAnswer('r')).toBe('recreate');
  expect(parseAnswer('recreate')).toBe('recreate');
  expect(parseAnswer('c')).toBe('cancel');
  expect(parseAnswer('q')).toBe('cancel');
  expect(parseAnswer('cancel')).toBe('cancel');
  expect(parseAnswer('x')).toBeUndefined();
});

test('promptText', () => {
  expect(promptText('clipboard', 'dev', 'web')).toBe(
    'Session "clipboard" is already running (layout: dev). [a]ttach / [r]ecreate with layout "web" / [c]ancel ',
  );
  expect(promptText('x', undefined, 'web')).toContain('(layout: unknown)');
});
