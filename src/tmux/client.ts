import { execFileSync, spawnSync } from 'node:child_process';
import { TmuxError } from '../util/errors';

export type Tmux = {
  /** Read-only query. Returns stdout, or null if tmux exits non-zero (e.g. no such session / no server). */
  query(args: string[]): string | null;
  /** Mutating command. Throws TmuxError on failure. In dry-run mode it is printed instead. */
  exec(args: string[]): string;
  /** Hands the terminal to tmux (attach-session). In dry-run mode it is printed instead. */
  interactive(args: string[]): void;
};

export type ClientOptions = {
  socket?: string;
  dryRun?: boolean;
  /** Receives dry-run lines. */
  print?: (line: string) => void;
};

/** Quotes an argument for display only; tmux itself never goes through a shell. */
export function shellQuote(arg: string): string {
  if (/^[\w@%+=:,./#-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(args: string[]): string {
  return ['tmux', ...args].map(shellQuote).join(' ');
}

function isEnoent(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'ENOENT';
}

function stderrOf(e: unknown): string {
  const s = (e as { stderr?: unknown }).stderr;
  return (typeof s === 'string' ? s : Buffer.isBuffer(s) ? s.toString('utf8') : '').trim();
}

const NOT_FOUND = 'tmux not found. Install tmux >= 3.2 (brew install tmux / apt install tmux).';

export function createTmux(opts: ClientOptions = {}): Tmux {
  const base = opts.socket ? ['-L', opts.socket] : [];
  const print = opts.print ?? ((line: string) => process.stdout.write(`${line}\n`));
  let fakeId = 0;

  const run = (args: string[]): string => {
    try {
      return execFileSync('tmux', [...base, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // explicit env: Bun otherwise resolves the binary with the PATH from process start
        env: process.env,
      });
    } catch (e) {
      if (isEnoent(e)) throw new TmuxError(NOT_FOUND);
      throw new TmuxError(`tmux ${args[0]} failed: ${stderrOf(e) || String(e)}`);
    }
  };

  return {
    query(args) {
      try {
        return run(args);
      } catch (e) {
        if (e instanceof TmuxError && e.message === NOT_FOUND && !opts.dryRun) throw e;
        return null;
      }
    },
    exec(args) {
      if (opts.dryRun) {
        print(formatCommand([...base, ...args]));
        return args.includes('-P') ? `%${++fakeId}\n` : '';
      }
      return run(args);
    },
    interactive(args) {
      if (opts.dryRun) {
        print(formatCommand([...base, ...args]));
        return;
      }
      const r = spawnSync('tmux', [...base, ...args], { stdio: 'inherit', env: process.env });
      if (r.error) throw isEnoent(r.error) ? new TmuxError(NOT_FOUND) : new TmuxError(String(r.error));
      if (r.status !== 0) throw new TmuxError(`tmux ${args[0]} exited with ${r.status}`);
    },
  };
}
