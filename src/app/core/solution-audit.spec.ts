import { describe, expect, it } from 'vitest';
import { auditSolutions } from './solution-audit';
import { generateLevel, type FlowLevel } from './flow-generator';
import { bridgeLevel } from './bridges';
import { pathHasShortcut } from './flow-rules';
import { rectTopology, type Cell } from './topology';

const oldDaily: FlowLevel = {
  seed: 'daily-2026-10-29-1', size: 5, numPairs: 4,
  pairs: [[[1, 1], [3, 4]], [[4, 4], [3, 1]], [[3, 2], [2, 0]], [[1, 0], [0, 4]]],
  solution: [
    [[1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4]],
    [[4, 4], [4, 3], [3, 3], [2, 3], [2, 2], [2, 1], [3, 1]],
    [[3, 2], [4, 2], [4, 1], [4, 0], [3, 0], [2, 0]],
    [[1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  ],
};

describe('whole-puzzle certification', () => {
  it('finds the screenshot’s alternate padded solution despite a clean stored solution', () => {
    const topo = rectTopology(5, 5);
    expect(oldDaily.solution.every(path => !pathHasShortcut(path, topo))).toBe(true);
    const audit = auditSolutions(oldDaily);
    expect(audit.complete).toBe(true);
    expect(audit.solutions).toBeGreaterThan(1);
    expect(audit.padded).toBe(true);
    const replacement = generateLevel(oldDaily.seed, 5, 4);
    expect(replacement.pairs).not.toEqual(oldDaily.pairs);
    expect(auditSolutions(replacement)).toMatchObject({ complete: true, solutions: 1, padded: false });
    expect(generateLevel(oldDaily.seed, 5, 4).solution).toEqual(replacement.solution);
    expect(replacement.seed).toBe(oldDaily.seed);
  });

  it('never treats a search budget exhaustion as a safe board', () => {
    expect(auditSolutions(oldDaily, 0)).toMatchObject({ complete: false, solutions: 0 });
  });

  it('certifies every shipped bridge board, including independent crossing lanes', () => {
    for (let n = 1; n <= 60; n++) {
      expect(auditSolutions(bridgeLevel(n)), `bridge ${n}`).toMatchObject({ complete: true, solutions: 1, padded: false });
    }
  });

  it('agrees with an independent exhaustive path enumerator on small boards', () => {
    // The oracle draws one entire flow at a time, unlike the production
    // search which grows the most constrained head of any unfinished flow.
    const topo = rectTopology(3, 3), cell = (k: number): Cell => [Math.floor(k / 3), k % 3];
    for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) {
      for (let c = 0; c < 9; c++) for (let d = c + 1; d < 9; d++) {
        if (new Set([a, b, c, d]).size !== 4 || a > c) continue;
        const pairs: [Cell, Cell][] = [[cell(a), cell(b)], [cell(c), cell(d)]];
        let count = 0, padded = false;
        const routes: Cell[][] = [], occupied = new Set<number>();
        const solve = (color: number): void => {
          if (color === 2) {
            if (occupied.size === 9) {
              count++;
              padded ||= routes.some(path => pathHasShortcut(path, topo));
            }
            return;
          }
          const [start, finish] = pairs[color], route: Cell[] = [];
          const visit = (current: Cell): void => {
            const key = topo.key(...current);
            if (occupied.has(key)) return;
            if (pairs.some((pair, i) => i > color && pair.some(dot => topo.key(...dot) === key))) return;
            occupied.add(key); route.push(current);
            if (key === topo.key(...finish)) { routes[color] = route; solve(color + 1); }
            else for (const next of topo.neighbors(...current)) visit(next);
            route.pop(); occupied.delete(key);
          };
          visit(start);
        };
        solve(0);
        const audit = auditSolutions({ seed: '', size: 3, numPairs: 2, pairs, solution: [] });
        expect(audit.complete).toBe(true);
        expect(audit.padded, JSON.stringify(pairs)).toBe(padded);
        if (!padded) expect(audit.solutions, JSON.stringify(pairs)).toBe(count);
      }
    }
  });
});
