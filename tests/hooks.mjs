/* Test-only ESM loader: resolve extensionless relative imports to .ts so
 * plain node --experimental-strip-types can run the TS sources directly.
 * Registered via: node --import ./tests/hooks.mjs ... */
import { register } from 'node:module';

register('./resolve-ts.mjs', import.meta.url);
