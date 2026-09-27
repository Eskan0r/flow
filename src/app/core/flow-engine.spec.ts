/* Headless gameplay specs for FlowEngine (vitest, no DOM). Run: ng test */
import { describe, expect, it } from 'vitest';
import type { Cell } from './flow-generator';
import { FlowEngine } from './flow-engine';

function drawPath(e: FlowEngine, cells: Cell[], pid = 1): boolean {
  e.pointerDown(cells[0][0], cells[0][1], pid);
  for (let i = 1; i < cells.length; i++) e.pointerMove(cells[i][0], cells[i][1], pid);
  return e.pointerUp(pid);
}

describe('FlowEngine', () => {
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
    e.active = { color: 1, last: [1, 2], breaks: [], changed: true, pid: 5 };
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
});
