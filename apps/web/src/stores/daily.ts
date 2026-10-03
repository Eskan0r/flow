import { DAILY_COUNT, dailyLabel, dailyShareCard, parseDailySeed, type DailyMark } from "@core";

const KEY = "flow.daily.done";

export function readDoneLabels(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export function dailyDoneOn(date: string): number[] {
  const out: number[] = [];
  for (const d of readDoneLabels()) {
    const parsed = parseDailySeed(`daily-${d}`);
    if (parsed && parsed.date === date) out.push(parsed.index);
  }
  return out.sort((a, b) => a - b);
}

export function recordDailySeed(seed: string): void {
  if (!seed.startsWith("daily-")) return;
  const label = seed.slice("daily-".length);
  try {
    const dates = readDoneLabels();
    if (!dates.includes(label)) {
      dates.push(label);
      localStorage.setItem(KEY, JSON.stringify(dates));
    }
  } catch {
    return;
  }
}

export function nextUndoneDaily(date: string, afterIndex = 0): number | null {
  const done = new Set(dailyDoneOn(date));
  for (let k = 1; k <= DAILY_COUNT; k++) {
    const idx = ((afterIndex + k - 1) % DAILY_COUNT) + 1;
    if (!done.has(idx)) return idx;
  }
  return null;
}

export function todayLabel(): string {
  return dailyLabel(new Date());
}

function dstarsKey(date: string, index: number): string {
  return `flow.dstars.${date}-${index}`;
}

export function dailyStars(date: string, index: number): number {
  try {
    return parseInt(localStorage.getItem(dstarsKey(date, index)) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function saveDailyStars(date: string, index: number, stars: number): void {
  try {
    const prev = dailyStars(date, index);
    if (stars > prev) localStorage.setItem(dstarsKey(date, index), String(stars));
  } catch {
    return;
  }
}

export function dailyMarks(date: string): DailyMark[] {
  const done = new Set(dailyDoneOn(date));
  const out: DailyMark[] = [];
  for (let i = 1; i <= DAILY_COUNT; i++) {
    if (!done.has(i)) out.push("todo");
    else out.push(dailyStars(date, i) >= 3 ? "perfect" : "done");
  }
  return out;
}

export function dailyStreak(): number {
  const byDate = new Map<string, Set<number>>();
  for (const d of readDoneLabels()) {
    const parsed = parseDailySeed(`daily-${d}`);
    if (!parsed) continue;
    if (!byDate.has(parsed.date)) byDate.set(parsed.date, new Set());
    byDate.get(parsed.date)?.add(parsed.index);
  }
  const full = (date: string): boolean => (byDate.get(date)?.size ?? 0) >= DAILY_COUNT;
  const day = 86400000;
  const now = new Date();
  const at = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!full(at(cursor))) cursor = new Date(cursor.getTime() - day);
  let streak = 0;
  while (full(at(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - day);
  }
  return streak;
}

export function shareText(date: string): string {
  return dailyShareCard(date, dailyMarks(date), dailyStreak(), null);
}
