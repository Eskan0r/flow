import type { Cell, FlowLevel, ValidationResult } from './flow-generator';
import { BRIDGE_BOARDS } from './bridge-levels';
import { rectTopology } from './topology';
import { pathAxis as bridgeAxis, pathHasShortcut } from './flow-rules';
export { pathAxis as bridgeAxis } from './flow-rules';

export type BridgeAxis = 'h' | 'v';
export interface Bridge { cell: Cell; over: BridgeAxis }
export interface BridgeLevel extends FlowLevel { bridges: Bridge[] }
export interface BridgeBoardData {
  size: number;
  bridges: Array<[number, BridgeAxis]>;
  paths: number[][];
}

export function bridgeLevel(n: number): BridgeLevel {
  const data: BridgeBoardData | undefined = BRIDGE_BOARDS[n - 1];
  if (!data) throw new Error(`Unknown bridge level ${n}`);
  const cell = (k: number): Cell => [Math.floor(k / data.size), k % data.size];
  const solution = data.paths.map(path => path.map(cell));
  return {
    seed: `flow-bridges-${n}`, size: data.size, rows: data.size, cols: data.size,
    kind: 'square', numPairs: solution.length,
    bridges: data.bridges.map(([k, over]) => ({ cell: cell(k), over })),
    pairs: solution.map(path => [path[0], path[path.length - 1]]), solution,
  };
}

/** Date-seeded rotation, reflection and color order of a validated board. */
export function dailyBridgeLevel(n: number, seed: string): BridgeLevel {
  const level = bridgeLevel(n), size = level.size;
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const roll = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 8; };
  const rotation = roll() % 4, mirror = roll() % 2 !== 0;
  const transform = (cell: Cell): Cell => {
    let [r, c] = cell;
    for (let i = 0; i < rotation; i++) [r, c] = [c, size - 1 - r];
    return [r, mirror ? size - 1 - c : c];
  };
  const solution = level.solution.map(path => path.map(transform));
  for (let i = solution.length - 1; i > 0; i--) {
    const j = roll() % (i + 1);
    [solution[i], solution[j]] = [solution[j], solution[i]];
  }
  for (const path of solution) if (roll() % 2) path.reverse();
  return {
    ...level, seed, solution,
    pairs: solution.map(path => [path[0], path[path.length - 1]]),
    bridges: level.bridges.map(b => ({ cell: transform(b.cell), over: rotation % 2 ? (b.over === 'h' ? 'v' : 'h') : b.over })),
  };
}

/** Independent validation for the shipped boards and completed bridge games. */
export function validateBridgeLevel(level: BridgeLevel): ValidationResult {
  const errors: string[] = [];
  const rows = level.rows ?? level.size, cols = level.cols ?? level.size;
  const topo = rectTopology(rows, cols);
  const key = ([r, c]: Cell) => r * cols + c;
  const inBounds = ([r, c]: Cell) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < rows && c < cols;
  const bridges = new Map(level.bridges.map(b => [key(b.cell), b]));
  if (bridges.size !== level.bridges.length) errors.push('duplicate bridge');
  for (const b of level.bridges) {
    if (!inBounds(b.cell) || b.cell[0] === 0 || b.cell[0] === rows - 1 || b.cell[1] === 0 || b.cell[1] === cols - 1) errors.push('bridge must be interior');
    if (b.over !== 'h' && b.over !== 'v') errors.push('invalid bridge orientation');
  }
  if (level.pairs.length !== level.numPairs || level.solution.length !== level.numPairs) errors.push('pair count mismatch');
  const occupied = new Map<string, number>();
  level.solution.forEach((path, ci) => {
    if (path.length < 2) { errors.push(`path ${ci} too short`); return; }
    const pair = level.pairs[ci];
    if (pair && topo.distance(pair[0], pair[1]) <= 1) errors.push(`path ${ci} matching endpoints adjacent`);
    if (pathHasShortcut(path, topo, bridges)) errors.push(`path ${ci} contains unnecessary space`);
    const first = key(path[0]), last = key(path[path.length - 1]);
    if (!pair || !((first === key(pair[0]) && last === key(pair[1])) || (first === key(pair[1]) && last === key(pair[0])))) errors.push(`path ${ci} endpoints mismatch`);
    const seen = new Set<number>();
    path.forEach((p, i) => {
      const k = key(p), bridge = bridges.has(k);
      if (!inBounds(p)) errors.push(`path ${ci} out of bounds`);
      if (seen.has(k)) errors.push(`path ${ci} crosses itself`);
      seen.add(k);
      if (i > 0 && Math.abs(p[0] - path[i - 1][0]) + Math.abs(p[1] - path[i - 1][1]) !== 1) errors.push(`path ${ci} disconnected`);
      if (bridge) {
        if (i === 0 || i === path.length - 1) errors.push('bridge cannot be an endpoint');
        else if (path[i - 1][0] + path[i + 1][0] !== 2 * p[0] || path[i - 1][1] + path[i + 1][1] !== 2 * p[1]) errors.push(`path ${ci} turns on a bridge`);
      }
      const slot = `${k}:${bridge ? bridgeAxis(path, i) : ''}`;
      if (occupied.has(slot)) errors.push(`overlap at ${slot}`);
      occupied.set(slot, ci);
    });
  });
  if (occupied.size !== rows * cols + bridges.size) errors.push('incomplete coverage');
  for (const [k] of bridges) {
    const h = occupied.get(`${k}:h`), v = occupied.get(`${k}:v`);
    if (h === undefined || v === undefined || h === v) errors.push('bridge needs two different flows');
  }
  return { ok: errors.length === 0, errors };
}
