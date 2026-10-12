/* Level packs, Flow-Free style: named packs with fixed level counts, size
 * schedules, and seed namespaces. Framework-free (tested by plain node). */

import type { BoardKind } from './topology';

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

/** A square/hex pack: shape always mirrors the nominal size. */
function uniformPack(base: Omit<Pack, 'shapeForLevel'>): Pack {
  return { ...base, shapeForLevel: (n) => squareShape(n, base.sizeForLevel) };
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
    shapeForLevel: (n) => (n <= 20 ? { rows: 5, cols: 7 } : n <= 40 ? { rows: 6, cols: 8 } : { rows: 8, cols: 10 }),
    seedForLevel: (n) => `flow-rectangles-${n}`,
  },
];

export function packById(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

/** Five fresh puzzles a day, ramping 5-5-6-7-8 with hexes mixed in. */
export const DAILY_COUNT = 5;
export const DAILY_SIZES = [5, 5, 6, 7, 8];
export const DAILY_KINDS: BoardKind[] = ['square', 'hex', 'square', 'hex', 'square'];

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
