import assert from 'node:assert/strict';
import { bridgeLevel, bridgeAxis, dailyBridgeLevel, validateBridgeLevel } from '../src/app/core/bridges.ts';
import { FlowEngine } from '../src/app/core/flow-engine.ts';
import { pathHasShortcut } from '../src/app/core/flow-rules.ts';
import { rectTopology } from '../src/app/core/topology.ts';
import { dailySpec, dailySeed } from '../src/app/core/packs.ts';
import { auditSolutions } from '../src/app/core/solution-audit.ts';

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function draw(e, path, pid = 1) {
  assert.equal(e.pointerDown(...path[0], pid), 'stroke');
  for (const cell of path.slice(1)) e.pointerMove(...cell, pid);
  e.pointerUp(pid);
}
function load(n = 1) { const e = new FlowEngine(); e.loadBridgeLevel(bridgeLevel(n)); return e; }
function crossing(e) {
  const b = e.bridges[0].cell;
  const color = axis => e.solution.findIndex(p => p.some((cell, i) => same(cell, b) && bridgeAxis(p, i) === axis));
  return { b, h: color('h'), v: color('v') };
}

for (let n = 1; n <= 60; n++) {
  const level = bridgeLevel(n);
  assert.equal(validateBridgeLevel(level).ok, true, `valid board ${n}`);
  assert.deepEqual(Object.fromEntries(Object.entries(auditSolutions(level)).filter(([key]) => key !== 'nodes')),
    { complete: true, solutions: 1, padded: false }, `unique unpadded board ${n}`);
  assert.equal(level.bridges.length, n <= 20 ? 1 : n <= 40 ? 2 : n <= 50 ? 3 : 4);
  const topo = rectTopology(level.size, level.size), keys = new Set(level.bridges.map(b => topo.key(...b.cell)));
  for (const pair of level.pairs) assert.ok(topo.distance(...pair) > 1, `matching endpoints separated ${n}`);
  for (const path of level.solution) assert.equal(pathHasShortcut(path, topo, keys), false, `no padded routes ${n}`);
  for (const reverse of [false, true]) {
    const e = load(n);
    const paths = reverse ? e.solution.toReversed().map(p => p.toReversed()) : e.solution;
    for (const path of paths) draw(e, path);
    assert.equal(e.won, true, `win ${n}, reverse=${reverse}`);
    assert.equal(e.win.perfect, true);
    assert.equal(e.filledCount(), e.rows * e.cols + e.bridges.length);
    assert.equal(e.filledPct(), 100);
  }
}

for (const order of [['h', 'v'], ['v', 'h']]) {
  const e = load(), cross = crossing(e);
  draw(e, e.solution[cross[order[0]]]);
  const first = structuredClone(e.paths[cross[order[0]]]);
  draw(e, e.solution[cross[order[1]]]);
  assert.deepEqual(e.paths[cross[order[0]]], first, 'crossing preserves the first lane');
  assert.equal(e.occupantAt(...cross.b, 'h'), cross.h);
  assert.equal(e.occupantAt(...cross.b, 'v'), cross.v);
  assert.equal(e.occupantAt(...cross.b), e.bridges[0].over === 'h' ? cross.h : cross.v);
  const moves = e.moves;
  e.undo();
  assert.equal(e.moves, moves, 'undo preserves spent moves');
  assert.deepEqual(e.paths[cross[order[0]]], first);
}

{
  const e = load(), { b, h, v } = crossing(e);
  const p = e.solution[h], index = p.findIndex(c => same(c, b));
  e.pointerDown(...p[0], 1);
  for (const c of p.slice(1, index + 1)) e.pointerMove(...c, 1);
  assert.equal(e.applyStep(h, [b[0] + 1, b[1]]), false, 'cannot turn on a bridge');
  assert.equal(e.applyStep(h, p[index + 1]), true, 'can continue straight');
  e.cancelStroke(1);
  e.reset();
  draw(e, e.solution[v]); draw(e, e.solution[h]);
  assert.equal(e.pointerDown(...b, 2, 'v'), 'stroke');
  assert.equal(e.active.color, v, 'grab the lower or upper lane explicitly');
  e.pointerUp(2);
  while (!e.won) assert.notEqual(e.hint(), -1);
  assert.equal(e.win.perfect, false);
  e.undo(); assert.ok(e.hints > 0, 'undo does not refund hints');
}

{
  const e = load(), { b, h, v } = crossing(e);
  draw(e, e.solution[v]); draw(e, e.solution[h]);
  const under = structuredClone(e.paths[v]), original = structuredClone(e.paths[h]);
  const third = e.paths.findIndex((_, i) => i !== h && i !== v);
  const from = [b[0], b[1] - 1];
  e.paths[third] = [from]; e.rebuild(); e.pushHistory(); e.grabStroke(third, from, 7);
  assert.equal(e.applyStep(third, b), true);
  assert.deepEqual(e.paths[v], under, 'cutting horizontal lane preserves vertical');
  assert.ok(e.paths[h].length < original.length);
  assert.equal(e.applyStep(third, from), true);
  assert.deepEqual(e.paths[h], original, 'dragging back restores only the cut lane');
  assert.deepEqual(e.paths[v], under);
}

{
  const e = load(), { b, h, v } = crossing(e);
  draw(e, e.solution[h]);
  const saved = structuredClone(e.paths[h]);
  while (!e.done[v]) e.hint();
  assert.deepEqual(e.paths[h], saved, 'hint preserves a perpendicular crossing');
  const broken = bridgeLevel(1);
  broken.solution[h] = broken.solution[h].filter(c => !same(c, b));
  assert.equal(validateBridgeLevel(broken).ok, false, 'missing bridge lane is not complete');
  const turned = bridgeLevel(1);
  const p = turned.solution[h], index = p.findIndex(c => same(c, b));
  p[index + 1] = [b[0] + 1, b[1]];
  assert.equal(validateBridgeLevel(turned).ok, false, 'turning bridge solution rejected');
}

{
  let count = 0;
  const slots = new Set(), sizes = new Set();
  for (const d = new Date('2027-01-01T12:00:00Z'); d.getUTCFullYear() === 2027; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    for (let i = 1; i <= 5; i++) {
      const spec = dailySpec(date, i);
      if (spec.bridgeLevel === undefined) continue;
      const seed = dailySeed(date, i), level = dailyBridgeLevel(spec.bridgeLevel, seed);
      assert.equal(spec.tag, 'Bridges');
      assert.equal(!!spec.warp || !!spec.chain, false);
      assert.equal(level.rows, spec.rows); assert.equal(level.cols, spec.cols);
      assert.equal(validateBridgeLevel(level).ok, true, `daily ${date}-${i}`);
      assert.deepEqual(level, dailyBridgeLevel(spec.bridgeLevel, seed), 'daily board deterministic');
      const e = new FlowEngine(); e.loadBridgeLevel(level);
      for (const path of level.solution) draw(e, path);
      assert.equal(e.won, true); assert.equal(e.win.perfect, true);
      assert.equal(e.seed, seed);
      count++; slots.add(i); sizes.add(level.size);
    }
  }
  assert.deepEqual([...slots].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual([...sizes].sort(), [5, 6, 7]);
  assert.ok(count > 0);
  console.log(`BRIDGE DAILIES: ${count} date-seeded boards checked across all slots and sizes.`);
}

console.log('ALL BRIDGE CHECKS PASSED: 60 boards, daily rotation, both draw orders, both lane orientations, cuts, undo, hints and invalid solutions.');
