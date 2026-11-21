import { loadConfig } from '../config/load';
import { sessionName } from '../config/resolve';
import type { Context } from '../context';
import { killSession, sessionExists } from '../tmux/session';
import { PkError } from '../util/errors';
import { findProjectByCwd } from '../util/paths';
import { unknownMessage } from '../util/suggest';
import { projectRoots } from './open';

export function killCommand(ctx: Context, project: string | undefined): number {
  const { config } = loadConfig({ env: ctx.env, home: ctx.home, notice: ctx.err });
  const id = project ?? findProjectByCwd(ctx.cwd, projectRoots(config, ctx.home));
  if (!id) throw new PkError(`No project contains ${ctx.cwd}. Usage: pk kill <project>`);
  const tmux = ctx.tmux({ dryRun: false });
  const session = sessionName(id);
  if (sessionExists(tmux, session)) {
    killSession(tmux, session);
    ctx.out(`Killed session "${session}".`);
    return 0;
  }
  if (!config.projects[id]) throw new PkError(unknownMessage('project', id, Object.keys(config.projects)));
  ctx.out(`No session running for "${id}".`);
  return 0;
}
