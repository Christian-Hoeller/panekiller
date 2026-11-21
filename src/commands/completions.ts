import { SUBCOMMANDS } from '../args';
import { layoutIds, sessionName } from '../config/resolve';
import type { Config } from '../config/schema';

export type Candidate = { value: string; description: string };

const SUBCOMMAND_HELP: Record<(typeof SUBCOMMANDS)[number], string> = {
  ls: 'list projects and running sessions',
  edit: 'edit the config',
  kill: 'kill a project session',
  add: 'add the current directory as a project',
  completions: 'print the shell completion script',
  help: 'show help',
};

const FLAG_HELP: Candidate[] = [
  { value: '--fresh', description: 'kill and rebuild an existing session' },
  { value: '--attach', description: 'attach to an existing session without asking' },
  { value: '--dry-run', description: 'print the tmux commands' },
  { value: '--detached', description: "create the session, don't attach" },
  { value: '--help', description: 'show help' },
  { value: '--version', description: 'show the version' },
];

function projectCandidates(config: Config, ids = Object.keys(config.projects)): Candidate[] {
  return ids.map((id) => ({ value: id, description: config.projects[id]?.root ?? '' }));
}

/**
 * Completion candidates. `words` are the words after `pk`, the last one being the word under the cursor
 * (possibly empty). `running` holds running session names (only consulted for `kill`).
 */
export function completionCandidates(
  config: Config,
  words: readonly string[],
  running: () => Set<string>,
): Candidate[] {
  const current = words.at(-1) ?? '';
  const before = words.slice(0, -1).filter((w) => !w.startsWith('-'));
  const [first] = before;
  if (current.startsWith('-')) {
    return first === undefined || config.projects[first] ? FLAG_HELP : [];
  }
  if (before.length === 0) {
    return [
      ...projectCandidates(config),
      ...SUBCOMMANDS.map((s) => ({ value: s, description: SUBCOMMAND_HELP[s] })),
    ];
  }
  if (before.length !== 1 || first === undefined) return [];
  if (first === 'kill') {
    const live = running();
    const ids = Object.keys(config.projects);
    const up = ids.filter((id) => live.has(sessionName(id)));
    return [
      ...up.map((id) => ({ value: id, description: 'running' })),
      ...projectCandidates(
        config,
        ids.filter((id) => !up.includes(id)),
      ),
    ];
  }
  if (first === 'completions') return [{ value: 'zsh', description: 'zsh completion script' }];
  const project = config.projects[first];
  if (!project) return [];
  const layouts = Array.isArray(project.layouts) ? project.layouts : [project.layouts];
  return layoutIds(project).map((id, i) => {
    const panes = layouts[i]?.panes ?? [];
    const names = panes.map((p) => (typeof p === 'string' ? p : (p.name ?? p.cmd ?? 'shell')));
    return { value: id, description: names.join(', ') };
  });
}

/** `value:description` lines for zsh's _describe. */
export function formatCandidates(candidates: readonly Candidate[]): string {
  return candidates.map((c) => `${c.value}:${c.description.replace(/:/g, '\\:')}`).join('\n');
}

export const ZSH_SCRIPT = `#compdef pk
# pk (panekiller) zsh completion. Setup: eval "$(pk completions zsh)" in ~/.zshrc
_pk() {
  local -a candidates
  candidates=("\${(@f)$(pk __complete "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  [[ -z "\${candidates[*]}" ]] && return 1
  _describe -V -t pk 'pk' candidates
}
if ! (( $+functions[compdef] )); then
  autoload -Uz compinit && compinit
fi
compdef _pk pk
`;
