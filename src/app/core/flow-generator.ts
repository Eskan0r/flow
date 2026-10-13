/* Seeded Flow Free level generator.
 * Hamiltonian snake -> seeded backbite shuffle -> sequential clean partition.
 * The partition IS a full-coverage solution, so every puzzle is solvable
 * by construction. Framework-free: usable from Angular and plain Node
 * (type-strippable - no enums, namespaces, or parameter properties). */

export type Cell = [number, number];

import { hexTopology, maskTopology, rectTopology } from './topology';
import type { BoardKind, Mask, Topology } from './topology';
import { carveLevel } from './carve';

export interface FlowLevel {
  seed: string;
  size: number;
  numPairs: number;
  pairs: [Cell, Cell][];
  solution: Cell[][];
  kind?: BoardKind;
  rows?: number;
  cols?: number;
  /** Shape mask used to build this level (masked square boards only). */
  mask?: Mask;
  /** Interior wall cells (rendering hint; subset of the blocked cells). */
  walls?: Mask;
  /** Toroidal edges (square boards only). */
  warp?: boolean;
}

export interface LevelStats {
  minLen: number;
  maxLen: number;
  avgLen: number;
  minD: number;
  minRatio: number;
  avgDetour: number;
  maxDetour: number;
  touches: number;
  mono2x2: number;
  borderBoth: number;
  straights: number;
  borderStraight: number;
  overlapCells: number;
  score: number;
  ms: number;
  tier: 'clean' | 'relaxed' | 'dirty';
}

export interface GeneratedLevel extends FlowLevel {
  stats: LevelStats;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export type Rng = () => number;

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function (): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(a: number): Rng {
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(seedString: string): Rng {
  return mulberry32(xmur3(String(seedString))());
}

/** Serpentine Hamiltonian path over a rows×cols rectangle. Contiguous on
 *  both square and odd-r hex boards (verified in tests/topology.mjs).
 *  @internal Exported for diagnostics/tests. */
export function buildSnake(rows: number, cols: number = rows): Cell[] {
  const path: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < cols; c++) path.push([r, c]);
    } else {
      for (let c = cols - 1; c >= 0; c--) path.push([r, c]);
    }
  }
  return path;
}

/** Randomize a Hamiltonian path with backbite moves (seeded, in place). */
export function backbite(path: Cell[], topo: Topology, rng: Rng, steps: number): Cell[] {
  const n = path.length;
  const key = (cell: Cell): number => topo.key(cell[0], cell[1]);
  const idxOf = new Array<number>(topo.total);
  for (let i = 0; i < n; i++) idxOf[key(path[i])] = i;

  for (let s = 0; s < steps; s++) {
    const atStart = rng() < 0.5;
    const e = atStart ? path[0] : path[n - 1];
    const forbidden = atStart ? path[1] : path[n - 2];
    const nbs = topo.neighbors(e[0], e[1]);
    const cands: Cell[] = [];
    for (const nb of nbs) {
      if (nb[0] === forbidden[0] && nb[1] === forbidden[1]) continue;
      cands.push(nb);
    }
    if (cands.length === 0) continue;
    const chosen = cands[Math.floor(rng() * cands.length)];
    const j = idxOf[key(chosen)];
    if (atStart) {
      if (j < 2) continue;
      const head = path.slice(0, j).reverse();
      for (let k = 0; k < head.length; k++) idxOf[key(head[k])] = k;
      for (let k = 0; k < j; k++) path[k] = head[k];
    } else {
      if (j > n - 3) continue;
      const tail = path.slice(j + 1).reverse();
      for (let k = 0; k < tail.length; k++) {
        path[j + 1 + k] = tail[k];
        idxOf[key(tail[k])] = j + 1 + k;
      }
    }
  }
  return path;
}


export interface CutInfo {
  segs: Cell[][];
  pairs: [Cell, Cell][];
  Ds: number[];
  Ls: number[];
  touches: number;
  mono2x2: number;
  borderBoth: number;
  straights: number;
  borderStraight: number;
  adjacentSame: number;
  overlapCells: number;
  minD: number;
  minL: number;
  maxL: number;
  avgL: number;
  minRatio: number;
  avgDetour: number;
  maxDetour: number;
  spread: number;
  score: number;
}

