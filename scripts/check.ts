// bun run check: everything CI runs, in the same order (SPEC §6.4, §7.1).
const steps: [string, string[]][] = [
  ['lint + format', ['bunx', 'biome', 'ci', '.']],
  ['typecheck', ['bun', 'run', 'typecheck']],
  ['unit tests + coverage', ['bun', 'run', 'test:unit', '--coverage']],
  ['integration tests', ['bun', 'run', 'test:integration']],
  ['build', ['bun', 'run', 'build']],
  ['dist drift', ['git', 'diff', '--exit-code', '--stat', 'dist/']],
  ['schema', ['bun', 'run', 'schema']],
  ['schema drift', ['git', 'diff', '--exit-code', '--stat', 'schema.json']],
  ['e2e tests', ['bun', 'run', 'test:e2e']],
];

for (const [name, cmd] of steps) {
  console.log(`\n▶ ${name}: ${cmd.join(' ')}`);
  const r = Bun.spawnSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'] });
  if (r.exitCode !== 0) {
    console.error(`\n✗ ${name} failed`);
    process.exit(r.exitCode ?? 1);
  }
}
console.log('\n✓ all checks passed');
