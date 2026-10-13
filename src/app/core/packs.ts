/* Level packs, Flow-Free style: named packs with fixed level counts, size
 * schedules, and seed namespaces. Framework-free (tested by plain node). */

import type { BoardKind, Mask } from './topology';
import { defaultPairsForSize } from './flow-generator';

export interface Pack {
  id: string;
  name: string;
  desc: string;
  color: string;
  kind: BoardKind;
  count: number;
  sizeForLevel(n: number): number;
  /** Board geometry. Equals { rows: size, cols: size } for square packs. */
  shapeForLevel(n: number): { rows: number; cols: number };
  /** Polyomino shape for the level (masked square boards only). */
  maskForLevel?(n: number): Mask;
  /** Interior wall cells for the level (rendering hint; masked boards only). */
  wallsForLevel?(n: number): Mask;
  /** True when the level wraps around its edges (square boards only). */
  warpForLevel?(n: number): boolean;
  /** True when completing a flow hands the live stroke to a touching dot. */
  chainForLevel?(n: number): boolean;
  /** Pair count override (rotates density within a size band so same-size
   *  levels can't converge on one layout; null = density default). */
  pairsForLevel?(n: number): number;
  /** Pinned pair counts for levels whose rotated K still collided with an
   *  earlier level's layout (verified: every pack is duplicate-free). */
  pairsOverride?: { [level: number]: number };
  seedForLevel(n: number): string;
}

function band(n: number, bands: Array<[number, number]>): number {
  for (const [upto, size] of bands) if (n <= upto) return size;
  return bands[bands.length - 1][1];
}

function squareShape(n: number, sizeForLevel: (n: number) => number): { rows: number; cols: number } {
  const s = sizeForLevel(n);
  return { rows: s, cols: s };
}

/** Pair-count rotation within a size band: base density ±1 by level, so
 *  same-size levels draw from disjoint pair-count pools (kills repeats). */
function rotatedPairs(sizeForLevel: (n: number) => number): (n: number) => number {
  return (n) => defaultPairsForSize(sizeForLevel(n)) + ((n % 3) - 1);
}

/** A square/hex pack: shape always mirrors the nominal size. */
function uniformPack(base: Omit<Pack, 'shapeForLevel'>): Pack {
  return { ...base, shapeForLevel: (n) => squareShape(n, base.sizeForLevel) };
}

// ---- polyomino shapes (bounding box is 7x7 unless noted) ----
const polyStair: Mask = (r, c) => c >= r; // 5x8 upper-right staircase
const polyTriangle: Mask = (r, c) => c <= r; // 6x6 lower triangle
const polyPlus: Mask = (r, c) => (r >= 2 && r <= 4) || (c >= 2 && c <= 4); // 7x7 thick plus
const polyBand: Mask = (r, c) => Math.abs(r - c) <= 2; // 7x7 diagonal band
const polyU: Mask = (r, c) => !(r >= 1 && r <= 4 && c >= 2 && c <= 4); // 7x7 U / notched

// ---- wall patterns: enclosed interior blocks (never on the board border, so
//      the renderer can tell them apart from outside-of-shape holes) ----
type WallPattern = (rows: number, cols: number) => Mask;
const WALL_PATTERNS: WallPattern[] = [
  (rows, cols) => { // 2x2 centre block
    const r0 = (rows - 1) >> 1;
    const c0 = (cols - 1) >> 1;
    return (r, c) => (r === r0 || r === r0 + 1) && (c === c0 || c === c0 + 1);
  },
  (rows, cols) => // four inner pillars
    (r, c) => (r === 1 || r === rows - 2) && (c === 1 || c === cols - 2),
  (_rows, _cols) => { // horizontal bar
    const r0 = (_rows - 1) >> 1;
    const c0 = (_cols - 1) >> 1;
    return (r, c) => r === r0 && Math.abs(c - c0) <= 1;
  },
  (_rows, _cols) => { // vertical bar
    const r0 = (_rows - 1) >> 1;
    const c0 = (_cols - 1) >> 1;
    return (r, c) => c === c0 && Math.abs(r - r0) <= 1;
  },
  (_rows, _cols) => { // plus
    const r0 = (_rows - 1) >> 1;
    const c0 = (_cols - 1) >> 1;
    return (r, c) => (r === r0 && Math.abs(c - c0) <= 1) || (c === c0 && Math.abs(r - r0) <= 1);
  },
  (rows, cols) => { // diagonal staircase from (2,2)
    const hi = Math.min(rows, cols) - 3;
    return (r, c) => r >= 2 && r <= hi && r === c;
  },
];

/** Wall cells for level `n` on a `rows x cols` board. */
function wallPatternFor(n: number, rows: number, cols: number): Mask {
  return WALL_PATTERNS[(n - 1) % WALL_PATTERNS.length](rows, cols);
}

