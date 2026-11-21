#!/usr/bin/env node
import { defaultContext } from './context';
import { main } from './main';

main(process.argv.slice(2), defaultContext()).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(
      `pk: unexpected error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
    );
    process.exitCode = 1;
  },
);
