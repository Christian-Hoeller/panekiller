import type { Tmux } from './client';

/** `=name` makes tmux match the session name exactly instead of by prefix. */
export const exact = (session: string): string => `=${session}`;

/** Same as `exact` for commands whose -t is a pane/window target (set-option, new-window). */
export const exactTarget = (session: string): string => `=${session}:`;

export const LAYOUT_OPTION = '@pk_layout';

export function sessionExists(tmux: Tmux, session: string): boolean {
  return tmux.query(['has-session', '-t', exact(session)]) !== null;
}

export function sessionLayout(tmux: Tmux, session: string): string | undefined {
  const out = tmux.query(['show-options', '-qv', '-t', exactTarget(session), LAYOUT_OPTION]);
  return out?.trim() || undefined;
}

/** Running sessions → their `@pk_layout` ('' if not a pk session). */
export function runningSessions(tmux: Tmux): Map<string, string> {
  const out = tmux.query(['list-sessions', '-F', `#{session_name}\t#{${LAYOUT_OPTION}}`]);
  const map = new Map<string, string>();
  for (const line of out?.split('\n') ?? []) {
    if (!line) continue;
    const [name = '', layout = ''] = line.split('\t');
    map.set(name, layout);
  }
  return map;
}

export function killSession(tmux: Tmux, session: string): void {
  tmux.exec(['kill-session', '-t', exact(session)]);
}

/** Inside tmux switch the current client, outside attach. Never nests. */
export function enterSession(tmux: Tmux, session: string, insideTmux: boolean): void {
  if (insideTmux) tmux.exec(['switch-client', '-t', exact(session)]);
  else tmux.interactive(['attach-session', '-t', exact(session)]);
}
