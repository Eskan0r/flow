/* Seeded Flow Free level generator.
 * Hamiltonian snake -> seeded backbite shuffle -> sequential clean partition.
 * The partition IS a full-coverage solution, so every puzzle is solvable
 * by construction. Framework-free: usable from Angular and plain Node
 * (type-strippable — no enums, namespaces, or parameter properties). */

export type Cell = [number, number];

export interface FlowLevel {
  seed: string;
  size: number;
  numPairs: number;
  pairs: [Cell, Cell][];
  solution: Cell[][];
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
  overlapCells: number;
  score: number;
  ms: number;
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

function randInt(rng: Rng, low: number, high: number): number {
  return low + Math.floor(rng() * (high - low + 1));
}

function neighborsOf(r: number, c: number, size: number): Cell[] {
  const out: Cell[] = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < size - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < size - 1) out.push([r, c + 1]);
  return out;
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function isBorder(cell: Cell, size: number): boolean {
  return cell[0] === 0 || cell[0] === size - 1 || cell[1] === 0 || cell[1] === size - 1;
}

function buildSnake(size: number): Cell[] {
  const path: Cell[] = [];
  for (let r = 0; r < size; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < size; c++) path.push([r, c]);
    } else {
      for (let c = size - 1; c >= 0; c--) path.push([r, c]);
    }
  }
  return path;
}

