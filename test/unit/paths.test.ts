import { afterAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  expandHome,
  findProjectByCwd,
  isInside,
  resolvePath,
  safeRealpath,
  tildify,
} from '../../src/util/paths';

const tmp = mkdtempSync(join(tmpdir(), 'pk-paths-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test('expandHome / resolvePath / tildify', () => {
  expect(expandHome('~', '/h')).toBe('/h');
  expect(expandHome('~/a', '/h')).toBe('/h/a');
  expect(expandHome('a/~', '/h')).toBe('a/~');
  expect(resolvePath('~/x/../y', '/base', '/h')).toBe('/h/y');
  expect(resolvePath('sub', '/base', '/h')).toBe('/base/sub');
  expect(resolvePath('/abs/', '/base', '/h')).toBe('/abs');
  expect(tildify('/h', '/h')).toBe('~');
  expect(tildify('/h/p', '/h')).toBe('~/p');
  expect(tildify('/hx/p', '/h')).toBe('/hx/p');
});

test('isInside', () => {
  expect(isInside('/a/b', '/a')).toBe(true);
  expect(isInside('/a', '/a')).toBe(true);
  expect(isInside('/ab', '/a')).toBe(false);
  expect(isInside('/a/b', '/')).toBe(true);
});

test('findProjectByCwd: deepest root wins, outside → undefined', () => {
  const roots = { mono: '/p/mono', app: '/p/mono/apps/app', other: '/p/other' };
  const id = (p: string) => p;
  expect(findProjectByCwd('/p/mono/apps/app/src', roots, id)).toBe('app');
  expect(findProjectByCwd('/p/mono/apps', roots, id)).toBe('mono');
  expect(findProjectByCwd('/p/mono', roots, id)).toBe('mono');
  expect(findProjectByCwd('/p/monorepo', roots, id)).toBeUndefined();
  expect(findProjectByCwd('/elsewhere', roots, id)).toBeUndefined();
});

test('findProjectByCwd: symlinked cwd and symlinked root', () => {
  const real = join(tmp, 'real');
  mkdirSync(join(real, 'sub'), { recursive: true });
  symlinkSync(real, join(tmp, 'link'));
  expect(findProjectByCwd(join(tmp, 'link', 'sub'), { p: real })).toBe('p');
  expect(findProjectByCwd(join(real, 'sub'), { p: join(tmp, 'link') })).toBe('p');
  expect(safeRealpath('/definitely/missing')).toBe('/definitely/missing');
});
