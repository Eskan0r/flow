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
  seedForLevel(n: number): string;
}

function band(n: number, bands: Array<[number, number]>): number {
  for (const [upto, size] of bands) if (n <= upto) return size;
  return bands[bands.length - 1][1];
}

export const PACKS: Pack[] = [
  {
    id: 'regular',
    name: 'Regular Pack',
    desc: '5x5 to 9x9 boards',
    color: '#16a34a',
    kind: 'square',
    count: 150,
    sizeForLevel: (n) => band(n, [[12, 5], [40, 6], [80, 7], [115, 8], [150, 9]]),
    seedForLevel: (n) => `flow-regular-${n}`,
  },
  {
    id: 'bonus',
    name: 'Bonus Pack',
    desc: '5x5 to 9x9 boards',
    color: '#2563eb',
    kind: 'square',
    count: 150,
    sizeForLevel: (n) => band(n, [[10, 5], [35, 6], [75, 7], [115, 8], [150, 9]]),
    seedForLevel: (n) => `flow-bonus-${n}`,
  },
  {
    id: 'hexes',
    name: 'Hexes',
    desc: 'Hexagonal tiles, 5x5 to 7x7',
    color: '#c026d3',
    kind: 'hex',
    count: 60,
    sizeForLevel: (n) => band(n, [[15, 5], [40, 6], [60, 7]]),
    seedForLevel: (n) => `flow-hexes-${n}`,
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
export const FLOW_SITE = 'flow.ronakchavva.com';

export type DailyMark = 'perfect' | 'done' | 'todo';

const MARK_EMOJI: Record<DailyMark, string> = {
  perfect: '⭐',
  done: '🟩',
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
  const lines = [`Flow Daily ${date}`, marks.map((mk) => MARK_EMOJI[mk]).join('')];
  lines.push(totalSeconds === null ? `Streak: ${streak}` : `Streak: ${streak} · ${fmtClock(totalSeconds)}`);
  lines.push(FLOW_SITE);
  return lines.join('\n');
}
