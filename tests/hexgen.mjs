/* Hex board validation: solvability, shape quality, determinism.
 * Run: node --experimental-strip-types --no-warnings --import ./tests/hooks.mjs tests/hexgen.mjs
 */
import { generateLevel, validateLevel } from '../src/app/core/flow-generator.ts';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error('  FAIL:', msg); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

function hexOpts(size) {
  return { kind: 'hex', rows: size, cols: size };
}

section('hex determinism + namespace separation');
{
  const a = generateLevel('hexseed-1', 6, null, hexOpts(6));
  const b = generateLevel('hexseed-1', 6, null, hexOpts(6));
  ok(JSON.stringify(a.pairs) === JSON.stringify(b.pairs), 'same hex seed gives identical board');
  ok(a.kind === 'hex' && a.rows === 6 && a.cols === 6, 'hex metadata present');
  const sq = generateLevel('hexseed-1', 6, null);
  ok(JSON.stringify(a.pairs) !== JSON.stringify(sq.pairs), 'hex and square never collide on one seed');
}

section('hex quality matrix (all sizes x seeds)');
{
  const SEEDS = ['h1', 'honeycomb', 'flow-hexes-1', 'daily-2026-09-26-2', 'zzz', 'abc-123'];
  let total = 0, valid = 0, cleanCount = 0, maxMs = 0;
  for (const size of [5, 6, 7, 8]) {
    for (const seed of SEEDS) {
      total++;
      const t0 = Date.now();
      const lv = generateLevel(seed, size, null, hexOpts(size));
      const ms = Date.now() - t0;
      maxMs = Math.max(maxMs, ms);
      const v = validateLevel(lv);
      if (!v.ok) {
        ok(false, `hex ${size} seed ${JSON.stringify(seed)} invalid: ${v.errors.slice(0, 3).join(' | ')}`);
        continue;
      }
      ok(true, 'valid');
      valid++;
      const s = lv.stats;
      // Hard guarantees: solvable essentials + never a border-to-border run.
      ok(s.touches === 0 && s.mono2x2 === 0, `hex ${size} seed ${seed}: touch-free`);
      ok(s.minLen >= 4, `hex ${size} seed ${seed}: minLen ${s.minLen} >= 4`);
      ok(s.borderStraight === 0, `hex ${size} seed ${seed}: no border-to-border straight`);
      ok(s.straights <= 3, `hex ${size} seed ${seed}: at most a few straights (got ${s.straights})`);
      ok(s.tier === 'clean' || s.tier === 'relaxed', `hex ${size} seed ${seed}: tier (got ${s.tier})`);
      if (s.tier === 'clean') cleanCount++;
      ok(s.minD >= 2, `hex ${size} seed ${seed}: endpoints spread (minD ${s.minD})`);
      ok(lv.numPairs >= 4 && lv.numPairs <= 13, `hex ${size} seed ${seed}: sane pair count (${lv.numPairs})`);
      ok(ms < 5000, `hex ${size} seed ${seed}: gen ${ms}ms < 5000ms`);
    }
  }
  console.log(`\n  valid: ${valid}/${total} · clean: ${cleanCount}/${total} · maxMs=${maxMs}`);
  ok(valid === total, `all ${total} hex puzzles strictly valid`);
  ok(cleanCount / total >= 0.9, `clean rate ${(100 * cleanCount / total).toFixed(0)}% >= 90%`);
}

section('hex fuzz (seeds x sizes)');
{
  let badShape = 0, bad = 0, cleanCount = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    const size = 5 + (i % 4);
    const lv = generateLevel(`hexfuzz-${i}`, size, null, hexOpts(size));
    if (!validateLevel(lv).ok) { bad++; continue; }
    if (lv.stats.borderStraight > 0 || lv.stats.straights > 3 ||
        (lv.stats.tier !== 'clean' && lv.stats.tier !== 'relaxed')) badShape++;
    else if (lv.stats.tier === 'clean') cleanCount++;
  }
  ok(bad === 0, `${N} hex fuzz valid (bad=${bad})`);
  ok(badShape === 0, `${N} hex fuzz within guarantees (badShape=${badShape})`);
  console.log(`  clean rate: ${(100 * cleanCount / N).toFixed(0)}%`);
  ok(cleanCount / N >= 0.9, `hex fuzz clean rate >= 90%`);
}

console.log(`\n----------------------------------------\nHEXGEN: PASS ${pass} · FAIL ${fail}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log(' - ' + f));
  process.exit(1);
} else {
  console.log('ALL HEX CHECKS PASSED');
}
