import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkConfigFile, editorCommand } from '../../src/commands/edit';
import { formatLs } from '../../src/commands/ls';
import { configSchema } from '../../src/config/schema';
import { main, VERSION } from '../../src/main';
import { type FakeContext, fakeContext } from '../helpers/fake';

const tmp = mkdtempSync(join(tmpdir(), 'pk-cmd-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const configFile = join(tmp, 'config.json');
const root = join(tmp, 'shop');
mkdirSync(join(root, 'api'), { recursive: true });

const CONFIG = {
  projects: {
    shop: {
      root,
      default: 'dev',
      layouts: [
        { id: 'dev', panes: ['one', { cwd: 'api', cmd: 'two' }] },
        { id: 'be', panes: [{ cwd: 'api', cmd: 'two' }] },
      ],
    },
    blog: { root: '~/blog', layouts: { panes: ['x'] } },
  },
};

beforeEach(() => writeFileSync(configFile, JSON.stringify(CONFIG)));

function ctx(over: Parameters<typeof fakeContext>[0] = {}): FakeContext {
  return fakeContext({ env: { PK_CONFIG: configFile }, home: tmp, cwd: root, exists: existsSync, ...over });
}

const cmds = (c: FakeContext) => c.tmuxFake.calls.map((a) => a[0]);

describe('main', () => {
  test('help / version / completions', async () => {
    const c = ctx();
    expect(await main(['--help'], c)).toBe(0);
    expect(await main(['--version'], c)).toBe(0);
    expect(await main(['completions', 'zsh'], c)).toBe(0);
    expect(c.stdout[0]).toContain('Usage:');
    expect(c.stdout[1]).toBe(VERSION);
    expect(c.stdout[2]).toContain('compdef _pk pk');
  });

  test('user errors → exit 1 on stderr', async () => {
    const c = ctx();
    expect(await main(['--bogus'], c)).toBe(1);
    expect(c.stderr[0]).toStartWith('pk: Unknown flag --bogus.');
    expect(await main(['nope'], c)).toBe(1);
    expect(c.stderr[1]).toContain('Unknown project "nope"');
  });

  test('unexpected errors propagate', async () => {
    const c = ctx({
      tmux: () => {
        throw new Error('boom');
      },
    });
    expect(main(['ls'], c)).rejects.toThrow('boom');
  });

  test('__complete reads the config live and never fails', async () => {
    const c = ctx();
    expect(await main(['__complete', 'shop', ''], c)).toBe(0);
    expect(c.stdout).toEqual([`dev:one, two\nbe:two`]);
    writeFileSync(configFile, '{ broken');
    expect(await main(['__complete', ''], c)).toBe(0);
    expect(c.stdout).toHaveLength(1);
    expect(await main(['__complete', 'kill', ''], ctx({ sessions: { blog: '' } }))).toBe(0);
  });

  test('__complete prints nothing when there are no candidates', async () => {
    const c = ctx();
    await main(['__complete', 'ls', ''], c);
    expect(c.stdout).toEqual([]);
  });
});

describe('open', () => {
  test('creates and attaches outside tmux', async () => {
    const c = ctx();
    expect(await main(['shop'], c)).toBe(0);
    expect(c.tmuxFake.calls[0]).toEqual(['has-session', '-t', '=shop']);
    expect(cmds(c)).toContain('new-session');
    expect(c.tmuxFake.calls.at(-1)).toEqual(['attach-session', '-t', '=shop']);
    expect(c.tmuxFake.sessions.get('shop')).toBe('dev');
  });

  test('inside tmux switches the client', async () => {
    const c = ctx({ env: { PK_CONFIG: configFile, TMUX: '/tmp/x,1,0' } });
    expect(await main(['shop', 'be'], c)).toBe(0);
    expect(c.tmuxFake.calls.at(-1)).toEqual(['switch-client', '-t', '=shop']);
  });

  test('project from cwd (subdir)', async () => {
    const c = ctx({ cwd: join(root, 'api') });
    expect(await main(['-d'], c)).toBe(0);
    expect(c.stdout).toEqual(['Created session "shop" (layout dev).']);
    expect(cmds(c)).not.toContain('attach-session');
  });

  test('no project for cwd → ls + hint, exit 1', async () => {
    const c = ctx({ cwd: '/' });
    expect(await main([], c)).toBe(1);
    expect(c.stdout[0]).toContain('PROJECT');
    expect(c.stderr[0]).toContain('pk add');
  });

  test('missing path → exit 1', async () => {
    const c = ctx();
    expect(await main(['blog'], c)).toBe(1);
    expect(c.stderr[0]).toContain('Missing paths for "blog"');
  });

  test('existing session without TTY → error with hint', async () => {
    const c = ctx({ sessions: { shop: 'dev' } });
    expect(await main(['shop', 'be'], c)).toBe(1);
    expect(c.stderr[0]).toBe(
      'pk: Session "shop" is already running (layout: dev). Pass --attach to attach to it or --fresh to recreate it.',
    );
  });

  test('--attach skips rebuild, --fresh rebuilds', async () => {
    const a = ctx({ sessions: { shop: 'dev' } });
    expect(await main(['shop', '--attach'], a)).toBe(0);
    expect(cmds(a)).not.toContain('new-session');
    expect(cmds(a)).toContain('attach-session');

    const f = ctx({ sessions: { shop: 'dev' } });
    expect(await main(['shop', 'be', '--fresh', '-d'], f)).toBe(0);
    expect(cmds(f)).toContain('kill-session');
    expect(cmds(f)).toContain('new-session');
    expect(f.tmuxFake.sessions.get('shop')).toBe('be');
  });

  test('--attach -d on a running session', async () => {
    const c = ctx({ sessions: { shop: 'dev' } });
    expect(await main(['shop', '--attach', '-d'], c)).toBe(0);
    expect(c.stdout).toEqual(['Session "shop" is already running.']);
  });

  test('prompt: attach / recreate / cancel / retry', async () => {
    const asked: string[] = [];
    const run = async (answers: string[]) => {
      const c = ctx({ sessions: { shop: 'dev' }, isTTY: true, answers });
      const ask = c.ask;
      c.ask = (q) => {
        asked.push(q);
        return ask(q);
      };
      return { code: await main(['shop', 'be', '-d'], c), c };
    };
    const a = await run(['a']);
    expect(asked[0]).toBe(
      'Session "shop" is already running (layout: dev). [a]ttach / [r]ecreate with layout "be" / [c]ancel ',
    );
    expect(cmds(a.c)).not.toContain('new-session');
    const r = await run(['?', 'r']);
    expect(asked.at(-1)).toBe('Please answer a, r or c: ');
    expect(cmds(r.c)).toContain('kill-session');
    expect(r.c.tmuxFake.sessions.get('shop')).toBe('be');
    const cancel = await run(['c']);
    expect(cancel.code).toBe(0);
    expect(cancel.c.stdout).toEqual(['Cancelled.']);
    expect(cmds(cancel.c)).not.toContain('kill-session');
  });

  test('--dry-run never prompts', async () => {
    const c = ctx({ sessions: { shop: 'dev' }, isTTY: true });
    expect(await main(['shop', '--dry-run'], c)).toBe(0);
    expect(cmds(c)).toContain('attach-session');
  });
});

describe('ls / kill', () => {
  test('ls marks default and running', async () => {
    const c = ctx({ sessions: { shop: 'be' } });
    expect(await main(['ls'], c)).toBe(0);
    const lines = (c.stdout[0] ?? '').split('\n').map((l) => l.split(/\s{2,}/));
    expect(lines).toEqual([
      ['PROJECT', 'ROOT', 'LAYOUTS', 'STATUS'],
      ['shop', root, 'dev*, be', '● running (layout be)'],
      ['blog', '~/blog', 'default*'],
    ]);
  });

  test('formatLs: empty and unknown layout', () => {
    expect(formatLs(configSchema.parse({}), new Map())).toBe('No projects configured yet.');
    const c = configSchema.parse({ projects: { a: { root: '/a', layouts: { panes: ['x'] } } } });
    expect(formatLs(c, new Map([['a', '']]))).toContain('● running (layout ?)');
  });

  test('kill', async () => {
    const c = ctx({ sessions: { shop: 'dev', blog: '' } });
    expect(await main(['kill'], c)).toBe(0);
    expect(c.stdout).toEqual(['Killed session "shop".']);
    expect([...c.tmuxFake.sessions.keys()]).toEqual(['blog']);
    expect(await main(['kill', 'shop'], c)).toBe(0);
    expect(c.stdout[1]).toBe('No session running for "shop".');
    expect(await main(['kill', 'nope'], c)).toBe(1);
    expect(await main(['kill'], ctx({ cwd: '/' }))).toBe(1);
  });
});

describe('edit', () => {
  test('editorCommand', () => {
    expect(editorCommand({})).toEqual(['nvim']);
    expect(editorCommand({ EDITOR: 'code -w' })).toEqual(['code', '-w']);
    expect(editorCommand({ EDITOR: 'vim', VISUAL: 'hx' })).toEqual(['hx']);
  });

  test('checkConfigFile', () => {
    expect(checkConfigFile(configFile)).toEqual([]);
    writeFileSync(configFile, '{"projects": {"ls": {"root": "/", "layouts": {"panes": ["x"]}}}}');
    expect(checkConfigFile(configFile)[0]).toContain('reserved');
  });

  test('runs $EDITOR then validates', async () => {
    const editor = join(tmp, 'fake-editor.sh');
    writeFileSync(editor, '#!/bin/sh\necho "$@" > "$(dirname "$0")/edited"\n');
    chmodSync(editor, 0o755);
    const ok = ctx({ env: { PK_CONFIG: configFile, EDITOR: editor } });
    expect(await main(['edit'], ok)).toBe(0);
    expect(ok.stdout).toEqual(['✓ config valid']);
    expect(readFileSync(join(tmp, 'edited'), 'utf8').trim()).toBe(configFile);

    const breaker = join(tmp, 'breaker.sh');
    writeFileSync(breaker, '#!/bin/sh\necho "{ nope" > "$1"\n');
    chmodSync(breaker, 0o755);
    const bad = ctx({ env: { PK_CONFIG: configFile, EDITOR: breaker } });
    expect(await main(['edit'], bad)).toBe(1);
    expect(bad.stderr[0]).toContain('Invalid JSON');
    // invalid config before editing still opens the editor
    expect(await main(['edit'], ctx({ env: { PK_CONFIG: configFile, EDITOR: editor } }))).toBe(1);

    const missing = ctx({ env: { PK_CONFIG: configFile, EDITOR: join(tmp, 'no-such-editor') } });
    expect(await main(['edit'], missing)).toBe(1);
    expect(missing.stderr[0]).toContain('Could not start editor');
  });
});
