// Fake dev servers for the demo GIFs: realistic startup logs, then idle.
//   bun demo/fake-server.ts <api|web|admin|worker|blog|new-api|new-web>
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[39m`,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const time = () => new Date().toTimeString().slice(0, 8);

async function vite(port: number, ms: number) {
  await sleep(250);
  console.log(
    `\n  ${c.green(c.bold('VITE'))} ${c.green('v6.3.5')}  ${c.dim('ready in')} ${c.bold(String(ms))} ${c.dim('ms')}\n`,
  );
  console.log(
    `  ${c.green('➜')}  ${c.bold('Local')}:   ${c.cyan(`http://localhost:${c.bold(String(port))}/`)}`,
  );
  console.log(`  ${c.green('➜')}  ${c.dim('Network')}: ${c.dim('use --host to expose')}`);
  console.log(`  ${c.green('➜')}  ${c.dim('press')} ${c.bold('h + enter')} ${c.dim('to show help')}`);
}

async function api(port: number) {
  console.log(c.dim('$ bun --watch src/server.ts'));
  await sleep(300);
  console.log(`${c.magenta('[db]')} connected to postgres://localhost:5432/shop`);
  await sleep(150);
  console.log(`${c.magenta('[db]')} 12 migrations up to date`);
  await sleep(200);
  console.log(`${c.green('✓')} Started server on ${c.cyan(`:${port}`)}`);
  for (const [m, p, s, t] of [
    ['GET', '/health', 200, 2],
    ['GET', '/api/products', 200, 14],
    ['POST', '/api/cart', 201, 9],
  ] as const) {
    await sleep(700);
    console.log(`${c.dim(time())} ${c.bold(m.padEnd(4))} ${p} ${c.green(String(s))} ${c.dim(`${t}ms`)}`);
  }
}

async function worker() {
  console.log(c.dim('$ bun src/worker.ts'));
  await sleep(400);
  console.log(`${c.yellow('[worker]')} listening on queue ${c.bold('emails')}, ${c.bold('invoices')}`);
  for (let i = 1; ; i++) {
    await sleep(1500);
    console.log(`${c.dim(time())} ${c.yellow('[worker]')} ♥ heartbeat #${i} ${c.dim('· 0 jobs waiting')}`);
    if (i % 3 === 0)
      console.log(
        `${c.dim(time())} ${c.yellow('[worker]')} ${c.green('✓')} sent order-confirmation #10${40 + i}`,
      );
  }
}

async function blog() {
  await sleep(300);
  console.log(`\n ${c.magenta(c.bold('astro'))}  ${c.dim('v5.7.0')} ${c.green('ready in')} 412 ms\n`);
  console.log(`┃ Local    ${c.cyan('http://localhost:4321/')}`);
  console.log(`┃ Network  ${c.dim('use --host to expose')}\n`);
  await sleep(800);
  console.log(`${c.dim(time())} ${c.blue('[watch]')} content/posts ${c.dim('(24 posts)')}`);
}

const kind = process.argv[2] ?? 'web';
const run: Record<string, () => Promise<unknown>> = {
  api: () => api(3000),
  web: () => vite(5173, 182),
  admin: () => vite(5174, 167),
  worker,
  blog,
  'new-api': () => api(4000),
  'new-web': () => vite(5180, 151),
};
await (run[kind] ?? run.web)?.();
setInterval(() => {}, 1 << 30);
