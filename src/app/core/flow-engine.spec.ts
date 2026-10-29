/* Headless gameplay specs for FlowEngine (vitest, no DOM). Run: ng test */
import { describe, expect, it } from 'vitest';
import type { Cell } from './flow-generator';
import { FlowEngine } from './flow-engine';
import { PACKS } from './packs';
import { pathHasShortcut } from './flow-rules';
import { hexTopology, rectTopology } from './topology';

function drawPath(e: FlowEngine, cells: Cell[], pid = 1): boolean {
  e.pointerDown(cells[0][0], cells[0][1], pid);
  for (let i = 1; i < cells.length; i++) e.pointerMove(cells[i][0], cells[i][1], pid);
  return e.pointerUp(pid);
}

describe('FlowEngine', () => {
  it('refuses the extra-square yellow loop during drawing', () => {
    const e = new FlowEngine();
    e.loadLevel('level', 1);
    e.pairs = [[[4, 0], [0, 4]]];
    e.numPairs = 1; e.paths = [[]]; e.done = [false];
    e.epOf = new Map([[e.key(4, 0), 0], [e.key(0, 4), 0]]);
    e.epSet = new Set(e.epOf.keys()); e.rebuild();
    const route: Cell[] = [[4, 0], [3, 0], [3, 1], [3, 2], [4, 2]];
    e.pointerDown(4, 0, 1);
    for (const cell of route.slice(1)) e.pointerMove(...cell, 1);
    expect(e.paths[0]).toEqual(route);
    e.pointerMove(4, 1, 1);
    expect(e.paths[0]).toEqual(route);
    expect(e.active?.last).toEqual([4, 2]);
    expect(e.drainEvents()).toContain('blocked');
    e.pointerMove(3, 2, 1);
    expect(e.paths[0]).toEqual(route.slice(0, -1));
    e.cancelStroke(1); e.reset();
    const approach: Cell[] = [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4]];
    e.pointerDown(4, 0, 1);
    for (const cell of approach.slice(1)) e.pointerMove(...cell, 1);
    e.pointerMove(1, 3, 1);
    expect(e.paths[0]).toEqual(approach);
    e.pointerMove(0, 4, 1);
    expect(e.done[0]).toBe(true);
  });

  it('finds padding across warp seams, within hexes, and only along connected bridge lanes', () => {
    const loop: Cell[] = [[2, 0], [1, 0], [1, 4], [2, 4]];
    expect(pathHasShortcut(loop, rectTopology(5, 5, true))).toBe(true);
    expect(pathHasShortcut(loop, rectTopology(5, 5, true, { rows: [1], cols: [] }))).toBe(false);
    const hex = hexTopology(5, 5), a: Cell = [2, 2], b = hex.neighbors(...a)[0];
    const c = hex.neighbors(...b).find(cell => hex.neighbors(...a).some(nb => nb[0] === cell[0] && nb[1] === cell[1]))!;
    expect(pathHasShortcut([a, b, c], hex)).toBe(true);
    const alongside: Cell[] = [[2, 0], [2, 1], [2, 2], [2, 3], [1, 3], [1, 2]];
    const topo = rectTopology(5, 5);
    expect(pathHasShortcut(alongside, topo)).toBe(true);
    expect(pathHasShortcut(alongside, topo, new Set([topo.key(2, 2)]))).toBe(false);
  });
  it('plays every gated warp board to a perfect win and rejects closed seams', () => {
    const pack = PACKS.find(p => p.id === 'warps')!;
    for (let n = 1; n <= 40; n++) {
      const e = new FlowEngine();
      const size = pack.sizeForLevel(n);
      e.loadLevel('seed', 0, pack.seedForLevel(n), size, 'square', size, size, null, null, true, false,
        pack.pairsForLevel!(n), pack.warpGatesForLevel!(n));
      const gates = e.topo.warpGates!;
      // Pick a closed edge, then ask applyStep to cross it directly.
      const row = Array.from({ length: size }, (_, r) => r).find(r => !gates.rows.includes(r))!;
      e.startStroke(0, [row, 0], 1);
      expect(e.applyStep(0, [row, size - 1])).toBe(false);
      e.reset();
      e.solution.forEach(path => drawPath(e, path));
      expect(e.won, `warp level ${n}`).toBe(true);
      expect(e.win?.perfect, `warp level ${n}`).toBe(true);
    }
  });
  it('wins by drawing every solution path with a perfect score', () => {
    const e = new FlowEngine();
    e.loadLevel('level', 3);
    expect(e.size).toBe(5);
    e.solution.forEach((sg) => drawPath(e, sg));
    expect(e.won).toBe(true);
    expect(e.win?.stars).toBe(3);
    expect(e.moves).toBe(e.numPairs);
    expect(e.filledPct()).toBe(100);
  });

  it('cuts a rival pipe and restores it on drag-back mid-stroke', () => {
    const e = new FlowEngine();
    e.loadLevel('seed', 0, 'cut-test', 6);
    e.paths[0] = [[2, 1], [2, 2], [2, 3]];
    e.paths[1] = [[0, 2], [1, 2]];
    e.rebuild();
    e.drainEvents();
    e.pushHistory();
    e.active = { color: 1, last: [1, 2], breaks: [], changed: true, pid: 5, preClaim: null, trail: [] };
    expect(e.applyStep(1, [2, 2])).toBe(true);
    expect(e.paths[0].length).toBe(1);
    e.applyStep(1, [1, 2]);
    expect(e.paths[0].length).toBe(3);
    expect(e.paths[1].length).toBe(2);
  });

  it('counts one move per stroke and ignores bare-dot taps', () => {
    const e = new FlowEngine();
    e.loadLevel('seed', 0, 'moves-test', 7);
    drawPath(e, e.solution[0]);
    expect(e.moves).toBe(1);
    const other = e.pairs[1][0];
    e.pointerDown(other[0], other[1], 9);
    e.pointerUp(9);
    expect(e.moves).toBe(1);
  });

  it('undo, reset and hint behave', () => {
    const e = new FlowEngine();
    e.loadLevel('level', 1);
    expect(e.undo()).toBe(false);
    drawPath(e, e.solution[0]);
    expect(e.undo()).toBe(true);
    expect(e.paths[0].length).toBe(0);
    expect(e.moves).toBe(1);
    const ci = e.hint();
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(e.done[ci]).toBe(true);
    expect(e.reset()).toBe(true);
    expect(e.paths.every((p) => p.length === 0)).toBe(true);
  });

  it('undo never refunds moves or hint usage and ends a live stroke', () => {
    const e = new FlowEngine();
    e.loadLevel('level', 1);
    drawPath(e, e.solution[0]);
    drawPath(e, e.solution[1]);
    expect(e.moves).toBe(2);
    expect(e.undo()).toBe(true);
    expect(e.moves).toBe(2);
    expect(e.undo()).toBe(true);
    expect(e.moves).toBe(2);
    e.hint();
    e.undo();
    expect(e.hints).toBe(1);
    drawPath(e, e.solution[0]);
    const dot = e.solution[1][0];
    e.pointerDown(dot[0], dot[1], 9);
    e.undo();
    expect(e.active).toBeNull();
    for (const path of e.solution) drawPath(e, path);
    expect(e.win?.perfect).toBe(false);
  });

  it('a second pointer cannot replace the current stroke', () => {
    const e = new FlowEngine();
    e.loadLevel('level', 1);
    const a = e.pairs[0][0], b = e.pairs[1][0];
    e.pointerDown(a[0], a[1], 1);
    expect(e.pointerDown(b[0], b[1], 2)).toBe('none');
    expect(e.active?.pid).toBe(1);
    expect(e.history.length).toBe(1);
  });

  it('normalizes hostile dimensions before allocating the board', () => {
    const e = new FlowEngine();
    e.loadLevel('seed', 0, 'dimension-bounds', 5, 'square', 1, 5);
    expect(e.rows).toBe(4);
    expect(e.cols).toBe(5);
    expect(e.grid.length).toBe(20);
    e.loadLevel('seed', 0, 'dimension-bounds', 5, 'square', 1000000, 5);
    expect(e.rows).toBe(12);
    expect(e.cols).toBe(5);
    expect(e.grid.length).toBe(60);
  });
});
