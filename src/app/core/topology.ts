/* Board topology: square grids and hexagonal (odd-r offset) grids behind one
 * interface, plus pointy-top hex pixel geometry. Framework-free and fully
 * unit-testable (see tests/topology.mjs). Cells are [row, col] in storage
 * coords: plain rectangles for square, odd-r offset rectangles for hex. */

export type BoardKind = 'square' | 'hex';
export type Cell = [number, number];
/** Per-cell playability predicate (polyomino/wall masks). */
export type Mask = (r: number, c: number) => boolean;

/** Selected opposite-edge passages; omitted means every edge cell wraps. */
export interface WarpGates {
  rows: number[];
  cols: number[];
}

export interface Topology {
  kind: BoardKind;
  rows: number;
  cols: number;
  /** Dense grid size (rows x cols), the array/stride domain for `key`. */
  total: number;
  /** Playable cell count (== `total` when there is no mask). */
  cells: number;
  /** Shape mask: a cell is playable only when this (optional) predicate holds. */
  mask?: Mask;
  /** Interior wall cells (blocked, subset of `!mask`); rendering hint only. */
  walls?: Mask;
  /** Toroidal edges: stepping off one side re-enters the opposite (square only). */
  warp?: boolean;
  warpGates?: WarpGates;
  key(r: number, c: number): number;
  inBounds(r: number, c: number): boolean;
  /** Orthogonal neighbors, in-bounds and in-shape only, deterministic order. */
  neighbors(r: number, c: number): Cell[];
  /** Shortest-path length in cells steps. */
  distance(a: Cell, b: Cell): number;
  isBorder(cell: Cell): boolean;
  /** Neighbors of `from` that get strictly closer to `to`, geometric order. */
  stepOptions(from: Cell, to: Cell): Cell[];
  /** True when all cells lie on one grid line (row/col, or hex axis). */
  collinear(cells: Cell[]): boolean;
}

/** Square-grid topology over a connected cell mask (polyomino shape / walls).
 *  Keys stay dense over the bounding rectangle (stride = cols); `mask`
 *  decides playability. `border` = a playable cell with a masked-out neighbor
 *  (pipes hug shape holes exactly like the board edge). */
export function maskTopology(rows: number, cols: number, mask: Mask, walls?: Mask): Topology {
  const inBounds = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols;
  const playable = (r: number, c: number): boolean => inBounds(r, c) && mask(r, c);
  let cells = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (mask(r, c)) cells++;
  const neighbors = (r: number, c: number): Cell[] => {
    const out: Cell[] = [];
    if (playable(r - 1, c)) out.push([r - 1, c]);
    if (playable(r + 1, c)) out.push([r + 1, c]);
    if (playable(r, c - 1)) out.push([r, c - 1]);
    if (playable(r, c + 1)) out.push([r, c + 1]);
    return out;
  };
  const isShapeInBounds = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols;
  return {
    kind: 'square',
    rows,
    cols,
    total: rows * cols,
    cells,
    mask,
    walls,
    key: (r, c) => r * cols + c,
    inBounds: playable,
    neighbors,
    distance: ([r1, c1], [r2, c2]) => Math.abs(r1 - r2) + Math.abs(c1 - c2),
    isBorder: ([r, c]) =>
      !mask(r, c) || // unreachable; defensive
      !isShapeInBounds(r - 1, c) || !mask(r - 1, c) ||
      !isShapeInBounds(r + 1, c) || !mask(r + 1, c) ||
      !isShapeInBounds(r, c - 1) || !mask(r, c - 1) ||
      !isShapeInBounds(r, c + 1) || !mask(r, c + 1),
    stepOptions: ([r, c], [tr, tc]) => {
      const out: Cell[] = [];
      const dr = tr - r;
      const dc = tc - c;
      const v: Cell | null = dr !== 0 ? [r + Math.sign(dr), c] : null;
      const h: Cell | null = dc !== 0 ? [r, c + Math.sign(dc)] : null;
      if (v && h) out.push(Math.abs(dr) >= Math.abs(dc) ? v : h, Math.abs(dr) >= Math.abs(dc) ? h : v);
      else if (v) out.push(v);
      else if (h) out.push(h);
      return out.filter(([rr, cc]) => playable(rr, cc));
    },
    collinear: (cells) => {
      if (cells.length === 0) return true;
      const r0 = cells[0][0];
      const c0 = cells[0][1];
      return cells.every(([r]) => r === r0) || cells.every(([, c]) => c === c0);
    },
  };
}

/** Rectangular square-grid topology (rows x cols). `squareTopology` is the
 *  square special case. Key stride is `cols`, matching hex storage. When
 *  `warp` is set the grid is a torus: edges wrap and distance is toroidal. */
