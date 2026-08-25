// Guard: the Docker image copies only an allowlist of ../libs files, while
// the server's imports grow over time — this spec fails the suite the moment
// a server file imports something the Dockerfile forgot to COPY (the image
// would build fine and then crash at container startup, which no other test
// exercises because they all run the server straight from the repo).
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

describe('deploy image', () => {
  test('every ../libs import in server/ has a Dockerfile COPY line', () => {
    const dockerfile = readFileSync(join(root, 'deploy', 'Dockerfile'), 'utf8');
    const copied = new Set([...dockerfile.matchAll(/^COPY\s+(libs\/\S+)\s/gm)].map((m) => m[1]));

    const serverFiles = readdirSync(here).filter((f) => f.endsWith('.ts'));
    for (const file of serverFiles) {
      const source = readFileSync(join(here, file), 'utf8');
      for (const match of source.matchAll(/from\s+'(\.\.\/libs\/[^']+)'/g)) {
        const target = normalize(match[1])
          .replace(/^\.\.\//, '')
          .replace(/\\/g, '/');
        expect(
          copied.has(target),
          `${file} imports ${target} but deploy/Dockerfile never COPYs it — the container would crash at startup`,
        ).toBe(true);
      }
    }
  });
});
