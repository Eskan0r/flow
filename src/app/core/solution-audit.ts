import type { FlowLevel } from './flow-generator';
import { hexTopology, maskTopology, rectTopology, type Cell } from './topology';
import { pathHasShortcut } from './flow-rules';

export interface SolutionAudit {
  complete: boolean;
  solutions: number;
  padded: boolean;
  nodes: number;
}

/** Enumerate ordinary full-coverage solutions, including routes the live
 * no-padding rule would reject. Bridge lanes are separate graph vertices.
 * A budget exhaustion is inconclusive, never a certificate of safety. */
export function auditSolutions(level: FlowLevel, budget = 100000): SolutionAudit {
  const rows = level.rows ?? level.size, cols = level.cols ?? level.size;
  const topo = level.kind === 'hex' ? hexTopology(rows, cols)
    : level.mask ? maskTopology(rows, cols, level.mask, level.walls)
      : rectTopology(rows, cols, level.warp, level.warpGates);
  const bridges = new Set(level.bridges?.map(b => topo.key(...b.cell)));
  const cells: Cell[] = [], ids = new Map<number, number>();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!topo.inBounds(r, c)) continue;
    const key = topo.key(r, c);
    ids.set(key, cells.length); cells.push([r, c]);
    if (bridges.has(key)) { ids.set(key + topo.total, cells.length); cells.push([r, c]); }
  }
  const graph = cells.map((cell, id) => topo.neighbors(...cell).flatMap(next => {
    const key = topo.key(...cell), nextKey = topo.key(...next);
    const vertical = cell[0] !== next[0];
    if (bridges.has(key) && (ids.get(key + topo.total) === id) !== vertical) return [];
    return [ids.get(nextKey + (bridges.has(nextKey) && vertical ? topo.total : 0))!];
  }));
  const owner = new Int16Array(cells.length).fill(-1);
  const heads: number[] = [], paths: number[][] = [], done = level.pairs.map(() => false);
  level.pairs.forEach((pair, color) => pair.forEach(cell => {
    const id = ids.get(topo.key(...cell))!;
    heads.push(id); paths.push([id]); owner[id] = color;
  }));
  let empty = cells.length - heads.length, remaining = done.length;
  const result: SolutionAudit = { complete: true, solutions: 0, padded: false, nodes: 0 };
  const active = new Int16Array(cells.length);
  const search = (): void => {
    if (result.padded || !result.complete) return;
    if (++result.nodes > budget) { result.complete = false; return; }
    if (!remaining) {
      if (empty) return;
      result.solutions++;
      result.padded = done.some((_, color) => {
        const route = [...paths[color * 2], ...paths[color * 2 + 1].slice().reverse()];
        const physical = route.map(id => cells[id]);
        return new Set(route.map(id => topo.key(...cells[id]))).size !== route.length
          || pathHasShortcut(physical, topo, bridges);
      });
      return;
    }
    active.fill(-1);
    for (let h = 0; h < heads.length; h++) if (!done[h >> 1]) active[heads[h]] = h;
    // Every unused vertex needs two eventual incident edges. Finished
    // pipes and interiors of unfinished pipes cannot supply those edges.
    for (let v = 0; v < cells.length; v++) if (owner[v] < 0) {
      let degree = 0;
      for (const n of graph[v]) if (owner[n] < 0 || active[n] >= 0) degree++;
      if (degree < 2) return;
    }
    let chosen = -1, options: number[] = [];
    for (let h = 0; h < heads.length; h++) {
      if (done[h >> 1]) continue;
      const opts = graph[heads[h]].filter(n => {
        if (n === heads[h ^ 1]) return true;
        if (owner[n] >= 0) return false;
        const key = topo.key(...cells[n]);
        if (!bridges.has(key)) return true;
        const other = ids.get(key + (ids.get(key) === n ? topo.total : 0))!;
        return owner[other] !== (h >> 1);
      });
      if (!opts.length) return;
      if (chosen < 0 || opts.length < options.length) { chosen = h; options = opts; }
    }
    const color = chosen >> 1, previous = heads[chosen];
    for (const next of options) {
      if (next === heads[chosen ^ 1]) {
        done[color] = true; remaining--;
        search();
        remaining++; done[color] = false;
      } else {
        owner[next] = color; heads[chosen] = next; paths[chosen].push(next); empty--;
        search();
        empty++; paths[chosen].pop(); heads[chosen] = previous; owner[next] = -1;
      }
      if (result.padded || !result.complete) return;
    }
  };
  search();
  return result;
}