export function rectTopology(rows: number, cols: number, warp = false, warpGates?: WarpGates): Topology {
  // A torus only makes sense from 3x3 up; smaller grids would produce
  // duplicate/self neighbors, so they stay planar.
  const gates = warp && warpGates ? {
    rows: [...new Set(warpGates.rows.filter(r => Number.isInteger(r) && r >= 0 && r < rows))].sort((a, b) => a - b),
    cols: [...new Set(warpGates.cols.filter(c => Number.isInteger(c) && c >= 0 && c < cols))].sort((a, b) => a - b),
  } : undefined;
  const tor = warp && rows > 2 && cols > 2 && (!gates || gates.rows.length + gates.cols.length > 0);
  const inBounds = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols;
  const neighbors = (r: number, c: number): Cell[] => {
    if (tor) {
      const out: Cell[] = [];
      if (r > 0 || !gates || gates.cols.includes(c)) out.push([(r - 1 + rows) % rows, c]);
      if (r < rows - 1 || !gates || gates.cols.includes(c)) out.push([(r + 1) % rows, c]);
      if (c > 0 || !gates || gates.rows.includes(r)) out.push([r, (c - 1 + cols) % cols]);
      if (c < cols - 1 || !gates || gates.rows.includes(r)) out.push([r, (c + 1) % cols]);
      return out;
    }
    const out: Cell[] = [];
    if (r > 0) out.push([r - 1, c]);
    if (r < rows - 1) out.push([r + 1, c]);
    if (c > 0) out.push([r, c - 1]);
    if (c < cols - 1) out.push([r, c + 1]);
    return out;
  };
  const torusDistance = ([r1, c1]: Cell, [r2, c2]: Cell): number => {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return Math.min(dr, rows - dr) + Math.min(dc, cols - dc);
  };
  // Selective passages need graph distances: unrestricted torus distance
  // would route a drag (and the generator) toward closed edges. Cache BFS
  // tables because generation asks about the same destinations repeatedly.
  const distances = new Map<number, Int16Array>();
  const distance = (a: Cell, b: Cell): number => {
    if (!tor) return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (!gates) return torusDistance(a, b);
    const target = b[0] * cols + b[1];
    let ds = distances.get(target);
    if (!ds) {
      ds = new Int16Array(rows * cols).fill(-1);
      ds[target] = 0;
      const queue = [target];
      for (let i = 0; i < queue.length; i++) {
        const k = queue[i];
        for (const [r, c] of neighbors(Math.floor(k / cols), k % cols)) {
          const next = r * cols + c;
          if (ds[next] !== -1) continue;
          ds[next] = ds[k] + 1;
          queue.push(next);
        }
      }
      distances.set(target, ds);
    }
    return ds[a[0] * cols + a[1]];
  };
  return {
    kind: 'square',
    rows,
    cols,
    total: rows * cols,
    cells: rows * cols,
    warp: tor,
    warpGates: tor ? gates : undefined,
    key: (r, c) => r * cols + c,
    inBounds,
    neighbors,
    distance,
    isBorder: tor && !gates ? () => false : ([r, c]) =>
      ((r === 0 || r === rows - 1) && (!tor || !gates?.cols.includes(c))) ||
      ((c === 0 || c === cols - 1) && (!tor || !gates?.rows.includes(r))),
    stepOptions: tor
      ? (from, to) => {
        const d = distance(from, to);
        return neighbors(from[0], from[1]).filter((nb) => distance(nb, to) < d);
      }
      : ([r, c], [tr, tc]) => {
        const out: Cell[] = [];
        const dr = tr - r;
        const dc = tc - c;
        const v: Cell | null = dr !== 0 ? [r + Math.sign(dr), c] : null;
        const h: Cell | null = dc !== 0 ? [r, c + Math.sign(dc)] : null;
        // Replicates the classic larger-delta-axis-first walk.
        if (v && h) {
          if (Math.abs(dr) >= Math.abs(dc)) out.push(v, h);
          else out.push(h, v);
        } else if (v) out.push(v);
        else if (h) out.push(h);
        return out.filter(([rr, cc]) => inBounds(rr, cc));
      },
    collinear: (cells) => {
      if (cells.length === 0) return true;
      const r0 = cells[0][0];
      const c0 = cells[0][1];
      return cells.every(([r]) => r === r0) || cells.every(([, c]) => c === c0);
    },
  };
}

export function squareTopology(size: number): Topology {
  return rectTopology(size, size);
}

/* ---------- hex (odd-r offset storage, axial math internally) ---------- */

interface Axial {
  q: number;
  r: number;
}

function offToAx(row: number, col: number): Axial {
  return { q: col - ((row - (row & 1)) >> 1), r: row };
}

function axToOff(q: number, r: number): Cell {
  return [r, q + ((r - (r & 1)) >> 1)];
}

