import { PkError } from './util/errors';
import { closest } from './util/suggest';

export type OpenFlags = {
  fresh: boolean;
  attach: boolean;
  dryRun: boolean;
  detached: boolean;
};

export type Command =
  | { kind: 'open'; project?: string; layout?: string; flags: OpenFlags }
  | { kind: 'ls' }
  | { kind: 'edit' }
  | { kind: 'kill'; project?: string }
  | { kind: 'add' }
  | { kind: 'completions'; shell: 'zsh' }
  | { kind: 'complete'; words: string[] }
  | { kind: 'help' }
  | { kind: 'version' };

export const SUBCOMMANDS = ['ls', 'edit', 'kill', 'add', 'completions', 'help'] as const;

export const OPEN_FLAGS = ['--fresh', '--attach', '--dry-run', '--detached', '-d'] as const;
const GLOBAL_FLAGS = ['--help', '-h', '--version', '-v'] as const;

function unknownFlag(flag: string, valid: readonly string[]): PkError {
  const guess = closest(flag, valid);
  return new PkError(`Unknown flag ${flag}.${guess ? ` Did you mean ${guess}?` : ''} See pk --help.`);
}

function noArgs(name: string, rest: string[]): void {
  if (rest.length) throw new PkError(`pk ${name} takes no arguments (got: ${rest.join(' ')}).`);
}

export function parseArgs(argv: readonly string[]): Command {
  const [first, ...rest] = argv;
  if (first === '__complete') return { kind: 'complete', words: rest };
  if (argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };
  if (argv.includes('--version') || argv.includes('-v')) return { kind: 'version' };

  switch (first) {
    case 'help':
      return { kind: 'help' };
    case 'ls':
    case 'edit':
    case 'add':
      noArgs(first, rest);
      return { kind: first };
    case 'kill': {
      const flag = rest.find((a) => a.startsWith('-'));
      if (flag) throw unknownFlag(flag, GLOBAL_FLAGS);
      if (rest.length > 1) throw new PkError('pk kill takes at most one project.');
      return rest[0] === undefined ? { kind: 'kill' } : { kind: 'kill', project: rest[0] };
    }
    case 'completions': {
      if (rest.length !== 1 || rest[0] !== 'zsh') {
        throw new PkError('Usage: pk completions zsh (only zsh is supported).');
      }
      return { kind: 'completions', shell: 'zsh' };
    }
  }

  const flags: OpenFlags = { fresh: false, attach: false, dryRun: false, detached: false };
  const positionals: string[] = [];
  for (const a of argv) {
    if (a === '--fresh') flags.fresh = true;
    else if (a === '--attach') flags.attach = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--detached' || a === '-d') flags.detached = true;
    else if (a.startsWith('-')) throw unknownFlag(a, [...OPEN_FLAGS, ...GLOBAL_FLAGS]);
    else positionals.push(a);
  }
  if (flags.fresh && flags.attach) throw new PkError('--fresh and --attach cannot be combined.');
  if (positionals.length > 2) {
    throw new PkError(`Too many arguments: ${positionals.join(' ')}. Usage: pk [project] [layout] [flags]`);
  }
  const [project, layout] = positionals;
  return {
    kind: 'open',
    ...(project !== undefined && { project }),
    ...(layout !== undefined && { layout }),
    flags,
  };
}

export const HELP = `pk (panekiller): one command per project, panes set up.

Usage:
  pk                         open the project whose root contains $PWD
  pk <project> [layout]      open a project (default or given layout)
  pk ls                      list projects, layouts and running sessions
  pk edit                    open the config in $EDITOR, validate after
  pk kill [project]          kill the project's session (default: project of $PWD)
  pk add                     add $PWD as a project (interactive)
  pk completions zsh         print the zsh completion script

Flags (open):
  --fresh                    kill an existing session and rebuild it
  --attach                   attach to an existing session without asking
  --dry-run                  print the tmux commands instead of running them
  -d, --detached             create the session but don't attach/switch
  -h, --help                 show this help
  -v, --version              show the version

Config: $PK_CONFIG or \${XDG_CONFIG_HOME:-~/.config}/panekiller/config.json
`;
