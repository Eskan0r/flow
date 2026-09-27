/* Topology math checks: neighbor symmetry, distances, snake validity,
 * hex pixel round-trips. Run: node ... tests/topology.mjs
 */
import {
  hexCellCenter, hexLayout, hexPixelToCell, hexTopology, squareTopology,
} from '../src/app/core/topology.ts';
import { buildSnake } from '../src/app/core/flow-generator.ts';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', msg); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

section('square topology');
{
  const t = squareTopology(6);
  ok(t.neighbors(2, 2).length === 4, 'interior has 4 neighbors');
  ok(t.neighbors(0, 2).length === 3, 'edge has 3 neighbors');
  ok(t.neighbors(0, 0).length === 2, 'corner has 2 neighbors');
  ok(t.distance([0, 0], [3, 4]) === 7, 'distance is Manhattan');
  ok(t.collinear([[1, 1], [1, 2], [1, 3]]), 'row run collinear');
  ok(!t.collinear([[1, 1], [1, 2], [2, 2]]), 'L bend not collinear');
  // greedy walk always terminates at target
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      let cur = [0, 0];
      let guard = 40;
      while ((cur[0] !== r || cur[1] !== c) && guard-- > 0) {
        const opts = t.stepOptions(cur, [r, c]);
        if (!opts.length) break;
        cur = opts[0];
      }
      if (cur[0] !== r || cur[1] !== c) ok(false, `square walk stuck -> [${r},${c}]`);
    }
  }
  ok(true, 'square greedy walks terminate');
}

section('hex topology: symmetry + distances');
{
  for (const [rows, cols] of [[4, 4], [5, 5], [6, 7], [8, 8], [9, 9]]) {
    const t = hexTopology(rows, cols);
    let symBad = 0, countBad = 0, distBad = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nbs = t.neighbors(r, c);
        const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        if (!edge && nbs.length !== 6) countBad++;
        for (const [nr, nc] of nbs) {
          if (!t.inBounds(nr, nc)) countBad++;
          if (!t.neighbors(nr, nc).some(([ar, ac]) => ar === r && ac === c)) symBad++;
        }
        if (t.distance([r, c], [r, c]) !== 0) distBad++;
      }
    }
    ok(countBad === 0, `hex ${rows}x${cols}: interior=6, all in-bounds`);
    ok(symBad === 0, `hex ${rows}x${cols}: adjacency symmetric`);
    ok(distBad === 0, `hex ${rows}x${cols}: zero self-distance`);
    // triangle inequality sample + symmetry
    let tri = 0;
    const at = (i) => [i % rows, (i * 3 + 1) % cols];
    for (let i = 0; i < 40; i++) {
      const a = at(i), b = at(i + 7), c = at(i + 13);
      if (t.distance(a, b) !== t.distance(b, a)) tri++;
      if (t.distance(a, c) > t.distance(a, b) + t.distance(b, c)) tri++;
    }
    ok(tri === 0, `hex ${rows}x${cols}: symmetric + triangle inequality`);
    // greedy walks terminate everywhere
    let stuck = 0;
    for (let r = 0; r < rows && stuck < 3; r++) {
      for (let c = 0; c < cols && stuck < 3; c++) {
        let cur = [0, 0];
        let guard = rows * cols + 10;
        while ((cur[0] !== r || cur[1] !== c) && guard-- > 0) {
          const opts = t.stepOptions(cur, [r, c]);
          if (!opts.length) break;
          cur = opts[0];
        }
        if (cur[0] !== r || cur[1] !== c) stuck++;
      }
    }
    ok(stuck === 0, `hex ${rows}x${cols}: greedy walks terminate`);
  }
}

section('hex collinearity');
{
  const t = hexTopology(7, 7);
  ok(t.collinear([[2, 1], [2, 2], [2, 3], [2, 4]]), 'hex row run collinear');
  // axial straight line (constant q): stairs down-right in offset coords
  ok(t.collinear([[0, 2], [1, 2], [2, 3], [3, 3]]), 'hex diagonal line collinear');
  ok(!t.collinear([[2, 2], [2, 3], [3, 3]]), 'hex bend not collinear');
}

section('snake validity on both topologies');
{
  for (const size of [4, 5, 6, 7, 8, 9]) {
    for (const topo of [squareTopology(size), hexTopology(size, size)]) {
      const path = buildSnake(size);
      ok(path.length === topo.total, `${topo.kind} ${size}: covers all ${topo.total} cells`);
      const seen = new Set(path.map(([r, c]) => topo.key(r, c)));
      ok(seen.size === topo.total, `${topo.kind} ${size}: no repeats`);
      let bad = 0;
      for (let i = 1; i < path.length; i++) {
        const [r, c] = path[i];
        if (!topo.neighbors(path[i - 1][0], path[i - 1][1]).some(([ar, ac]) => ar === r && ac === c)) bad++;
      }
      ok(bad === 0, `${topo.kind} ${size}: snake fully contiguous`);
    }
  }
}

section('hex pixel round-trip');
{
  for (const [rows, cols] of [[5, 5], [6, 6], [7, 8], [8, 8]]) {
    const s = 12;
    const lay = hexLayout(rows, cols, s);
    ok(lay.w > 0 && lay.h > 0, `hex ${rows}x${cols}: positive layout`);
    let bad = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = hexCellCenter(lay, r, c);
        const got = hexPixelToCell(lay, rows, cols, p.x, p.y);
        if (!got || got[0] !== r || got[1] !== c) bad++;
        // slight jitter inside the hex must still hit
        const got2 = hexPixelToCell(lay, rows, cols, p.x + s * 0.2, p.y - s * 0.2);
        if (!got2 || got2[0] !== r || got2[1] !== c) bad++;
      }
    }
    ok(bad === 0, `hex ${rows}x${cols}: center+jitter round-trips`);
    ok(hexPixelToCell(lay, rows, cols, -50, -50) === null, `hex ${rows}x${cols}: outside -> null`);
    ok(hexPixelToCell(lay, rows, cols, lay.w + 50, lay.h + 50) === null, `hex ${rows}x${cols}: far outside -> null`);
  }
}

console.log(`\n----------------------------------------\nTOPOLOGY: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
else console.log('ALL TOPOLOGY CHECKS PASSED');
