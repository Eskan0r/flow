/* Topology math checks: neighbor symmetry, distances, snake validity,
 * hex pixel round-trips. Run: node ... tests/topology.mjs
 */
import {
  hexCellCenter, hexLayout, hexPixelToCell, hexTopology, maskTopology, rectTopology, squareTopology,
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

section('rectangular topology');
{
  const t = rectTopology(5, 8);
  ok(t.total === 40, 'rect total = rows x cols');
  ok(t.rows === 5 && t.cols === 8, 'rect rows/cols exposed');
  ok(t.neighbors(2, 2).length === 4, 'rect interior has 4 neighbors');
  ok(t.neighbors(2, 7).length === 3, 'rect right edge has 3 neighbors');
  ok(t.key(3, 0) === 24 && t.key(4, 7) === 39, 'key stride is cols');
  ok(t.inBounds(4, 7) && !t.inBounds(5, 0) && !t.inBounds(0, 8), 'rect bounds by rows/cols');
  ok(t.distance([0, 0], [4, 7]) === 11, 'rect Manhattan distance');
  ok(JSON.stringify(t.stepOptions([0, 0], [4, 7])) === JSON.stringify([[0, 1], [1, 0]]), 'rect greedy walk starts east (larger delta axis)');
  let badWalk = 0;
  for (let r = 0; r < 5 && badWalk < 3; r++) {
    for (let c = 0; c < 8 && badWalk < 3; c++) {
      let cur = [0, 0];
      let guard = 50;
      while ((cur[0] !== r || cur[1] !== c) && guard-- > 0) {
        const opts = t.stepOptions(cur, [r, c]);
        if (!opts.length) { badWalk++; break; }
        cur = opts[0];
      }
    }
  }
  ok(badWalk === 0, 'rect greedy walks terminate');
  ok(squareTopology(6).total === 36 && squareTopology(6).cols === 6, 'square delegates to rect');
}

section('masked polyomino topology');
{
  // 5x5 diamond: |r-2| + |c-2| <= 2  ->  13 playable cells
  const t = maskTopology(5, 5, (r, c) => Math.abs(r - 2) + Math.abs(c - 2) <= 2);
  ok(t.rows === 5 && t.cols === 5 && t.total === 25, 'mask keeps dense bounding grid');
  ok(t.cells === 13, `mask cells counted (got ${t.cells})`);
  ok(t.inBounds(2, 2) && t.inBounds(0, 2), 'center + tip in shape');
  ok(!t.inBounds(0, 0) && !t.inBounds(4, 4), 'corners out of shape');
  ok(t.key(3, 2) === 17, 'mask key stride is cols (dense)');
  ok(t.neighbors(2, 2).length === 4, 'center has 4 neighbors');
  ok(t.neighbors(0, 2).length === 1, 'tip has 1 neighbor (shape edge)');
  ok(t.neighbors(0, 0).length === 0, 'outside cell has no neighbors');
  ok(t.isBorder([0, 2]) && t.isBorder([2, 0]), 'shape tips are border');
  ok(!t.isBorder([2, 2]), 'center is not border');
  // no neighbor crosses the mask
  let leak = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!t.inBounds(r, c)) continue;
      for (const [nr, nc] of t.neighbors(r, c)) if (!t.inBounds(nr, nc)) leak++;
    }
  }
  ok(leak === 0, 'neighbors never leave the shape');
  // every playable cell reachable from the center (connected)
  const seen = new Set([t.key(2, 2)]);
  const q = [[2, 2]];
  while (q.length) {
    const [r, c] = q.pop();
    for (const [nr, nc] of t.neighbors(r, c)) {
      const k = t.key(nr, nc);
      if (!seen.has(k)) { seen.add(k); q.push([nr, nc]); }
    }
  }
  ok(seen.size === t.cells, 'diamond shape is connected');
}

section('wall topology (full rect minus enclosed walls)');
{
  // 7x7 with a plus of wall cells around the centre (44 playable).
  const wall = (r, c) => (r === 3 && Math.abs(c - 3) <= 1) || (c === 3 && Math.abs(r - 3) <= 1);
  const t = maskTopology(7, 7, (r, c) => !wall(r, c));
  ok(t.rows === 7 && t.cols === 7 && t.total === 49, 'wall board keeps dense bounding grid');
  ok(t.cells === 44, `wall board cell count (got ${t.cells})`);
  ok(!t.inBounds(3, 3) && !t.inBounds(3, 2), 'wall cells are not playable');
  ok(t.neighbors(1, 1).length === 4, 'open playable cell keeps 4 neighbors');
  ok(t.neighbors(2, 2).length === 2, 'cell beside the plus only reaches its open sides');
  ok(t.isBorder([2, 2]), 'cell hugging a wall is a border (pipes hug walls)');
  ok(!t.isBorder([1, 1]), 'open cell with no wall neighbour is not border');
  ok(t.stepOptions([1, 1], [3, 1]).every(([r, c]) => t.inBounds(r, c)), 'stepOptions honour playability');
  let throughWall = 0;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (!t.inBounds(r, c)) continue;
      for (const [nr, nc] of t.stepOptions([r, c], [r, c + 1])) if (wall(nr, nc)) throughWall++;
    }
  }
  ok(throughWall === 0, 'stepOptions never route through a wall');
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
