import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planLayout } from '../../src/layout/plan';
import { CLI, World } from '../helpers/tmux-env';

let w: World;
beforeEach(() => {
  w = new World();
});
afterEach(() => w.dispose());

const settings = (over: Record<string, unknown> = {}) => ({
  editor: { cmd: 'true' },
  ...over,
});

/** Groups panes into columns by pane_left; within each column ordered by pane_top. */
function columnsOf(
  rows: string[][],
): { left: number; width: number; panes: { title: string; height: number }[] }[] {
  const cols = new Map<
    number,
    { left: number; width: number; panes: { title: string; top: number; height: number }[] }
  >();
  for (const [left, top, width, height, title] of rows) {
    const l = Number(left);
    const col = cols.get(l) ?? { left: l, width: Number(width), panes: [] };
    col.panes.push({ title: title ?? '', top: Number(top), height: Number(height) });
    cols.set(l, col);
  }
  return [...cols.values()]
    .sort((a, b) => a.left - b.left)
    .map((c) => ({
      ...c,
      panes: c.panes.sort((a, b) => a.top - b.top).map(({ title, height }) => ({ title, height })),
    }));
}

describe('geometry', () => {
  for (const extraPane of ['left', 'right'] as const) {
    for (let n = 1; n <= 5; n++) {
      test(`${n} panes, extra ${extraPane}`, () => {
        const root = w.project('shop');
        const panes = Array.from({ length: n }, (_, i) => ({ name: `p${i + 1}` }));
        w.writeConfig({
          settings: settings({ paneTitles: true, layout: { maxColumns: 2, extraPane } }),
          projects: { shop: { root, layouts: { panes } } },
        });
        expect(w.pk(['shop', '-d']).code).toBe(0);
        const cols = columnsOf(
          w.panes(
            '=shop:apps',
            '#{pane_left}',
            '#{pane_top}',
            '#{pane_width}',
            '#{pane_height}',
            '#{pane_title}',
          ),
        );
        const plan = planLayout(n, { maxColumns: 2, extraPane });
        expect(cols.map((c) => c.panes.map((p) => p.title))).toEqual(
          plan.map((c) => c.panes.map((i) => `p${i + 1}`)),
        );
        const widths = cols.map((c) => c.width);
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
        for (const c of cols) {
          const hs = c.panes.map((p) => p.height);
          expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(1);
        }
      });
    }
  }
});

