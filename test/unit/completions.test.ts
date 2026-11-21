import { expect, test } from 'bun:test';
import { completionCandidates, formatCandidates, ZSH_SCRIPT } from '../../src/commands/completions';
import { configSchema } from '../../src/config/schema';

const config = configSchema.parse({
  projects: {
    nms: { root: '~/nms', layouts: { panes: ['bun run dev'] } },
    clipboard: {
      root: '~/clipboard',
      default: 'dev',
      layouts: [
        { id: 'dev', panes: [{ name: 'desktop', cmd: 'x' }, { cmd: 'y' }, {}] },
        { id: 'web', panes: ['bun run dev:web'] },
      ],
    },
  },
});

const values = (words: string[], running: string[] = []) =>
  completionCandidates(config, words, () => new Set(running)).map((c) => c.value);

test('word 1: projects + subcommands', () => {
  expect(values([''])).toEqual(['nms', 'clipboard', 'ls', 'edit', 'kill', 'add', 'completions', 'help']);
  expect(values([])).toEqual(values(['']));
});

test('word 2 after a project: its layouts', () => {
  expect(values(['clipboard', ''])).toEqual(['dev', 'web']);
  expect(values(['nms', ''])).toEqual(['default']);
  expect(completionCandidates(config, ['clipboard', ''], () => new Set())[0]?.description).toBe(
    'desktop, y, shell',
  );
  expect(values(['--fresh', 'clipboard', ''])).toEqual(['dev', 'web']);
});

test('after kill: running projects first', () => {
  expect(values(['kill', ''], ['clipboard'])).toEqual(['clipboard', 'nms']);
  expect(completionCandidates(config, ['kill', ''], () => new Set(['clipboard']))[0]?.description).toBe(
    'running',
  );
});

test('flags', () => {
  expect(values(['-'])).toContain('--fresh');
  expect(values(['clipboard', '--'])).toEqual([
    '--fresh',
    '--attach',
    '--dry-run',
    '--detached',
    '--help',
    '--version',
  ]);
  expect(values(['ls', '--'])).toEqual([]);
});

test('nothing after complete commands / unknown project', () => {
  expect(values(['clipboard', 'dev', ''])).toEqual([]);
  expect(values(['ls', ''])).toEqual([]);
  expect(values(['nope', ''])).toEqual([]);
  expect(values(['completions', ''])).toEqual(['zsh']);
});

test('formatCandidates escapes colons', () => {
  expect(
    formatCandidates([
      { value: 'a', description: 'x:y' },
      { value: 'b', description: '' },
    ]),
  ).toBe('a:x\\:y\nb:');
});

test('zsh script snapshot', () => {
  expect(ZSH_SCRIPT).toMatchSnapshot();
});