export const PACKS: Pack[] = [
  uniformPack({
    id: 'regular',
    name: 'Regular Pack',
    desc: '5x5 to 9x9 boards',
    color: '#16a34a',
    kind: 'square',
    count: 150,
    sizeForLevel: (n) => band(n, [[12, 5], [40, 6], [80, 7], [115, 8], [150, 9]]),
    pairsForLevel: rotatedPairs((n) => band(n, [[12, 5], [40, 6], [80, 7], [115, 8], [150, 9]])),
    pairsOverride: { 12: 4, 34: 7, 73: 8, 95: 10, 103: 9, 109: 9 },
    seedForLevel: (n) => `flow-regular-${n}`,
  }),
  uniformPack({
    id: 'bonus',
    name: 'Bonus Pack',
    desc: '5x5 to 9x9 boards',
    color: '#2563eb',
    kind: 'square',
    count: 150,
    sizeForLevel: (n) => band(n, [[10, 5], [35, 6], [75, 7], [115, 8], [150, 9]]),
    pairsForLevel: rotatedPairs((n) => band(n, [[10, 5], [35, 6], [75, 7], [115, 8], [150, 9]])),
    pairsOverride: { 29: 8, 30: 6, 74: 9, 103: 9 },
    seedForLevel: (n) => `flow-bonus-${n}`,
  }),
  uniformPack({
    id: 'hexes',
    name: 'Hexes',
    desc: 'Hexagonal tiles, 5x5 to 7x7',
    color: '#c026d3',
    kind: 'hex',
    count: 60,
    sizeForLevel: (n) => band(n, [[15, 5], [40, 6], [60, 7]]),
    seedForLevel: (n) => `flow-hexes-${n}`,
  }),
  {
    id: 'rectangles',
    name: 'Rectangles',
    desc: 'Wide 5x7 to 8x10 boards',
    color: '#0891b2',
    kind: 'square',
    count: 60,
    sizeForLevel: (n) => band(n, [[20, 7], [40, 8], [60, 10]]),
    pairsForLevel: rotatedPairs((n) => band(n, [[20, 7], [40, 8], [60, 10]])),
    shapeForLevel: (n) => (n <= 20 ? { rows: 5, cols: 7 } : n <= 40 ? { rows: 6, cols: 8 } : { rows: 8, cols: 10 }),
    seedForLevel: (n) => `flow-rectangles-${n}`,
  },
  {
    id: 'oddshapes',
    name: 'Odd Shapes',
    desc: 'Staircases, U\'s, pluses and bands',
    color: '#ea580c',
    kind: 'square',
    count: 60,
    sizeForLevel: (n) => (n <= 12 ? 8 : n <= 24 ? 6 : 7),
    shapeForLevel: (n) => (n <= 12 ? { rows: 5, cols: 8 } : n <= 24 ? { rows: 6, cols: 6 } : { rows: 7, cols: 7 }),
    maskForLevel: (n) =>
      n <= 12 ? polyStair
        : n <= 24 ? polyTriangle
          : n <= 36 ? polyPlus
            : n <= 48 ? polyBand
              : polyU,
    seedForLevel: (n) => `flow-oddshapes-${n}`,
  },
  {
    id: 'walls',
    name: 'Walls',
    desc: 'Route around blocked cells',
    color: '#475569',
    kind: 'square',
    count: 60,
    sizeForLevel: (n) => band(n, [[15, 6], [40, 7], [60, 8]]),
    shapeForLevel: (n) => squareShape(n, (m) => band(m, [[15, 6], [40, 7], [60, 8]])),
    maskForLevel: (n) => {
      const s = band(n, [[15, 6], [40, 7], [60, 8]]);
      const w = wallPatternFor(n, s, s);
      return (r, c) => !w(r, c);
    },
    wallsForLevel: (n) => {
      const s = band(n, [[15, 6], [40, 7], [60, 8]]);
      return wallPatternFor(n, s, s);
    },
    seedForLevel: (n) => `flow-walls-${n}`,
  },
  uniformPack({
    id: 'warps',
    name: 'Warps',
    desc: 'Edges wrap around, 5x5 to 7x7',
    color: '#7c3aed',
    kind: 'square',
    count: 60,
    sizeForLevel: (n) => band(n, [[20, 5], [40, 6], [60, 7]]),
    pairsForLevel: rotatedPairs((n) => band(n, [[20, 5], [40, 6], [60, 7]])),
    seedForLevel: (n) => `flow-warps-${n}`,
    warpForLevel: () => true,
  }),
  uniformPack({
    id: 'chains',
    name: 'Chains',
    desc: 'One-stroke boards: drag across touching dots, 5x5 to 7x7',
    color: '#e11d48',
    kind: 'square',
    count: 60,
    sizeForLevel: (n) => band(n, [[20, 5], [40, 6], [60, 7]]),
    pairsForLevel: rotatedPairs((n) => band(n, [[20, 5], [40, 6], [60, 7]])),
    pairsOverride: { 9: 4, 18: 4 },
    seedForLevel: (n) => `flow-chains-${n}`,
    chainForLevel: () => true,
  }),
];