describe('panes', () => {
  test('cwd, env and command per pane; editor window; focus; @pk_layout', async () => {
    const root = w.project('shop', 'api', 'web');
    w.writeConfig({
      settings: settings({ editor: { cmd: w.dev('editor') } }),
      projects: {
        shop: {
          root,
          env: { PKT_PROJECT: 'yes', PKT_OVER: 'project' },
          layouts: {
            panes: [
              { name: 'api', cmd: w.dev('api'), cwd: 'api', env: { PKT_OVER: 'pane' } },
              { name: 'web', cmd: w.dev('web'), cwd: 'web' },
              w.dev('root'),
            ],
          },
        },
      },
    });
    expect(w.pk(['shop', '-d'])).toMatchObject({
      code: 0,
      stdout: 'Created session "shop" (layout default).\n',
    });

    expect(await w.mark('api')).toEqual({ pwd: join(root, 'api'), PKT_OVER: 'pane', PKT_PROJECT: 'yes' });
    expect(await w.mark('web')).toEqual({ pwd: join(root, 'web'), PKT_OVER: 'project', PKT_PROJECT: 'yes' });
    expect(await w.mark('root')).toEqual({ pwd: root, PKT_OVER: 'project', PKT_PROJECT: 'yes' });
    expect(await w.mark('editor')).toEqual({ pwd: root, PKT_OVER: 'project', PKT_PROJECT: 'yes' });

    const paths = w.panes('=shop:apps', '#{pane_current_path}').map(([p]) => p);
    expect(paths.sort()).toEqual([root, join(root, 'api'), join(root, 'web')].sort());

    expect(
      w.tmux('list-windows', '-t', '=shop', '-F', '#{window_name} #{window_active}').split('\n'),
    ).toEqual([expect.stringMatching(/^apps 0$/), expect.stringMatching(/^editor 1$/)]);
    expect(w.tmux('show-options', '-qv', '-t', '=shop:', '@pk_layout')).toBe('default');
    // first pane of the apps window is selected
    const active = w.panes('=shop:apps', '#{pane_active}', '#{pane_left}', '#{pane_top}');
    expect(active.find(([a]) => a === '1')?.slice(1)).toEqual(['0', '0']);
  });

  test('pane stays at a zsh prompt after the command exits', async () => {
    const root = w.project('shop');
    w.writeConfig({
      settings: settings(),
      projects: { shop: { root, layouts: { panes: [w.dev('quick', '--exit')] } } },
    });
    expect(w.pk(['shop', '-d']).code).toBe(0);
    await w.mark('quick');
    await w.waitFor('zsh in pane', () => w.panes('=shop:apps', '#{pane_current_command}')[0]?.[0] === 'zsh');
    expect(w.panes('=shop:apps', '#{pane_dead}')).toEqual([['0']]);
    // and the command landed in the shell history (↑ + Enter restarts it)
    w.tmux('send-keys', '-t', '=shop:apps', 'Up');
    await w.waitFor('history recall', () => {
      const lines = w.tmux('capture-pane', '-p', '-t', '=shop:apps').split('\n').filter(Boolean);
      return lines.at(-1)?.startsWith('% ') && lines.at(-1)?.endsWith('quick --exit');
    });
  });

  test('editor disabled, focus apps, window names', () => {
    const root = w.project('shop');
    w.writeConfig({
      settings: settings({ editor: { enabled: false }, focus: 'apps', appsWindowName: 'servers' }),
      projects: { shop: { root, layouts: { panes: ['true'] } } },
    });
    expect(w.pk(['shop', '-d']).code).toBe(0);
    expect(w.tmux('list-windows', '-t', '=shop', '-F', '#{window_name} #{window_active}')).toBe('servers 1');
  });

  test('per-layout editor override + focus editor', () => {
    const root = w.project('shop');
    w.writeConfig({
      settings: settings({ editor: { windowName: 'code', cmd: 'true' } }),
      projects: {
        shop: {
          root,
          default: 'a',
          layouts: [
            { id: 'a', panes: ['true'] },
            { id: 'b', editor: { enabled: false }, panes: ['true', 'true'] },
          ],
        },
      },
    });
    expect(w.pk(['shop', '-d']).code).toBe(0);
    expect(w.tmux('list-windows', '-t', '=shop', '-F', '#{window_name}:#{window_active}')).toBe(
      'apps:0\ncode:1',
    );
    expect(w.pk(['shop', 'b', '--fresh', '-d']).code).toBe(0);
    expect(w.tmux('list-windows', '-t', '=shop', '-F', '#{window_name}')).toBe('apps');
  });
});

