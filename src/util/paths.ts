import { realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

export function expandHome(p: string, home: string): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

/** `~` → home, relative → against `base`, result absolute and normalized. */
export function resolvePath(p: string, base: string, home: string): string {
  const expanded = expandHome(p, home);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(base, expanded);
}

/** Inverse of expandHome for display/storage. */
export function tildify(p: string, home: string): string {
  if (p === home) return '~';
  return p.startsWith(home + sep) ? `~/${p.slice(home.length + 1)}` : p;
}

export function isInside(child: string, parent: string): boolean {
  if (child === parent) return true;
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}

export function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Project whose root contains `cwd`; the deepest root wins.
 * Both the given and the symlink-resolved forms of each path are compared.
 */
export function findProjectByCwd(
  cwd: string,
  roots: Record<string, string>,
  real: (p: string) => string = safeRealpath,
): string | undefined {
  const cwds = new Set([resolve(cwd), real(cwd)]);
  let best: { id: string; depth: number } | undefined;
  for (const [id, root] of Object.entries(roots)) {
    for (const r of new Set([resolve(root), real(root)])) {
      const hit = [...cwds].some((c) => isInside(c, r));
      if (hit && (!best || r.length > best.depth)) best = { id, depth: r.length };
    }
  }
  return best?.id;
}