/** @internal Exported for diagnostics/tests. */
export function analyzeCut(path: Cell[], topo: Topology, lens: number[]): CutInfo {
  const K = lens.length;
  const { rows, cols } = topo;
  const segs: Cell[][] = [];
  let idx = 0;
  for (let s = 0; s < K; s++) {
    segs.push(path.slice(idx, idx + lens[s]));
    idx += lens[s];
  }
  const pairs = segs.map((sg): [Cell, Cell] => [sg[0], sg[sg.length - 1]]);
  const Ds = pairs.map(([a, b]) => topo.distance(a, b));
  const Ls = lens.slice();

  let touches = 0;
  for (let s = 0; s < K; s++) {
    const sg = segs[s];
    const inSeg = new Set(sg.map((cell) => topo.key(cell[0], cell[1])));
    for (let k = 0; k < sg.length; k++) {
      const cell = sg[k];
      const isEnd = k === 0 || k === sg.length - 1;
      let same = 0;
      for (const nb of topo.neighbors(cell[0], cell[1])) {
        if (inSeg.has(topo.key(nb[0], nb[1]))) same++;
      }
      if (same !== (isEnd ? 1 : 2)) touches++;
    }
  }
  let mono2x2 = 0;
  if (topo.kind === 'square') {
    const segGrid: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
    for (let s = 0; s < K; s++) {
      for (const cell of segs[s]) segGrid[cell[0]][cell[1]] = s;
    }
    const rMax = topo.warp ? rows : rows - 1;
    const cMax = topo.warp ? cols : cols - 1;
    for (let r = 0; r < rMax; r++) {
      for (let c = 0; c < cMax; c++) {
        const r1 = (r + 1) % rows;
        const c1 = (c + 1) % cols;
        const a = segGrid[r][c];
        if (a !== -1 && a === segGrid[r1][c] && a === segGrid[r][c1] && a === segGrid[r1][c1]) mono2x2++;
      }
    }
  }
  let borderBoth = 0;
  for (const [a, b] of pairs) {
    if (topo.isBorder(a) && topo.isBorder(b)) borderBoth++;
  }
  let straights = 0;
  let borderStraight = 0;
  for (const sg of segs) {
    if (topo.collinear(sg)) {
      straights++;
      const a = sg[0];
      const b = sg[sg.length - 1];
      if (topo.isBorder(a) && topo.isBorder(b)) borderStraight++;
    }
  }
  let adjacentSame = 0;
  for (const d of Ds) if (d <= 1) adjacentSame++;

  const cover = new Array<number>(topo.total).fill(0);
  for (const [a, b] of pairs) {
    const D = topo.distance(a, b);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell: Cell = [r, c];
        if (topo.distance(a, cell) + topo.distance(cell, b) === D) cover[topo.key(r, c)]++;
      }
    }
  }
  let overlapCells = 0;
  for (const v of cover) if (v >= 2) overlapCells++;

  const minD = Math.min(...Ds);
  const maxL = Math.max(...Ls);
  const minL = Math.min(...Ls);
  const avgL = Ls.reduce((x, y) => x + y, 0) / Ls.length;
  const minRatio = Math.min(...Ls.map((L, i) => Ds[i] / L));
  const detours = Ls.map((L, i) => L - (Ds[i] + 1));
  const avgDetour = detours.reduce((x, y) => x + y, 0) / detours.length;
  const maxDetour = Math.max(...detours);
  const spread = (maxL - minL) / avgL;
  const score = minRatio * 3.0 - spread * 0.6 - borderBoth * 0.25 - straights * 0.4 - Math.max(0, maxDetour - 5) * 0.2;

  return {
    segs, pairs, Ds, Ls, touches, mono2x2, borderBoth, straights, borderStraight,
    adjacentSame, overlapCells, minD, minL, maxL, avgL, minRatio,
    avgDetour, maxDetour, spread, score,
  };
}

export function defaultPairsForSize(size: number): number {
  if (size <= 5) return 4;
  return size; // ~1 pair per side, Flow Free convention
}

/** Hex density: carving naturally lands ~5-cell flows, so hex pair counts
 *  follow total/5 (denser than square, which is correct on 6-neighbor grids). */
export function defaultHexPairs(rows: number, cols: number): number {
  return Math.min(12, Math.max(4, Math.round((rows * cols) / 5)));
}

/** Masked-shape density: carve ~6-cell flows over playable cells. */
export function maskDefaultPairs(cells: number): number {
  return Math.max(2, Math.min(12, Math.round(cells / 6)));
}

