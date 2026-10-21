// predev: copy sample fixtures into public/data, but never over real ingest output.
import { cpSync, existsSync } from 'node:fs';

const target = new URL('../public/data/', import.meta.url);
if (existsSync(new URL('heat.json', target))) {
  console.log('public/data/heat.json exists; leaving it alone');
} else {
  cpSync(new URL('../fixtures/data/', import.meta.url), target, { recursive: true });
  console.log('copied fixtures/data to public/data');
}
