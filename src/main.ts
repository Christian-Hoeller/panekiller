import { version } from '../package.json' with { type: 'json' };
import { HELP, parseArgs } from './args';
import { addCommand } from './commands/add';
import { completionCandidates, formatCandidates, ZSH_SCRIPT } from './commands/completions';
import { editCommand } from './commands/edit';
import { killCommand } from './commands/kill';
import { lsCommand } from './commands/ls';
import { openCommand } from './commands/open';
import { loadConfig } from './config/load';
import type { Context } from './context';
import { runningSessions } from './tmux/session';
import { PkError } from './util/errors';

export const VERSION: string = version;

function complete(ctx: Context, words: string[]): number {
  try {
    const { config } = loadConfig({ env: ctx.env, home: ctx.home, readOnly: true });
    const running = () => new Set(runningSessions(ctx.tmux({ dryRun: false })).keys());
    const out = formatCandidates(completionCandidates(config, words, running));
    if (out) ctx.out(out);
  } catch {
    // completion must never print errors into the prompt
  }
  return 0;
}

export async function main(argv: string[], ctx: Context): Promise<number> {
  try {
    const cmd = parseArgs(argv);
    switch (cmd.kind) {
      case 'help':
        ctx.out(HELP);
        return 0;
      case 'version':
        ctx.out(VERSION);
        return 0;
      case 'completions':
        ctx.out(ZSH_SCRIPT);
        return 0;
      case 'complete':
        return complete(ctx, cmd.words);
      case 'ls':
        return lsCommand(ctx);
      case 'edit':
        return editCommand(ctx);
      case 'kill':
        return killCommand(ctx, cmd.project);
      case 'add':
        return await addCommand(ctx);
      case 'open':
        return await openCommand(ctx, cmd);
    }
  } catch (e) {
    if (e instanceof PkError) {
      if (e.exitCode !== 0) ctx.err(`pk: ${e.message}`);
      return e.exitCode;
    }
    throw e;
  }
}
