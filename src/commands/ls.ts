import { loadConfig } from '../config/load';
import { defaultLayoutId, layoutIds, sessionName } from '../config/resolve';
import type { Config } from '../config/schema';
import type { Context } from '../context';
import { runningSessions } from '../tmux/session';

function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? [];
  return rows
    .map((r) =>
      r
        .map((cell, i) => cell.padEnd(widths[i] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

/** `pk ls` table. `running` maps session name → @pk_layout. */
export function formatLs(config: Config, running: Map<string, string>): string {
  const ids = Object.keys(config.projects);
  if (!ids.length) return 'No projects configured yet.';
  const rows = [['PROJECT', 'ROOT', 'LAYOUTS', 'STATUS']];
  for (const id of ids) {
    const project = config.projects[id];
    if (!project) continue;
    const def = defaultLayoutId(project);
    const layouts = layoutIds(project)
      .map((l) => (l === def ? `${l}*` : l))
      .join(', ');
    const session = running.get(sessionName(id));
    const status = session === undefined ? '' : `● running (layout ${session || '?'})`;
    rows.push([id, project.root, layouts, status]);
  }
  return table(rows);
}

export function lsCommand(ctx: Context): number {
  const { config } = loadConfig({ env: ctx.env, home: ctx.home, notice: ctx.err });
  ctx.out(formatLs(config, runningSessions(ctx.tmux({ dryRun: false }))));
  return 0;
}
