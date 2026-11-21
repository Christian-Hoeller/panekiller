import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configPath,
  loadConfig,
  parseJsonc,
  STARTER_CONFIG,
  syncSchema,
  validateConfig,
} from '../../src/config/load';
import { jsonSchemaText } from '../../src/config/schema';
import { PkError } from '../../src/util/errors';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pk-load-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function thrown(fn: () => unknown): PkError {
  try {
    fn();
  } catch (e) {
    if (e instanceof PkError) return e;
    throw e;
  }
  throw new Error('did not throw');
}

describe('configPath precedence', () => {
  test('PK_CONFIG > XDG_CONFIG_HOME > ~/.config', () => {
    expect(configPath({ PK_CONFIG: '/c.json', XDG_CONFIG_HOME: '/x' }, '/h')).toBe('/c.json');
    expect(configPath({ XDG_CONFIG_HOME: '/x' }, '/h')).toBe('/x/panekiller/config.json');
    expect(configPath({ XDG_CONFIG_HOME: '' }, '/h')).toBe('/h/.config/panekiller/config.json');
    expect(configPath({}, '/h')).toBe('/h/.config/panekiller/config.json');
  });
});

describe('parseJsonc', () => {
  test('comments and trailing commas', () => {
    expect(parseJsonc('// hi\n{ /* x */ "a": [1, 2,], }')).toEqual({ a: [1, 2] });
  });
  test('syntax errors carry line:col', () => {
    const e = thrown(() => parseJsonc('{\n  "a": 1\n  "b": 2\n}', 'c.json'));
    expect(e.message).toBe('Invalid JSON in config:\n  c.json:3:3: CommaExpected');
    expect(e.exitCode).toBe(1);
  });
});

describe('validateConfig', () => {
  test('errors with JSON paths', () => {
    const e = thrown(() =>
      validateConfig(
        {
          projects: {
            clipboard: { root: '/r', default: 'a', layouts: [{ id: 'a', panes: ['x'] }, { panes: ['y'] }] },
          },
        },
        'c.json',
      ),
    );
    expect(e.message).toBe(
      'Invalid config (c.json):\n  projects.clipboard.layouts[1].id: required when layouts is an array',
    );
  });
});

describe('loadConfig', () => {
  test('creates the starter config and schema when missing', () => {
    const notices: string[] = [];
    const xdg = join(tmp, 'xdg');
    const r = loadConfig({ env: { XDG_CONFIG_HOME: xdg }, home: tmp, notice: (m) => notices.push(m) });
    const path = join(xdg, 'panekiller', 'config.json');
    expect(r.path).toBe(path);
    expect(readFileSync(path, 'utf8')).toBe(STARTER_CONFIG);
    expect(readFileSync(join(xdg, 'panekiller', 'schema.json'), 'utf8')).toBe(jsonSchemaText());
    expect(notices).toEqual([`Created starter config at ${path}`]);
    expect(r.config.projects).toEqual({});
  });

  test('reads JSONC with comments', () => {
    const path = join(tmp, 'c.json');
    writeFileSync(
      path,
      '{\n // c\n "projects": { "a": { "root": "/r", "layouts": { "panes": ["x",], }, }, },\n}',
    );
    const r = loadConfig({ env: { PK_CONFIG: path }, home: tmp });
    expect(Object.keys(r.config.projects)).toEqual(['a']);
  });

  test('readOnly: no files written, missing config → empty', () => {
    const path = join(tmp, 'none', 'c.json');
    const r = loadConfig({ env: { PK_CONFIG: path }, home: tmp, readOnly: true });
    expect(r.config.projects).toEqual({});
    expect(existsSync(join(tmp, 'none'))).toBe(false);
  });

  test('invalid config throws', () => {
    const path = join(tmp, 'c.json');
    writeFileSync(path, '{ "projects": { "ls": { "root": "/r", "layouts": { "panes": ["x"] } } } }');
    expect(thrown(() => loadConfig({ env: { PK_CONFIG: path }, home: tmp })).message).toContain(
      'projects.ls: "ls" is a reserved word',
    );
  });
});

describe('syncSchema', () => {
  test('writes when missing or outdated, skips when current', () => {
    mkdirSync(join(tmp, 'd'));
    const dir = join(tmp, 'd');
    expect(syncSchema(dir)).toBe(true);
    expect(syncSchema(dir)).toBe(false);
    writeFileSync(join(dir, 'schema.json'), '{"old":true}');
    expect(syncSchema(dir)).toBe(true);
    expect(readFileSync(join(dir, 'schema.json'), 'utf8')).toBe(jsonSchemaText());
  });
});

test('starter config is itself valid', () => {
  expect(validateConfig(parseJsonc(STARTER_CONFIG)).projects).toEqual({});
});