export function countMask(mask: Mask, rows: number, cols: number): number {
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (mask(r, c)) n++;
  return n;
}

export function lengthBounds(size: number, numPairs: number, total = size * size): { minLen: number; maxLen: number; avg: number } {
  const avg = total / numPairs;
  return { minLen: Math.max(4, Math.floor(avg * 0.5)), maxLen: Math.ceil(avg * 1.7), avg };
}

/** One snake segment path[l..r) is a clean Flow line: induced path (no
 *  self-touch), no 2x2 block on square boards, spread ends. On hex boards
 *  the per-cell touch counts fully characterize validity (see topology). */
/** @internal Exported for diagnostics/tests. */
export function segClean(path: Cell[], topo: Topology, l: number, r: number, minD: number): boolean {
  const a = path[l];
  const b = path[r - 1];
  const D = topo.distance(a, b);
  if (D <= 1 || D < minD) return false;
  const set = new Set<number>();
  for (let i = l; i < r; i++) set.add(topo.key(path[i][0], path[i][1]));
  for (let k = l; k < r; k++) {
    const cell = path[k];
    const isEnd = k === l || k === r - 1;
    let same = 0;
    for (const nb of topo.neighbors(cell[0], cell[1])) {
      if (set.has(topo.key(nb[0], nb[1]))) same++;
    }
    if (same !== (isEnd ? 1 : 2)) return false;
  }
  if (topo.kind === 'square') {
    const { rows, cols } = topo;
    for (let i = l; i < r; i++) {
      const cr = path[i][0];
      const cc = path[i][1];
      if (cr < rows - 1 && cc < cols - 1) {
        if (set.has(topo.key(cr, cc)) && set.has(topo.key(cr + 1, cc)) &&
            set.has(topo.key(cr, cc + 1)) && set.has(topo.key(cr + 1, cc + 1))) return false;
      }
    }
  }
  return true;
}

/** Sequential backtracking partition: walk the snake, cut clean segments.
 *  @internal Exported for diagnostics/tests. */
export function findCleanPartition(
  path: Cell[], topo: Topology, K: number, minLen: number, maxLen: number,
  minD: number, rng: Rng, budget = 2500, maxStraights = 99, forbidBorderStraight = false,
): number[] | null {
  const total = path.length;
  const lens = new Array<number>(K);
  let calls = 0;
  const segIsBorderStraight = (l: number, r: number): boolean => {
    if (!topo.collinear(path.slice(l, r))) return false;
    return topo.isBorder(path[l]) && topo.isBorder(path[r - 1]);
  };
  function dfs(seg: number, pos: number, straightsUsed: number): boolean {
    if (++calls > budget) return false;
    if (seg === K) return pos === total;
    const remain = K - seg;
    const lo = Math.max(minLen, total - pos - (remain - 1) * maxLen);
    const hi = Math.min(maxLen, total - pos - (remain - 1) * minLen);
    if (lo > hi) return false;
    const opts: number[] = [];
    for (let L = lo; L <= hi; L++) opts.push(L);
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = opts[i];
      opts[i] = opts[j];
      opts[j] = t;
    }
    const avg = total / K;
    // Jitter keys are drawn up front: rng call counts inside a sort
    // comparator vary by JS engine, which would diverge levels across
    // browsers. Score-form keeps the comparator transitive and pure.
    const jitter = new Map<number, number>();
    for (const L of opts) jitter.set(L, (rng() - 0.5) * 0.01);
    opts.sort((x, y) => Math.abs(x - avg) + (jitter.get(x) ?? 0) - Math.abs(y - avg) - (jitter.get(y) ?? 0));
    for (const L of opts) {
      if (!segClean(path, topo, pos, pos + L, minD)) continue;
      const straight = topo.collinear(path.slice(pos, pos + L));
      if (straight && straightsUsed >= maxStraights) continue;
      if (forbidBorderStraight && segIsBorderStraight(pos, pos + L)) continue;
      lens[seg] = L;
      if (dfs(seg + 1, pos + L, straightsUsed + (straight ? 1 : 0))) return true;
    }
    return false;
  }
  return dfs(0, 0, 0) ? lens.slice() : null;
}

