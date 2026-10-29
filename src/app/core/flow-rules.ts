import type { Cell, Topology } from './topology';

export function pathAxis(path: Cell[], index: number): 'h' | 'v' {
  const neighbor = index > 0 ? path[index - 1] : path[index + 1];
  return neighbor && neighbor[0] === path[index][0] ? 'h' : 'v';
}

/** Nonconsecutive neighbors let a pipe pad coverage with a removable loop.
 * Bridge lanes are independent: only neighbors along that lane can touch. */
export function pathHasShortcut(
  path: Cell[], topo: Topology, bridges?: { has(key: number): boolean },
): boolean {
  const indices = new Map(path.map((cell, i) => [topo.key(...cell), i]));
  for (let i = 0; i < path.length; i++) {
    const cell = path[i], key = topo.key(...cell);
    for (const neighbor of topo.neighbors(...cell)) {
      const nextKey = topo.key(...neighbor), j = indices.get(nextKey);
      if (j === undefined || j <= i + 1) continue;
      const axis = cell[0] === neighbor[0] ? 'h' : 'v';
      if (bridges?.has(key) && pathAxis(path, i) !== axis) continue;
      if (bridges?.has(nextKey) && pathAxis(path, j) !== axis) continue;
      return true;
    }
  }
  return false;
}
