// Run from the repository root: node --experimental-strip-types --no-warnings public/assets/bridges/export-svg.mjs
import { writeFileSync } from 'node:fs';
import { bridgeArtworkSvg } from '../../../src/app/board/bridge-artwork.ts';

for (const [axis, name] of [['h', 'horizontal'], ['v', 'vertical']]) {
  writeFileSync(new URL(`bridge-${name}.svg`, import.meta.url), bridgeArtworkSvg(axis));
}
console.log('Exported both bridge SVGs from the shared artwork.');
