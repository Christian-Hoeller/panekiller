import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildEntry,
  detectScripts,
  insertProject,
  isDevScript,
  paneEntry,
  rootFor,
  runner,
  suggestId,
  validateId,
} from '../../src/commands/add';
import { parseJsonc, validateConfig } from '../../src/config/load';

const repos = join(import.meta.dir, '../fixtures/repos');
const golden = join(import.meta.dir, '../fixtures/golden');

describe('detectScripts', () => {
  test('root scripts', () => {
    expect(detectScripts(join(repos, 'root-scripts'))).toEqual([
      { dir: '', script: 'dev', cmd: 'bun run dev', name: 'dev' },
      { dir: '', script: 'dev:api', cmd: 'bun run dev:api', name: 'api' },
    ]);
  });

  test('workspaces field (array) + runner', () => {
    expect(detectScripts(join(repos, 'workspaces'))).toEqual([
      { dir: '', script: 'dev', cmd: 'pnpm run dev', name: 'dev' },
      { dir: 'web', script: 'dev', cmd: 'pnpm run dev', name: 'web' },
      { dir: 'api', script: 'dev:watch', cmd: 'pnpm run dev:watch', name: 'watch' },
    ]);
  });

  test('workspaces.packages + apps/* + packages/*', () => {
    expect(detectScripts(join(repos, 'apps-dir')).map((c) => `${c.dir} ${c.cmd} ${c.name}`)).toEqual([
      'apps/desktop yarn dev desktop',
      'apps/frontend yarn dev frontend',
      'packages/ui yarn dev ui',
    ]);
  });

  test('no package.json', () => {
    expect(detectScripts(join(repos, 'nope'))).toEqual([]);
    expect(runner(join(repos, 'nope'))).toBe('npm run');
  });

  test('isDevScript', () => {
    expect(['dev', 'dev:web', 'dev-api', 'dev_x'].every(isDevScript)).toBe(true);
    expect(['develop', 'predev', 'build'].some(isDevScript)).toBe(false);
  });
});

describe('entry building', () => {
  test('paneEntry', () => {
    expect(paneEntry({ dir: '', script: 'dev', cmd: 'bun run dev', name: 'dev' })).toEqual({
      name: 'dev',
      cmd: 'bun run dev',
    });
    expect(paneEntry({ dir: 'apps/web', script: 'dev', cmd: 'bun run dev', name: 'web' })).toEqual({
      name: 'web',
      cmd: 'bun run dev',
      cwd: 'apps/web',
    });
  });

  test('single layout vs array + default; empty → shell pane', () => {
    expect(buildEntry('~/x', [{ id: 'dev', panes: ['a'] }])).toEqual({
      root: '~/x',
      layouts: { panes: ['a'] },
    });
    expect(buildEntry('~/x', [])).toEqual({ root: '~/x', layouts: { panes: [{ name: 'shell' }] } });
    expect(
      buildEntry('~/x', [
        { id: 'dev', panes: ['a'] },
        { id: 'fe', panes: [] },
      ]),
    ).toEqual({
      root: '~/x',
      default: 'dev',
      layouts: [
        { id: 'dev', panes: ['a'] },
        { id: 'fe', panes: [{ name: 'shell' }] },
      ],
    });
  });

  test('rootFor', () => {
    expect(rootFor('/cfg/projects/a', '/cfg', '/h')).toBe('projects/a');
    expect(rootFor('/h/p/a', '/cfg', '/h')).toBe('~/p/a');
    expect(rootFor('/cfg', '/cfg', '/h')).toBe('/cfg');
  });

  test('ids', () => {
    expect(suggestId('/p/My App.v2')).toBe('my-app-v2');
    expect(suggestId('/p/__')).toBe('project');
    expect(validateId('ok-1', [])).toBeUndefined();
    expect(validateId('Bad', [])).toContain('lowercase');
    expect(validateId('ls', [])).toBe('"ls" is reserved.');
    expect(validateId('shop', ['shop'])).toBe('"shop" already exists.');
  });
});

test('insertProject keeps comments (golden file)', () => {
  const before = readFileSync(join(golden, 'add-before.jsonc'), 'utf8');
  const after = insertProject(before, 'new-app', {
    root: '~/new-app',
    default: 'dev',
    layouts: [{ id: 'dev', panes: [{ name: 'web', cmd: 'bun run dev:web', cwd: 'apps/web' }] }],
  });
  const file = join(golden, 'add-after.jsonc');
  if (process.env.UPDATE_GOLDEN) writeFileSync(file, after);
  expect(after).toBe(readFileSync(file, 'utf8'));
  expect(after).toContain('// my config');
  expect(after).toContain('// one pane');
  expect(Object.keys(validateConfig(parseJsonc(after)).projects)).toEqual(['shop', 'new-app']);
});
