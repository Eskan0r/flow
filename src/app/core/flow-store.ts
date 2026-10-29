/* Central game state: owns the FlowEngine, mirrors HUD state to signals,
 * runs the clock, persists bests/routes, plays sounds, opens the win dialog.
 * Framework touchpoints (dialog service, storage) live here - the engine
 * itself stays pure. */

import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmDialogService } from '../ui/dialog';
import { WinDialogComponent, type WinDialogContext } from '../win-dialog/win-dialog.component';
import { FlowEngine, randomSeed, type EngineSnapshot } from './flow-engine';
import { DAILY_COUNT, PACKS, dailyLabel, dailySeed, dailyShareCard, dailySpec, packById, parseDailySeed, type DailyMark, type Pack } from './packs';
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
  private checkpointTimer = 0;
  private readonly progressCache = new Map<string, { version: number; done: number; total: number }>();

  constructor() {
    this.sound.enabled = true;
    const save = () => this.saveDailyAttempt();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    inject(DestroyRef).onDestroy(() => {
      save();
      this.stopClock();
      clearTimeout(this.toastTimer);
      clearTimeout(this.checkpointTimer);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    });
  }

  // ---------- boot / routing ----------

  boot(): void {
    let q: URLSearchParams | null = null;
    try {
      q = new URLSearchParams(location.search);
    } catch {
      q = null;
    }
    // Explicit deep links only (?pack=&level=, ?seed=, legacy ?level=). A
    // bare visit always lands on the home page: no restoring the last
    // played level, no rewriting the URL to one.
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
      const rows = parseInt(q.get('rows') ?? '0', 10) || 0;
      const cols = parseInt(q.get('cols') ?? '0', 10) || 0;
      const warp = q.get('warp') === '1';
      const chain = q.get('chain') === '1';
      this.seedInput.set(q.get('seed') ?? '');
      // Daily links resolve by embedded date (spec rotation covers shapes
      // URL params can't describe); custom seeds use the params directly.
      const pd = parseDailySeed(this.seedInput());
      if (pd) this.daily(pd.index, pd.date);
      else this.loadSeed(this.seedInput(), size, kind, rows, cols, warp, chain);
    } else if (q?.get('level')) {
      // legacy route from before packs existed ? start of Regular Pack
      const p = packById('regular');
      if (p) this.playPackLevel(p, 1, false);
      else this.showPacks();
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
        if (this.engine.rows !== this.engine.cols) {
          u.searchParams.set('rows', String(this.engine.rows));
          u.searchParams.set('cols', String(this.engine.cols));
        }
        if (this.engine.topo.kind === 'hex') u.searchParams.set('kind', 'hex');
        if (this.engine.warp) u.searchParams.set('warp', '1');
        if (this.engine.chain) u.searchParams.set('chain', '1');
      }
      history.replaceState(null, '', u.toString());
    } catch {
      /* non-browser / restricted */
    }
  }

  /** Drop level params from the address bar when leaving the game, so the
   *  URL never points at a level that isn't on screen. */
  private clearRoute(): void {
    try {
      const u = new URL(location.href);
      if (u.search) {
        u.search = '';
        history.replaceState(null, '', u.toString());
      }
    } catch {
      /* non-browser / restricted */
    }
  }

  // ---------- views & packs ----------

  showPacks(): void {
    this.stopClock();
    this.saveDailyAttempt();
    this.closeDialog();
    this.pack.set(null);
    this.view.set('packs');
    this.clearRoute();
  }

  showDailies(): void {
    this.stopClock();
    this.saveDailyAttempt();
    this.closeDialog();
    this.pack.set(null);
    this.view.set('dailies');
    this.clearRoute();
  }

  openPack(p: Pack): void {
    this.stopClock();
    this.saveDailyAttempt();
    this.closeDialog();
    this.pack.set(p);
    this.view.set('levels');
    this.clearRoute();
  }

  backFromGame(): void {
    const p = this.pack();
    if (p) this.openPack(p);
    else if (this.engine.seed.startsWith('daily-')) this.showDailies();
    else this.showPacks();
  }

  /** Play a pack level. Silent skips the click sound (used by boot). */
  playPackLevel(p: Pack, n: number, announce = true): void {
    this.stopClock();
    this.saveDailyAttempt();
    const level = Math.min(Math.max(1, n), p.count);
    this.pack.set(p);
    this.packLevel.set(level);
    this.kind.set(p.kind);
    this.seedInput.set('');
    const { rows, cols } = p.shapeForLevel(level);
    const mask = p.maskForLevel ? p.maskForLevel(level) : null;
    const walls = p.wallsForLevel ? p.wallsForLevel(level) : null;
    const warp = p.warpForLevel ? p.warpForLevel(level) : false;
    const chain = p.chainForLevel ? p.chainForLevel(level) : false;
    const pairCount = p.pairsOverride?.[level] ?? (p.pairsForLevel ? p.pairsForLevel(level) : null);
    this.engine.loadLevel('seed', 0, p.seedForLevel(level), p.sizeForLevel(level), p.kind, rows, cols, mask, walls, warp, chain, pairCount);
    this.view.set('game');
    this.afterLoad();
    if (announce) this.sound.click();
  }

  playCustom(seed: string, size: number, kind?: BoardKind, rows = 0, cols = 0): void {
    const k = kind ?? this.kind();
    this.pack.set(null);
    this.kind.set(k);
    this.loadSeed(seed, size, k, rows, cols);
  }

  loadSeed(seed: string, size: number, kind?: BoardKind, rows = 0, cols = 0, warp = false, chain = false): void {
    const daily = parseDailySeed(seed);
    if (daily) {
      this.daily(daily.index, daily.date);
      return;
    }
    this.stopClock();
    this.saveDailyAttempt();
    this.pack.set(null);
    const k = kind ?? this.kind();
    this.kind.set(k);
    this.engine.loadLevel('seed', 0, seed, size, k, rows, cols, null, null, warp, chain);
    this.view.set('game');
    this.afterLoad();
  }

  newRandom(): void {
    this.stopClock();
    this.saveDailyAttempt();
    // Different seeds can still land on the same small-board layout, so
    // re-roll until the puzzle actually changes (keeps "New" from replaying).
    const prevKey = JSON.stringify(this.engine.pairs);
    let sd = randomSeed();
    for (let t = 0; t < 6; t++) {
      this.engine.loadLevel('seed', 0, sd, this.engine.size, this.kind());
      if (JSON.stringify(this.engine.pairs) !== prevKey || t === 5) break;
      sd = randomSeed();
    }
    this.seedInput.set(sd);
    this.pack.set(null);
    this.view.set('game');
    this.afterLoad();
  }

  /** Play one of a date's puzzles (1-based index; category rotates by date).
   *  Daily links resolve by their embedded date, so masked/warp/chain
   *  dailies (which URL params alone can't describe) load exactly. */
  daily(index = 1, dateStr: string = dailyLabel()): void {
    this.stopClock();
    this.saveDailyAttempt();
    const i = Math.min(Math.max(1, index), DAILY_COUNT);
    // Dailies are one-shot: a completed level can't be replayed. Send the
    // player back to the menu instead of loading the board again.
    const done = this.dailyDoneOn(dateStr);
    if (done.includes(i)) {
      this.showDailies();
      this.toast(
        done.length >= DAILY_COUNT
          ? 'All dailies complete — share your results'
          : 'Already completed — try the next one',
      );
      return;
    }
    const sd = dailySeed(dateStr, i);
    const spec = dailySpec(dateStr, i);
    this.seedInput.set(sd);
    this.pack.set(null);
    this.kind.set(spec.kind);
    this.engine.loadLevel(
      'seed', 0, sd, Math.max(spec.rows, spec.cols), spec.kind,
      spec.rows, spec.cols, spec.mask ?? null, spec.walls ?? null,
      spec.warp ?? false, spec.chain ?? false,
    );
    this.view.set('game');
    this.afterLoad();
    this.toast(`Daily ${i} of ${DAILY_COUNT}`);
  }

  dailyLabelToday(): string {
    return dailyLabel();
  }

  dailySize(index: number): number {
    const s = dailySpec(dailyLabel(), Math.min(Math.max(1, index), DAILY_COUNT));
    return Math.max(s.rows, s.cols);
  }

  dailyKind(index: number): BoardKind {
    return dailySpec(dailyLabel(), Math.min(Math.max(1, index), DAILY_COUNT)).kind;
  }

  /** Menu line for a date's daily: shape plus category tag. */
  dailyBlurb(index: number, dateStr: string = dailyLabel()): string {
    const s = dailySpec(dateStr, Math.min(Math.max(1, index), DAILY_COUNT));
    return `${s.rows}\u00D7${s.cols}${s.tag ? ` ${s.tag}` : ''}`;
  }

  /** Parse the current engine seed as a daily ({date,index}) or null. */
  parseDaily(): { date: string; index: number } | null {
    return parseDailySeed(this.engine.seed);
  }

  /** Next not-yet-completed daily index after `afterIndex` (wraps), or null when all done. */
  nextUndoneDaily(date: string, afterIndex = 0): number | null {
    const done = new Set(this.dailyDoneOn(date));
    for (let k = 1; k <= DAILY_COUNT; k++) {
      const idx = ((afterIndex + k - 1) % DAILY_COUNT) + 1;
      if (!done.has(idx)) return idx;
    }
    return null;
  }

  /** True once all 5 of today's dailies are complete. */
  dailyAllDoneToday(): boolean {
    return this.dailyDoneOn(dailyLabel()).length >= DAILY_COUNT;
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
    const version = this.progressVersion();
    const cached = this.progressCache.get(p.id);
    if (cached?.version === version) return cached;
    let done = 0;
    for (let n = 1; n <= p.count; n++) {
      if (this.starsFor(p.id, n) > 0) done++;
    }
    const progress = { version, done, total: p.count };
    this.progressCache.set(p.id, progress);
    return progress;
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
      const spec = dailySpec(date, i);
      const b = this.loadBestFor(dailySeed(date, i), spec.rows, spec.cols);
      if (!b) return null;
      sum += b.t;
    }
    return sum;
  }

  /** Full share text for a date (defaults to today). */
  shareText(date: string = dailyLabel()): string {
    return dailyShareCard(date, this.dailyMarks(date), this.dailyStreak(), this.dailyTotalTime(date));
  }

  /** Copy the day's card straight to the clipboard. */
  async shareToday(date: string = dailyLabel()): Promise<void> {
    if (await this.copyText(this.shareText(date))) {
      this.toast('Copied to clipboard');
    } else {
      this.toast('Copy failed — long-press the text to copy');
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
    const now = new Date();
    const at = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!full(at(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (full(at(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
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
    this.time.set('0:00');
    this.closeDialog();
    this.restoreDailyAttempt();
    this.refresh();
    this.persistRoute();
  }

  /** Debounce live-drag writes; releases and page lifecycle events flush immediately. */
  checkpointDaily(): void {
    if (!this.isDaily() || this.checkpointTimer) return;
    this.checkpointTimer = window.setTimeout(() => this.saveDailyAttempt(), 150);
  }

  private saveDailyAttempt(): void {
    clearTimeout(this.checkpointTimer);
    this.checkpointTimer = 0;
    if (!this.isDaily() || this.engine.won) return;
    const elapsed = this.timerId ? (Date.now() - this.startTs) / 1000 : this.elapsed;
    try {
      localStorage.setItem(`flow.attempt.${this.engine.seed}`, JSON.stringify({
        version: 1,
        board: JSON.stringify(this.engine.pairs),
        state: this.engine.snapshot(),
        history: this.engine.history,
        elapsed,
        savedAt: Date.now(),
        running: !!this.timerId,
      }));
    } catch { /* Storage may be unavailable. The current game remains playable. */ }
  }

  private restoreDailyAttempt(): void {
    if (!this.isDaily()) return;
    try {
      const raw = localStorage.getItem(`flow.attempt.${this.engine.seed}`);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || saved.board !== JSON.stringify(this.engine.pairs)
        || !this.validSnapshot(saved.state) || !Array.isArray(saved.history)
        || saved.history.length > 200 || !saved.history.every((s: unknown) => this.validSnapshot(s))
        || !Number.isFinite(saved.elapsed) || saved.elapsed < 0
        || !Number.isFinite(saved.savedAt)) return;
      this.engine.restore(saved.state);
      this.engine.history = saved.history;
      this.engine.drainEvents();
      this.elapsed = saved.elapsed + (saved.running ? Math.max(0, Date.now() - saved.savedAt) / 1000 : 0);
      this.time.set(fmtT(this.elapsed));
      if (saved.running) this.ensureClock();
      this.engine.checkWin();
    } catch { /* Ignore obsolete or damaged saved attempts. */ }
  }

  private validSnapshot(value: unknown): value is EngineSnapshot {
    if (!value || typeof value !== 'object') return false;
    const s = value as EngineSnapshot;
    const e = this.engine;
    if (!Number.isSafeInteger(s.moves) || s.moves < 0 || !Number.isSafeInteger(s.hints) || s.hints < 0
      || !(s.lastCounted === null || (Number.isInteger(s.lastCounted) && s.lastCounted >= 0 && s.lastCounted < e.numPairs))
      || !Array.isArray(s.paths) || s.paths.length !== e.numPairs) return false;
    const seen = new Set<number>();
    return s.paths.every((path, ci) => {
      if (!Array.isArray(path) || path.length > e.topo.cells) return false;
      return path.every((cell, i) => {
        if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) return false;
        const [r, c] = cell;
        if (!e.inBounds(r, c)) return false;
        const key = e.key(r, c);
        const dot = e.epOf.get(key);
        if (seen.has(key) || (dot !== undefined && (dot !== ci || (i !== 0 && i !== path.length - 1)))
          || (i === 0 && dot !== ci)) return false;
        if (i > 0) {
          const prev = path[i - 1];
          if (!e.topo.neighbors(prev[0], prev[1]).some(([rr, cc]) => rr === r && cc === c)
            || e.edgeWalled(prev, cell)) return false;
        }
        seen.add(key);
        return true;
      });
    });
  }

  // ---------- HUD sync ----------

  /** Call after any engine mutation: sounds, HUD signals, win dialog. */
  refresh(): void {
    for (const ev of this.engine.drainEvents()) {
      if (ev === 'cut') this.sound.cut();
      else if (ev.startsWith('complete:')) this.sound.done();
      // NOTE: 'blocked' bumps stay silent by design (a burst of them fires
      // on release after dragging along walls/rival dots).
    }
    const e = this.engine;
    this.moves.set(e.moves);
    this.filled.set(e.filledPct());
    this.linked.set(`${e.connectedCount()}/${e.numPairs}`);
    this.size.set(e.size);
    const p = this.pack();
    const dims = `${e.rows} \u00D7 ${e.cols}`;
    const tag = e.topo.warp ? ' warp' : e.topo.kind === 'hex' ? ' hex' : '';
    const chainTag = e.chain ? ' chain' : '';
    if (p) {
      this.title.set(`${p.name} \u00B7 ${this.packLevel()}`);
      this.subtitle.set(`${dims}${tag}${chainTag} \u00B7 ${e.numPairs} colors`);
    } else if (e.seed.startsWith('daily-')) {
      this.title.set('Daily Puzzle');
      const hex = e.topo.kind === 'hex' ? ' Hex' : '';
      const wtag = e.topo.warp ? ' Warp' : '';
      const ctag = e.chain ? ' Chain' : '';
      this.subtitle.set(`${dims}${hex}${wtag}${ctag} \u00B7 ${e.seed.slice('daily-'.length)}`);
    } else {
      this.title.set(e.topo.kind === 'hex' ? 'Custom Hex' : 'Custom');
      const sd = e.seed.length > 16 ? `${e.seed.slice(0, 15)}\u2026` : e.seed;
      this.subtitle.set(`${dims} \u00B7 ${sd}`);
    }
    if (e.won && e.win && !this.dialogRef) this.onWin();
    this.saveDailyAttempt();
    this.renderTick.update((v) => v + 1);
  }

  // ---------- clock ----------

  ensureClock(): void {
    if (this.startTs || this.engine.won) return;
    this.startTs = Date.now() - this.elapsed * 1000;
    this.stopClock();
    this.timerId = window.setInterval(() => {
      this.elapsed = (Date.now() - this.startTs) / 1000;
      this.time.set(fmtT(this.elapsed));
    }, 250);
  }

  private stopClock(): void {
    if (this.timerId) this.elapsed = (Date.now() - this.startTs) / 1000;
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
    if (this.isDaily() && (this.engine.won || this.dailyFinished())) return;
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

  private dailyFinished(): boolean {
    const daily = this.parseDaily();
    return !!daily && this.dailyDoneOn(daily.date).includes(daily.index);
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
    if (this.isDaily() && this.dailyFinished()) return;
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
      // Dailies are one-shot: once a daily is done it can't be replayed.
      // (Win-dialog Replay only fires after a win, so the current daily is
      // done by then — route onward instead of reloading it.)
      const parsed = parseDailySeed(e.seed);
      if (parsed) {
        const done = this.dailyDoneOn(parsed.date);
        if (done.includes(parsed.index)) {
          const nxt = this.nextUndoneDaily(parsed.date, parsed.index);
          if (nxt !== null) this.daily(nxt, parsed.date);
          else {
            this.showDailies();
            this.toast('All dailies complete — share your results');
          }
          return;
        }
      }
      this.loadSeed(e.seed, e.size, e.topo.kind, e.rows, e.cols, e.warp, e.chain);
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
      // Skip already-completed dailies; land on the menu once all 5 are done.
      const nxt = this.nextUndoneDaily(parsed.date, parsed.index);
      if (nxt !== null) this.daily(nxt, parsed.date);
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
    // Another tab may already have committed this one-shot daily.
    if (this.dailyFinished()) {
      this.showDailies();
      return;
    }
    this.stopClock();
    const secs = this.elapsed;
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
    if (parsedDaily) {
      try { localStorage.removeItem(`flow.attempt.${this.engine.seed}`); } catch { /* ignore */ }
    }
    // Share card only makes sense once the full set of 5 dailies is done.
    // recordDaily() ran above, so the just-finished puzzle is already counted.
    const dailyComplete = parsedDaily ? this.dailyDoneOn(parsedDaily.date).length >= DAILY_COUNT : false;
    const ctx: WinDialogContext = {
      stars: win.stars,
      time: fmtT(secs),
      moves: win.moves,
      perfect: win.perfect,
      hints: win.hints,
      isBest,
      nextLabel: parsedDaily ? (dailyComplete ? 'Home' : 'Next') : 'Next',
      showShare: dailyComplete,
      // Built after recording, so the just-finished puzzle is included.
      shareText: parsedDaily && dailyComplete ? this.shareText(parsedDaily.date) : null,
      // Dailies are one-shot: no Replay once played (win implies done).
      showReplay: parsedDaily ? false : true,
      onReplay: () => this.replay(),
      onNext: () => this.next(),
      onShare: () => void this.shareToday(parsedDaily?.date),
    };
    // Stable describedby id (see template span): brain skips its live DOM
    // sync when ariaDescribedBy is preset, so the container binding never
    // flips after first check - no more dev-mode NG0100 on every win.
    this.dialogRef = this.dialog.open(WinDialogComponent, {
      context: ctx,
      disableClose: true,
      ariaDescribedBy: 'flow-win-desc',
      // Fixed, appropriately-sized win modal: narrow card centered on all screens.
      // Overrides the base dialog's sm:max-w-md / sm:mx-0 via tailwind-merge.
      contentClass: 'w-[min(92vw,22rem)] sm:max-w-[22rem] sm:mx-auto',
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
    const e = this.engine;
    return this.bestKeyFor(e.seed, e.rows, e.cols);
  }

  private bestKeyFor(seed: string, rows: number, cols: number): string {
    const e = this.engine;
    // Daily geometry is canonical. Preserve existing daily and classic keys.
    const variant = parseDailySeed(seed) || (e.topo.kind === 'square' && !e.warp && !e.chain)
      ? '' : `.${e.topo.kind}.w${Number(e.warp)}.c${Number(e.chain)}`;
    return `flow.best.${seed}.s${rows}x${cols}${variant}`;
  }

  private loadBest(): Best | null {
    return this.loadBestFor(this.engine.seed, this.engine.rows, this.engine.cols);
  }

  private loadBestFor(seed: string, rows: number, cols: number): Best | null {
    try {
      const raw = localStorage.getItem(this.bestKeyFor(seed, rows, cols));
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
