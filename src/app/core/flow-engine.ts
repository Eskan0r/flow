/* Flow Free gameplay engine. Pure logic, no DOM: paths, cutting with
 * in-stroke un-cut, undo history, hints, win detection. A thin UI layer
 * (Angular component) owns rendering, persistence, sound, and timers. */

import { defaultPairsForSize, generateLevel, validateLevel } from './flow-generator';
import type { Cell } from './flow-generator';

export type PlayMode = 'level' | 'seed';

export interface StrokeBreak {
  color: number;
  removed: Cell[];
  atLen: number;
}

export interface ActiveStroke {
  color: number;
  last: Cell;
  breaks: StrokeBreak[];
  changed: boolean;
  pid: number;
}

export interface EngineSnapshot {
  paths: Cell[][];
  moves: number;
  hints: number;
  lastCounted: number | null;
}

export interface WinInfo {
  moves: number;
  hints: number;
  perfect: boolean;
  /** 3 = perfect (minimum moves), 1 = completed. No middle grade. */
  stars: 1 | 3;
}

export function sizeForLevel(n: number): number {
  if (n <= 5) return 5;
  if (n <= 12) return 6;
  if (n <= 22) return 7;
  if (n <= 34) return 8;
  if (n <= 48) return 9;
  return 10;
}

export function seedForLevel(n: number): string {
  return `flow-level-${n}`;
}

const WORDS_A = ['coral', 'sunrise', 'nebula', 'willow', 'ember', 'meadow', 'cobalt', 'harbor', 'maple', 'onyx'];
const WORDS_B = ['fox', 'river', 'comet', 'grove', 'tide', 'sparrow', 'lantern', 'drift', 'zephyr'];

export function randomSeed(rnd: () => number = Math.random): string {
  const a = WORDS_A[Math.floor(rnd() * WORDS_A.length)];
  const b = WORDS_B[Math.floor(rnd() * WORDS_B.length)];
  return `${a}-${b}-${Math.floor(rnd() * 90 + 10)}`;
}

const eq = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

export class FlowEngine {
  mode: PlayMode = 'level';
  levelNum = 1;
  seed = 'flow-level-1';
  size = 5;
  numPairs = 4;
  pairs: [Cell, Cell][] = [];
  solution: Cell[][] = [];

  paths: Cell[][] = [];
  done: boolean[] = [];
  grid: number[] = [];
  epOf = new Map<number, number>();
  epSet = new Set<number>();

  moves = 0;
  hints = 0;
  /** Color of the last counted session (null = none yet). */
  lastCounted: number | null = null;
  won = false;
  win: WinInfo | null = null;
  history: EngineSnapshot[] = [];
  active: ActiveStroke | null = null;
  /** Sound-worthy happenings since last drain: 'complete:i' | 'cut' | 'blocked'. */
  events: string[] = [];