export interface GenerateOptions {
  /** Fixed candidate count for the cut pipeline (deterministic bound). */
  maxPaths?: number;
  kind?: BoardKind;
  rows?: number;
  cols?: number;
  /** Shape mask (plays like a square board restricted to `mask` cells). */
  mask?: Mask;
  /** Interior wall cells (must be a subset of the blocked cells). */
  walls?: Mask;
  /** Toroidal edges (square boards only). */
  warp?: boolean;
}

interface Candidate {
  lens: number[];
  info: CutInfo;
  path: Cell[];
}

/** Shared quality score for full-coverage partitions. Exported for carve.ts. */
export function scoreClean(info: CutInfo): number {
  const detourPenalty = info.avgDetour < 0.8 ? (0.8 - info.avgDetour) * 0.8 : 0;
  const hardPenalty = info.minD < 3 ? 0.35 : 0;
  return (
    info.minRatio * 3.2 - info.spread * 0.7 - info.borderBoth * 0.5 -
    info.straights * 0.45 - info.borderStraight * 1.0 - Math.max(0, info.maxDetour - 5) * 0.25 -
    detourPenalty - hardPenalty + Math.min(0.5, info.overlapCells / 24)
  );
}

export function generateLevel(
  seedString: string, size = 7, numPairs: number | null = null, opts: GenerateOptions = {},
): GeneratedLevel {
  const t0 = Date.now();
  if (size < 5) size = 5;
  if (size > 12) size = 12;
  const kind: BoardKind = opts.kind ?? 'square';
  const rows = Math.min(12, Math.max(4, opts.rows ?? size));
  const cols = Math.min(12, Math.max(4, opts.cols ?? size));
  const masked = kind !== 'hex' && opts.mask !== undefined;
  const cells = masked ? countMask(opts.mask as Mask, rows, cols) : 0;
  let K = numPairs
    ?? (kind === 'hex' ? defaultHexPairs(rows, cols)
      : masked ? maskDefaultPairs(cells)
      : defaultPairsForSize(size));
  K = Math.max(2, Math.min(14, K));

  // Square keeps the legacy namespace; hex gets its own so the two can
  // never collide on the same seed string. Rectangular square boards use
  // `rows x cols`, which equals `size x size` for square boards; masked
  // boards carve under their own namespace so they can't collide either.
  const rng = kind === 'hex'
    ? seededRng(`${String(seedString)}::hex:${rows}x${cols}:${K}`)
    : masked
      ? seededRng(`${String(seedString)}::mask:${rows}x${cols}:${K}`)
      : seededRng(`${String(seedString)}::${rows}x${cols}:${K}${opts.warp ? ':warp' : ''}`);
  const topo: Topology = kind === 'hex'
    ? hexTopology(rows, cols)
    : masked
      ? maskTopology(rows, cols, opts.mask as Mask, opts.walls)
      : rectTopology(rows, cols, opts.warp);
  const total = topo.total;
  const maxPaths = opts.maxPaths ?? 70;
  // Excellent boards stop the search early, but only after a fixed minimum
  // look (never wall-clock: iteration counts must be identical everywhere so
  // one seed deals the same level on every client).
  const MIN_PATHS = 8;

  // Hex and masked boards carve instead of cutting: Hamiltonian partitions
  // tangle on degree-6 grids and non-rectangular shapes, while sequential
  // carving stays clean (see carve.ts). Several salted attempts; the last
  // drops the straight-count cap (but never the border veto or validity).
  // Thin/non-convex masks need a deeper carve search than hex.
  const tuning = masked ? { triesPerFlow: 30, pathBudget: 1500 } : {};
  const mkLevel = (carved: NonNullable<ReturnType<typeof carveLevel>>, info: ReturnType<typeof analyzeCut>, tier: 'clean' | 'relaxed' | 'dirty') => ({
    seed: String(seedString),
    size,
    numPairs: carved.solution.length,
    kind,
    rows,
    cols,
    mask: topo.mask,
    walls: topo.walls,
    warp: topo.warp,
    pairs: carved.pairs,
    solution: carved.solution,
    stats: {
      minLen: info.minL, maxLen: info.maxL, avgLen: +info.avgL.toFixed(2),
      minD: info.minD, minRatio: +info.minRatio.toFixed(3),
      avgDetour: +info.avgDetour.toFixed(2), maxDetour: info.maxDetour,
      touches: info.touches, mono2x2: info.mono2x2,
      borderBoth: info.borderBoth, straights: info.straights,
      borderStraight: info.borderStraight,
      overlapCells: info.overlapCells, score: +info.score.toFixed(3),
      ms: Date.now() - t0,
      tier,
    },
  });
  let maskBestEffort: ReturnType<typeof mkLevel> | null = null;
  if (kind === 'hex' || masked) {
    const salts: Array<{ salt: string; relax: boolean; restarts: number }> = [
      { salt: '', relax: false, restarts: 12 },
      { salt: '#c2', relax: false, restarts: 12 },
      { salt: '#c3', relax: false, restarts: 12 },
      { salt: '#c4', relax: false, restarts: 12 },
      { salt: '#c5', relax: false, restarts: 12 },
      { salt: '#c6', relax: true, restarts: 12 },
    ];
    // Thin/non-convex masks need a deeper carve search than hex.
    for (const a of salts) {
      const carved = carveLevel(String(seedString), topo, K, {
        maxRestarts: a.restarts,
        salt: a.salt,
        relaxShape: a.relax,
        ...tuning,
      });
      if (!carved) continue;
      const info = analyzeCut(
        carved.solution.flat(),
        topo,
        carved.solution.map((sg) => sg.length),
      );
      if (info.touches !== 0 || info.mono2x2 !== 0) continue;
      if (masked && !maskBestEffort) maskBestEffort = mkLevel(carved, info, 'relaxed');
      if (a.relax) {
        if (info.borderStraight > 0 || info.straights > 3) continue;
      } else if (info.straights > 1 || info.borderStraight > 0) {
        continue;
      }
      return mkLevel(carved, info, a.relax ? 'relaxed' : 'clean');
    }
    // Vanishingly rare for hex: fall through to the cut pipeline below so a
    // solvable board still comes back (loadLevel retries with fresh seeds).
  }
  if (masked) {
    // The cut pipeline below builds snakes over the full bounding rectangle,
    // which would walk through masked-out cells. Masks rely on carve only:
    // retry across nearby pair counts (both denser and coarser) with a deep
    // search and the shape cap relaxed. `throw` is a last resort for shapes
    // that are genuinely uncarvable (loadLevel retries with fresh seeds).
    const alt = [K - 1, K + 1, K - 2, K + 2, K - 3, K + 3].filter((k) => k >= 3 && k <= 14);
    for (const k of alt) {
      const carved = carveLevel(String(seedString), topo, k, { maxRestarts: 10, relaxShape: true, ...tuning });
      if (!carved) continue;
      const info = analyzeCut(
        carved.solution.flat(),
        topo,
        carved.solution.map((sg) => sg.length),
      );
      if (info.touches !== 0 || info.mono2x2 !== 0) continue;
      return mkLevel(carved, info, 'relaxed');
    }
    // A wall/odd board can force more straights than the clean cap allows;
    // accept the valid carve at the default density before giving up.
    if (maskBestEffort) return maskBestEffort;
    // One deep, slow attempt before giving up: thin shapes sometimes need a
    // wider search and more tries per flow than the salts above use.
    const deep = carveLevel(String(seedString), topo, K, {
      maxRestarts: 12,
      relaxShape: true,
      triesPerFlow: 60,
      pathBudget: 20000,
    });
    if (deep) {
      const info = analyzeCut(deep.solution.flat(), topo, deep.solution.map((sg) => sg.length));
      if (info.touches === 0 && info.mono2x2 === 0) return mkLevel(deep, info, 'relaxed');
    }
    throw new Error(`mask carve failed for seed ${JSON.stringify(String(seedString))} (${rows}x${cols})`);
  }

  const { minLen, maxLen } = lengthBounds(Math.max(rows, cols), K, total);

  const cleanPool: Candidate[] = [];
  const relaxedPool: Candidate[] = [];
  let bestDirty: Candidate | null = null;
  let bestDirtyScore = -Infinity;
  const considerDirty = (lens: number[], info: CutInfo, path: Cell[]): void => {
    const s = info.score - info.touches * 0.6 - info.mono2x2 * 2 - info.borderStraight * 0.5;
    if (!bestDirty || s > bestDirtyScore) {
      bestDirty = { lens, info, path: path.map((c) => c.slice() as Cell) };
      bestDirtyScore = s;
    }
  };
  const copyPath = (path: Cell[]): Cell[] => path.map((c) => c.slice() as Cell);
  // Phase A: smooth Hamiltonians + shape-pruned sequential cuts. Accepted
  // candidates are touch-free, mono-free, have at most one straight line
  // and zero border-to-border straights.
  let bestCleanScore = -Infinity;
  let bestCleanMinD = 0;
  for (let p = 0; p < maxPaths; p++) {
    const path = buildSnake(rows, cols);
    backbite(path, topo, rng, Math.floor(total * (0.3 + rng() * 0.6)));
    const lens = findCleanPartition(path, topo, K, minLen, maxLen, 2, rng, 8000, 1, true);
    if (!lens) continue;
    const info = analyzeCut(path, topo, lens);
    considerDirty(lens, info, path);
    if (info.touches !== 0 || info.mono2x2 !== 0 || info.adjacentSame !== 0) continue;
    if (info.straights > 1 || info.borderStraight > 0) continue;
    info.score = scoreClean(info);
    cleanPool.push({ lens: lens.slice(), info, path: copyPath(path) });
    if (info.score > bestCleanScore) {
      bestCleanScore = info.score;
      bestCleanMinD = info.minD;
    }
    if (bestCleanScore > 1.35 && bestCleanMinD >= 3 && p >= MIN_PATHS) break;
  }

  // Phase B: medium-roughness Hamiltonians, touch-free sequential cuts, no
  // shape pruning. Still solvable with clean essentials.
  if (cleanPool.length === 0) {
    let bestRelaxedScore = -Infinity;
    for (let p = 0; p < 40; p++) {
      const path = buildSnake(rows, cols);
      backbite(path, topo, rng, Math.floor(total * (1.0 + rng() * 1.0)));
      const lens = findCleanPartition(path, topo, K, minLen, maxLen, 2, rng, 3000, 99, false);
      if (!lens) continue;
      const info = analyzeCut(path, topo, lens);
      considerDirty(lens, info, path);
      if (info.touches !== 0 || info.mono2x2 !== 0 || info.adjacentSame !== 0) continue;
      info.score = scoreClean(info);
      relaxedPool.push({ lens: lens.slice(), info, path: copyPath(path) });
      if (info.score > bestRelaxedScore) bestRelaxedScore = info.score;
      if (bestRelaxedScore > 1.2 && p >= MIN_PATHS) break;
    }
  }

  // Diversity pick: best-by-score funnels different seeds into the same few
  // optima (repeat levels across a pack), so choose by seed among the top
  // scorers instead. The pool is deduped to distinct dot layouts first (same
  // dots from different snakes would waste finalist slots). The strict
  // filter keeps the suite invariants green by construction; the rng draw
  // sits at a fixed program point, so one seed still deals one level on
  // every client.
  const pool = cleanPool.length > 0 ? cleanPool : relaxedPool;
  const seenPairs = new Set<string>();
  const distinct = pool.filter((c) => {
    const k = JSON.stringify(c.info.pairs);
    if (seenPairs.has(k)) return false;
    seenPairs.add(k);
    return true;
  });
  const strict = distinct.filter((c) =>
    c.info.minRatio >= 0.25 && c.info.minD >= 2 &&
    c.info.straights <= 1 && c.info.borderStraight === 0 &&
    c.info.overlapCells >= 2 &&
    c.info.maxDetour <= Math.ceil((size * size / K) * 0.9));
  const top = (strict.length > 0 ? strict : distinct)
    .slice()
    .sort((x, y) => y.info.score - x.info.score)
    .slice(0, 12);
  const best = top.length > 0 ? top[Math.floor(rng() * top.length)] : bestDirty;
  // Phase C: best-effort fallback. Always yields a solvable board (the cut
  // itself is a full-coverage solution); only the shape polish may be missing.
  if (best) {
    const tier = cleanPool.includes(best) ? 'clean' : relaxedPool.includes(best) ? 'relaxed' : 'dirty';
    const { info, path } = best;
    const segs: Cell[][] = [];
    let idx = 0;
    for (const L of best.lens) {
      segs.push(path.slice(idx, idx + L));
      idx += L;
    }
    return {
      seed: String(seedString),
      size,
      numPairs: K,
      kind,
      rows,
      cols,
      warp: topo.warp,
      pairs: segs.map((sg): [Cell, Cell] => [[sg[0][0], sg[0][1]], [sg[sg.length - 1][0], sg[sg.length - 1][1]]]),
      solution: segs.map((sg) => sg.map((cell): Cell => [cell[0], cell[1]])),
      stats: {
        minLen: info.minL, maxLen: info.maxL, avgLen: +info.avgL.toFixed(2),
        minD: info.minD, minRatio: +info.minRatio.toFixed(3),
        avgDetour: +info.avgDetour.toFixed(2), maxDetour: info.maxDetour,
        touches: info.touches, mono2x2: info.mono2x2,
        borderBoth: info.borderBoth, straights: info.straights,
        borderStraight: info.borderStraight,
        overlapCells: info.overlapCells, score: +info.score.toFixed(3),
        ms: Date.now() - t0,
        tier,
      },
    };
  }
  // Absolute last resort (should never happen). The rectangle serpentine is
  // NOT a valid torus path (its two ends meet across the seam and the wrap
  // gives edge cells an extra same-color neighbor), so warp boards carve
  // instead; if that fails too, throw so FlowEngine retries another salt.
  if (topo.warp) {
    const carved = carveLevel(String(seedString), topo, K, {
      maxRestarts: 12,
      relaxShape: true,
      triesPerFlow: 60,
      pathBudget: 20000,
    });
    if (carved) {
      const info = analyzeCut(carved.solution.flat(), topo, carved.solution.map((sg) => sg.length));
      if (info.touches === 0 && info.mono2x2 === 0) return mkLevel(carved, info, 'dirty');
    }
    throw new Error(`warp generation failed for seed ${JSON.stringify(String(seedString))} (${rows}x${cols})`);
  }
  // A planar single-flow snake covering the board. Solvable by construction;
  // flagged dirty so validation retries it.
  const snake = buildSnake(rows, cols);
  const ends: [Cell, Cell] = [
    [snake[0][0], snake[0][1]],
    [snake[snake.length - 1][0], snake[snake.length - 1][1]],
  ];
  const snakeInfo = analyzeCut(snake, topo, [snake.length]);
  return {
    seed: String(seedString),
    size,
    numPairs: 1,
    kind,
    rows,
    cols,
    warp: topo.warp,
    pairs: [ends],
    solution: [snake.map((cell): Cell => [cell[0], cell[1]])],
    stats: {
      minLen: snakeInfo.minL, maxLen: snakeInfo.maxL, avgLen: +snakeInfo.avgL.toFixed(2),
      minD: snakeInfo.minD, minRatio: +snakeInfo.minRatio.toFixed(3),
      avgDetour: +snakeInfo.avgDetour.toFixed(2), maxDetour: snakeInfo.maxDetour,
      touches: snakeInfo.touches, mono2x2: snakeInfo.mono2x2,
      borderBoth: snakeInfo.borderBoth, straights: snakeInfo.straights,
      borderStraight: snakeInfo.borderStraight,
      overlapCells: snakeInfo.overlapCells, score: +snakeInfo.score.toFixed(3),
      ms: Date.now() - t0,
      tier: 'dirty',
    },
  };
}

