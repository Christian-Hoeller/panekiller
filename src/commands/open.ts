import type { OpenFlags } from '../args';
import { loadConfig } from '../config/load';
import { type ResolvedWorkspace, resolve } from '../config/resolve';
import type { Config } from '../config/schema';
import type { Context } from '../context';
import { buildSession } from '../tmux/build';
import type { Tmux } from '../tmux/client';
import { enterSession, killSession, sessionExists, sessionLayout } from '../tmux/session';
import { PkError } from '../util/errors';
import { findProjectByCwd, resolvePath } from '../util/paths';
import { decide, parseAnswer, promptText } from './decide';
import { formatLs } from './ls';

export function projectRoots(config: Config, home: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config.projects).map(([id, p]) => [id, resolvePath(p.root, '/', home)]),
  );
}

export type OpenArgs = { project?: string; layout?: string; flags: OpenFlags };

function build(ctx: Context, tmux: Tmux, ws: ResolvedWorkspace): void {
  buildSession(tmux, ws, ctx.size);
}

export async function openCommand(ctx: Context, args: OpenArgs): Promise<number> {
  const { config } = loadConfig({ env: ctx.env, home: ctx.home, notice: ctx.err });
  const projectId = args.project ?? findProjectByCwd(ctx.cwd, projectRoots(config, ctx.home));
  if (!projectId) {
    ctx.out(formatLs(config, new Map()));
    ctx.err(`\nNo project contains ${ctx.cwd}. Run \`pk add\` to register this directory.`);
    return 1;
  }
  const ws = resolve(config, projectId, args.layout, { home: ctx.home, exists: ctx.exists });
  const tmux = ctx.tmux({ dryRun: args.flags.dryRun });
  const inside = Boolean(ctx.env.TMUX);
  const exists = sessionExists(tmux, ws.session);

  let action = decide(exists, args.flags, ctx.isTTY && !args.flags.dryRun);
  if (action === 'error' && args.flags.dryRun) action = 'attach';
  if (action === 'error') {
    const running = sessionLayout(tmux, ws.session);
    throw new PkError(
      `Session "${ws.session}" is already running (layout: ${running ?? 'unknown'}). ` +
        'Pass --attach to attach to it or --fresh to recreate it.',
    );
  }
  if (action === 'prompt') {
    const question = promptText(ws.session, sessionLayout(tmux, ws.session), ws.layoutId);
    let answer = parseAnswer(await ctx.ask(question));
    while (!answer) answer = parseAnswer(await ctx.ask('Please answer a, r or c: '));
    if (answer === 'cancel') {
      ctx.out('Cancelled.');
      return 0;
    }
    action = answer;
  }

  if (action === 'recreate') killSession(tmux, ws.session);
  if (action === 'create' || action === 'recreate') build(ctx, tmux, ws);

  if (args.flags.detached) {
    ctx.out(
      action === 'attach'
        ? `Session "${ws.session}" is already running.`
        : `Created session "${ws.session}" (layout ${ws.layoutId}).`,
    );
    return 0;
  }
  enterSession(tmux, ws.session, inside);
  return 0;
}
