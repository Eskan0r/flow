/* Level packs, Flow-Free style: named packs with fixed level counts, size
 * schedules, and seed namespaces. Framework-free (tested by plain node). */

export interface Pack {
  id: string;
  name: string;
  desc: string;
  color: string;
  count: number;
  sizeForLevel(n: number): number;
  seedForLevel(n: number): string;
}

function band(n: number, bands: [number, number][]): number {
  for (const [upto, size] of bands) if (n <= upto) return size;
  return bands[bands.length - 1][1];
}

export const PACKS: Pack[] = [
  {
    id: 'regular',
    name: 'Regular Pack',
    desc: '5×5 to 9×9 boards',
    color: '#16a34a',
    count: 150,
    sizeForLevel: (n) => band(n, [[12, 5], [40, 6], [80, 7], [115, 8], [150, 9]]),
    seedForLevel: (n) => `flow-regular-${n}`,
  },
  {
    id: 'bonus',
    name: 'Bonus Pack',
    desc: '5×5 to 9×9 boards',
    color: '#2563eb',
    count: 150,
    sizeForLevel: (n) => band(n, [[10, 5], [35, 6], [75, 7], [115, 8], [150, 9]]),
    seedForLevel: (n) => `flow-bonus-${n}`,
  },
  {
    id: 'mania6',
    name: '6×6 Mania',
    desc: 'All 6×6, all the time!',
    color: '#b45309',
    count: 60,
    sizeForLevel: () => 6,
    seedForLevel: (n) => `flow-mania6-${n}`,
  },
  {
    id: 'mania7',
    name: '7×7 Mania',
    desc: 'All 7×7, all the time!',
    color: '#c026d3',
    count: 60,
    sizeForLevel: () => 7,
    seedForLevel: (n) => `flow-mania7-${n}`,
  },
  {
    id: 'mania8',
    name: '8×8 Mania',
    desc: 'All 8×8, all the time!',
    color: '#65a30d',
    count: 60,
    sizeForLevel: () => 8,
    seedForLevel: (n) => `flow-mania8-${n}`,
  },
  {
    id: 'mania9',
    name: '9×9 Mania',
    desc: 'All 9×9, all the time!',
    color: '#0891b2',
    count: 60,
    sizeForLevel: () => 9,
    seedForLevel: (n) => `flow-mania9-${n}`,
  },
];

export function packById(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function dailySeed(d = new Date()): string {
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `daily-${ds}`;
}

export function dailyLabel(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