/** A one-stroke chain order: `order` covers every flow, and `entries[i]` is
 *  the [entryDot, exitDot] pair flow `order[i]` is drawn through, with the
 *  exit dot touching the next flow's entry dot. Interior flows therefore use
 *  distinct dots for entry and exit, so the order is genuinely drawable in
 *  a single stroke (not just linked in the abstract). */
export interface ChainResult {
  order: number[];
  entries: Array<[Cell, Cell]>;
}

/** Flow-adjacency chain over topo neighbors. K is small in practice (chain
 *  packs stay <= 7 pairs), so DFS over (flow, entryDot) states suffices. */
export function flowChainPath(pairs: [Cell, Cell][], topo: Topology): ChainResult | null {
  const K = pairs.length;
  if (K === 0) return null;
  if (K === 1) {
    const [a, b] = pairs[0];
    return { order: [0], entries: [[[a[0], a[1]] as Cell, [b[0], b[1]] as Cell]] };
  }
  const path: Array<{ f: number; entry: number }> = [];
  const used = new Array<boolean>(K).fill(false);
  const touches = (cell: Cell, dot: Cell): boolean =>
    topo.neighbors(cell[0], cell[1]).some(([r, c]) => r === dot[0] && c === dot[1]);
  const dfs = (): boolean => {
    if (path.length === K) return true;
    if (path.length === 0) {
      for (let f = 0; f < K; f++) {
        for (let en = 0; en < 2; en++) {
          used[f] = true;
          path.push({ f, entry: en });
          if (dfs()) return true;
          path.pop();
          used[f] = false;
        }
      }
      return false;
    }
    const top = path[path.length - 1];
    const exit = pairs[top.f][1 - top.entry];
    for (let j = 0; j < K; j++) {
      if (used[j]) continue;
      for (let d = 0; d < 2; d++) {
        if (!touches(exit, pairs[j][d])) continue;
        used[j] = true;
        path.push({ f: j, entry: d });
        if (dfs()) return true;
        path.pop();
        used[j] = false;
      }
    }
    return false;
  };
  if (!dfs()) return null;
  return {
    order: path.map((s) => s.f),
    entries: path.map((s) => {
      const en = pairs[s.f][s.entry];
      const ex = pairs[s.f][1 - s.entry];
      return [[en[0], en[1]] as Cell, [ex[0], ex[1]] as Cell];
    }),
  };
}

