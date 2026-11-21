import { describe, expect, test } from 'bun:test';
import { defaultLayoutId, layoutIds, resolve, sessionName } from '../../src/config/resolve';
import { configSchema } from '../../src/config/schema';
import { PkError } from '../../src/util/errors';

const opts = { home: '/h', exists: () => true };

const config = configSchema.parse({
  settings: { editor: { cmd: 'nvim .' }, focus: 'apps' },
  projects: {
    single: { root: '~/single', layouts: { panes: ['bun run dev'] } },
    named: { root: '/n', layouts: { id: 'main', panes: [{ cwd: 'sub' }] } },
    multi: {
      root: '~/multi',
      env: { A: 'project', B: 'project' },
      editor: { cmd: 'vim', windowName: 'code' },
      default: 'dev',
      layouts: [
        {
          id: 'dev',
          panes: ['one', { cmd: 'two', cwd: 'apps/web', env: { B: 'pane', C: 'pane' }, name: 'web' }],
        },
        {
          id: 'fe',
          env: { A: 'layout' },
          editor: { enabled: false },
          panes: [{ cwd: '~/elsewhere' }, { cwd: '/abs' }],
        },
        { id: 'moved', root: '/moved', panes: ['x'] },
      ],
    },
  },
});

function thrown(fn: () => unknown): PkError {
  try {
    fn();
  } catch (e) {
    if (e instanceof PkError) return e;
    throw e;
  }
  throw new Error('did not throw');
}

describe('resolve', () => {
  test('single layout object', () => {
    const ws = resolve(config, 'single', undefined, opts);
    expect(ws).toEqual({
      projectId: 'single',
      layoutId: 'default',
      session: 'single',
      root: '/h/single',
      env: {},
      editor: { enabled: true, windowName: 'editor', cmd: 'nvim .' },
      settings: {
        layout: { maxColumns: 2, extraPane: 'left' },
        appsWindowName: 'apps',
        focus: 'apps',
        paneTitles: false,
        sendDelayMs: 0,
      },
      panes: [{ cmd: 'bun run dev', cwd: '/h/single', env: {} }],
    });
    expect(resolve(config, 'single', 'default', opts).layoutId).toBe('default');
  });

  test('single layout with id', () => {
    const ws = resolve(config, 'named', undefined, opts);
    expect(ws.layoutId).toBe('main');
    expect(ws.panes).toEqual([{ cwd: '/n/sub', env: {} }]);
    expect(thrown(() => resolve(config, 'named', 'default', opts)).message).toContain(
      'Unknown layout "default"',
    );
  });

  test('default layout and merge order settings ← project ← layout ← pane', () => {
    const ws = resolve(config, 'multi', undefined, opts);
    expect(ws.layoutId).toBe('dev');
    expect(ws.editor).toEqual({ enabled: true, windowName: 'code', cmd: 'vim' });
    expect(ws.env).toEqual({ A: 'project', B: 'project' });
    expect(ws.panes).toEqual([
      { cmd: 'one', cwd: '/h/multi', env: { A: 'project', B: 'project' } },
      { cmd: 'two', name: 'web', cwd: '/h/multi/apps/web', env: { A: 'project', B: 'pane', C: 'pane' } },
    ]);
  });

  test('explicit layout overrides env/editor; ~ and absolute cwd', () => {
    const ws = resolve(config, 'multi', 'fe', opts);
    expect(ws.env).toEqual({ A: 'layout', B: 'project' });
    expect(ws.editor).toEqual({ enabled: false, windowName: 'code', cmd: 'vim' });
    expect(ws.panes.map((p) => p.cwd)).toEqual(['/h/elsewhere', '/abs']);
  });

  test('layout can move the root', () => {
    expect(resolve(config, 'multi', 'moved', opts).root).toBe('/moved');
  });

  test('arrays replace (panes come from the layout only)', () => {
    expect(resolve(config, 'multi', 'moved', opts).panes).toHaveLength(1);
  });

  test('unknown project / layout with suggestions', () => {
    expect(thrown(() => resolve(config, 'mutli', undefined, opts)).message).toBe(
      'Unknown project "mutli". Did you mean "multi"?\nValid projects: single, named, multi',
    );
    expect(thrown(() => resolve(config, 'multi', 'dve', opts)).message).toBe(
      'Unknown layout "dve" for project "multi". Did you mean "dev"?\nValid layouts: dev, fe, moved',
    );
  });

  test('missing paths are listed', () => {
    const e = thrown(() => resolve(config, 'multi', 'dev', { home: '/h', exists: (p) => p === '/h/multi' }));
    expect(e.message).toBe('Missing paths for "multi" (layout dev):\n  /h/multi/apps/web');
    expect(e.exitCode).toBe(1);
  });

  test('helpers', () => {
    expect(sessionName('a.b:c')).toBe('a-b-c');
    const multi = config.projects.multi;
    if (!multi) throw new Error('fixture');
    expect(layoutIds(multi)).toEqual(['dev', 'fe', 'moved']);
    expect(defaultLayoutId(multi)).toBe('dev');
  });
});
