/* Offline deterministic path-cover generation. Run with the tests TS loader:
 * node --experimental-strip-types --import ./tests/hooks.mjs scripts/generate-bridges.mjs
 * Each bridge becomes two degree-two vertices; both lanes are forced straight.
 * The game ships the validated results instead of doing this search on load. */
import fs from 'node:fs';
import { seededRng } from '../src/app/core/flow-generator.ts';
import { validateBridgeLevel } from '../src/app/core/bridges.ts';

function generate(n) {
  const size = n <= 20 ? 5 : n <= 40 ? 6 : 7;
  const bridgeCount = n <= 20 ? 1 : n <= 40 ? 2 : n <= 50 ? 3 : 4;
  const rng = seededRng(`flow-bridges-${n}`);
  const positions = [];
  while (positions.length < bridgeCount) {
    const p = [1 + Math.floor(rng() * (size - 2)), 1 + Math.floor(rng() * (size - 2))];
    if (positions.every(q => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) >= 3)) positions.push(p);
    // Four spread-out bridges always fit this pattern.
    if (positions.length === 3 && bridgeCount === 4) {
      positions.splice(0, positions.length, [1, 1], [1, 5], [5, 1], [5, 5]);
    }
  }
  const total = size * size, count = total + bridgeCount;
  const extra = new Map(positions.map((p, i) => [p[0] * size + p[1], total + i]));
  const physical = k => k < total ? k : positions[k - total][0] * size + positions[k - total][1];
  const node = (r, c, axis) => axis === 'v' && extra.has(r * size + c) ? extra.get(r * size + c) : r * size + c;
  const edges = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (c + 1 < size) edges.push([node(r, c, 'h'), node(r, c + 1, 'h')]);
    if (r + 1 < size) edges.push([node(r, c, 'v'), node(r + 1, c, 'v')]);
  }
  const bridgeNodes = new Set([...extra.keys(), ...extra.values()]);
  const graph = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) { graph[a].push(b); graph[b].push(a); }
  const forced = edges.filter(e => e.some(k => bridgeNodes.has(k)));
  const loose = edges.filter(e => !e.some(k => bridgeNodes.has(k)));
  let best = null, bestScore = -Infinity;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const parent = Array.from({ length: count }, (_, i) => i);
    const degree = new Uint8Array(count), masks = new Uint8Array(count);
    const adjacent = Array.from({ length: count }, () => []);
    const members = Array.from({ length: count }, (_, i) => [i]);
    positions.forEach((p, i) => { masks[p[0] * size + p[1]] = 1 << i; masks[total + i] = 1 << i; });
    const find = k => parent[k] === k ? k : (parent[k] = find(parent[k]));
    const join = (a, b) => {
      const x = find(a), y = find(b);
      if (x === y || degree[a] >= 2 || degree[b] >= 2 || (masks[x] & masks[y])) return false;
      // Joining paths is only legal when this edge is their sole contact.
      // Otherwise the merged pipe has a shortcut and can waste squares.
      for (const node of members[x]) for (const neighbor of graph[node]) {
        if (find(neighbor) === y && (node !== a || neighbor !== b)) return false;
      }
      parent[x] = y; masks[y] |= masks[x]; degree[a]++; degree[b]++;
      members[y].push(...members[x]); members[x] = [];
      adjacent[a].push(b); adjacent[b].push(a);
      return true;
    };
    if (!forced.every(([a, b]) => join(a, b))) throw new Error('Invalid bridge arrangement');
    const candidates = loose.map(e => [rng(), e]).sort((a, b) => a[0] - b[0]);
    for (const [, [a, b]] of candidates) join(a, b);
    if (degree.some(d => d === 0)) continue;
    const paths = [];
    for (let a = 0; a < count; a++) {
      if (degree[a] !== 1) continue;
      const path = [a];
      let previous = -1, current = a;
      while (true) {
        const next = adjacent[current].find(k => k !== previous);
        if (next === undefined) break;
        path.push(next); previous = current; current = next;
      }
      if (a < path[path.length - 1]) paths.push(path);
    }
    if (paths.some(p => p.length < 4) || paths.length < (n <= 20 ? 3 : 4) || paths.length > size + 1) continue;
    const lengths = paths.map(p => p.length), target = size - 1;
    const score = -Math.abs(paths.length - target) * 8 - (Math.max(...lengths) - Math.min(...lengths));
    if (score <= bestScore) continue;
    bestScore = score;
    best = { size, bridges: positions.map((p, i) => [p[0] * size + p[1], (n + i) % 2 ? 'h' : 'v']), paths: paths.map(p => p.map(physical)) };
  }
  if (!best) throw new Error(`Could not generate bridge level ${n}`);
  return best;
}

const boards = Array.from({ length: 60 }, (_, i) => generate(i + 1));
const seen = new Set();
for (const [index, board] of boards.entries()) {
  const cell = k => [Math.floor(k / board.size), k % board.size];
  const solution = board.paths.map(p => p.map(cell));
  const level = {
    seed: `flow-bridges-${index + 1}`, size: board.size, numPairs: solution.length,
    bridges: board.bridges.map(([k, over]) => ({ cell: cell(k), over })),
    pairs: solution.map(p => [p[0], p.at(-1)]), solution,
  };
  const validation = validateBridgeLevel(level);
  if (!validation.ok) throw new Error(`Invalid bridge level ${index + 1}: ${validation.errors.join(', ')}`);
  const key = JSON.stringify([level.pairs, level.bridges]);
  if (seen.has(key)) throw new Error(`Duplicate bridge level ${index + 1}`);
  seen.add(key);
}
fs.writeFileSync('src/app/core/bridge-levels.ts', `// Generated by scripts/generate-bridges.mjs. Do not edit by hand.\nimport type { BridgeBoardData } from './bridges';\nexport const BRIDGE_BOARDS: BridgeBoardData[] = [\n${boards.map(b => `  ${JSON.stringify(b)},`).join('\n')}\n];\n`);
console.log(`Generated and validated ${boards.length} unique bridge boards.`);