const AX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

function cubeDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexTopology(rows: number, cols: number): Topology {
  const inBounds = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols;
  const neighbors = (r: number, c: number): Cell[] => {
    const a = offToAx(r, c);
    const out: Cell[] = [];
    for (const [dq, dr] of AX_DIRS) {
      const [rr, cc] = axToOff(a.q + dq, a.r + dr);
      if (inBounds(rr, cc)) out.push([rr, cc]);
    }
    return out;
  };
  const dist = (x: Cell, y: Cell): number => {
    const a = offToAx(x[0], x[1]);
    const b = offToAx(y[0], y[1]);
    return cubeDistance(a, b);
  };
  return {
    kind: 'hex',
    rows,
    cols,
    total: rows * cols,
    cells: rows * cols,
    key: (r, c) => r * cols + c,
    inBounds,
    neighbors,
    distance: dist,
    isBorder: ([r, c]) => r === 0 || r === rows - 1 || c === 0 || c === cols - 1,
    stepOptions: (from, to) => {
      const d = dist(from, to);
      return neighbors(from[0], from[1]).filter((nb) => dist(nb, to) < d);
    },
    collinear: (cells) => {
      if (cells.length === 0) return true;
      // A straight hex line holds one cube coordinate constant.
      let cx = true;
      let cy = true;
      let cz = true;
      let x0 = 0;
      let y0 = 0;
      let z0 = 0;
      cells.forEach(([r, c], i) => {
        const a = offToAx(r, c);
        const x = a.q;
        const z = a.r;
        const y = -x - z;
        if (i === 0) {
          x0 = x;
          y0 = y;
          z0 = z;
        } else {
          if (x !== x0) cx = false;
          if (y !== y0) cy = false;
          if (z !== z0) cz = false;
        }
      });
      return cx || cy || cz;
    },
  };
}

/* ---------- pointy-top hex pixel geometry (pure, testable) ---------- */

export interface HexLayout {
  s: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const SQRT3 = Math.sqrt(3);

function rawCenter(q: number, r: number, s: number): { x: number; y: number } {
  return { x: s * SQRT3 * (q + r / 2), y: s * 1.5 * r };
}

/** Layout (with origin) for an odd-r rows×cols board at hex size s. */
export function hexLayout(rows: number, cols: number, s: number): HexLayout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = offToAx(r, c);
      const p = rawCenter(a.q, a.r, s);
      minX = Math.min(minX, p.x - (SQRT3 / 2) * s);
      maxX = Math.max(maxX, p.x + (SQRT3 / 2) * s);
      minY = Math.min(minY, p.y - s);
      maxY = Math.max(maxY, p.y + s);
    }
  }
  return { s, w: maxX - minX, h: maxY - minY, ox: -minX, oy: -minY };
}

export function hexCellCenter(layout: HexLayout, r: number, c: number): { x: number; y: number } {
  const a = offToAx(r, c);
  const p = rawCenter(a.q, a.r, layout.s);
  return { x: p.x + layout.ox, y: p.y + layout.oy };
}

/** Six corner offsets (pointy-top) for outlines, relative to a center. */
export function hexCornerOffsets(s: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const ang = ((60 * i - 30) * Math.PI) / 180;
    out.push({ x: s * Math.cos(ang), y: s * Math.sin(ang) });
  }
  return out;
}

/** Pixel → cell via fractional axial + cube rounding. Null when outside. */
export function hexPixelToCell(
  layout: HexLayout, rows: number, cols: number, x: number, y: number,
): Cell | null {
  const s = layout.s;
  const rx = x - layout.ox;
  const ry = y - layout.oy;
  const qf = ((SQRT3 / 3) * rx - ry / 3) / s;
  const rf = ((2 / 3) * ry) / s;
  let cx = qf;
  let cz = rf;
  let cy = -cx - cz;
  let rx2 = Math.round(cx);
  let ry2 = Math.round(cy);
  let rz2 = Math.round(cz);
  const dx = Math.abs(rx2 - cx);
  const dy = Math.abs(ry2 - cy);
  const dz = Math.abs(rz2 - cz);
  if (dx > dy && dx > dz) rx2 = -ry2 - rz2;
  else if (dy > dz) ry2 = -rx2 - rz2;
  else rz2 = -rx2 - ry2;
  const [r, c] = axToOff(rx2, rz2);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  // Reject pixels outside this hex (jagged rim corners): inside iff within
  // the apothem on all six edge normals.
  const ctr = hexCellCenter(layout, r, c);
  const px = x - ctr.x;
  const py = y - ctr.y;
  const apothem = (SQRT3 / 2) * s;
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    if (px * Math.cos(ang) + py * Math.sin(ang) > apothem + 1e-9) return null;
  }
  return [r, c];
}
