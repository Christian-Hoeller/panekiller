import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import * as p from '@clack/prompts';
import { applyEdits, modify } from 'jsonc-parser';
import { loadConfig } from '../config/load';
import { ID_PATTERN, RESERVED_IDS } from '../config/schema';
import type { Context } from '../context';
import { PkError } from '../util/errors';
import { isInside, tildify } from '../util/paths';

export type ScriptCandidate = {
  /** Directory relative to the root, '' for the root itself. */
  dir: string;
  script: string;
  cmd: string;
  name: string;
};

type PackageJson = { name?: string; scripts?: Record<string, string>; workspaces?: unknown };

function readPackage(dir: string): PackageJson | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
  } catch {
    return undefined;
  }
}

export function runner(root: string): string {
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun run';
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm run';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm run';
}

function workspacePatterns(pkg: PackageJson | undefined): string[] {
  const ws = pkg?.workspaces;
  const list = Array.isArray(ws) ? ws : (ws as { packages?: unknown } | undefined)?.packages;
  const patterns = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  return [...new Set([...patterns, 'apps/*', 'packages/*'])];
}

/** Expands `dir/*` and literal directories (relative to root). Other globs are not supported. */
function expandPattern(root: string, pattern: string): string[] {
  const clean = pattern.replace(/\/+$/, '');
  if (!clean.endsWith('/*')) return existsSync(join(root, clean, 'package.json')) ? [clean] : [];
  const parent = clean.slice(0, -2);
  const abs = join(root, parent);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((d) => statSync(join(abs, d)).isDirectory() && existsSync(join(abs, d, 'package.json')))
    .sort()
    .map((d) => (parent ? `${parent}/${d}` : d));
}

export const isDevScript = (name: string): boolean => /^dev(\b|[:_-]|$)/.test(name);

/** Finds `dev*` scripts in the root package.json and in workspace packages. */
export function detectScripts(root: string): ScriptCandidate[] {
  const run = runner(root);
  const rootPkg = readPackage(root);
  const dirs = ['', ...workspacePatterns(rootPkg).flatMap((pat) => expandPattern(root, pat))];
  const out: ScriptCandidate[] = [];
  for (const dir of [...new Set(dirs)]) {
    const pkg = dir ? readPackage(join(root, dir)) : rootPkg;
    for (const script of Object.keys(pkg?.scripts ?? {}).filter(isDevScript)) {
      const suffix = script.replace(/^dev[:_-]?/, '');
      out.push({ dir, script, cmd: `${run} ${script}`, name: suffix || (dir ? basename(dir) : 'dev') });
    }
  }
  return out;
}

export type PaneEntry = string | { name?: string; cmd: string; cwd?: string };

export function paneEntry(c: ScriptCandidate): PaneEntry {
  return { name: c.name, cmd: c.cmd, ...(c.dir && { cwd: c.dir }) };
}

export type LayoutDraft = { id: string; panes: PaneEntry[] };

/** Project entry: a single layout object, or an array + default when there are several. */
export function buildEntry(root: string, layouts: LayoutDraft[]): Record<string, unknown> {
  const fix = (panes: PaneEntry[]) => (panes.length ? panes : [{ name: 'shell' }]);
  if (layouts.length <= 1) return { root, layouts: { panes: fix(layouts[0]?.panes ?? []) } };
  return {
    root,
    default: layouts[0]?.id,
    layouts: layouts.map((l) => ({ id: l.id, panes: fix(l.panes) })),
  };
}

/** Inserts `projects.<id>` keeping existing comments and formatting. */
export function insertProject(text: string, id: string, entry: unknown): string {
  const edits = modify(text, ['projects', id], entry, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
  });
  return applyEdits(text, edits);
}

/** How `root` is written: relative when under the config dir, else with `~`. */
export function rootFor(dir: string, configDir: string, home: string): string {
  return isInside(dir, configDir) && dir !== configDir ? relative(configDir, dir) : tildify(dir, home);
}

export function suggestId(dir: string): string {
  return (
    basename(dir)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^[^a-z0-9]+/, '') || 'project'
  );
}

export function validateId(id: string, existing: readonly string[]): string | undefined {
  if (!ID_PATTERN.test(id)) return 'Use lowercase letters, digits, - and _ (start with a letter or digit).';
  if ((RESERVED_IDS as readonly string[]).includes(id)) return `"${id}" is reserved.`;
  if (existing.includes(id)) return `"${id}" already exists.`;
  return undefined;
}

function cancelled<T>(v: T): Exclude<T, symbol> {
  if (p.isCancel(v)) {
    p.cancel('Cancelled.');
    throw new PkError('Cancelled.', 0);
  }
  return v as Exclude<T, symbol>;
}

async function pickPanes(candidates: ScriptCandidate[], root: string, message: string): Promise<PaneEntry[]> {
  if (!candidates.length) {
    const cmd = cancelled(
      await p.text({ message: `${message} (no dev scripts found; empty = plain shell)` }),
    );
    return cmd?.trim() ? [cmd.trim()] : [];
  }
  const picked = cancelled(
    await p.multiselect({
      message,
      required: false,
      options: candidates.map((c, i) => ({
        value: i,
        label: c.cmd,
        hint: c.dir ? relative(root, join(root, c.dir)) : 'root',
      })),
    }),
  );
  return picked.map((i) => paneEntry(candidates[i] as ScriptCandidate));
}

export async function addCommand(ctx: Context): Promise<number> {
  const { config, path, text } = loadConfig({ env: ctx.env, home: ctx.home, notice: ctx.err });
  const existing = Object.keys(config.projects);
  const candidates = detectScripts(ctx.cwd);

  p.intro('pk add');
  const id = cancelled(
    await p.text({
      message: 'Project id',
      initialValue: suggestId(ctx.cwd),
      validate: (v) => validateId(v ?? '', existing),
    }),
  );
  const first = await pickPanes(candidates, ctx.cwd, 'Panes (space to toggle)');
  const layouts: LayoutDraft[] = [{ id: 'dev', panes: first }];
  while (cancelled(await p.confirm({ message: 'Add another layout?', initialValue: false }))) {
    if (layouts.length === 1) {
      layouts[0] = {
        id: cancelled(
          await p.text({
            message: 'Id of the first layout',
            initialValue: 'dev',
            validate: (v) => validateId(v ?? '', []),
          }),
        ),
        panes: first,
      };
    }
    const taken = layouts.map((l) => l.id);
    const lid = cancelled(
      await p.text({ message: 'Layout id', validate: (v) => validateId(v ?? '', taken) }),
    );
    layouts.push({ id: lid, panes: await pickPanes(candidates, ctx.cwd, `Panes for "${lid}"`) });
  }

  const entry = buildEntry(rootFor(ctx.cwd, dirname(path), ctx.home), layouts);
  writeFileSync(path, insertProject(text, id, entry));
  p.note(JSON.stringify({ [id]: entry }, null, 2), `Added to ${tildify(path, ctx.home)}`);
  p.outro(`Run it: pk ${id}`);
  return 0;
}
