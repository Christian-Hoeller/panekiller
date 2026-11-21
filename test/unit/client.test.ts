import { afterEach, describe, expect, test } from 'bun:test';
import { createTmux, formatCommand, shellQuote } from '../../src/tmux/client';
import {
  enterSession,
  killSession,
  runningSessions,
  sessionExists,
  sessionLayout,
} from '../../src/tmux/session';
import { TmuxError } from '../../src/util/errors';
import { fakeTmux } from '../helpers/fake';

const PATH = process.env.PATH;
afterEach(() => {
  process.env.PATH = PATH;
});

describe('client', () => {
  test('shellQuote / formatCommand', () => {
    expect(shellQuote('abc')).toBe('abc');
    expect(shellQuote('#{pane_id}')).toBe("'#{pane_id}'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(formatCommand(['send-keys', '-l', 'bun run dev'])).toBe("tmux send-keys -l 'bun run dev'");
  });

  test('dry-run prints mutating commands with the socket and fakes pane ids', () => {
    const lines: string[] = [];
    const t = createTmux({ socket: 's', dryRun: true, print: (l) => lines.push(l) });
    expect(t.exec(['new-session', '-P'])).toBe('%1\n');
    expect(t.exec(['send-keys', 'Enter'])).toBe('');
    t.interactive(['attach-session', '-t', '=x']);
    expect(lines).toEqual([
      'tmux -L s new-session -P',
      'tmux -L s send-keys Enter',
      'tmux -L s attach-session -t =x',
    ]);
  });

  test('query returns null on failure, exec throws TmuxError', () => {
    const t = createTmux({ socket: `pk-unit-${process.pid}` });
    expect(t.query(['has-session', '-t', '=nope'])).toBeNull();
    expect(() => t.exec(['kill-session', '-t', '=nope'])).toThrow(TmuxError);
  });

  test('tmux missing → exit code 2', () => {
    process.env.PATH = '/nonexistent';
    const t = createTmux();
    let err: unknown;
    try {
      t.query(['-V']);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TmuxError);
    expect((err as TmuxError).exitCode).toBe(2);
    expect(() => t.exec(['-V'])).toThrow('tmux not found');
    expect(() => t.interactive(['-V'])).toThrow('tmux not found');
    // dry-run tolerates a missing tmux for queries
    expect(createTmux({ dryRun: true, print: () => {} }).query(['has-session'])).toBeNull();
  });

  test('interactive surfaces non-zero exits', () => {
    expect(() =>
      createTmux({ socket: `pk-unit-${process.pid}` }).interactive(['has-session', '-t', '=nope']),
    ).toThrow('exited with 1');
  });

  test('real exec returns stdout', () => {
    expect(createTmux().exec(['-V'])).toStartWith('tmux ');
  });
});

describe('session helpers', () => {
  test('exists / layout / list / kill / enter', () => {
    const t = fakeTmux({ shop: 'dev', other: '' });
    expect(sessionExists(t, 'shop')).toBe(true);
    expect(sessionExists(t, 'nope')).toBe(false);
    expect(sessionLayout(t, 'shop')).toBe('dev');
    expect(sessionLayout(t, 'other')).toBeUndefined();
    expect(runningSessions(t)).toEqual(
      new Map([
        ['shop', 'dev'],
        ['other', ''],
      ]),
    );
    killSession(t, 'shop');
    expect(t.calls.at(-1)).toEqual(['kill-session', '-t', '=shop']);
    enterSession(t, 'x', true);
    expect(t.calls.at(-1)).toEqual(['switch-client', '-t', '=x']);
    enterSession(t, 'x', false);
    expect(t.calls.at(-1)).toEqual(['attach-session', '-t', '=x']);
    expect(runningSessions(fakeTmux())).toEqual(new Map());
  });
});
