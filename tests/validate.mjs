/* Validation suite for the seeded Flow generator.
 * Run: npm test  (node --experimental-strip-types tests/validate.js)
 * Checks: solvability by construction, no 2-cell wriggles, balanced flows,
 * endpoints never adjacent, no self-touch, no 2x2 mono, determinism,
 * seed sensitivity, contention, performance, edge-case seeds.
 */
import { generateLevel, validateLevel, defaultPairsForSize, flowChainPath } from '../src/app/core/flow-generator.ts';
import { rectTopology } from '../src/app/core/topology.ts';

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
      ok(s.straights <= 1, `size ${size} seed ${seed}: at most one straight (got ${s.straights})`);
      ok(s.borderStraight === 0, `size ${size} seed ${seed}: no border-to-border straight`);
      ok(s.tier === 'clean', `size ${size} seed ${seed}: clean tier (got ${s.tier})`);
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
  let bad = 0, badShape = 0;
  for (let n = 1; n <= 60; n++) {
    const size = sizeForLevel(n);
    const lv = generateLevel(`flow-level-${n}`, size, defaultPairsForSize(size));
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  FAIL: level ${n}: ${v.errors.slice(0, 2).join(' | ')}`); }
    else if (lv.stats.straights > 1 || lv.stats.borderStraight > 0 || lv.stats.tier !== 'clean') {
      badShape++;
      console.error(`  FAIL-SHAPE: level ${n}: straights=${lv.stats.straights} borderStraight=${lv.stats.borderStraight} tier=${lv.stats.tier}`);
    }
  }
  ok(bad === 0, `60/60 progression levels valid (bad=${bad})`);
  ok(badShape === 0, `60/60 progression levels clean-shaped (badShape=${badShape})`);
}

section('edge cases');
{
  const e1 = generateLevel('', 5, 4);
  ok(validateLevel(e1).ok, 'empty seed still generates valid puzzle');
  const e2 = generateLevel(' ⌥flow ', 10, 10);
  ok(validateLevel(e2).ok, 'unicode seed valid');
  let minSeen = 99, badShape = 0;
  for (let i = 0; i < 200; i++) {
    const lv = generateLevel(`fuzz-${i}`, 7, 7);
    minSeen = Math.min(minSeen, lv.stats.minLen);
    if (!validateLevel(lv).ok) { ok(false, `fuzz-${i} invalid`); break; }
    if (lv.stats.straights > 1 || lv.stats.borderStraight > 0 || lv.stats.tier !== 'clean') badShape++;
  }
  ok(minSeen >= 4, `200 fuzz seeds: shortest flow ever = ${minSeen} (must be >=4)`);
  ok(badShape === 0, `200 fuzz seeds: all clean-shaped (badShape=${badShape})`);
}

section('rectangular grids generate + validate');
{
  const shapes = [[5, 7], [6, 8], [8, 10], [8, 6]];
  const thin = [[4, 9]];
  let bad = 0, badShape = 0, badDims = 0;
  for (const [rows, cols] of shapes) {
    for (const seed of ['rect-a', 'rect-b', 'rect-c']) {
      const want = defaultPairsForSize(Math.max(rows, cols));
      const lv = generateLevel(seed, Math.max(rows, cols), null, { rows, cols });
      if (!validateLevel(lv).ok) { bad++; console.error(`  FAIL: ${seed} ${rows}x${cols}`); continue; }
      if (lv.rows !== rows || lv.cols !== cols) badDims++;
      if (lv.pairs.length !== want) bad++;
      if (lv.stats.straights > 1 || lv.stats.borderStraight > 0 || lv.stats.tier !== 'clean') badShape++;
    }
  }
  ok(bad === 0, 'all rect samples valid');
  ok(badDims === 0, 'rect generation respects rows/cols');
  ok(badShape === 0, 'normal rect shapes clean-shaped');
  // Very thin boards can legitimately relax straights; still solvable + valid.
  for (const [rows, cols] of thin) {
    for (const seed of ['rect-a', 'rect-b', 'rect-c']) {
      const lv = generateLevel(seed, Math.max(rows, cols), null, { rows, cols });
      if (!validateLevel(lv).ok || lv.stats.tier === 'dirty') { bad++; console.error(`  FAIL-thin: ${seed} ${rows}x${cols}`); }
    }
  }
  ok(bad === 0, 'thin rect boards still valid (may relax shape)');
}

section('masked (polyomino) grids generate + validate');
{
  const shapes = [
    { rows: 5, cols: 8, mask: (r, c) => c >= r },              // staircase
    { rows: 6, cols: 6, mask: (r, c) => c <= r },              // triangle
    { rows: 7, cols: 7, mask: (r, c) => (r >= 2 && r <= 4) || (c >= 2 && c <= 4) }, // plus
    { rows: 7, cols: 7, mask: (r, c) => Math.abs(r - c) <= 2 }, // band
    { rows: 7, cols: 7, mask: (r, c) => !(r >= 1 && r <= 4 && c >= 2 && c <= 4) },  // U
  ];
  let bad = 0, badTier = 0;
  for (const s of shapes) {
    for (const seed of ['poly-a', 'poly-b', 'poly-c']) {
      const lv = generateLevel(seed, Math.max(s.rows, s.cols), null, { rows: s.rows, cols: s.cols, mask: s.mask });
      const v = validateLevel(lv);
      if (!v.ok) { bad++; console.error(`  FAIL: ${seed} ${s.rows}x${s.cols}: ${v.errors.slice(0, 2).join(' | ')}`); continue; }
      const cells = countPlayable(s.mask, s.rows, s.cols);
      const covered = lv.solution.reduce((n, sg) => n + sg.length, 0);
      if (covered !== cells) bad++;
      if (lv.stats.tier === 'dirty') badTier++;
    }
  }
  ok(bad === 0, 'all masked samples valid + fully cover the shape');
  ok(badTier === 0, 'masked samples never dirty');
}

function countPlayable(mask, rows, cols) {
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (mask(r, c)) n++;
  return n;
}

section('flow chain paths (one-stroke orders)');
{
  // square snake-partition levels chain by construction: consecutive runs
  // share their cut point, so partition order is always a valid chain
  let unchained = 0;
  for (const size of [5, 6, 7, 8]) {
    const topo = rectTopology(size, size, false);
    for (const seed of ['chain-a', 'chain-b', 'chain-c']) {
      const lv = generateLevel(seed, size, null, { kind: 'square', rows: size, cols: size });
      const ch = flowChainPath(lv.pairs, topo);
      if (!ch || ch.order.length !== lv.numPairs || new Set(ch.order).size !== lv.numPairs) {
        unchained++;
        console.error(`  FAIL: ${size}x${size} ${seed}: no full chain`);
        continue;
      }
      ok(true, `${size}x${size} ${seed}: Hamiltonian chain over ${lv.numPairs} flows`);
      // entries continuity: exit[i] touches entry[i+1], and every entry is
      // one of its own flow's dots with the exit at the other dot
      let hopsOk = ch.entries.length === lv.numPairs;
      for (let k = 0; k < ch.entries.length; k++) {
        const [en, ex] = ch.entries[k];
        const dots = lv.pairs[ch.order[k]];
        const has = (d) => (d[0] === dots[0][0] && d[1] === dots[0][1]) || (d[0] === dots[1][0] && d[1] === dots[1][1]);
        if (!has(en) || !has(ex)) { hopsOk = false; break; }
        if ((en[0] === ex[0] && en[1] === ex[1])) { hopsOk = false; break; }
        if (k > 0) {
          const prevEx = ch.entries[k - 1][1];
          if (!topo.neighbors(prevEx[0], prevEx[1]).some(([r, c]) => r === en[0] && c === en[1])) { hopsOk = false; break; }
        }
      }
      ok(hopsOk, `${size}x${size} ${seed}: every chain hop touches endpoints`);
    }
  }
  ok(unchained === 0, 'all sampled square levels chainable');
  // negative: isolated flows admit no chain
  const lonely = [[[0, 0], [4, 4]], [[0, 4], [4, 0]]];
  ok(flowChainPath(lonely, rectTopology(5, 5, false)) === null, 'disconnected endpoints yield no chain');
  // degenerate: a lone flow is trivially chained
  const solo = flowChainPath([[[0, 0], [2, 2]]], rectTopology(5, 5, false));
  ok(!!solo && solo.order.length === 1 && solo.entries.length === 1, 'single flow chains trivially');
}

console.log(`\n----------------------------------------\nGENERATOR: PASS ${pass} · FAIL ${fail}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log(' - ' + f));
  process.exit(1);
} else {
  console.log('ALL GENERATOR CHECKS PASSED');
}