describe('existing session', () => {
  const ids = () => w.panes('=shop:apps', '#{pane_id}').map(([p]) => p);

  beforeEach(() => {
    const root = w.project('shop');
    w.writeConfig({
      settings: settings(),
      projects: {
        shop: {
          root,
          default: 'be',
          layouts: [
            { id: 'be', panes: ['true'] },
            { id: 'fe', panes: ['true', 'true'] },
          ],
        },
      },
    });
    expect(w.pk(['shop', '-d']).code).toBe(0);
    // keeps the server alive across kill-session, so pane ids are never reused
    w.tmux('new-session', '-d', '-s', 'keep');
  });

  test('--attach: no rebuild', () => {
    const before = ids();
    expect(w.pk(['shop', 'fe', '--attach', '-d'])).toMatchObject({
      code: 0,
      stdout: 'Session "shop" is already running.\n',
    });
    expect(ids()).toEqual(before);
    expect(w.tmux('show-options', '-qv', '-t', '=shop:', '@pk_layout')).toBe('be');
  });

  test('--fresh: rebuild with the new layout', () => {
    const before = ids();
    expect(w.pk(['shop', 'fe', '--fresh', '-d']).code).toBe(0);
    const after = ids();
    expect(after).toHaveLength(2);
    expect(after.some((id) => before.includes(id))).toBe(false);
    expect(w.tmux('show-options', '-qv', '-t', '=shop:', '@pk_layout')).toBe('fe');
  });

  test('no flag, no TTY: exit 1 with hint', () => {
    const r = w.pk(['shop', 'fe']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Pass --attach to attach to it or --fresh to recreate it.');
  });

  /** Runs pk under a pseudo-TTY (script(1)) and types `answer` once the prompt shows. */
  async function withTty(args: string[], answer: string) {
    const answerFile = join(w.dir, `answer-${Math.random()}`);
    const run = process.platform === 'darwin' ? 'script -q /dev/null "$@"' : 'script -qec "$*" /dev/null';
    // stdin must be a real pipe for script(1); the answer is fed once the prompt is visible
    const sh = `(while [ ! -f "$ANS" ]; do sleep 0.05; done; cat "$ANS"; sleep 0.5) | ${run}`;
    const p = Bun.spawn(['sh', '-c', sh, 'sh', process.execPath, CLI, ...args], {
      env: { ...w.env, ANS: answerFile },
      cwd: w.home,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    let out = '';
    const decoder = new TextDecoder();
    for await (const chunk of p.stdout) {
      out += decoder.decode(chunk);
      if (out.includes('[c]ancel') && !existsSync(answerFile)) writeFileSync(answerFile, `${answer}\n`);
    }
    return { code: await p.exited, out };
  }

  test('prompt: a / r / c', async () => {
    const before = ids();
    const a = await withTty(['shop', 'fe', '-d'], 'a');
    expect(a.out).toContain(
      'Session "shop" is already running (layout: be). [a]ttach / [r]ecreate with layout "fe" / [c]ancel',
    );
    expect(a.code).toBe(0);
    expect(ids()).toEqual(before);

    const c = await withTty(['shop', 'fe', '-d'], 'c');
    expect(c.out).toContain('Cancelled.');
    expect(ids()).toEqual(before);

    const r = await withTty(['shop', 'fe', '-d'], 'r');
    expect(r.code).toBe(0);
    expect(ids()).toHaveLength(2);
    expect(w.tmux('show-options', '-qv', '-t', '=shop:', '@pk_layout')).toBe('fe');
  });
});

describe('subcommands', () => {
  beforeEach(() => {
    const shop = w.project('shop', 'apps/web');
    const blog = w.project('blog');
    w.writeConfig({
      settings: settings(),
      projects: {
        shop: {
          root: '~/projects/shop',
          default: 'dev',
          layouts: [
            { id: 'dev', panes: ['true'] },
            { id: 'be', panes: ['true'] },
          ],
        },
        blog: { root: '~/projects/blog', layouts: { panes: ['true'] } },
      },
    });
    expect([shop, blog]).toHaveLength(2);
  });

  test('pk in a project subdir opens that project', () => {
    expect(w.pk(['-d'], { cwd: join(w.home, 'projects', 'shop', 'apps', 'web') }).stdout).toBe(
      'Created session "shop" (layout dev).\n',
    );
    expect(w.tmux('list-sessions', '-F', '#{session_name}')).toBe('shop');
  });

  test('ls shows running markers; kill kills only its own session', () => {
    expect(w.pk(['shop', 'be', '-d']).code).toBe(0);
    expect(w.pk(['blog', '-d']).code).toBe(0);
    expect(w.pk(['ls']).stdout).toMatchSnapshot();
    expect(w.pk(['kill', 'shop']).stdout).toBe('Killed session "shop".\n');
    expect(w.tmux('list-sessions', '-F', '#{session_name}')).toBe('blog');
    expect(w.pk(['kill', 'shop']).stdout).toBe('No session running for "shop".\n');
    expect(w.pk(['ls']).stdout).toMatchSnapshot();
  });
});

describe('inside tmux', () => {
  beforeEach(() => {
    w.project('shop');
    w.project('blog');
    w.writeConfig({
      settings: settings(),
      projects: {
        shop: { root: '~/projects/shop', layouts: { panes: ['true'] } },
        blog: { root: '~/projects/blog', layouts: { panes: ['true'] } },
      },
    });
  });

  test('--dry-run shows switch-client instead of attach', () => {
    const inside = w
      .pk(['shop', '--dry-run'], { env: { TMUX: '/tmp/fake,1,0' } })
      .stdout.trim()
      .split('\n');
    expect(inside.at(-1)).toBe(`tmux -L ${w.socket} switch-client -t =shop`);
    const outside = w.pk(['shop', '--dry-run']).stdout.trim().split('\n');
    expect(outside.at(-1)).toBe(`tmux -L ${w.socket} attach-session -t =shop`);
    expect(w.tryTmux('list-sessions')).toBeNull();
  });

  test('pk -d from a pane of the server creates a sibling session, no nesting', async () => {
    expect(w.pk(['shop', '-d']).code).toBe(0);
    const cmd = `${process.execPath} ${CLI} blog -d; echo "code=$?" > ${join(w.marks, 'inner')}`;
    w.tmux('send-keys', '-t', '=shop:apps', '-l', cmd);
    w.tmux('send-keys', '-t', '=shop:apps', 'Enter');
    expect(await w.mark('inner')).toEqual({ code: '0' });
    expect(w.tmux('list-sessions', '-F', '#{session_name}').split('\n').sort()).toEqual(['blog', 'shop']);
    expect(w.panes('=shop:apps', '#{pane_current_command}')).toEqual([['zsh']]);
  });
});
