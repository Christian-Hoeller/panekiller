// bun test test/unit [args]; with --coverage also enforces the thresholds from SPEC §6.4.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const coverage = args.includes('--coverage');
const reporters = coverage ? ['--coverage-reporter=text', '--coverage-reporter=lcov'] : [];
const run = Bun.spawnSync(['bun', 'test', 'test/unit', ...args, ...reporters], {
  stdio: ['inherit', 'inherit', 'inherit'],
});
if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
if (!coverage) process.exit(0);

type FileCov = { file: string; found: number; hit: number };
const files: FileCov[] = [];
let cur: FileCov | undefined;
for (const line of readFileSync('coverage/lcov.info', 'utf8').split('\n')) {
  if (line.startsWith('SF:')) cur = { file: line.slice(3), found: 0, hit: 0 };
  else if (line.startsWith('LF:') && cur) cur.found = Number(line.slice(3));
  else if (line.startsWith('LH:') && cur) cur.hit = Number(line.slice(3));
  else if (line === 'end_of_record' && cur) {
    files.push(cur);
    cur = undefined;
  }
}

const GATES: { name: string; match: (f: string) => boolean; min: number }[] = [
  { name: 'src/config', match: (f) => f.startsWith('src/config/'), min: 95 },
  { name: 'src/layout', match: (f) => f.startsWith('src/layout/'), min: 95 },
  { name: 'src/util', match: (f) => f.startsWith('src/util/'), min: 95 },
  { name: 'args + decide', match: (f) => f === 'src/args.ts' || f === 'src/commands/decide.ts', min: 95 },
  { name: 'overall (src)', match: (f) => f.startsWith('src/'), min: 80 },
];

let failed = false;
console.log('\nCoverage gates (lines):');
for (const g of GATES) {
  const sel = files.filter((f) => g.match(f.file));
  const found = sel.reduce((a, f) => a + f.found, 0);
  const hit = sel.reduce((a, f) => a + f.hit, 0);
  const pct = found ? (hit / found) * 100 : 0;
  const ok = sel.length > 0 && pct >= g.min;
  failed ||= !ok;
  console.log(
    `  ${ok ? '✓' : '✗'} ${g.name.padEnd(14)} ${pct.toFixed(2).padStart(6)}%  (min ${g.min}%, ${sel.length} files)`,
  );
}
process.exit(failed ? 1 : 0);
