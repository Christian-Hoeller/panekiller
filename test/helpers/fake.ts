import type { Context } from '../../src/context';
import type { Tmux } from '../../src/tmux/client';

export type FakeTmux = Tmux & { calls: string[][]; sessions: Map<string, string> };

/** In-memory tmux: records every call, knows which sessions exist and their @pk_layout. */
export function fakeTmux(sessions: Record<string, string> = {}): FakeTmux {
  const state = new Map(Object.entries(sessions));
  const calls: string[][] = [];
  let id = 0;
  const name = (t: string | undefined) => (t ?? '').replace(/^=/, '').replace(/:$/, '');
  const target = (args: string[]) => name(args[args.indexOf('-t') + 1]);
  return {
    calls,
    sessions: state,
    query(args) {
      calls.push(args);
      const [cmd] = args;
      if (cmd === 'has-session') return state.has(target(args)) ? '' : null;
      if (cmd === 'show-options') return state.get(target(args)) ?? null;
      if (cmd === 'list-sessions') {
        return state.size ? [...state].map(([n, l]) => `${n}\t${l}`).join('\n') : null;
      }
      return '';
    },
    exec(args) {
      calls.push(args);
      const [cmd] = args;
      if (cmd === 'new-session') state.set(args[args.indexOf('-s') + 1] ?? '', '');
      if (cmd === 'set-option' && args.includes('@pk_layout')) {
        state.set(target(args), args.at(-1) ?? '');
      }
      if (cmd === 'kill-session') state.delete(target(args));
      return args.includes('-P') ? `%${id++}\n` : '';
    },
    interactive(args) {
      calls.push(args);
    },
  };
}

export type FakeContext = Context & {
  stdout: string[];
  stderr: string[];
  tmuxFake: FakeTmux;
  answers: string[];
};

export function fakeContext(
  over: Partial<Context> & { sessions?: Record<string, string>; answers?: string[] } = {},
): FakeContext {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const tmuxFake = fakeTmux(over.sessions);
  const answers = [...(over.answers ?? [])];
  const { sessions: _s, answers: _a, ...rest } = over;
  return {
    env: {},
    cwd: '/',
    home: '/home/u',
    isTTY: false,
    size: { cols: 200, lines: 50 },
    out: (t) => stdout.push(t),
    err: (t) => stderr.push(t),
    exists: () => true,
    tmux: () => tmuxFake,
    ask: async () => answers.shift() ?? '',
    ...rest,
    stdout,
    stderr,
    tmuxFake,
    answers,
  };
}
