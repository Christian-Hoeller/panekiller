import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonc } from '../../src/config/load';
import { configSchema, formatIssues, formatPath, jsonSchema, jsonSchemaText } from '../../src/config/schema';

const seed = parseJsonc(readFileSync(join(import.meta.dir, '../fixtures/seed-config.jsonc'), 'utf8'));

function issues(raw: unknown): string[] {
  const r = configSchema.safeParse(raw);
  return r.success ? [] : formatIssues(r.error);
}

const project = (p: Record<string, unknown>) => ({ projects: { app: { root: '/r', ...p } } });

describe('config schema', () => {
  test('seed config is valid', () => {
    expect(issues(seed)).toEqual([]);
  });

  test('defaults fill in', () => {
    const c = configSchema.parse({});
    expect(c.settings).toEqual({
      layout: { maxColumns: 2, extraPane: 'left' },
      editor: { enabled: true, windowName: 'editor', cmd: 'nvim .' },
      appsWindowName: 'apps',
      focus: 'editor',
      paneTitles: false,
      sendDelayMs: 0,
    });
    expect(c.projects).toEqual({});
  });

  test('reserved ids are rejected', () => {
    for (const id of ['ls', 'edit', 'kill', 'add', 'completions', 'help']) {
      expect(issues({ projects: { [id]: { root: '/r', layouts: { panes: ['x'] } } } })).toEqual([
        `projects.${id}: "${id}" is a reserved word (ls, edit, kill, add, completions, help)`,
      ]);
    }
  });

  test('bad id patterns', () => {
    expect(issues({ projects: { Foo: { root: '/r', layouts: { panes: ['x'] } } } })).toEqual([
      'projects.Foo: project id must match ^[a-z0-9][a-z0-9-_]*$',
    ]);
    expect(issues({ projects: { '-x': { root: '/r', layouts: { panes: ['x'] } } } })).toHaveLength(1);
    expect(issues(project({ default: 'a', layouts: [{ id: 'Bad', panes: ['x'] }] }))[0]).toStartWith(
      'projects.app.layouts[0].id: must match',
    );
  });

  test('duplicate layout ids', () => {
    expect(
      issues(
        project({
          default: 'a',
          layouts: [
            { id: 'a', panes: ['x'] },
            { id: 'a', panes: ['y'] },
          ],
        }),
      ),
    ).toEqual(['projects.app.layouts[1].id: duplicate layout id "a"']);
  });

  test('array layouts: id and default required', () => {
    expect(issues(project({ layouts: [{ id: 'a', panes: ['x'] }, { panes: ['y'] }] }))).toEqual([
      'projects.app.layouts[1].id: required when layouts is an array',
      'projects.app.default: required when layouts is an array',
    ]);
  });

  test('default with a single object is not allowed', () => {
    expect(issues(project({ default: 'a', layouts: { panes: ['x'] } }))).toEqual([
      'projects.app.default: not allowed when layouts is a single object',
    ]);
  });

  test('default naming an unknown id', () => {
    expect(issues(project({ default: 'nope', layouts: [{ id: 'a', panes: ['x'] }] }))).toEqual([
      'projects.app.default: unknown layout "nope" (layouts: a)',
    ]);
  });

  test('string and object panes', () => {
    expect(
      issues(
        project({ layouts: { panes: ['bun dev', {}, { cmd: 'x', cwd: 'a', name: 'n', env: { A: '1' } }] } }),
      ),
    ).toEqual([]);
    expect(issues(project({ layouts: { panes: [42] } }))).toHaveLength(1);
    expect(issues(project({ layouts: { panes: [] } }))).toEqual([
      'projects.app.layouts.panes: Too small: expected array to have >=1 items',
    ]);
  });

  test('unknown keys are rejected (strict)', () => {
    expect(issues({ nope: 1 })).toEqual(['(root): Unrecognized key: "nope"']);
    expect(issues({ settings: { layout: { columns: 3 } } })).toEqual([
      'settings.layout: Unrecognized key: "columns"',
    ]);
    expect(issues(project({ layouts: { panes: [{ command: 'x' }] } }))).toHaveLength(1);
    expect(issues(project({ layouts: { panes: ['x'] }, foo: 1 }))).toEqual([
      'projects.app: Unrecognized key: "foo"',
    ]);
  });

  test('layouts can override project fields', () => {
    expect(
      issues(project({ layouts: { panes: ['x'], env: { A: 'b' }, editor: { cmd: 'vim' }, root: '/x' } })),
    ).toEqual([]);
  });

  test('formatPath', () => {
    expect(formatPath([])).toBe('(root)');
    expect(formatPath(['projects', 'a', 'layouts', 1, 'id'])).toBe('projects.a.layouts[1].id');
    expect(formatPath([0, 'x'])).toBe('[0].x');
  });

  test('JSON schema export', () => {
    const s = jsonSchema();
    expect(s.title).toBe('panekiller config');
    const projects = (s.properties as Record<string, Record<string, unknown>>).projects;
    expect(projects?.propertyNames).toEqual({
      pattern: '^[a-z0-9][a-z0-9-_]*$',
      not: { enum: ['ls', 'edit', 'kill', 'add', 'completions', 'help'] },
    });
    expect(jsonSchemaText().endsWith('}\n')).toBe(true);
  });

  test('committed schema.json is up to date', () => {
    expect(readFileSync(join(import.meta.dir, '../../schema.json'), 'utf8')).toBe(jsonSchemaText());
  });
});