/** Randomize a Hamiltonian path with backbite moves (seeded, in place). */
export function backbite(path: Cell[], size: number, rng: Rng, steps: number): Cell[] {
  const n = path.length;
  const key = (cell: Cell): number => cell[0] * size + cell[1];
  const idxOf = new Array<number>(size * size);
  for (let i = 0; i < n; i++) idxOf[key(path[i])] = i;

  for (let s = 0; s < steps; s++) {
    const atStart = rng() < 0.5;
    const e = atStart ? path[0] : path[n - 1];
    const forbidden = atStart ? path[1] : path[n - 2];
    const nbs = neighborsOf(e[0], e[1], size);
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

function randomComposition(rng: Rng, total: number, parts: number, minLen: number, maxLen: number): number[] {
  const lens: number[] = [];
  let remaining = total;
  for (let i = 0; i < parts - 1; i++) {
    const left = parts - 1 - i;
    const low = Math.max(minLen, remaining - left * maxLen);
    const high = Math.min(maxLen, remaining - left * minLen);
    const v = randInt(rng, low, high);
    lens.push(v);
    remaining -= v;
  }
  lens.push(remaining);
  return lens;
}

interface CutInfo {
  segs: Cell[][];
  pairs: [Cell, Cell][];
  Ds: number[];
  Ls: number[];
  touches: number;
  mono2x2: number;
  borderBoth: number;
  straights: number;
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

function analyzeCut(path: Cell[], size: number, lens: number[]): CutInfo {
  const K = lens.length;
  const segs: Cell[][] = [];
  let idx = 0;
  for (let s = 0; s < K; s++) {
    segs.push(path.slice(idx, idx + lens[s]));
    idx += lens[s];
  }
  const pairs = segs.map((sg): [Cell, Cell] => [sg[0], sg[sg.length - 1]]);
  const Ds = pairs.map(([a, b]) => manhattan(a, b));
  const Ls = lens.slice();

  let touches = 0;
  for (let s = 0; s < K; s++) {
    const sg = segs[s];
    const inSeg = new Set(sg.map((cell) => cell[0] * size + cell[1]));
    for (let k = 0; k < sg.length; k++) {
      const cell = sg[k];
      const isEnd = k === 0 || k === sg.length - 1;
      let same = 0;
      for (const nb of neighborsOf(cell[0], cell[1], size)) {
        if (inSeg.has(nb[0] * size + nb[1])) same++;
      }
      if (same !== (isEnd ? 1 : 2)) touches++;
    }
  }
  let mono2x2 = 0;
  const segGrid: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(-1));
  for (let s = 0; s < K; s++) {
    for (const cell of segs[s]) segGrid[cell[0]][cell[1]] = s;
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const a = segGrid[r][c];
      if (a !== -1 && a === segGrid[r + 1][c] && a === segGrid[r][c + 1] && a === segGrid[r + 1][c + 1]) mono2x2++;
    }
  }
  let borderBoth = 0;
  for (const [a, b] of pairs) {
    if (isBorder(a, size) && isBorder(b, size)) borderBoth++;
  }
  let straights = 0;
  for (const sg of segs) {
    const sameRow = sg.every((cell) => cell[0] === sg[0][0]);
    const sameCol = sg.every((cell) => cell[1] === sg[0][1]);
    if (sameRow || sameCol) straights++;
  }
  let adjacentSame = 0;
  for (const d of Ds) if (d <= 1) adjacentSame++;

  const cover = new Array<number>(size * size).fill(0);
  for (const [a, b] of pairs) {
    const D = manhattan(a, b);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell: Cell = [r, c];
        if (manhattan(a, cell) + manhattan(cell, b) === D) cover[r * size + c]++;
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
    segs, pairs, Ds, Ls, touches, mono2x2, borderBoth, straights,
    adjacentSame, overlapCells, minD, minL, maxL, avgL, minRatio,
    avgDetour, maxDetour, spread, score,
  };
}

export function defaultPairsForSize(size: number): number {
  if (size <= 5) return 4;
  return size;
}

export function lengthBounds(size: number, numPairs: number): { minLen: number; maxLen: number; avg: number } {
  const total = size * size;
  const avg = total / numPairs;
  return { minLen: Math.max(4, Math.floor(avg * 0.5)), maxLen: Math.ceil(avg * 1.7), avg };
}

/** One snake segment path[l..r) is a clean Flow line: induced path, no 2x2, spread ends. */
function segClean(path: Cell[], size: number, l: number, r: number, minD: number): boolean {
  const a = path[l];
  const b = path[r - 1];
  const D = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  if (D <= 1 || D < minD) return false;
  const set = new Set<number>();
  for (let i = l; i < r; i++) set.add(path[i][0] * size + path[i][1]);
  for (let k = l; k < r; k++) {
    const cell = path[k];
    const isEnd = k === l || k === r - 1;
    let same = 0;
    if (cell[0] > 0 && set.has((cell[0] - 1) * size + cell[1])) same++;
    if (cell[0] < size - 1 && set.has((cell[0] + 1) * size + cell[1])) same++;
    if (cell[1] > 0 && set.has(cell[0] * size + cell[1] - 1)) same++;
    if (cell[1] < size - 1 && set.has(cell[0] * size + cell[1] + 1)) same++;
    if (same !== (isEnd ? 1 : 2)) return false;
  }
  for (let i = l; i < r; i++) {
    const cr = path[i][0];
    const cc = path[i][1];
    if (cr < size - 1 && cc < size - 1) {
      if (set.has(cr * size + cc) && set.has((cr + 1) * size + cc) &&
          set.has(cr * size + cc + 1) && set.has((cr + 1) * size + cc + 1)) return false;
    }
  }
  return true;
}

/** Sequential backtracking partition: walk the snake, cut clean segments. */
function findCleanPartition(
  path: Cell[], size: number, K: number, minLen: number, maxLen: number,
  minD: number, rng: Rng, budget = 2500,
): number[] | null {
  const total = path.length;
  const lens = new Array<number>(K);
  let calls = 0;
  function dfs(seg: number, pos: number): boolean {
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
    opts.sort((x, y) => Math.abs(x - avg) - Math.abs(y - avg) + (rng() - 0.5) * 0.01);
    for (const L of opts) {
      if (!segClean(path, size, pos, pos + L, minD)) continue;
      lens[seg] = L;
      if (dfs(seg + 1, pos + L)) return true;
    }
    return false;
  }
  return dfs(0, 0) ? lens.slice() : null;
}

export interface GenerateOptions {
  timeBudgetMs?: number;
  maxPaths?: number;
}

export function generateLevel(
  seedString: string, size = 7, numPairs: number | null = null, opts: GenerateOptions = {},
): GeneratedLevel {
  const t0 = Date.now();
  if (size < 5) size = 5;
  if (size > 12) size = 12;
  let K = numPairs ?? defaultPairsForSize(size);
  K = Math.max(2, Math.min(14, K));

  const rng = seededRng(`${String(seedString)}::${size}x${size}:${K}`);
  const total = size * size;

  const { minLen, maxLen } = lengthBounds(size, K);
  const timeBudgetMs = opts.timeBudgetMs ?? 900;
  const maxPaths = opts.maxPaths ?? (size <= 7 ? 40 : 26);

  let best: { lens: number[]; info: CutInfo; path: Cell[] } | null = null;
  for (let p = 0; p < maxPaths; p++) {
    if (Date.now() - t0 > timeBudgetMs && best) break;
    const path = buildSnake(size);
    backbite(path, size, rng, Math.floor(total * (1.2 + rng() * 3.2)));
    const lens = findCleanPartition(path, size, K, minLen, maxLen, 2, rng, size <= 7 ? 3000 : 2000);
    if (!lens) continue;
    const info = analyzeCut(path, size, lens);
    if (info.touches !== 0 || info.mono2x2 !== 0 || info.adjacentSame !== 0) continue;
    if (info.straights > 2) continue;
    const detourPenalty = info.avgDetour < 0.8 ? (0.8 - info.avgDetour) * 0.8 : 0;
    const hardPenalty = info.minD < 3 ? 0.35 : 0;
    const score =
      info.minRatio * 3.2 - info.spread * 0.7 - info.borderBoth * 0.22 -
      info.straights * 0.45 - Math.max(0, info.maxDetour - 5) * 0.25 -
      detourPenalty - hardPenalty + Math.min(0.5, info.overlapCells / 24);
    info.score = score;
    if (!best || score > best.info.score) {
      best = { lens: lens.slice(), info, path: path.map((c) => c.slice() as Cell) };
    }
    if (best && best.info.score > 1.35 && best.info.minD >= 3 && best.info.straights <= 1) {
      if (Date.now() - t0 > 120) break;
    }
  }

  if (!best) {
    const path = buildSnake(size);
    backbite(path, size, rng, Math.floor(total * 2));
    for (let a = 0; a < 600; a++) {
      const lens = randomComposition(rng, total, K, minLen, maxLen);
      const info = analyzeCut(path, size, lens);
      if (info.adjacentSame > 0 || info.mono2x2 > 0) continue;
      const score = info.score - info.touches * 0.6;
      if (!best || score > best.info.score) {
        best = { lens, info, path: path.map((c) => c.slice() as Cell) };
      }
    }
  }
  if (!best) {
    const path = buildSnake(size);
    const lens: number[] = [];
    let rem = total;
    for (let i = 0; i < K - 1; i++) {
      const v = Math.floor(rem / (K - i));
      lens.push(v);
      rem -= v;
    }
    lens.push(rem);
    best = { lens, info: analyzeCut(path, size, lens), path };
  }

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
    pairs: segs.map((sg): [Cell, Cell] => [[sg[0][0], sg[0][1]], [sg[sg.length - 1][0], sg[sg.length - 1][1]]]),
    solution: segs.map((sg) => sg.map((cell): Cell => [cell[0], cell[1]])),
    stats: {
      minLen: info.minL, maxLen: info.maxL, avgLen: +info.avgL.toFixed(2),
      minD: info.minD, minRatio: +info.minRatio.toFixed(3),
      avgDetour: +info.avgDetour.toFixed(2), maxDetour: info.maxDetour,
      touches: info.touches, mono2x2: info.mono2x2,
      borderBoth: info.borderBoth, straights: info.straights,
      overlapCells: info.overlapCells, score: +info.score.toFixed(3),
      ms: Date.now() - t0,
    },
  };
}

