import { describe, expect, test } from 'bun:test';
import { resolve } from '../../src/config/resolve';
import { configSchema } from '../../src/config/schema';
import { buildSession } from '../../src/tmux/build';
import { fakeTmux } from '../helpers/fake';

const opts = { home: '/h', exists: () => true };

function workspace(settings: Record<string, unknown>, panes: unknown[], extra: Record<string, unknown> = {}) {
  const config = configSchema.parse({
    settings,
    projects: { app: { root: '/r', layouts: { panes }, ...extra } },
  });
  return resolve(config, 'app', undefined, opts);
}

const size = { cols: 200, lines: 50 };

describe('buildSession', () => {
  test('3 panes: tmux call sequence', () => {
    const tmux = fakeTmux();
    const ws = workspace({}, ['one', { cmd: 'two', cwd: 'b', env: { K: 'V' } }, { cwd: 'c' }], {
      env: { P: '1' },
    });
    const built = buildSession(tmux, ws, size);
    expect(built).toEqual({ paneIds: ['%0', '%2', '%1'], editorPaneId: '%3' });
    expect(tmux.calls).toEqual([
      [
        'new-session',
        '-d',
        '-s',
        'app',
        '-n',
        'apps',
        '-c',
        '/r',
        '-e',
        'P=1',
        '-x',
        '200',
        '-y',
        '50',
        '-P',
        '-F',
        '#{pane_id}',
      ],
      ['set-option', '-t', '=app:', '@pk_layout', 'default'],
      ['split-window', '-h', '-t', '%0', '-l', '50%', '-c', '/r/c', '-e', 'P=1', '-P', '-F', '#{pane_id}'],
      [
        'split-window',
        '-v',
        '-t',
        '%0',
        '-l',
        '50%',
        '-c',
        '/r/b',
        '-e',
        'P=1',
        '-e',
        'K=V',
        '-P',
        '-F',
        '#{pane_id}',
      ],
      ['new-window', '-d', '-t', '=app:', '-n', 'editor', '-c', '/r', '-e', 'P=1', '-P', '-F', '#{pane_id}'],
      ['send-keys', '-t', '%0', '-l', 'one'],
      ['send-keys', '-t', '%0', 'Enter'],
      ['send-keys', '-t', '%2', '-l', 'two'],
      ['send-keys', '-t', '%2', 'Enter'],
      ['send-keys', '-t', '%3', '-l', 'nvim .'],
      ['send-keys', '-t', '%3', 'Enter'],
      ['select-pane', '-t', '%0'],
      ['select-window', '-t', '%3'],
    ]);
  });

  test('3 columns, 3 rows: split sizes give equal parts', () => {
    const tmux = fakeTmux();
    const ws = workspace({ layout: { maxColumns: 3 } }, ['1', '2', '3', '4', '5', '6', '7']);
    buildSession(tmux, ws, size);
    const splits = tmux.calls.filter((c) => c[0] === 'split-window').map((c) => `${c[1]} ${c[3]} ${c[5]}`);
    // columns [1,2,3] [4,5] [6,7]
    expect(splits).toEqual(['-h %0 67%', '-h %1 50%', '-v %0 67%', '-v %3 50%', '-v %1 50%', '-v %2 50%']);
  });

  test('focus apps, editor disabled, pane titles, send delay', () => {
    const tmux = fakeTmux();
    const ws = workspace({ focus: 'apps', editor: { enabled: false }, paneTitles: true, sendDelayMs: 1 }, [
      { name: 'web', cmd: 'w' },
      { cmd: 'x' },
    ]);
    const built = buildSession(tmux, ws, size);
    expect(built.editorPaneId).toBeUndefined();
    expect(tmux.calls.some((c) => c[0] === 'new-window')).toBe(false);
    expect(tmux.calls).toContainEqual(['set-option', '-w', '-t', '%0', 'pane-border-status', 'top']);
    expect(tmux.calls).toContainEqual(['select-pane', '-t', '%0', '-T', 'web']);
    expect(tmux.calls.filter((c) => c.includes('-T'))).toHaveLength(1);
    expect(tmux.calls.at(-1)).toEqual(['select-window', '-t', '%0']);
  });

  test('focus editor without editor falls back to apps', () => {
    const tmux = fakeTmux();
    buildSession(tmux, workspace({ editor: { enabled: false } }, ['x']), size);
    expect(tmux.calls.at(-1)).toEqual(['select-window', '-t', '%0']);
  });
});
