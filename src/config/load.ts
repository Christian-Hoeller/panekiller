import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type ParseError, parse, printParseErrorCode } from 'jsonc-parser';
import { PkError } from '../util/errors';
import { type Config, configSchema, formatIssues, jsonSchemaText } from './schema';

export type Env = Record<string, string | undefined>;

export function configPath(env: Env, home: string): string {
  if (env.PK_CONFIG) return env.PK_CONFIG;
  const base = env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, 'panekiller', 'config.json');
}

export const STARTER_CONFIG = `// panekiller (pk) config. JSONC: comments and trailing commas are fine.
//
// Each project has a root and one or more layouts. A layout is a list of panes;
// a pane is a command string (run in root) or { "cmd", "cwd", "name", "env" }.
// One layout: "layouts": { "panes": [...] }
// Several:    "layouts": [{ "id": "dev", "panes": [...] }, ...] plus "default": "dev"
//
// Run \`pk add\` inside a project to scaffold an entry, \`pk edit\` to edit this file.
// Full reference: https://github.com/Christian-Hoeller/panekiller#config
{
  "$schema": "./schema.json",
  "settings": {
    "layout": { "maxColumns": 2, "extraPane": "left" },
    "editor": { "enabled": true, "windowName": "editor", "cmd": "nvim ." },
    "appsWindowName": "apps",
    "focus": "editor",
    "paneTitles": false
  },
  "projects": {
    // "my-app": {
    //   "root": "~/projects/my-app",
    //   "layouts": { "panes": ["bun run dev"] }
    // }
  }
}
`;

export function parseJsonc(text: string, file = 'config.json'): unknown {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) {
    const lines = errors.map((e) => {
      const before = text.slice(0, e.offset).split('\n');
      const line = before.length;
      const col = (before.at(-1)?.length ?? 0) + 1;
      return `${file}:${line}:${col}: ${printParseErrorCode(e.error)}`;
    });
    throw new PkError(`Invalid JSON in config:\n  ${lines.join('\n  ')}`);
  }
  return value;
}

export function validateConfig(raw: unknown, file = 'config.json'): Config {
  const r = configSchema.safeParse(raw);
  if (!r.success) {
    throw new PkError(`Invalid config (${file}):\n  ${formatIssues(r.error).join('\n  ')}`);
  }
  return r.data;
}

/** Writes schema.json next to the config if missing or different. Returns true if written. */
export function syncSchema(dir: string): boolean {
  const file = join(dir, 'schema.json');
  const text = jsonSchemaText();
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeFileSync(file, text);
  return true;
}

export type LoadOptions = {
  env: Env;
  home: string;
  /** Called with a message when the starter config is created. */
  notice?: (msg: string) => void;
  /** No writes at all (completion). A missing config yields an empty one. */
  readOnly?: boolean;
};

export type Loaded = { config: Config; path: string; text: string };

export function loadConfig(opts: LoadOptions): Loaded {
  const path = configPath(opts.env, opts.home);
  if (!existsSync(path)) {
    if (opts.readOnly) return { config: validateConfig({}), path, text: '' };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, STARTER_CONFIG);
    opts.notice?.(`Created starter config at ${path}`);
  }
  if (!opts.readOnly) syncSchema(dirname(path));
  const text = readFileSync(path, 'utf8');
  return { config: validateConfig(parseJsonc(text, path), path), path, text };
}
