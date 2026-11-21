import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { configPath, loadConfig, parseJsonc, validateConfig } from '../config/load';
import type { Context } from '../context';
import { PkError } from '../util/errors';

/** `$EDITOR` may carry arguments (`code -w`); it is split on whitespace, never run through a shell. */
export function editorCommand(env: Context['env']): [string, ...string[]] {
  const parts = (env.VISUAL || env.EDITOR || '').trim().split(/\s+/).filter(Boolean);
  const [bin, ...args] = parts;
  return bin ? [bin, ...args] : ['nvim'];
}

export function checkConfigFile(path: string): string[] {
  try {
    validateConfig(parseJsonc(readFileSync(path, 'utf8'), path), path);
    return [];
  } catch (e) {
    if (e instanceof PkError) return [e.message];
    throw e;
  }
}

export function editCommand(ctx: Context): number {
  const path = configPath(ctx.env, ctx.home);
  try {
    loadConfig({ env: ctx.env, home: ctx.home, notice: ctx.err });
  } catch (e) {
    if (!(e instanceof PkError)) throw e;
  }
  const [bin, ...args] = editorCommand(ctx.env);
  const r = spawnSync(bin, [...args, path], { stdio: 'inherit' });
  if (r.error) throw new PkError(`Could not start editor "${bin}": ${r.error.message}`);
  const errors = checkConfigFile(path);
  if (errors.length) {
    ctx.err(errors.join('\n'));
    return 1;
  }
  ctx.out('✓ config valid');
  return 0;
}
