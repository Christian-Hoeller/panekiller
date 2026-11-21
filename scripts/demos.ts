// bun run demos: records every tape in assets/tapes (except common.tape) with vhs, then shrinks the GIFs.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const has = (bin: string) => Bun.spawnSync(['sh', '-c', `command -v ${bin}`]).exitCode === 0;
if (!has('vhs')) {
  console.error('vhs not found (brew install vhs)');
  process.exit(1);
}
const only = process.argv.slice(2);
const tapes = readdirSync('assets/tapes')
  .filter((f) => f.endsWith('.tape') && f !== 'common.tape')
  .filter((f) => !only.length || only.includes(f.replace(/\.tape$/, '')));
const build = Bun.spawnSync(['bun', 'run', 'build'], { stdio: ['inherit', 'inherit', 'inherit'] });
if (build.exitCode !== 0) process.exit(1);
for (const tape of tapes) {
  console.log(`▶ ${tape}`);
  const env = { ...process.env, TMUX: '' };
  const r = Bun.spawnSync(['vhs', join('assets/tapes', tape)], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env,
  });
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
  const gif = join('assets', `demo-${tape.replace(/\.tape$/, '')}.gif`);
  if (has('gifsicle')) Bun.spawnSync(['gifsicle', '-O3', '-b', gif]);
}