  drainEvents(): string[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  key(r: number, c: number): number {
    return r * this.size + c;
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  loadLevel(mode: PlayMode, levelNum = 1, seed = '', size = 7): void {
    this.mode = mode;
    if (mode === 'level') {
      this.levelNum = levelNum;
      this.seed = seedForLevel(levelNum);
      this.size = sizeForLevel(levelNum);
    } else {
      this.seed = seed;
      this.size = size;
    }
    this.numPairs = defaultPairsForSize(this.size);

    let lv = generateLevel(this.seed, this.size, this.numPairs);
    for (let t = 1; t < 6 && !validateLevel(lv).ok; t++) {
      lv = generateLevel(`${this.seed}#${t}`, this.size, this.numPairs);
      if (validateLevel(lv).ok) this.seed = `${this.seed}#${t}`;
    }
    this.pairs = lv.pairs;
    this.solution = lv.solution;

    this.paths = this.pairs.map(() => []);
    this.done = this.pairs.map(() => false);
    this.grid = new Array<number>(this.size * this.size).fill(-1);
    this.epOf = new Map();
    this.epSet = new Set();
    this.pairs.forEach(([a, b], ci) => {
      this.epOf.set(a[0] * this.size + a[1], ci);
      this.epOf.set(b[0] * this.size + b[1], ci);
      this.epSet.add(a[0] * this.size + a[1]);
      this.epSet.add(b[0] * this.size + b[1]);
    });
    this.rebuild();
    this.moves = 0;
    this.hints = 0;
    this.lastCounted = null;
    this.won = false;
    this.win = null;
    this.history = [];
    this.active = null;
    this.events = [];
  }

  rebuild(): void {
    const n = this.size;
    this.grid.fill(-1);
    this.pairs.forEach(([a, b], ci) => {
      this.grid[a[0] * n + a[1]] = ci;
      this.grid[b[0] * n + b[1]] = ci;
    });
    this.paths.forEach((p, ci) => {
      for (const [r, c] of p) this.grid[r * n + c] = ci;
    });
    this.pairs.forEach(([a, b], ci) => {
      const p = this.paths[ci];
      const was = this.done[ci];
      if (p.length >= 2) {
        const f = p[0];
        const l = p[p.length - 1];
        this.done[ci] = (eq(f, a) && eq(l, b)) || (eq(f, b) && eq(l, a));
        if (this.done[ci] && !was) this.events.push(`complete:${ci}`);
      } else {
        this.done[ci] = false;
      }
    });
  }

  filledCount(): number {
    let n = 0;
    for (const v of this.grid) if (v !== -1) n++;
    return n;
  }

  filledPct(): number {
    return Math.round((this.filledCount() / (this.size * this.size)) * 100);
  }

  connectedCount(): number {
    return this.done.filter(Boolean).length;
  }

  snapshot(): EngineSnapshot {
    return {
      paths: this.paths.map((p) => p.map((c) => c.slice() as Cell)),
      moves: this.moves,
      hints: this.hints,
      lastCounted: this.lastCounted,
    };
  }

  restore(snap: EngineSnapshot): void {
    this.paths = snap.paths.map((p) => p.map((c) => c.slice() as Cell));
    this.moves = snap.moves;
    this.hints = snap.hints;
    this.lastCounted = snap.lastCounted;
    this.rebuild();
  }

  pushHistory(): void {
    this.history.push(this.snapshot());
    if (this.history.length > 200) this.history.shift();
  }

  /** Begin (or restart) a stroke from an endpoint cell. */
  startStroke(color: number, from: Cell, pid: number): void {
    this.pushHistory();
    const prevLen = this.paths[color].length;
    this.paths[color] = [from.slice() as Cell];
    this.active = { color, last: from.slice() as Cell, breaks: [], changed: false, pid };
    // Clearing an existing pipe is itself a board change: attribute it now.
    // A bare-dot tap changes nothing and stays free.
    if (prevLen >= 2) this.markChanged(color);
    this.rebuild();
  }

  /** Continue an existing pipe from the middle (already trimmed by caller). */
  grabStroke(color: number, from: Cell, pid: number): void {
    this.active = { color, last: from.slice() as Cell, breaks: [], changed: false, pid };
  }

  /* Moves are session-collapsed: consecutive strokes on the same color cost
   * one move total; touching a different color banks a new move. So a color
   * drawn across several releases still costs one — as long as no other
   * color was touched in between. Counting happens at the first real board
   * change, never on release, so no delivery quirk can undercount visible
   * play on any surface. */
  private markChanged(color: number): void {
    const a = this.active;
    if (!a) return;
    a.changed = true;
    if (this.lastCounted !== color) {
      this.lastCounted = color;
      this.moves++;
    }
  }

  /** Pointer pressed on a cell. Returns 'stroke' when a stroke started. */
  pointerDown(r: number, c: number, pid: number): 'stroke' | 'none' {
    if (this.won || !this.inBounds(r, c)) return 'none';
    const k = this.key(r, c);
    const epColor = this.epOf.get(k);
    if (epColor !== undefined) {
      this.startStroke(epColor, [r, c], pid);
      return 'stroke';
    }
    const occupant = this.grid[k];
    if (occupant >= 0) {
      const p = this.paths[occupant];
      const idx = p.findIndex(([pr, pc]) => pr === r && pc === c);
      if (idx >= 0) {
        this.pushHistory();
        const trimmed = idx < p.length - 1;
        this.paths[occupant] = p.slice(0, idx + 1);
        this.rebuild();
        this.grabStroke(occupant, [r, c], pid);
        if (trimmed) this.markChanged(occupant);
        return 'stroke';
      }
    }
    return 'none';
  }

  /** Pointer moved; engine interpolates orthogonally cell-by-cell.
   *  Reaching the matching dot connects the flow, but the stroke stays
   *  alive: it cannot be dragged past the dot (capped), yet dragging back
   *  out of it keeps control to re-route the tail. Release finalizes. */
  pointerMove(r: number, c: number, pid: number): void {
    if (!this.active || pid !== this.active.pid) return;
    if (!this.inBounds(r, c)) return;
    const last = this.active.last;
    if (r === last[0] && c === last[1]) return;
    const color = this.active.color;
    for (const s of this.stepsBetween(last, [r, c], color)) {
      if (!this.applyStep(color, s)) break;
      this.active.last = s.slice() as Cell;
      this.active.changed = true;
    }
    this.rebuild();
  }

  /** Pointer released. Moves were already counted at first change;
   *  this only drops no-op strokes, then checks the win. */
  pointerUp(pid: number): boolean {
    if (!this.active || pid !== this.active.pid) return false;
    const changed = this.active.changed;
    this.active = null;
    if (!changed && this.history.length) this.history.pop();
    this.rebuild();
    this.checkWin();
    return changed;
  }

  cancelStroke(pid: number): void {
    if (!this.active || pid !== this.active.pid) return;
    this.active = null;
    this.rebuild();
  }

  private stepsBetween(from: Cell, to: Cell, color: number): Cell[] {
    // Orthogonal walk that prefers NOT cutting rival pipes: at each step,
    // when both axis moves are available, step onto the free cell (empty,
    // own pipe, or own dot). A directly-targeted rival cell is still taken
    // on the final step, so deliberate cuts keep working.
    const out: Cell[] = [];
    let r = from[0];
    let c = from[1];
    const [tr, tc] = to;
    let guard = this.size * 2 + 4;
    const isFree = (rr: number, cc: number): boolean => {
      if (!this.inBounds(rr, cc)) return false;
      const k = rr * this.size + cc;
      if (this.paths[color].some(([pr, pc]) => pr === rr && pc === cc)) return true;
      const epc = this.epOf.get(k);
      if (epc !== undefined) return epc === color;
      return this.grid[k] === -1;
    };
    while ((r !== tr || c !== tc) && guard-- > 0) {
      const dr = tr - r;
      const dc = tc - c;
      let first: Cell | null = null;
      let second: Cell | null = null;
      if (Math.abs(dr) >= Math.abs(dc) && dr !== 0) {
        first = [r + Math.sign(dr), c];
        if (dc !== 0) second = [r, c + Math.sign(dc)];
      } else if (dc !== 0) {
        first = [r, c + Math.sign(dc)];
        if (dr !== 0) second = [r + Math.sign(dr), c];
      } else if (dr !== 0) {
        first = [r + Math.sign(dr), c];
      } else {
        break;
      }
      let next: Cell;
      if (first && second) {
        const f1 = isFree(first[0], first[1]);
        const f2 = isFree(second[0], second[1]);
        next = f1 && !f2 ? first : !f1 && f2 ? second : first;
      } else {
        next = (first ?? second) as Cell;
      }
      r = next[0];
      c = next[1];
      out.push([r, c]);
    }
    return out;
  }

  /** Advance one cell. Returns false when blocked. Exported for tests. */
  applyStep(color: number, s: Cell): boolean {
    const [r, c] = s;
    if (!this.inBounds(r, c) || !this.active) return false;
    const path = this.paths[color];
    const head = path[path.length - 1];
    if (!head) return false;

    const existingIdx = path.findIndex(([pr, pc]) => pr === r && pc === c);
    if (existingIdx >= 0) {
      if (path.length - 1 > existingIdx) {
        this.markChanged(color);
        while (path.length - 1 > existingIdx) {
          path.pop();
          while (
            this.active.breaks.length &&
            this.active.breaks[this.active.breaks.length - 1].atLen > path.length
          ) {
            const br = this.active.breaks.pop() as StrokeBreak;
            this.paths[br.color] = this.paths[br.color].concat(br.removed);
          }
        }
      }
      this.rebuild();
      return true;
    }
    if (Math.abs(head[0] - r) + Math.abs(head[1] - c) !== 1) return false;

    // Connected flows are capped at their dot: stepping back along the pipe
    // stays live (handled above), but pushing past the endpoint is refused.
    if (this.done[color]) return false;

    const epc = this.epOf.get(this.key(r, c));
    if (epc !== undefined && epc !== color) {
      this.events.push('blocked');
      return false; // other dots are walls
    }
    const occ = this.grid[this.key(r, c)];
    if (occ === -1 || epc === color) {
      this.markChanged(color);
      path.push([r, c]);
      this.rebuild();
      return true;
    }
    if (occ === color) return false;
    const op = this.paths[occ];
    const k = op.findIndex(([pr, pc]) => pr === r && pc === c);
    if (k <= 0) {
      this.events.push('blocked');
      return false;
    }
    const removed = op.slice(k);
    this.paths[occ] = op.slice(0, k);
    this.active.breaks.push({ color: occ, removed, atLen: path.length + 1 });
    this.markChanged(color);
    path.push([r, c]);
    this.events.push('cut');
    this.rebuild();
    return true;
  }

  undo(): boolean {
    const snap = this.history.pop();
    if (!snap) return false;
    this.restore(snap);
    this.moves = snap.moves + 1;
    this.rebuild();
    this.won = false;
    this.win = null;
    return true;
  }

  reset(): boolean {
    if (this.paths.every((p) => p.length === 0)) return false;
    this.pushHistory();
    this.paths = this.pairs.map(() => []);
    this.moves = 0;
    this.lastCounted = null;
    this.won = false;
    this.win = null;
    this.rebuild();
    return true;
  }

  clearColor(ci: number): boolean {
    if (this.paths[ci].length === 0) return false;
    this.pushHistory();
    this.paths[ci] = [];
    this.moves++;
    this.rebuild();
    return true;
  }

  /** Reveal the longest unconnected flow (cuts conflicting pipes). */
  hint(): number {
    const open = this.done.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    if (!open.length) return -1;
    open.sort((a, b) => this.solution[b].length - this.solution[a].length);
    const ci = open[0];
    this.pushHistory();
    const want = this.solution[ci];
    const wantSet = new Set(want.map(([r, c]) => r * this.size + c));
    this.paths.forEach((p, oi) => {
      if (oi === ci) return;
      const cut = p.findIndex(([r, c]) => wantSet.has(r * this.size + c) && !this.epSet.has(r * this.size + c));
      if (cut >= 0) this.paths[oi] = p.slice(0, Math.max(0, cut));
    });
    this.paths[ci] = want.map((cell) => cell.slice() as Cell);
    this.hints++;
    this.rebuild();
    this.checkWin();
    return ci;
  }

  checkWin(): boolean {
    if (this.won) return true;
    if (!this.done.every(Boolean)) return false;
    if (this.filledCount() !== this.size * this.size) return false;
    this.won = true;
    const perfect = this.moves <= this.numPairs && this.hints === 0;
    this.win = { moves: this.moves, hints: this.hints, perfect, stars: perfect ? 3 : 1 };
    return true;
  }
}
