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
  ok(PACKS.length === 7, `regular, bonus, hexes, rectangles, oddshapes, walls, warps packs (got ${PACKS.length})`);
  const ids = PACKS.map((p) => p.id);
  ok(new Set(ids).size === ids.length, 'pack ids unique');
  for (const p of PACKS) {
    ok(p.count >= 60, `${p.id}: at least 60 levels (got ${p.count})`);
    let badSize = 0;
    let badShape = 0;
    const seeds = new Set();
    for (let n = 1; n <= p.count; n++) {
      const s = p.sizeForLevel(n);
      if (s < 5 || s > 10) badSize++;
      const { rows, cols } = p.shapeForLevel(n);
      if (rows < 4 || rows > 10 || cols < 4 || cols > 10) badShape++;
      seeds.add(p.seedForLevel(n));
    }
    ok(badSize === 0, `${p.id}: all sizes in 5..10`);
    ok(badShape === 0, `${p.id}: all shapes in 4..10`);
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
  const rect = PACKS.find((p) => p.id === 'rectangles');
  ok(!!rect && rect.kind === 'square' && rect.count === 60, 'rectangles pack: 60 square levels');
  ok(JSON.stringify(rect.shapeForLevel(1)) === JSON.stringify({ rows: 5, cols: 7 }), 'rectangles: wide 5x7 start');
  ok(JSON.stringify(rect.shapeForLevel(60)) === JSON.stringify({ rows: 8, cols: 10 }), 'rectangles: 8x10 end');
  const odd = PACKS.find((p) => p.id === 'oddshapes');
  ok(!!odd && odd.kind === 'square' && odd.count === 60 && !!odd.maskForLevel, 'oddshapes pack: 60 masked levels');
  let oddBad = 0;
  for (let n = 1; n <= odd.count; n++) {
    const { rows, cols } = odd.shapeForLevel(n);
    const mask = odd.maskForLevel(n);
    let cells = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (mask(r, c)) cells++;
    if (cells < 16) oddBad++;
  }
  ok(oddBad === 0, 'oddshapes masks all have >=16 cells');
  const walls = PACKS.find((p) => p.id === 'walls');
  ok(!!walls && walls.kind === 'square' && walls.count === 60 && !!walls.maskForLevel, 'walls pack: 60 masked levels');
  ok(!!walls && !!walls.wallsForLevel, 'walls pack exposes a walls predicate');
  let wallBad = 0;
  for (let n = 1; n <= walls.count; n++) {
    const { rows, cols } = walls.shapeForLevel(n);
    const mask = walls.maskForLevel(n);
    const wall = walls.wallsForLevel(n);
    let playable = 0, borderWalls = 0, leak = 0, wallCells = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (mask(r, c)) playable++;
        else if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) borderWalls++;
        if (wall(r, c)) { wallCells++; if (mask(r, c)) leak++; }
      }
    }
    if (playable < 24 || borderWalls > 0 || leak > 0 || wallCells < 2) wallBad++;
  }
  ok(wallBad === 0, 'walls: >=24 playable, no border walls, walls are blocked and non-empty');
  const warps = PACKS.find((p) => p.id === 'warps');
  ok(!!warps && warps.kind === 'square' && warps.count === 60, 'warps pack: 60 toroidal levels');
  ok(!!warps && warps.warpForLevel && warps.warpForLevel(1) === true, 'warps pack marks every level warped');
  ok(!!warps && warps.sizeForLevel(1) === 5 && warps.sizeForLevel(60) === 7, 'warps pack ramps 5 to 7');
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
    const shape = p.shapeForLevel(n);
    const mask = p.maskForLevel ? p.maskForLevel(n) : undefined;
    const walls = p.wallsForLevel ? p.wallsForLevel(n) : undefined;
    const warp = p.warpForLevel ? p.warpForLevel(n) : false;
    const lv = generateLevel(p.seedForLevel(n), size, null,
      { kind: p.kind, rows: shape.rows, cols: shape.cols, mask, walls, warp });
    if (lv.rows !== shape.rows || lv.cols !== shape.cols) {
      bad++;
      console.error(`  FAIL-SHAPE: ${p.id} #${n}: got ${lv.rows}x${lv.cols}, want ${shape.rows}x${shape.cols}`);
    }
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  FAIL: ${p.id} #${n}: ${v.errors.slice(0, 2).join(' | ')}`); }
    else if (lv.stats.borderStraight > (p.maskForLevel ? 1 : 0) || lv.stats.straights > (p.kind === 'hex' || p.maskForLevel ? 3 : 1) ||
        (lv.stats.tier !== 'clean' && lv.stats.tier !== 'relaxed')) {
      badShape++;
      console.error(`  FAIL-SHAPE: ${p.id} #${n}: straights=${lv.stats.straights} borderStraight=${lv.stats.borderStraight} tier=${lv.stats.tier}`);
    } else if (lv.stats.tier === 'clean') cleanCount++;
  }
  ok(bad === 0, `${picks.length} sampled pack levels all valid`);
  ok(badShape === 0, `${picks.length} sampled pack levels within guarantees`);
  console.log(`  clean rate: ${(100 * cleanCount / picks.length).toFixed(0)}%`);
}

