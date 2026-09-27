/* Topology math specs (mirror of tests/topology.mjs core). Run: ng test */
import { describe, expect, it } from 'vitest';
import { hexCellCenter, hexLayout, hexPixelToCell, hexTopology, squareTopology } from './topology';
import { buildSnake } from './flow-generator';

describe('topology', () => {
  it('square neighborhoods and distances', () => {
    const t = squareTopology(6);
    expect(t.neighbors(2, 2)).toHaveLength(4);
    expect(t.neighbors(0, 0)).toHaveLength(2);
    expect(t.distance([0, 0], [3, 4])).toBe(7);
    expect(t.collinear([[1, 1], [1, 3]])).toBe(true);
    expect(t.collinear([[1, 1], [2, 2]])).toBe(false);
  });

  it('hex neighborhoods are symmetric with correct counts', () => {
    for (const [rows, cols] of [[5, 5], [7, 7]] as Array<[number, number]>) {
      const t = hexTopology(rows, cols);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const nbs = t.neighbors(r, c);
          const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
          if (!edge) expect(nbs).toHaveLength(6);
          for (const [nr, nc] of nbs) {
            expect(t.inBounds(nr, nc)).toBe(true);
            expect(t.neighbors(nr, nc).some(([ar, ac]) => ar === r && ac === c)).toBe(true);
          }
          expect(t.distance([r, c], [r, c])).toBe(0);
        }
      }
    }
  });

  it('snake covers both topologies contiguously', () => {
    for (const topo of [squareTopology(6), hexTopology(6, 6)]) {
      const path = buildSnake(6, 6);
      expect(path).toHaveLength(topo.total);
      expect(new Set(path.map(([r, c]) => topo.key(r, c))).size).toBe(topo.total);
      for (let i = 1; i < path.length; i++) {
        const [r, c] = path[i];
        expect(topo.neighbors(path[i - 1][0], path[i - 1][1]).some(([ar, ac]) => ar === r && ac === c)).toBe(true);
      }
    }
  });

  it('hex pixel centers round-trip', () => {
    const lay = hexLayout(6, 6, 12);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const p = hexCellCenter(lay, r, c);
        expect(hexPixelToCell(lay, 6, 6, p.x, p.y)).toEqual([r, c]);
      }
    }
    expect(hexPixelToCell(lay, 6, 6, -50, -50)).toBeNull();
  });
});
