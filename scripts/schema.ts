import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonSchemaText } from '../src/config/schema';

const file = join(import.meta.dir, '..', 'schema.json');
writeFileSync(file, jsonSchemaText());
console.log(`wrote ${file}`);
