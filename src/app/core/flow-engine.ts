/* Flow Free gameplay engine. Pure logic, no DOM: paths, cutting with
 * in-stroke un-cut, undo history, hints, win detection. A thin UI layer
 * (Angular component) owns rendering, persistence, sound, and timers. */

import { defaultHexPairs, defaultPairsForSize, flowChainPath, generateLevel, validateLevel } from './flow-generator';
import type { Cell, GeneratedLevel } from './flow-generator';
import { hexTopology, maskTopology, rectTopology, squareTopology } from './topology';
import type { BoardKind, Mask, Topology, WarpGates } from './topology';

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
  /** Chain session marker: color pre-claimed by a handoff, so the run's
   *  banked move covers it (burns free on first change, then clears). */
  preClaim: number | null;
  /** Handoff trail for backward un-handoff: each entry records the flow we
   *  left and the dot we left it from, so retreating across the seam pops
   *  back to fix earlier flows without releasing. */
  trail: Array<{ color: number; dot: Cell }>;
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
  /** Nominal board dimension (max of rows/cols), used for pair density. */
  size = 5;
  /** Actual square-board geometry. Equal to `size` unless the board is rectangular. */
  rows = 5;
  cols = 5;
  /** Optional shape mask (polyomino / wall boards). */
  mask: Mask | undefined = undefined;
  /** Optional interior wall cells (rendering hint; subset of blocked cells). */
  walls: Mask | undefined = undefined;
  /** Toroidal edges for square boards. */
  warp = false;
  /** Chain mode: completing a flow and dragging into an adjacent incomplete
   *  flow's dot hands the live stroke off instead of blocking. */
  chain = false;
  /** Chain funnel walls: blocked edges around the run's start/end dots (all
   *  incident edges except the solution one). Static per level; paths and
   *  snapshots never include them. Empty on non-chain boards. */
  chainWalls: Array<readonly [Cell, Cell]> = [];
  /** Canonical chain links for the renderer: [exitDot, entryDot, exitColor,
   *  entryColor] of each consecutive flow pair in chain order. Empty on
   *  non-chain boards. */
  chainLinks: Array<readonly [Cell, Cell, number, number]> = [];
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
  /** Board geometry. Square by default; hex boards set a hex topology. */
  topo: Topology = squareTopology(5);
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
    return this.topo.key(r, c);
  }

  inBounds(r: number, c: number): boolean {
    return this.topo.inBounds(r, c);
  }

  loadLevel(mode: PlayMode, levelNum = 1, seed = '', size = 7, kind: BoardKind = 'square', rows = 0, cols = 0, mask: Mask | null = null, walls: Mask | null = null, warp = false, chain = false, pairCount: number | null = null, warpGates?: WarpGates): void {
    this.mode = mode;
    if (mode === 'level') {
      this.levelNum = levelNum;
      this.seed = seedForLevel(levelNum);
      this.size = sizeForLevel(levelNum);
    } else {
      this.seed = seed;
      this.size = size;
    }
    // Rectangular square boards pass explicit rows/cols; hex boards always
    // receive both from the caller. Default to `size x size`.
    const dimension = (value: number, min: number, fallback: number): number =>
      Number.isFinite(value) ? Math.min(12, Math.max(min, Math.trunc(value))) : fallback;
    this.size = dimension(this.size, 5, 7);
    this.rows = dimension(rows || this.size, 4, this.size);
    this.cols = dimension(cols || this.size, 4, this.size);
    this.mask = kind === 'square' && mask ? mask : undefined;
    this.walls = kind === 'square' && this.mask && walls ? walls : undefined;
    this.warp = kind === 'square' && !!warp && !mask && this.rows > 2 && this.cols > 2;
    this.chain = !!chain;
    this.topo = kind === 'hex'
      ? hexTopology(this.rows, this.cols)
      : this.mask
        ? maskTopology(this.rows, this.cols, this.mask, this.walls)
        : rectTopology(this.rows, this.cols, this.warp, warpGates);
    this.warp = !!this.topo.warp;
    // Masked shapes pick their own density inside generateLevel (pass null).
    // Packs may pin the pair count per level (density rotation); customs
    // and dailies use the size default.
    const genPairs = pairCount
      ?? (kind === 'hex'
        ? defaultHexPairs(this.rows, this.cols)
        : this.mask
          ? null
          : defaultPairsForSize(Math.max(this.rows, this.cols)));
    this.numPairs = genPairs ?? defaultPairsForSize(Math.max(this.rows, this.cols));
    const opts = { kind, rows: this.rows, cols: this.cols, mask: this.mask, walls: this.walls, warp: this.warp, warpGates: this.topo.warpGates };

    let lv: GeneratedLevel | null = null;
    let fallback: GeneratedLevel | null = null;
    for (let t = 0; t < 6 && !lv; t++) {
      const salt = t === 0 ? this.seed : `${this.seed}#${t}`;
      try {
        const cand = generateLevel(salt, Math.max(this.rows, this.cols), genPairs, opts);
        if (!validateLevel(cand, this.topo).ok) continue;
        if (!this.chain || flowChainPath(cand.pairs, this.topo) !== null) {
          lv = cand;
        } else if (!fallback) {
          // Valid but not one-stroke chainable: keep as a last resort so a
          // chain board still loads (partial chains keep working).
          fallback = cand;
        }
      } catch {
        // Seed-specific carve failure: keep any previous candidate and try
        // the next salt instead of letting the exception escape.
      }
    }
    lv = lv ?? fallback;
    if (!lv) throw new Error(`level generation failed for seed ${JSON.stringify(this.seed)}`);
    this.pairs = lv.pairs;
    this.solution = lv.solution;
    // Carved (hex) boards can land a different pair count than requested;
    // perfect-play math must use the actual board.
    this.numPairs = lv.solution.length;
    // Chain funnels: wall every edge of the run's start/end dots except the
    // solution edge, so the one-stroke run can only begin/end correctly.
    // Blocked edges only ever touch the funneled dots, which no solution
    // but the chain's own uses — solvability is preserved by construction.
    this.chainWalls = [];
    this.chainLinks = [];
    if (this.chain) {
      const ch = flowChainPath(this.pairs, this.topo);
      if (ch && ch.order.length > 0) {
        const first = ch.order[0];
        this.addFunnel(this.solution[first], ch.entries[0][0]);
        const last = ch.order[ch.order.length - 1];
        this.addFunnel(this.solution[last], ch.entries[ch.entries.length - 1][1]);
        for (let k = 1; k < ch.entries.length; k++) {
          this.chainLinks.push([ch.entries[k - 1][1], ch.entries[k][0], ch.order[k - 1], ch.order[k]]);
        }
      }
    }

    this.paths = this.pairs.map(() => []);
    this.done = this.pairs.map(() => false);
    this.grid = new Array<number>(this.topo.total).fill(-1);
    this.epOf = new Map();
    this.epSet = new Set();
    this.pairs.forEach(([a, b], ci) => {
      this.epOf.set(this.key(a[0], a[1]), ci);
      this.epOf.set(this.key(b[0], b[1]), ci);
      this.epSet.add(this.key(a[0], a[1]));
      this.epSet.add(this.key(b[0], b[1]));
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

  /** True when a chain funnel wall blocks movement between two cells. */
  edgeWalled(a: Cell, b: Cell): boolean {
    return this.chainWalls.some(([x, y]) =>
      (x[0] === a[0] && x[1] === a[1] && y[0] === b[0] && y[1] === b[1]) ||
      (y[0] === a[0] && y[1] === a[1] && x[0] === b[0] && x[1] === b[1]));
  }

  /** Wall every edge of `dot` except the one continuing along `sol`. */
  private addFunnel(sol: Cell[], dot: Cell): void {
    if (sol.length < 2) return;
    const open = eq(sol[0], dot) ? sol[1]
      : eq(sol[sol.length - 1], dot) ? sol[sol.length - 2]
        : null;
    if (!open) return;
    for (const nb of this.topo.neighbors(dot[0], dot[1])) {
      if (nb[0] === open[0] && nb[1] === open[1]) continue;
      this.chainWalls.push([dot.slice() as Cell, [nb[0], nb[1]]]);
    }
  }

  rebuild(): void {
    this.grid.fill(-1);
    this.pairs.forEach(([a, b], ci) => {
      this.grid[this.key(a[0], a[1])] = ci;
      this.grid[this.key(b[0], b[1])] = ci;
    });
    this.paths.forEach((p, ci) => {
      for (const [r, c] of p) this.grid[this.key(r, c)] = ci;
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
    return Math.round((this.filledCount() / this.topo.cells) * 100);
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
    this.active = { color, last: from.slice() as Cell, breaks: [], changed: false, pid, preClaim: null, trail: [] };
    // Clearing an existing pipe is itself a board change: attribute it now.
    // A bare-dot tap changes nothing and stays free.
    if (prevLen >= 2) this.markChanged(color);
    this.rebuild();
  }

  /** Continue an existing pipe from the middle (already trimmed by caller). */
  grabStroke(color: number, from: Cell, pid: number): void {
    this.active = { color, last: from.slice() as Cell, breaks: [], changed: false, pid, preClaim: null, trail: [] };
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
    // A chain handoff pre-claims the new color for this session: the run's
    // move was banked on the previous color. Consuming the claim banks the
    // collapse state too, so every later change this session stays free.
    // (An unconsumed claim dies with the stroke, never leaking into
    // later sessions via lastCounted.)
    if (a.preClaim === color) {
      a.preClaim = null;
      this.lastCounted = color;
      return;
    }
    if (this.lastCounted !== color) {
      this.lastCounted = color;
      this.moves++;
    }
  }

  /** Pointer pressed on a cell. Returns 'stroke' when a stroke started. */
  pointerDown(r: number, c: number, pid: number): 'stroke' | 'none' {
    if (this.won || this.active || !this.inBounds(r, c)) return 'none';
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
   *  out of it keeps control to re-route the tail. Release finalizes.
   *  In chain mode a handoff swaps the active color mid-drag; the rest of
   *  the drag keeps routing toward the same target under the new color. */
  pointerMove(r: number, c: number, pid: number): void {
    if (!this.active || pid !== this.active.pid) return;
    if (!this.inBounds(r, c)) return;
    const target: Cell = [r, c];
    for (let hop = 0; hop <= this.numPairs; hop++) {
      const a = this.active;
      if (!a) break;
      if (a.last[0] === target[0] && a.last[1] === target[1]) break;
      const color = a.color;
      const steps = this.stepsBetween(a.last, target, color);
      if (steps.length === 0) break;
      let advanced = false;
      for (const s of steps) {
        if (!this.applyStep(color, s)) break;
        advanced = true;
        if (!this.active) break;
        this.active.last = s.slice() as Cell;
        this.active.changed = true;
        if (this.active.color !== color) break; // handoff: re-route below
      }
      if (!advanced) break;
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
    // Topology-generic walk that prefers NOT cutting rival pipes: at each
    // step, among the options that get closer to the target, step onto the
    // free cell (empty, own pipe, or own dot). A directly-targeted rival
    // cell is still taken on the final step, so deliberate cuts keep working.
    const out: Cell[] = [];
    let cur: Cell = from.slice() as Cell;
    const guard = this.topo.total + 8;
    const isFree = (rr: number, cc: number): boolean => {
      if (!this.inBounds(rr, cc)) return false;
      if (this.edgeWalled(cur, [rr, cc] as Cell)) return false;
      const k = this.key(rr, cc);
      if (this.paths[color].some(([pr, pc]) => pr === rr && pc === cc)) return true;
      const epc = this.epOf.get(k);
      if (epc !== undefined) return epc === color;
      return this.grid[k] === -1;
    };
    for (let g = 0; g < guard; g++) {
      if (cur[0] === to[0] && cur[1] === to[1]) break;
      const opts = this.topo.stepOptions(cur, to);
      if (opts.length === 0) break;
      let next: Cell | null = null;
      for (const o of opts) {
        if (isFree(o[0], o[1])) {
          next = o;
          break;
        }
      }
      if (!next) next = opts[0];
      cur = next;
      out.push([cur[0], cur[1]]);
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
    if (!this.topo.neighbors(head[0], head[1]).some(([rr, cc]) => rr === r && cc === c)) return false;
    // Chain funnel walls block every incident edge of the run's start/end
    // dots except the solution one (retreating along own pipe is above).
    if (this.edgeWalled(head, [r, c] as Cell)) {
      this.events.push('blocked');
      return false;
    }

    const epc = this.epOf.get(this.key(r, c));
    if (epc !== undefined && epc !== color) {
      // Backward un-handoff: retreated to the entry dot and stepping back
      // into the flow we came from pops the trail and resumes it.
      const top = this.active.trail[this.active.trail.length - 1];
      if (
        top && epc === top.color && r === top.dot[0] && c === top.dot[1] &&
        path.length <= 1
      ) {
        this.unhandoff();
        return true;
      }
      // Chain handoff: the completed flow's head stepped into an adjacent
      // incomplete flow's dot, so the same stroke continues in the new color
      // (same pid, history entry, and move).
      if (this.chain && this.done[color] && !this.done[epc]) {
        this.handoff(epc, [r, c]);
        return true;
      }
      this.events.push('blocked');
      return false; // other dots are walls
    }
    // Connected flows are capped at their dot: stepping back along the pipe
    // stays live (handled above), but pushing past the endpoint is refused.
    if (this.done[color]) return false;
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

  /** Chain handoff: seed the next flow at its dot and keep the stroke alive
   *  under the same pid. No history push (the whole chain undoes as one
   *  action); the run's move stays banked via a pre-claim on the new color.
   *  The flow we leave is pushed on the trail for backward un-handoff. */
  private handoff(color: number, dot: Cell): void {
    const a = this.active;
    const pid = a ? a.pid : 0;
    const trail = a ? a.trail : [];
    if (a) trail.push({ color: a.color, dot: a.last.slice() as Cell });
    this.paths[color] = [dot.slice() as Cell];
    this.active = { color, last: dot.slice() as Cell, breaks: [], changed: true, pid, preClaim: color, trail };
    this.rebuild();
  }

  /** Backward un-handoff: the head retreated to its entry dot and stepped
   *  back into the flow it came from. Pop the trail, clear the stub, and
   *  resume the previous flow (re-claimed for the session) so earlier
   *  flows can be re-routed without releasing. */
  private unhandoff(): void {
    const a = this.active;
    if (!a || a.trail.length === 0) return;
    const top = a.trail.pop() as { color: number; dot: Cell };
    this.paths[a.color] = [];
    this.active = {
      color: top.color,
      last: top.dot.slice() as Cell,
      breaks: [],
      changed: true,
      pid: a.pid,
      preClaim: top.color,
      trail: a.trail,
    };
    this.rebuild();
  }

  undo(): boolean {
    const snap = this.history.pop();
    if (!snap) return false;
    const moves = this.moves;
    const hints = this.hints;
    this.restore(snap);
    this.moves = moves;
    this.hints = hints;
    this.lastCounted = null;
    this.active = null;
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
    this.active = null;
    this.won = false;
    this.win = null;
    this.rebuild();
    return true;
  }

  clearColor(ci: number): boolean {
    if (this.won) return false;
    if (this.paths[ci].length === 0) return false;
    this.pushHistory();
    this.paths[ci] = [];
    this.moves++;
    this.lastCounted = null;
    this.active = null;
    this.rebuild();
    return true;
  }

  /** Reveal the longest unconnected flow (cuts conflicting pipes). */
  hint(): number {
    if (this.won) return -1;
    const open = this.done.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    if (!open.length) return -1;
    open.sort((a, b) => this.solution[b].length - this.solution[a].length);
    const ci = open[0];
    this.pushHistory();
    const want = this.solution[ci];
    const wantSet = new Set(want.map(([r, c]) => this.key(r, c)));
    this.paths.forEach((p, oi) => {
      if (oi === ci) return;
      const cut = p.findIndex(([r, c]) => wantSet.has(this.key(r, c)) && !this.epSet.has(this.key(r, c)));
      if (cut >= 0) this.paths[oi] = p.slice(0, Math.max(0, cut));
    });
    this.paths[ci] = want.map((cell) => cell.slice() as Cell);
    this.hints++;
    this.lastCounted = null;
    this.active = null;
    this.rebuild();
    this.checkWin();
    return ci;
  }

  checkWin(): boolean {
    if (this.won) return true;
    if (!this.done.every(Boolean)) return false;
    if (this.filledCount() !== this.topo.cells) return false;
    this.won = true;
    // Chain boards are one-stroke puzzles: perfect demands the single move.
    const perfect = (this.chain ? this.moves <= 1 : this.moves <= this.numPairs) && this.hints === 0;
    this.win = { moves: this.moves, hints: this.hints, perfect, stars: perfect ? 3 : 1 };
    return true;
  }
}
