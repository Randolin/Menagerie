// Resolve hook so plain Node can run the TypeScript under libs/core/.
//
// Node strips types from .ts files on its own (22.18+), but it will not
// invent an extension: core's internal imports are extensionless
// (`./wordlists`) because a bundler resolves them, and the `@mng/*` aliases
// exist only in tsconfig. This hook teaches Node both, in-thread and with no
// npm dependency — the same "plain Node, no deps" posture as server/.
//
// Preload it: `node --import ./scripts/ts-resolve.mjs scripts/seed-qa.ts`.
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Mirrors tsconfig.json "paths" — keep the two in step.
const ALIASES = {
  '@mng/core': 'libs/core/src/index.ts',
  '@mng/core/wordlist': 'libs/core/src/crypto/eff-wordlist.ts',
  '@mng/ui': 'libs/ui/src/index.ts',
};

const HAS_EXTENSION = /\.[cm]?[jt]s$/;

registerHooks({
  resolve(specifier, context, next) {
    const alias = ALIASES[specifier];
    if (alias) return next(pathToFileURL(resolvePath(repoRoot, alias)).href, context);
    if (specifier.startsWith('.') && !HAS_EXTENSION.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        // Not a .ts file after all — fall through to Node's own resolution.
      }
    }
    return next(specifier, context);
  },
});
