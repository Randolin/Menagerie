// Write the English source catalogue for the domain's user-facing copy.
//
//   npm run i18n:extract
//
// The survey schema is the majority of what Menagerie says to a person, and
// it lives in `libs/core`, which may not import a framework — so Angular's
// extractor cannot see it. This is the other half of that story: it walks the
// schema and writes every string with the key `labels.ts` reads it back by.
//
// Run it after adding or relabelling anything in `schema/sections.ts`. You do
// not have to remember: `messages.spec.ts` compares the checked-in file to the
// live schema on every test run and fails when they drift.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sourceCatalogue } from '@mng/core';

const OUT = fileURLToPath(new URL('../libs/core/src/i18n/messages.en.json', import.meta.url));

const catalogue = sourceCatalogue();
writeFileSync(OUT, JSON.stringify(catalogue, null, 2) + '\n');
console.log(`wrote ${Object.keys(catalogue).length} messages to ${OUT}`);