/** Validate a level object. Topology defaults from the level itself
 *  (square unless kind/rows/cols say hex). */
export function validateLevel(level: FlowLevel, topo?: Topology): ValidationResult {
  const errors: string[] = [];
  const { size, numPairs, pairs, solution } = level;
  const t = topo ?? (level.kind === 'hex'
    ? hexTopology(level.rows ?? size, level.cols ?? size)
    : level.mask
      ? maskTopology(level.rows ?? size, level.cols ?? size, level.mask, level.walls)
      : rectTopology(level.rows ?? size, level.cols ?? size, level.warp));
  const { rows, cols } = t;
  const total = t.total;
  if (!pairs || pairs.length !== numPairs) errors.push(`pairs length ${pairs && pairs.length} != ${numPairs}`);
  if (!solution || solution.length !== numPairs) errors.push('solution length mismatch');

  const seen = new Set<number>();
  for (let s = 0; s < solution.length; s++) {
    const sg = solution[s];
    for (let k = 0; k < sg.length; k++) {
      const [r, c] = sg[k];
      if (!t.inBounds(r, c)) errors.push(`solution[${s}][${k}] out of bounds`);
      const kk = t.key(r, c);
      if (seen.has(kk)) errors.push(`duplicate cell ${r},${c}`);
      seen.add(kk);
      if (k > 0) {
        const [pr, pc] = sg[k - 1];
        if (!t.neighbors(pr, pc).some(([ar, ac]) => ar === r && ac === c)) {
          errors.push(`solution[${s}] not contiguous at ${k}`);
        }
      }
    }
    const a = sg[0];
    const b = sg[sg.length - 1];
    const [pa, pb] = pairs[s];
    const match =
      (a[0] === pa[0] && a[1] === pa[1] && b[0] === pb[0] && b[1] === pb[1]) ||
      (a[0] === pb[0] && a[1] === pb[1] && b[0] === pa[0] && b[1] === pa[1]);
    if (!match) errors.push(`pair ${s} endpoints mismatch solution`);
    if (t.distance(pa, pb) <= 1) errors.push(`pair ${s} endpoints adjacent (D=${t.distance(pa, pb)})`);
    if (sg.length < 4) errors.push(`pair ${s} too short (L=${sg.length})`);
  }
  if (seen.size !== t.cells) errors.push(`coverage ${seen.size}/${t.cells}`);

  const segGrid: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
  solution.forEach((sg, s) => sg.forEach(([r, c]) => { segGrid[r][c] = s; }));
  for (let s = 0; s < solution.length; s++) {
    const inSeg = new Set(solution[s].map(([r, c]) => t.key(r, c)));
    solution[s].forEach(([r, c], k) => {
      const isEnd = k === 0 || k === solution[s].length - 1;
      let same = 0;
      for (const [nr, nc] of t.neighbors(r, c)) {
        if (inSeg.has(t.key(nr, nc))) same++;
      }
      if (same !== (isEnd ? 1 : 2)) errors.push(`self-touch color ${s} at ${r},${c} (same=${same})`);
    });
  }
  if (t.kind === 'square') {
    const rMax = t.warp ? rows : rows - 1;
    const cMax = t.warp ? cols : cols - 1;
    for (let r = 0; r < rMax; r++) {
      for (let c = 0; c < cMax; c++) {
        const r1 = (r + 1) % rows;
        const c1 = (c + 1) % cols;
        const a = segGrid[r][c];
        if (a !== -1 && a === segGrid[r1][c] && a === segGrid[r][c1] && a === segGrid[r1][c1]) {
          errors.push(`2x2 mono at ${r},${c} color ${a}`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
