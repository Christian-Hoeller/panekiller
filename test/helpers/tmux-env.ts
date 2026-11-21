import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REPO = join(import.meta.dir, '..', '..');
export const CLI = join(REPO, 'src', 'cli.ts');
export const FAKE_DEV = join(REPO, 'test', 'fixtures', 'fake-dev.sh');

function which(bin: string): string {
  return execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).trim();
}

export type RunResult = { code: number; stdout: string; stderr: string };

/** An isolated pk world: own tmux server, temp HOME/XDG, marker dir, config. */
export class World {
  readonly dir = realpathSync(mkdtempSync(join(tmpdir(), 'pk-it-')));
  readonly home = join(this.dir, 'home');
  readonly marks = join(this.dir, 'marks');
  readonly socket = `pk-test-${Math.random().toString(36).slice(2, 10)}`;
  readonly configFile = join(this.home, '.config', 'panekiller', 'config.json');
  readonly env: Record<string, string>;

  constructor() {
    mkdirSync(this.marks, { recursive: true });
    mkdirSync(join(this.home, '.config', 'panekiller'), { recursive: true });
    // a plain zsh: no user rc, no new-user wizard, simple prompt
    writeFileSync(join(this.home, '.zshrc'), "PROMPT='%% '\nunsetopt BEEP\n");
    // Ubuntu's /etc/zsh/zshrc runs compinit, whose prompts would swallow the typed command
    writeFileSync(join(this.home, '.zshenv'), 'skip_global_compinit=1\n');
    const base: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !k.startsWith('TMUX') && !k.startsWith('PK_') && k !== 'ZDOTDIR') base[k] = v;
    }
    this.env = {
      ...base,
      HOME: this.home,
      XDG_CONFIG_HOME: join(this.home, '.config'),
      SHELL: which('zsh'),
      PK_TMUX_SOCKET: this.socket,
      PK_MARK_DIR: this.marks,
      TERM: 'xterm-256color',
    };
  }

  project(name: string, ...subdirs: string[]): string {
    const root = join(this.home, 'projects', name);
    for (const d of ['', ...subdirs]) mkdirSync(join(root, d), { recursive: true });
    return root;
  }

  writeConfig(config: unknown): void {
    writeFileSync(this.configFile, JSON.stringify(config, null, 2));
  }

  pk(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): RunResult {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd: opts.cwd ?? this.home,
      env: { ...this.env, ...opts.env },
      encoding: 'utf8',
    });
    return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
  }

  tmux(...args: string[]): string {
    return execFileSync('tmux', ['-L', this.socket, ...args], { encoding: 'utf8', env: this.env }).trim();
  }

  tryTmux(...args: string[]): string | null {
    try {
      return this.tmux(...args);
    } catch {
      return null;
    }
  }

  /** `#{...}` formats for every pane of a window, one array per pane. */
  panes(target: string, ...formats: string[]): string[][] {
    return this.tmux('list-panes', '-t', target, '-F', formats.join('\t'))
      .split('\n')
      .map((l) => l.split('\t'));
  }

  async waitFor<T>(what: string, fn: () => T | undefined | null | false, timeoutMs = 15000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}\n${this.dump()}`);
      await Bun.sleep(50);
    }
  }

  async mark(name: string): Promise<Record<string, string>> {
    const file = join(this.marks, name);
    const text = await this.waitFor(`marker ${name}`, () =>
      existsSync(file) ? readFileSync(file, 'utf8') || undefined : undefined,
    );
    return Object.fromEntries(
      text
        .trim()
        .split('\n')
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    );
  }

  dev(name: string, extra = ''): string {
    return `sh ${FAKE_DEV} ${name}${extra ? ` ${extra}` : ''}`;
  }

  /** Every pane's content, for failure messages. */
  dump(): string {
    const panes =
      this.tryTmux('list-panes', '-a', '-F', '#{pane_id} #{session_name}:#{window_name}') ?? '(no server)';
    return panes
      .split('\n')
      .map((line) => {
        const id = line.split(' ')[0] ?? '';
        return `--- ${line}\n${this.tryTmux('capture-pane', '-p', '-t', id) ?? ''}`;
      })
      .join('\n');
  }

  dispose(): void {
    this.tryTmux('kill-server');
    rmSync(this.dir, { recursive: true, force: true });
  }
}
