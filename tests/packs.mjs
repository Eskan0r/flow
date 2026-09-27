/* Pack definition checks: counts, size schedules, seed uniqueness.
 * Run: node --experimental-strip-types --no-warnings --import ./tests/hooks.mjs tests/packs.mjs
 */
import { PACKS, dailyLabel, dailySeed } from '../src/app/core/packs.ts';
import { generateLevel, validateLevel } from '../src/app/core/flow-generator.ts';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', msg); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

section('pack definitions');
{
  ok(PACKS.length >= 5, `at least 5 packs (got ${PACKS.length})`);
  const ids = PACKS.map((p) => p.id);
  ok(new Set(ids).size === ids.length, 'pack ids unique');
  for (const p of PACKS) {
    ok(p.count >= 60, `${p.id}: at least 60 levels (got ${p.count})`);
    let badSize = 0;
    const seeds = new Set();
    for (let n = 1; n <= p.count; n++) {
      const s = p.sizeForLevel(n);
      if (s < 5 || s > 10) badSize++;
      seeds.add(p.seedForLevel(n));
    }
    ok(badSize === 0, `${p.id}: all sizes in 5..10`);
    ok(seeds.size === p.count, `${p.id}: seeds unique per level`);
  }
  const reg = PACKS.find((p) => p.id === 'regular');
  ok(reg && reg.count === 150, 'regular pack has 150 levels');
  let ramp = true;
  for (let n = 2; n <= reg.count; n++) {
    if (reg.sizeForLevel(n) < reg.sizeForLevel(n - 1)) ramp = false;
  }
  ok(ramp, 'regular pack sizes never decrease (easy -> hard)');
  for (const m of ['mania6', 'mania7', 'mania8', 'mania9']) {
    const p = PACKS.find((x) => x.id === m);
    const want = parseInt(m.slice('mania'.length), 10);
    ok(!!p && p.sizeForLevel(1) === want && p.sizeForLevel(p.count) === want, `${m}: fixed ${want}x${want}`);
  }
}

section('pack levels generate valid puzzles');
{
  // first, middle, last of each pack + a spread of regular levels
  const picks = [];
  for (const p of PACKS) picks.push([p, 1], [p, Math.floor(p.count / 2)], [p, p.count]);
  const reg = PACKS.find((p) => p.id === 'regular');
  for (let n = 5; n <= 150; n += 13) picks.push([reg, n]);
  let bad = 0, badShape = 0;
  for (const [p, n] of picks) {
    const lv = generateLevel(p.seedForLevel(n), p.sizeForLevel(n), null);
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  FAIL: ${p.id} #${n}: ${v.errors.slice(0, 2).join(' | ')}`); }
    else if (lv.stats.straights > 1 || lv.stats.borderStraight > 0 || lv.stats.tier !== 'clean') {
      badShape++;
      console.error(`  FAIL-SHAPE: ${p.id} #${n}: straights=${lv.stats.straights} borderStraight=${lv.stats.borderStraight} tier=${lv.stats.tier}`);
    }
  }
  ok(bad === 0, `${picks.length} sampled pack levels all valid`);
  ok(badShape === 0, `${picks.length} sampled pack levels all clean-shaped`);
}

section('daily');
{
  const a = dailySeed(new Date(2026, 8, 26));
  const b = dailySeed(new Date(2026, 8, 27));
  ok(a === 'daily-2026-09-26', `daily seed format (${a})`);
  ok(a !== b, 'daily seed changes per day');
  ok(dailyLabel(new Date(2026, 8, 26)) === '2026-09-26', 'daily label format');
  ok(validateLevel(generateLevel(a, 8, null)).ok, 'daily puzzle valid');
}

console.log(`\n----------------------------------------\nPACKS: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
else console.log('ALL PACK CHECKS PASSED');