section('masked packs full sweep');
for (const id of ['oddshapes', 'walls']) {
  const p = PACKS.find((x) => x.id === id);
  let bad = 0;
  for (let n = 1; n <= p.count; n++) {
    const { rows, cols } = p.shapeForLevel(n);
    const mask = p.maskForLevel(n);
    const walls = p.wallsForLevel ? p.wallsForLevel(n) : undefined;
    let lv;
    try {
      lv = generateLevel(p.seedForLevel(n), p.sizeForLevel(n), null, { rows, cols, mask, walls });
    } catch (err) {
      bad++; console.error(`  THREW: ${id} #${n}: ${err && err.message}`); continue;
    }
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  INVALID: ${id} #${n}: ${v.errors[0]}`); continue; }
    if (id === 'walls' && !lv.walls) { bad++; console.error(`  LOST WALLS: ${id} #${n}`); }
    if (id === 'oddshapes' && lv.walls) { bad++; console.error(`  UNEXPECTED WALLS: ${id} #${n}`); }
  }
  ok(bad === 0, `all ${p.count} ${id} levels generate valid (bad=${bad})`);
}

section('warps full sweep');
{
  const p = PACKS.find((x) => x.id === 'warps');
  let bad = 0;
  for (let n = 1; n <= p.count; n++) {
    const { rows, cols } = p.shapeForLevel(n);
    let lv;
    try {
      lv = generateLevel(p.seedForLevel(n), p.sizeForLevel(n), null, { rows, cols, warp: true });
    } catch (err) {
      bad++; console.error(`  THREW: #${n}: ${err && err.message}`); continue;
    }
    const v = validateLevel(lv);
    if (!v.ok) { bad++; console.error(`  INVALID: #${n}: ${v.errors[0]}`); continue; }
    if (!lv.warp) { bad++; console.error(`  LOST WARP: #${n}`); }
  }
  ok(bad === 0, `all 60 warps levels generate valid (bad=${bad})`);
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
  ok(full === 'roflow daily 2026-09-26\n⭐⭐✅⬛⬛\nstreak: 3\n' + FLOW_SITE, 'mixed card exact text');
  const sweep = dailyShareCard('2026-09-26', ['perfect', 'perfect', 'perfect', 'perfect', 'perfect'], 0, 754);
  ok(sweep === 'roflow daily 2026-09-26\n⭐⭐⭐⭐⭐\nstreak: 0 · 12:34\n' + FLOW_SITE, 'perfect sweep with total time');
  const empty = dailyShareCard('2026-09-26', ['todo', 'todo', 'todo', 'todo', 'todo'], 0, null);
  ok(empty.split('\n').length === 4 && empty.includes('⬛⬛⬛⬛⬛'), 'untouched day renders blanks');
  ok(!full.endsWith('\n') && full.includes('flow.ronakchavva.com'), 'no trailing newline, site linked');
}

console.log(`\n----------------------------------------\nPACKS: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
else console.log('ALL PACK CHECKS PASSED');
