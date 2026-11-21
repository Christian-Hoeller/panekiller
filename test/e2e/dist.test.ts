import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonc } from '../../src/config/load';
import { configSchema } from '../../src/config/schema';

const REPO = join(import.meta.dir, '..', '..');
const DIST = join(REPO, 'dist', 'pk.js');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { name: string; version: string };
const tmp = mkdtempSync(join(tmpdir(), 'pk-e2e-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const home = join(tmp, 'home');
const env: Record<string, string> = {
  PATH: process.env.PATH ?? '',
  HOME: home,
  XDG_CONFIG_HOME: join(home, '.config'),
  PK_TMUX_SOCKET: `pk-e2e-${process.pid}`,
};

/** Runs the built bundle with node (not bun) to prove Node compatibility. */
function node(args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync('node', [DIST, ...args], { env: { ...env, ...extraEnv }, encoding: 'utf8', cwd: tmp });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// the seed config from SPEC §8, with roots pointing at temp dirs
const seedText = readFileSync(join(REPO, 'test', 'fixtures', 'seed-config.jsonc'), 'utf8').replaceAll(
  '~/projects/',
  `${home}/projects/`,
);
const seed = configSchema.parse(parseJsonc(seedText));
for (const id of Object.keys(seed.projects)) mkdirSync(join(home, 'projects', id), { recursive: true });
const seedFile = join(tmp, 'seed.json');
writeFileSync(seedFile, seedText);

describe('node dist/pk.js', () => {
  test('is a node script', () => {
    expect(readFileSync(DIST, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(execFileSync('node', ['--version'], { encoding: 'utf8' })).toMatch(/^v\d+/);
  });

  test('--version / --help', () => {
    expect(node(['--version'])).toMatchObject({ code: 0, stdout: `${pkg.version}\n` });
    expect(node(['--help']).stdout).toContain('Usage:');
  });

  test('first run creates the starter config; ls', () => {
    const r = node(['ls']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Created starter config');
    expect(existsSync(join(home, '.config', 'panekiller', 'schema.json'))).toBe(true);
    expect(node(['ls'], { PK_CONFIG: seedFile }).stdout).toContain('clipboard');
  });

  test('--dry-run for every seed layout', () => {
    for (const [id, project] of Object.entries(seed.projects)) {
      const layouts = Array.isArray(project.layouts) ? project.layouts.map((l) => l.id) : [undefined];
      for (const layout of layouts) {
        const r = node([id, ...(layout ? [layout] : []), '--dry-run'], { PK_CONFIG: seedFile });
        expect(r.stderr).toBe('');
        expect(r.code).toBe(0);
        expect(r.stdout).toContain(`new-session -d -s ${id} -n apps`);
        expect(r.stdout.trim().split('\n').at(-1)).toBe(
          `tmux -L ${env.PK_TMUX_SOCKET} attach-session -t =${id}`,
        );
      }
    }
  });

  test('error exit codes', () => {
    expect(node(['nope'], { PK_CONFIG: seedFile }).code).toBe(1);
    expect(node(['clipboard', 'nope'], { PK_CONFIG: seedFile }).code).toBe(1);
    expect(node(['--fresh', '--attach'], { PK_CONFIG: seedFile }).code).toBe(1);
    expect(node(['ls'], { PK_CONFIG: seedFile, PATH: '/nonexistent' }).code).not.toBe(0);
    const bad = join(tmp, 'bad.json');
    writeFileSync(bad, '{ "projects": { "ls": {} } }');
    const r = node(['ls'], { PK_CONFIG: bad });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('projects.ls');
  });

  test('tmux missing → exit 2', () => {
    const nodeBin = execFileSync('sh', ['-c', 'command -v node'], { encoding: 'utf8' }).trim();
    const r = spawnSync(nodeBin, [DIST, 'nms', '-d'], {
      env: { ...env, PK_CONFIG: seedFile, PATH: '/nonexistent' },
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('tmux not found');
  });
});

describe('packaging', () => {
  test('npm pack → global install → pk works → uninstall removes it', () => {
    const packDir = join(tmp, 'pack');
    const prefix = join(tmp, 'prefix');
    mkdirSync(packDir);
    const npm = (args: string[]) =>
      execFileSync('npm', args, {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, npm_config_loglevel: 'error' },
      });
    npm(['pack', '--pack-destination', packDir]);
    const [tgz] = readdirSync(packDir).filter((f) => f.endsWith('.tgz'));
    expect(tgz).toBeDefined();
    npm(['i', '-g', '--prefix', prefix, '--offline', join(packDir, tgz as string)]);
    const bin = join(prefix, 'bin', 'pk');
    expect(execFileSync(bin, ['--version'], { encoding: 'utf8', env })).toBe(`${pkg.version}\n`);
    npm(['rm', '-g', '--prefix', prefix, pkg.name]);
    expect(existsSync(bin)).toBe(false);
  }, 60000);
});