export function packById(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

/** Five fresh puzzles a day, ramping 5-5-6-7-8 with hexes mixed in. */
export const DAILY_COUNT = 5;
export const DAILY_SIZES = [5, 5, 6, 7, 8];
export const DAILY_KINDS: BoardKind[] = ['square', 'hex', 'square', 'hex', 'square'];

/** Small string hash (FNV-1a) for deterministic per-date rotation. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DailySpec {
  kind: BoardKind;
  rows: number;
  cols: number;
  mask?: Mask;
  walls?: Mask;
  warp?: boolean;
  chain?: boolean;
  /** Menu tag: 'Warp' | 'Chain' | 'Rect' | 'Odd' | 'Walls' | 'Hex' | ''. */
  tag: string;
}

type DailyCat = 'square' | 'hex' | 'chains' | 'rect' | 'odd' | 'walls' | 'warps';
// Warps stay in the hard slots (4-5) only; everything else rotates anywhere.
const DAILY_EASY: DailyCat[] = ['square', 'hex', 'chains', 'rect'];
const DAILY_MID: DailyCat[] = [...DAILY_EASY, 'odd', 'walls'];
const DAILY_HARD: DailyCat[] = [...DAILY_MID, 'warps'];

/** Full board spec for one of a date's five dailies. Deterministic per
 *  (date, index) so every client plays the same boards; the seed stays
 *  `daily-YYYY-MM-DD-i` regardless of category. */
export function dailySpec(dateStr: string, index: number): DailySpec {
  const i = Math.min(Math.max(1, index), DAILY_COUNT);
  const size = DAILY_SIZES[i - 1];
  const pool = i <= 2 ? DAILY_EASY : i === 3 ? DAILY_MID : DAILY_HARD;
  const h = hashStr(`${dateStr}:${i}`);
  switch (pool[h % pool.length]) {
    case 'hex':
      return { kind: 'hex', rows: size, cols: size, tag: 'Hex' };
    case 'chains':
      return { kind: 'square', rows: size, cols: size, chain: true, tag: 'Chain' };
    case 'rect':
      return { kind: 'square', rows: Math.max(4, size - 1), cols: size + 1, tag: 'Rect' };
    case 'odd': {
      const masks: Mask[] = size >= 7 ? [polyPlus, polyBand, polyU] : [polyTriangle];
      return { kind: 'square', rows: size, cols: size, mask: masks[h % masks.length], tag: 'Odd' };
    }
    case 'walls': {
      const w = wallPatternFor((h % WALL_PATTERNS.length) + 1, size, size);
      return { kind: 'square', rows: size, cols: size, mask: (r, c) => !w(r, c), walls: w, tag: 'Walls' };
    }
    case 'warps':
      return { kind: 'square', rows: size, cols: size, warp: true, tag: 'Warp' };
    default:
      return { kind: 'square', rows: size, cols: size, tag: '' };
  }
}

export function dailyLabel(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(d: Date | string = new Date(), index = 1): string {
  const ds = typeof d === 'string' ? d : dailyLabel(d);
  return `daily-${ds}-${index}`;
}

/** 'daily-2026-09-26-3' -> { date: '2026-09-26', index: 3 }. Null when not a daily seed. */
export function parseDailySeed(seed: string): { date: string; index: number } | null {
  const m = /^daily-(\d{4}-\d{2}-\d{2})-([1-5])$/.exec(seed);
  if (!m) return null;
  return { date: m[1], index: parseInt(m[2], 10) };
}

/** Public site, printed on share cards so posts find the game. */
export const FLOW_SITE = 'roflow.ronakchavva.com';

export type DailyMark = 'perfect' | 'done' | 'todo';

const MARK_EMOJI: Record<DailyMark, string> = {
  perfect: '⭐',
  done: '✅',
  todo: '⬛',
};

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Wordle-style share card: identity line, one glyph per daily in order,
 *  streak (+ summed best time on full clears), site. Spoiler-free. */
export function dailyShareCard(
  date: string,
  marks: DailyMark[],
  streak: number,
  totalSeconds: number | null,
): string {
  const lines = [`roflow daily ${date}`, marks.map((mk) => MARK_EMOJI[mk]).join('')];
  lines.push(totalSeconds === null ? `streak: ${streak}` : `streak: ${streak} · ${fmtClock(totalSeconds)}`);
  lines.push(FLOW_SITE);
  return lines.join('\n');
}
