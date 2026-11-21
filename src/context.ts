import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import type { Env } from './config/load';
import type { Size } from './tmux/build';
import { createTmux, type Tmux } from './tmux/client';

/** Everything commands touch outside their arguments; swapped for fakes in tests. */
export type Context = {
  env: Env;
  cwd: string;
  home: string;
  isTTY: boolean;
  size: Size;
  out: (text: string) => void;
  err: (text: string) => void;
  exists: (path: string) => boolean;
  tmux: (opts: { dryRun: boolean }) => Tmux;
  ask: (question: string) => Promise<string>;
};

export function defaultContext(): Context {
  const env = process.env;
  const out = (t: string) => process.stdout.write(t.endsWith('\n') ? t : `${t}\n`);
  return {
    env,
    cwd: process.cwd(),
    home: env.HOME || homedir(),
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    size: { cols: process.stdout.columns || 200, lines: process.stdout.rows || 50 },
    out,
    err: (t) => process.stderr.write(t.endsWith('\n') ? t : `${t}\n`),
    exists: existsSync,
    tmux: ({ dryRun }) =>
      createTmux({ ...(env.PK_TMUX_SOCKET && { socket: env.PK_TMUX_SOCKET }), dryRun, print: out }),
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };
}
