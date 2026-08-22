// Structural guard: @moxy/core must stay framework-free. If this fails,
// someone imported Angular (or another framework/DOM library) into the
// domain layer — move that code to @moxy/ui or the app instead.
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/from\s+['"]@angular\//, /from\s+['"]rxjs['"/]/, /from\s+['"]zone\.js/];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts')) yield full;
  }
}

describe('framework-freeness', () => {
  test('no Angular/rxjs/zone imports anywhere in @moxy/core', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (FORBIDDEN.some((re) => re.test(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
