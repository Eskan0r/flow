/* Resolve hook: try specifier + '.ts' when normal resolution fails. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (typeof specifier === 'string' && specifier.startsWith('.') && !path.extname(specifier)) {
      const cand = path.resolve(path.dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
      if (existsSync(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
    }
    throw err;
  }
}