/** Validate a level object. Returns {ok, errors[]}. */
export function validateLevel(level: FlowLevel): ValidationResult {
  const errors: string[] = [];
  const { size, numPairs, pairs, solution } = level;
  const total = size * size;
  if (!pairs || pairs.length !== numPairs) errors.push(`pairs length ${pairs && pairs.length} != ${numPairs}`);
  if (!solution || solution.length !== numPairs) errors.push('solution length mismatch');

  const seen = new Set<number>();
  for (let s = 0; s < solution.length; s++) {
    const sg = solution[s];
    for (let k = 0; k < sg.length; k++) {
      const [r, c] = sg[k];
      if (r < 0 || r >= size || c < 0 || c >= size) errors.push(`solution[${s}][${k}] out of bounds`);
      const kk = r * size + c;
      if (seen.has(kk)) errors.push(`duplicate cell ${r},${c}`);
      seen.add(kk);
      if (k > 0) {
        const [pr, pc] = sg[k - 1];
        if (Math.abs(pr - r) + Math.abs(pc - c) !== 1) errors.push(`solution[${s}] not contiguous at ${k}`);
      }
    }
    const a = sg[0];
    const b = sg[sg.length - 1];
    const [pa, pb] = pairs[s];
    const match =
      (a[0] === pa[0] && a[1] === pa[1] && b[0] === pb[0] && b[1] === pb[1]) ||
      (a[0] === pb[0] && a[1] === pb[1] && b[0] === pa[0] && b[1] === pa[1]);
    if (!match) errors.push(`pair ${s} endpoints mismatch solution`);
    if (manhattan(pa, pb) <= 1) errors.push(`pair ${s} endpoints adjacent (D=${manhattan(pa, pb)})`);
    if (sg.length < 4) errors.push(`pair ${s} too short (L=${sg.length})`);
  }
  if (seen.size !== total) errors.push(`coverage ${seen.size}/${total}`);

  const segGrid: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(-1));
  solution.forEach((sg, s) => sg.forEach(([r, c]) => { segGrid[r][c] = s; }));
  for (let s = 0; s < solution.length; s++) {
    const inSeg = new Set(solution[s].map(([r, c]) => r * size + c));
    solution[s].forEach(([r, c], k) => {
      const isEnd = k === 0 || k === solution[s].length - 1;
      let same = 0;
      const dirs: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && inSeg.has(nr * size + nc)) same++;
      }
      if (same !== (isEnd ? 1 : 2)) errors.push(`self-touch color ${s} at ${r},${c} (same=${same})`);
    });
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const a = segGrid[r][c];
      if (a !== -1 && a === segGrid[r + 1][c] && a === segGrid[r][c + 1] && a === segGrid[r + 1][c + 1]) {
        errors.push(`2x2 mono at ${r},${c} color ${a}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
