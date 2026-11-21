export type Decision = 'create' | 'attach' | 'recreate' | 'prompt' | 'error';

export type DecideFlags = { fresh: boolean; attach: boolean };

/** What to do given whether the session exists. `--fresh`/`--attach` win over asking; no TTY means no asking. */
export function decide(sessionExists: boolean, flags: DecideFlags, isTTY: boolean): Decision {
  if (!sessionExists) return 'create';
  if (flags.fresh) return 'recreate';
  if (flags.attach) return 'attach';
  return isTTY ? 'prompt' : 'error';
}

export type PromptAnswer = 'attach' | 'recreate' | 'cancel';

/** Maps a prompt reply to an action. Empty = attach (the default). Unknown → undefined (ask again). */
export function parseAnswer(reply: string): PromptAnswer | undefined {
  const r = reply.trim().toLowerCase();
  if (r === '' || r === 'a' || r === 'attach') return 'attach';
  if (r === 'r' || r === 'recreate') return 'recreate';
  if (r === 'c' || r === 'cancel' || r === 'q') return 'cancel';
  return undefined;
}

export function promptText(session: string, runningLayout: string | undefined, wantedLayout: string): string {
  return `Session "${session}" is already running (layout: ${runningLayout ?? 'unknown'}). [a]ttach / [r]ecreate with layout "${wantedLayout}" / [c]ancel `;
}
