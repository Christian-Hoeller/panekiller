import { describe, expect, test } from 'bun:test';
import { parseArgs } from '../../src/args';
import { PkError } from '../../src/util/errors';

const none = { fresh: false, attach: false, dryRun: false, detached: false };

function err(argv: string[]): string {
  try {
    parseArgs(argv);
  } catch (e) {
    if (e instanceof PkError) return e.message;
    throw e;
  }
  throw new Error('did not throw');
}

describe('parseArgs', () => {
  test('open forms', () => {
    expect(parseArgs([])).toEqual({ kind: 'open', flags: none });
    expect(parseArgs(['clipboard'])).toEqual({ kind: 'open', project: 'clipboard', flags: none });
    expect(parseArgs(['clipboard', 'web'])).toEqual({
      kind: 'open',
      project: 'clipboard',
      layout: 'web',
      flags: none,
    });
    expect(parseArgs(['clipboard', 'web', '--fresh'])).toEqual({
      kind: 'open',
      project: 'clipboard',
      layout: 'web',
      flags: { ...none, fresh: true },
    });
    expect(parseArgs(['--attach', 'clipboard'])).toEqual({
      kind: 'open',
      project: 'clipboard',
      flags: { ...none, attach: true },
    });
    expect(parseArgs(['clipboard', '--dry-run'])).toMatchObject({ flags: { ...none, dryRun: true } });
    expect(parseArgs(['-d'])).toEqual({ kind: 'open', flags: { ...none, detached: true } });
    expect(parseArgs(['x', '--detached'])).toMatchObject({ flags: { ...none, detached: true } });
  });

  test('--fresh + --attach conflict', () => {
    expect(err(['x', '--fresh', '--attach'])).toBe('--fresh and --attach cannot be combined.');
  });

  test('unknown flags with suggestion; no --layout flag', () => {
    expect(err(['x', '--frsh'])).toBe('Unknown flag --frsh. Did you mean --fresh? See pk --help.');
    expect(err(['x', '--layout', 'web'])).toStartWith('Unknown flag --layout.');
    expect(err(['kill', '--fresh'])).toStartWith('Unknown flag --fresh.');
  });

  test('too many positionals', () => {
    expect(err(['a', 'b', 'c'])).toStartWith('Too many arguments: a b c.');
  });

  test('subcommands and reserved words', () => {
    expect(parseArgs(['ls'])).toEqual({ kind: 'ls' });
    expect(parseArgs(['edit'])).toEqual({ kind: 'edit' });
    expect(parseArgs(['add'])).toEqual({ kind: 'add' });
    expect(parseArgs(['help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['kill'])).toEqual({ kind: 'kill' });
    expect(parseArgs(['kill', 'nms'])).toEqual({ kind: 'kill', project: 'nms' });
    expect(parseArgs(['completions', 'zsh'])).toEqual({ kind: 'completions', shell: 'zsh' });
    expect(err(['completions', 'bash'])).toBe('Usage: pk completions zsh (only zsh is supported).');
    expect(err(['completions'])).toBe('Usage: pk completions zsh (only zsh is supported).');
    expect(err(['ls', 'x'])).toBe('pk ls takes no arguments (got: x).');
    expect(err(['kill', 'a', 'b'])).toBe('pk kill takes at most one project.');
  });

  test('help / version anywhere', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['clipboard', '-h'])).toEqual({ kind: 'help' });
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgs(['-v'])).toEqual({ kind: 'version' });
  });

  test('hidden __complete passes words through untouched', () => {
    expect(parseArgs(['__complete', 'clip', '--x', ''])).toEqual({
      kind: 'complete',
      words: ['clip', '--x', ''],
    });
  });
});
