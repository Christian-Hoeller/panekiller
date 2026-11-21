import { PkError } from '../util/errors';
import { deepMerge } from '../util/merge';
import { resolvePath } from '../util/paths';
import { unknownMessage } from '../util/suggest';
import type { Config, EditorSettings, Layout, Pane, Project, Settings } from './schema';

/** Layout id used for a project whose single layout object has no id. */
export const SINGLE_LAYOUT_ID = 'default';

export type ResolvedPane = {
  cmd?: string;
  cwd: string;
  name?: string;
  env: Record<string, string>;
};

export type ResolvedWorkspace = {
  projectId: string;
  layoutId: string;
  session: string;
  root: string;
  env: Record<string, string>;
  editor: EditorSettings;
  settings: Omit<Settings, 'editor'>;
  panes: ResolvedPane[];
};

export type ResolveOptions = {
  home: string;
  /** Path existence check; inject for tests. */
  exists: (path: string) => boolean;
};

export function sessionName(projectId: string): string {
  return projectId.replace(/[.:]/g, '-');
}

export function layoutIds(project: Project): string[] {
  return Array.isArray(project.layouts)
    ? project.layouts.map((l) => l.id ?? '')
    : [project.layouts.id ?? SINGLE_LAYOUT_ID];
}

export function defaultLayoutId(project: Project): string {
  if (Array.isArray(project.layouts)) return project.default ?? project.layouts[0]?.id ?? '';
  return project.layouts.id ?? SINGLE_LAYOUT_ID;
}

function pickLayout(projectId: string, project: Project, layoutId?: string): { id: string; layout: Layout } {
  const id = layoutId ?? defaultLayoutId(project);
  const layouts = Array.isArray(project.layouts) ? project.layouts : [project.layouts];
  const ids = layoutIds(project);
  const idx = ids.indexOf(id);
  const layout = layouts[idx];
  if (!layout) throw new PkError(unknownMessage('layout', id, ids, ` for project "${projectId}"`));
  return { id, layout };
}

function normalizePane(p: Pane): Exclude<Pane, string> {
  return typeof p === 'string' ? { cmd: p } : p;
}

export function resolve(
  config: Config,
  projectId: string,
  layoutId: string | undefined,
  opts: ResolveOptions,
): ResolvedWorkspace {
  const project = config.projects[projectId];
  if (!project) throw new PkError(unknownMessage('project', projectId, Object.keys(config.projects)));
  const { id, layout } = pickLayout(projectId, project, layoutId);

  const { editor: baseEditor, ...settings } = config.settings;
  const { layouts: _l, default: _d, ...projectBase } = project;
  const { id: _id, panes, ...layoutBase } = layout;
  const merged = deepMerge<{ root: string; editor: EditorSettings; env: Record<string, string> }>(
    { root: project.root, editor: baseEditor, env: {} },
    projectBase,
    layoutBase,
  );

  const root = resolvePath(merged.root, '/', opts.home);
  const resolvedPanes = panes.map(normalizePane).map(
    (p): ResolvedPane => ({
      ...(p.cmd !== undefined && { cmd: p.cmd }),
      ...(p.name !== undefined && { name: p.name }),
      cwd: p.cwd ? resolvePath(p.cwd, root, opts.home) : root,
      env: { ...merged.env, ...p.env },
    }),
  );

  const missing = [...new Set([root, ...resolvedPanes.map((p) => p.cwd)])].filter((p) => !opts.exists(p));
  if (missing.length) {
    throw new PkError(`Missing paths for "${projectId}" (layout ${id}):\n  ${missing.join('\n  ')}`);
  }

  return {
    projectId,
    layoutId: id,
    session: sessionName(projectId),
    root,
    env: merged.env,
    editor: merged.editor,
    settings,
    panes: resolvedPanes,
  };
}
