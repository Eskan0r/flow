/* Pack definition checks: counts, size schedules, seed uniqueness.
 * Run: node --experimental-strip-types --no-warnings --import ./tests/hooks.mjs tests/packs.mjs
 */
import { PACKS, DAILY_COUNT, DAILY_KINDS, DAILY_SIZES, FLOW_SITE, dailyLabel, dailySeed, dailyShareCard, parseDailySeed } from '../src/app/core/packs.ts';
import { generateLevel, validateLevel } from '../src/app/core/flow-generator.ts';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', msg); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

section('pack definitions');
{
  ok(PACKS.length === 3, `regular, bonus, hexes packs (got ${PACKS.length})`);
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
    ok(!PACKS.find((x) => x.id === m), `${m} pack removed`);
  }
  const hex = PACKS.find((p) => p.id === 'hexes');
  ok(!!hex && hex.kind === 'hex' && hex.count === 60, 'hexes pack: 60 hex levels');
  ok(!!hex && hex.sizeForLevel(1) === 5 && hex.sizeForLevel(60) === 7, 'hexes pack ramps 5 to 7');
}

section('pack levels generate valid puzzles');
{
  // first, middle, last of each pack + a spread of regular levels
  const picks = [];
  for (const p of PACKS) picks.push([p, 1], [p, Math.floor(p.count / 2)], [p, p.count]);
  const reg = PACKS.find((p) => p.id === 'regular');
  for (let n = 5; n <= 150; n += 13) picks.push([reg, n]);
  let bad = 0, badShape = 0, cleanCount = 0;
  for (const [p, n] of picks) {
    const size = p.sizeForLevel(n);
    const lv = generateLevel(p.seedForLevel(n), size, null,
      p.kind === 'hex' ? { kind: 'hex', rows: size, cols: size } : {});
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  FAIL: ${p.id} #${n}: ${v.errors.slice(0, 2).join(' | ')}`); }
    else if (lv.stats.borderStraight > 0 || lv.stats.straights > (p.kind === 'hex' ? 3 : 1) ||
        (lv.stats.tier !== 'clean' && lv.stats.tier !== 'relaxed')) {
      badShape++;
      console.error(`  FAIL-SHAPE: ${p.id} #${n}: straights=${lv.stats.straights} borderStraight=${lv.stats.borderStraight} tier=${lv.stats.tier}`);
    } else if (lv.stats.tier === 'clean') cleanCount++;
  }
  ok(bad === 0, `${picks.length} sampled pack levels all valid`);
  ok(badShape === 0, `${picks.length} sampled pack levels within guarantees`);
  console.log(`  clean rate: ${(100 * cleanCount / picks.length).toFixed(0)}%`);
}

section('daily');
{
  const a = dailySeed(new Date(2026, 8, 26), 1);
  const b = dailySeed(new Date(2026, 8, 27), 1);
  const c = dailySeed(new Date(2026, 8, 26), 5);
  ok(a === 'daily-2026-09-26-1', `daily seed format (${a})`);
  ok(c === 'daily-2026-09-26-5', `daily index format (${c})`);
  ok(a !== b, 'daily seed changes per day');
  ok(dailyLabel(new Date(2026, 8, 26)) === '2026-09-26', 'daily label format');
  const parsed = parseDailySeed('daily-2026-09-26-3');
  ok(!!parsed && parsed.date === '2026-09-26' && parsed.index === 3, 'daily seed parses');
  ok(parseDailySeed('flow-regular-7') === null, 'non-daily seed parses null');
  ok(parseDailySeed('daily-2026-09-26-9') === null, 'out-of-range daily index parses null');
  for (let i = 1; i <= 5; i++) {
    const sd = dailySeed(new Date(2026, 8, 26), i);
    const size = DAILY_SIZES[i - 1];
    const kind = DAILY_KINDS[i - 1];
    const lv = generateLevel(sd, size, null, kind === 'hex' ? { kind, rows: size, cols: size } : {});
    ok(validateLevel(lv).ok, `daily ${i} (${size}x${size} ${kind}) valid`);
  }
  ok(JSON.stringify(DAILY_SIZES) === JSON.stringify([5, 5, 6, 7, 8]), 'daily sizes ramp 5-5-6-7-8');
  ok(DAILY_KINDS.includes('hex'), 'hexes appear in dailies');
}

section('share card');
{
  const full = dailyShareCard('2026-09-26', ['perfect', 'perfect', 'done', 'todo', 'todo'], 3, null);
  ok(full === 'roflow daily 2026-09-26\n⭐⭐🟩⬛⬛\nstreak: 3\n' + FLOW_SITE, 'mixed card exact text');
  const sweep = dailyShareCard('2026-09-26', ['perfect', 'perfect', 'perfect', 'perfect', 'perfect'], 0, 754);
  ok(sweep === 'roflow daily 2026-09-26\n⭐⭐⭐⭐⭐\nstreak: 0 · 12:34\n' + FLOW_SITE, 'perfect sweep with total time');
  const empty = dailyShareCard('2026-09-26', ['todo', 'todo', 'todo', 'todo', 'todo'], 0, null);
  ok(empty.split('\n').length === 4 && empty.includes('⬛⬛⬛⬛⬛'), 'untouched day renders blanks');
  ok(!full.endsWith('\n') && full.includes('flow.ronakchavva.com'), 'no trailing newline, site linked');
}

console.log(`\n----------------------------------------\nPACKS: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
else console.log('ALL PACK CHECKS PASSED');
