/* Validation suite for the seeded Flow generator.
 * Run: npm test  (node --experimental-strip-types tests/validate.js)
 * Checks: solvability by construction, no 2-cell wriggles, balanced flows,
 * endpoints never adjacent, no self-touch, no 2x2 mono, determinism,
 * seed sensitivity, contention, performance, edge-case seeds.
 */
import { generateLevel, validateLevel, defaultPairsForSize } from '../src/app/core/flow-generator.ts';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error('  FAIL:', msg); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const SEEDS = ['sunrise-7', 'coral-fox-42', 'flow-level-1', 'daily-2026-09-26', 'a', 'hello world', ' ⌥flow ', 'x'.repeat(200), '', '12345'];
const SIZES = [5, 6, 7, 8, 9, 10];

section('determinism + seed sensitivity');
{
  const a = generateLevel('sunrise-7', 7, 7);
  const b = generateLevel('sunrise-7', 7, 7);
  ok(JSON.stringify(a.pairs) === JSON.stringify(b.pairs), 'same seed+size must give identical pairs');
  ok(JSON.stringify(a.solution) === JSON.stringify(b.solution), 'same seed+size must give identical solution');
  const c = generateLevel('sunrise-8', 7, 7);
  ok(JSON.stringify(a.pairs) !== JSON.stringify(c.pairs), 'different seeds should differ');
  const d = generateLevel('sunrise-7', 8, 8);
  ok(d.size === 8 && d.pairs.length === 8, 'size parameter respected');
}

section('solvability + human-experience invariants (all sizes x seeds)');
{
  let total = 0, strictOk = 0;
  const detourList = [], ratioList = [];
  let maxMs = 0;
  for (const size of SIZES) {
    const K = defaultPairsForSize(size);
    for (const seed of SEEDS) {
      total++;
      const t0 = Date.now();
      const lv = generateLevel(seed, size, K);
      const ms = Date.now() - t0;
      maxMs = Math.max(maxMs, ms);
      const v = validateLevel(lv);
      if (!v.ok) {
        ok(false, `size ${size} seed ${JSON.stringify(seed)} invalid: ${v.errors.slice(0, 3).join(' | ')}`);
        continue;
      }
      ok(true, 'valid');
      strictOk++;
      const s = lv.stats;
      detourList.push(s.avgDetour); ratioList.push(s.minRatio);
      ok(s.minLen >= 4, `size ${size} seed ${seed}: minLen ${s.minLen} >= 4 (no wriggles)`);
      ok(s.touches === 0, `size ${size} seed ${seed}: touches==0 (got ${s.touches})`);
      ok(s.mono2x2 === 0, `size ${size} seed ${seed}: no 2x2 mono`);
      ok(s.minD >= 2, `size ${size} seed ${seed}: endpoints never adjacent (minD ${s.minD}>=2)`);
      ok(s.minRatio >= 0.25, `size ${size} seed ${seed}: direct flows (minRatio ${s.minRatio}>=0.25)`);
      if (size <= 7) ok(s.overlapCells >= 2, `size ${size} seed ${seed}: contention overlap ${s.overlapCells}>=2`);
      ok(s.maxDetour <= Math.ceil((size * size / K) * 0.9), `size ${size} seed ${seed}: maxDetour ${s.maxDetour} not cheesy`);
      ok(ms < 1500, `size ${size} seed ${seed}: gen ${ms}ms < 1500ms`);
    }
  }
  console.log(`\n  strict-valid: ${strictOk}/${total} · maxMs=${maxMs}`);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  avgDetour=${avg(detourList).toFixed(2)} · minRatio avg=${avg(ratioList).toFixed(2)}`);
  ok(strictOk === total, `all ${total} puzzles strictly valid`);
}

section('level seeds 1..60 (progression pack)');
{
  const sizeForLevel = (n) => (n <= 5 ? 5 : n <= 12 ? 6 : n <= 22 ? 7 : n <= 34 ? 8 : n <= 48 ? 9 : 10);
  let bad = 0;
  for (let n = 1; n <= 60; n++) {
    const size = sizeForLevel(n);
    const lv = generateLevel(`flow-level-${n}`, size, defaultPairsForSize(size));
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  FAIL: level ${n}: ${v.errors.slice(0, 2).join(' | ')}`); }
  }
  ok(bad === 0, `60/60 progression levels valid (bad=${bad})`);
}

section('edge cases');
{
  const e1 = generateLevel('', 5, 4);
  ok(validateLevel(e1).ok, 'empty seed still generates valid puzzle');
  const e2 = generateLevel(' ⌥flow ', 10, 10);
  ok(validateLevel(e2).ok, 'unicode seed valid');
  let minSeen = 99;
  for (let i = 0; i < 200; i++) {
    const lv = generateLevel(`fuzz-${i}`, 7, 7);
    minSeen = Math.min(minSeen, lv.stats.minLen);
    if (!validateLevel(lv).ok) { ok(false, `fuzz-${i} invalid`); break; }
  }
  ok(minSeen >= 4, `200 fuzz seeds: shortest flow ever = ${minSeen} (must be >=4)`);
}

console.log(`\n----------------------------------------\nGENERATOR: PASS ${pass} · FAIL ${fail}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log(' - ' + f));
  process.exit(1);
} else {
  console.log('ALL GENERATOR CHECKS PASSED');
}
