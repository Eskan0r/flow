/* Central game state: owns the FlowEngine, mirrors HUD state to signals,
 * runs the clock, persists bests/routes, plays sounds, opens the win dialog.
 * Framework touchpoints (dialog service, storage) live here - the engine
 * itself stays pure. */

import { Injectable, inject, signal } from '@angular/core';
import type { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmDialogService } from '../ui/dialog';
import { WinDialogComponent, type WinDialogContext } from '../win-dialog/win-dialog.component';
import { FlowEngine, randomSeed } from './flow-engine';
import { DAILY_COUNT, DAILY_KINDS, DAILY_SIZES, PACKS, dailyLabel, dailySeed, dailyShareCard, packById, parseDailySeed, type DailyMark, type Pack } from './packs';
import { Sound } from './sound';
import type { BoardKind } from './topology';

export interface Best {
  t: number;
  m: number;
}

function fmtT(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class FlowStore {
  private readonly dialog = inject(HlmDialogService);
  readonly engine = new FlowEngine();
  readonly sound = new Sound();

  readonly moves = signal(0);
  readonly filled = signal(0);
  readonly linked = signal('0/0');
  readonly title = signal('LEVEL 1');
  readonly subtitle = signal('');
  readonly time = signal('0:00');
  readonly toastMsg = signal<string | null>(null);
  readonly panelOpen = signal(false);
  readonly soundOn = signal(true);
  readonly seedInput = signal('');
  readonly size = signal(5);
  /** Bumped after every engine mutation so the board repaints. */
  readonly renderTick = signal(0);
  /** True while the win dialog is open (also handy for tests). */
  readonly winOpen = signal(false);
  /** Current screen: pack list, level grid, dailies, or the game itself. */
  readonly view = signal<'packs' | 'levels' | 'dailies' | 'game'>('packs');
  /** Active pack (null = custom seed / daily). */
  readonly pack = signal<Pack | null>(null);
  readonly packLevel = signal(1);
  /** Board geometry for custom play; packs bring their own kind. */
  readonly kind = signal<BoardKind>('square');
  /** Bump to refresh progress displays after a win. */
  readonly progressVersion = signal(0);

  readonly packs = PACKS;

  private startTs = 0;
  private elapsed = 0;
  private timerId = 0;
  private toastTimer = 0;
  private dialogRef: BrnDialogRef<unknown> | null = null;

  constructor() {
    this.sound.enabled = true;
  }

  // ---------- boot / routing ----------

  boot(): void {
    let q: URLSearchParams | null = null;
    try {
      q = new URLSearchParams(location.search);
    } catch {
      q = null;
    }
    let last: string | null = null;
    try {
      last = localStorage.getItem('flow.last');
    } catch {
      last = null;
    }
    if (q?.get('pack')) {
      const p = packById(q.get('pack') ?? '');
      const n = Math.max(1, parseInt(q.get('level') ?? '1', 10) || 1);
      if (p) {
        this.playPackLevel(p, Math.min(n, p.count), false);
        return;
      }
    }
    if (q?.get('seed')) {
      const size = Math.min(10, Math.max(5, parseInt(q.get('size') ?? '7', 10) || 7));
      const kind = q.get('kind') === 'hex' ? 'hex' : 'square';
      this.seedInput.set(q.get('seed') ?? '');
      this.loadSeed(this.seedInput(), size, kind);
    } else if (q?.get('level')) {
      // legacy route from before packs existed ? start of Regular Pack
      const p = packById('regular');
      if (p) this.playPackLevel(p, 1, false);
      else this.showPacks();
    } else if (last) {
      try {
        const u = new URL(last);
        if (u.searchParams.get('pack')) {
          const p = packById(u.searchParams.get('pack') ?? '');
          const n = Math.max(1, parseInt(u.searchParams.get('level') ?? '1', 10) || 1);
          if (p) {
            this.playPackLevel(p, Math.min(n, p.count), false);
            return;
          }
        }
        if (u.searchParams.get('seed')) {
          const s2 = Math.min(10, Math.max(5, parseInt(u.searchParams.get('size') ?? '7', 10) || 7));
          const k2 = u.searchParams.get('kind') === 'hex' ? 'hex' : 'square';
          this.seedInput.set(u.searchParams.get('seed') ?? '');
          this.loadSeed(this.seedInput(), s2, k2);
        } else {
          this.showPacks();
        }
      } catch {
        this.showPacks();
      }
    } else {
      this.showPacks();
    }
  }

  private persistRoute(): void {
    try {
      const u = new URL(location.href);
      u.search = '';
      const p = this.pack();
      if (p && this.engine.mode === 'seed') {
        u.searchParams.set('pack', p.id);
        u.searchParams.set('level', String(this.packLevel()));
      } else if (this.engine.mode === 'level') {
        u.searchParams.set('level', String(this.engine.levelNum));
      } else {
        u.searchParams.set('seed', this.engine.seed);
        u.searchParams.set('size', String(this.engine.size));
        if (this.engine.topo.kind === 'hex') u.searchParams.set('kind', 'hex');
      }
      history.replaceState(null, '', u.toString());
      localStorage.setItem('flow.last', u.toString());
    } catch {
      /* non-browser / restricted */
    }
  }

  // ---------- views & packs ----------

  showPacks(): void {
    this.closeDialog();
    this.pack.set(null);
    this.view.set('packs');
  }

  showDailies(): void {
    this.closeDialog();
    this.pack.set(null);
    this.view.set('dailies');
  }

  openPack(p: Pack): void {
    this.closeDialog();
    this.pack.set(p);
    this.view.set('levels');
  }

  backFromGame(): void {
    this.closeDialog();
    if (this.pack()) this.view.set('levels');
    else if (this.engine.seed.startsWith('daily-')) this.view.set('dailies');
    else this.view.set('packs');
  }

  /** Play a pack level. Silent skips the click sound (used by boot). */
  playPackLevel(p: Pack, n: number, announce = true): void {
    const level = Math.min(Math.max(1, n), p.count);
    this.pack.set(p);
    this.packLevel.set(level);
    this.kind.set(p.kind);
    this.seedInput.set('');
    this.engine.loadLevel('seed', 0, p.seedForLevel(level), p.sizeForLevel(level), p.kind);
    this.view.set('game');
    this.afterLoad();
    if (announce) this.sound.click();
  }

  playCustom(seed: string, size: number, kind?: BoardKind): void {
    const k = kind ?? this.kind();
    this.pack.set(null);
    this.kind.set(k);
    this.loadSeed(seed, size, k);
    this.view.set('game');
  }

  loadSeed(seed: string, size: number, kind?: BoardKind): void {
    const k = kind ?? this.kind();
    this.kind.set(k);
    this.engine.loadLevel('seed', 0, seed, size, k);
    this.afterLoad();
  }

  newRandom(): void {
    const sd = randomSeed();
    this.seedInput.set(sd);
    this.pack.set(null);
    this.engine.loadLevel('seed', 0, sd, this.engine.size, this.kind());
    this.view.set('game');
    this.afterLoad();
  }

  /** Play one of today's puzzles (1-based index into DAILY_SIZES/KINDS). */
  daily(index = 1): void {
    const i = Math.min(Math.max(1, index), DAILY_COUNT);
    const sd = dailySeed(new Date(), i);
    const k = DAILY_KINDS[i - 1];
    this.seedInput.set(sd);
    this.pack.set(null);
    this.kind.set(k);
    this.engine.loadLevel('seed', 0, sd, DAILY_SIZES[i - 1], k);
    this.view.set('game');
    this.afterLoad();
    this.toast(`Daily ${i} of ${DAILY_COUNT}`);
  }

  dailyLabelToday(): string {
    return dailyLabel();
  }

  dailySize(index: number): number {
    return DAILY_SIZES[Math.min(Math.max(1, index), DAILY_COUNT) - 1];
  }

  dailyKind(index: number): BoardKind {
    return DAILY_KINDS[Math.min(Math.max(1, index), DAILY_COUNT) - 1];
  }

  /** Parse the current engine seed as a daily ({date,index}) or null. */
  parseDaily(): { date: string; index: number } | null {
    return parseDailySeed(this.engine.seed);
  }

  setSize(size: number): void {
    if (this.engine.mode === 'seed' && !this.pack()) this.loadSeed(this.engine.seed, size, this.kind());
    else this.playCustom(randomSeed(), size, this.kind());
  }

  setKind(kind: BoardKind): void {
    if (kind === this.kind() && !this.pack()) return;
    const size = kind === 'hex' ? Math.min(this.engine.size, 8) : this.engine.size;
    this.playCustom(randomSeed(), size, kind);
  }

  sizesForKind(): number[] {
    return this.kind() === 'hex' ? [5, 6, 7, 8] : [5, 6, 7, 8, 9, 10];
  }

  // ---------- progress ----------

  private starsKey(packId: string, level: number): string {
    return `flow.stars.${packId}.${level}`;
  }

  starsFor(packId: string, level: number): number {
    try {
      return parseInt(localStorage.getItem(this.starsKey(packId, level)) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  packProgress(p: Pack): { done: number; total: number } {
    // Cheap enough at these counts (=150 reads of tiny keys).
    // progressVersion() is read so grids refresh after a win.
    this.progressVersion();
    let done = 0;
    for (let n = 1; n <= p.count; n++) {
      if (this.starsFor(p.id, n) > 0) done++;
    }
    return { done, total: p.count };
  }

  private recordStars(p: Pack, level: number, stars: number): void {
    try {
      const prev = this.starsFor(p.id, level);
      if (stars > prev) localStorage.setItem(this.starsKey(p.id, level), String(stars));
    } catch {
      /* ignore */
    }
    this.progressVersion.update((v) => v + 1);
  }

  private dailyDates(): string[] {
    try {
      const raw = localStorage.getItem('flow.daily.done');
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((d): d is string => typeof d === 'string') : [];
    } catch {
      return [];
    }
  }

  private dailyStarsKey(date: string, index: number): string {
    return `flow.dstars.${date}-${index}`;
  }

  dailyStars(date: string, index: number): number {
    try {
      return parseInt(localStorage.getItem(this.dailyStarsKey(date, index)) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  private saveDailyStars(date: string, index: number, stars: number): void {
    try {
      if (stars > this.dailyStars(date, index)) {
        localStorage.setItem(this.dailyStarsKey(date, index), String(stars));
      }
    } catch {
      /* ignore */
    }
  }

  /** Per-daily marks for a share card: perfect (3 stars), done, or todo. */
  dailyMarks(date: string): DailyMark[] {
    this.progressVersion();
    const done = new Set(this.dailyDoneOn(date));
    const out: DailyMark[] = [];
    for (let i = 1; i <= DAILY_COUNT; i++) {
      if (!done.has(i)) out.push('todo');
      else out.push(this.dailyStars(date, i) >= 3 ? 'perfect' : 'done');
    }
    return out;
  }

  /** Summed best times for a date's dailies, or null unless all are done. */
  dailyTotalTime(date: string): number | null {
    const done = this.dailyDoneOn(date);
    if (done.length < DAILY_COUNT) return null;
    let sum = 0;
    for (let i = 1; i <= DAILY_COUNT; i++) {
      const b = this.loadBestFor(dailySeed(date, i), DAILY_SIZES[i - 1]);
      if (!b) return null;
      sum += b.t;
    }
    return sum;
  }

  /** Full share text for a date (defaults to today). */
  shareText(date: string = dailyLabel()): string {
    return dailyShareCard(date, this.dailyMarks(date), this.dailyStreak(), this.dailyTotalTime(date));
  }

  /** Copy the day's card: native share sheet on mobile, clipboard otherwise. */
  async shareToday(date: string = dailyLabel()): Promise<void> {
    const text = this.shareText(date);
    try {
      const nav = window.navigator as Navigator & {
        share?: (data: { text: string }) => Promise<void>;
      };
      if (typeof nav.share === 'function') {
        await nav.share({ text });
        return;
      }
    } catch (err) {
      // User dismissed the sheet: stay silent. Real failures fall through.
      if (err instanceof Error && err.name === 'AbortError') return;
    }
    if (await this.copyText(text)) {
      this.toast('Copied to clipboard');
    } else {
      this.toast('Copy failed — long-press to copy');
    }
  }

  private copyText(text: string): Promise<boolean> {
    try {
      const clipboard = window.navigator.clipboard;
      if (clipboard?.writeText) return clipboard.writeText(text).then(
        () => true,
        () => this.legacyCopy(text),
      );
    } catch {
      /* fall through */
    }
    return Promise.resolve(this.legacyCopy(text));
  }

  private legacyCopy(text: string): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  private recordDaily(seed: string): void {
    if (!seed.startsWith('daily-')) return;
    const label = seed.slice('daily-'.length);
    try {
      const dates = this.dailyDates();
      if (!dates.includes(label)) {
        dates.push(label);
        localStorage.setItem('flow.daily.done', JSON.stringify(dates));
      }
    } catch {
      /* ignore */
    }
    this.progressVersion.update((v) => v + 1);
  }

  /** Completed daily indices (1-based) for a given date label. */
  dailyDoneOn(date: string): number[] {
    this.progressVersion();
    const out: number[] = [];
    for (const d of this.dailyDates()) {
      const parsed = parseDailySeed(`daily-${d}`);
      if (parsed && parsed.date === date) out.push(parsed.index);
    }
    return out.sort((a, b) => a - b);
  }

  dailyDoneToday(): number[] {
    return this.dailyDoneOn(dailyLabel());
  }

  dailyStreak(): number {
    this.progressVersion();
    const byDate = new Map<string, Set<number>>();
    for (const d of this.dailyDates()) {
      const parsed = parseDailySeed(`daily-${d}`);
      if (!parsed) continue;
      if (!byDate.has(parsed.date)) byDate.set(parsed.date, new Set());
      byDate.get(parsed.date)?.add(parsed.index);
    }
    const full = (date: string): boolean => (byDate.get(date)?.size ?? 0) >= DAILY_COUNT;
    const day = 86400000;
    const now = new Date();
    const at = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!full(at(cursor))) cursor = new Date(cursor.getTime() - day);
    let streak = 0;
    while (full(at(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - day);
    }
    return streak;
  }

  dailyDoneCount(): number {
    this.progressVersion();
    return this.dailyDoneToday().length;
  }

  private afterLoad(): void {
    this.stopClock();
    this.startTs = 0;
    this.elapsed = 0;
    this.closeDialog();
    this.refresh();
    this.persistRoute();
  }

  // ---------- HUD sync ----------

  /** Call after any engine mutation: sounds, HUD signals, win dialog. */
  refresh(): void {
    for (const ev of this.engine.drainEvents()) {
      if (ev === 'cut') this.sound.cut();
      else if (ev === 'blocked') this.sound.bad();
      else if (ev.startsWith('complete:')) this.sound.done();
    }
    const e = this.engine;
    this.moves.set(e.moves);
    this.filled.set(e.filledPct());
    this.linked.set(`${e.connectedCount()}/${e.numPairs}`);
    this.size.set(e.size);
    const p = this.pack();
    if (p) {
    this.title.set(`${p.name} \u00B7 ${this.packLevel()}`);
    this.subtitle.set(`${e.size} \u00D7 ${e.size} \u00B7 ${e.numPairs} colors`);
    } else if (e.seed.startsWith('daily-')) {
      this.title.set('Daily Puzzle');
      const hex = e.topo.kind === 'hex' ? ' Hex' : '';
      this.subtitle.set(`${e.size} \u00D7 ${e.size}${hex} \u00B7 ${e.seed.slice('daily-'.length)}`);
    } else {
      this.title.set(e.topo.kind === 'hex' ? 'Custom Hex' : 'Custom');
      const sd = e.seed.length > 16 ? `${e.seed.slice(0, 15)}\u2026` : e.seed;
      this.subtitle.set(`${e.size} \u00D7 ${e.size} \u00B7 ${sd}`);
    }
    if (e.won && e.win && !this.dialogRef) this.onWin();
    this.renderTick.update((v) => v + 1);
  }

  // ---------- clock ----------

  ensureClock(): void {
    if (this.startTs || this.engine.won) return;
    this.startTs = Date.now();
    this.stopClock();
    this.timerId = window.setInterval(() => {
      this.elapsed = (Date.now() - this.startTs) / 1000;
      this.time.set(fmtT(this.elapsed));
    }, 250);
  }

  private stopClock(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = 0;
  }

  resumeClock(): void {
    if (!this.startTs || this.engine.won) return;
    this.stopClock();
    const frozen = this.elapsed;
    this.startTs = Date.now() - frozen * 1000;
    this.timerId = window.setInterval(() => {
      this.elapsed = (Date.now() - this.startTs) / 1000;
      this.time.set(fmtT(this.elapsed));
    }, 250);
  }

  // ---------- actions (from board / buttons) ----------

  undo(): void {
    if (!this.engine.undo()) {
      this.toast('Nothing to undo');
      return;
    }
    this.closeDialog();
    this.resumeClock();
    this.refresh();
    this.sound.click();
  }

  /** True while playing a daily puzzle (resets are disabled there). */
  isDaily(): boolean {
    return parseDailySeed(this.engine.seed) !== null;
  }

  reset(): void {
    if (this.isDaily()) {
      this.toast('No resets on dailies');
      return;
    }
    if (!this.engine.reset()) return;
    this.closeDialog();
    this.refresh();
    this.sound.click();
  }

  hint(): void {
    const ci = this.engine.hint();
    if (ci < 0) return;
    this.ensureClock();
    this.refresh();
    this.toast(`Hint placed (color ${ci + 1})`);
  }

  replay(): void {
    const p = this.pack();
    if (p) this.playPackLevel(p, this.packLevel());
    else {
      const e = this.engine;
      this.loadSeed(e.seed, e.size, e.topo.kind);
      this.sound.click();
    }
  }

  next(): void {
    const p = this.pack();
    if (p) {
      if (this.packLevel() < p.count) {
        this.playPackLevel(p, this.packLevel() + 1);
      } else {
        this.openPack(p);
        this.toast(`${p.name} complete`);
      }
      return;
    }
    const parsed = parseDailySeed(this.engine.seed);
    if (parsed) {
      if (parsed.index < DAILY_COUNT) this.daily(parsed.index + 1);
      else {
        this.showDailies();
        this.toast('All dailies complete');
      }
      return;
    }
    const e = this.engine;
    const sd = randomSeed();
    this.seedInput.set(sd);
    this.loadSeed(sd, e.size, e.topo.kind);
    this.sound.click();
  }

  setSound(on: boolean): void {
    this.soundOn.set(on);
    this.sound.enabled = on;
  }

  toast(msg: string): void {
    this.toastMsg.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastMsg.set(null), 2200);
  }

  bestLabel(): string {
    const b = this.loadBest();
    return b ? `${fmtT(b.t)} \u00B7 ${b.m} moves` : '\u2014';
  }

  // ---------- win ----------

  private onWin(): void {
    this.stopClock();
    const secs = this.startTs ? (Date.now() - this.startTs) / 1000 : 0;
    this.time.set(fmtT(secs));
    const win = this.engine.win;
    if (!win) return;
    const isBest = this.saveBest(secs, win.moves);
    const p = this.pack();
    const parsedDaily = parseDailySeed(this.engine.seed);
    if (p) this.recordStars(p, this.packLevel(), win.stars);
    else {
      this.recordDaily(this.engine.seed);
      if (parsedDaily) this.saveDailyStars(parsedDaily.date, parsedDaily.index, win.stars);
    }
    const ctx: WinDialogContext = {
      stars: win.stars,
      time: fmtT(secs),
      moves: win.moves,
      perfect: win.perfect,
      hints: win.hints,
      isBest,
      nextLabel: parsedDaily && parsedDaily.index >= DAILY_COUNT ? 'Home' : 'Next',
      showShare: parsedDaily !== null,
      onReplay: () => this.replay(),
      onNext: () => this.next(),
      onShare: () => void this.shareToday(),
    };
    // Stable describedby id (see template span): brain skips its live DOM
    // sync when ariaDescribedBy is preset, so the container binding never
    // flips after first check - no more dev-mode NG0100 on every win.
    this.dialogRef = this.dialog.open(WinDialogComponent, {
      context: ctx,
      disableClose: true,
      ariaDescribedBy: 'flow-win-desc',
    });
    this.winOpen.set(true);
    this.sound.win();
  }

  private closeDialog(): void {
    try {
      this.dialogRef?.close({});
    } catch {
      /* already closed */
    }
    this.dialogRef = null;
    this.winOpen.set(false);
  }

  private bestKey(): string {
    return `flow.best.${this.engine.seed}.s${this.engine.size}`;
  }

  private loadBest(): Best | null {
    return this.loadBestFor(this.engine.seed, this.engine.size);
  }

  private loadBestFor(seed: string, size: number): Best | null {
    try {
      const raw = localStorage.getItem(`flow.best.${seed}.s${size}`);
      return raw ? (JSON.parse(raw) as Best) : null;
    } catch {
      return null;
    }
  }

  private saveBest(t: number, m: number): boolean {
    const prev = this.loadBest();
    if (!prev || t < prev.t || (t === prev.t && m < prev.m)) {
      try {
        localStorage.setItem(this.bestKey(), JSON.stringify({ t, m }));
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }
}
