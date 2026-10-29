/* The game board: black canvas, flat dots, solid pipes on square grids and
 * hexagonal tiles. Pointer input with swipe interpolation drives the
 * FlowEngine via FlowStore. */

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { FlowStore } from '../core/flow-store';
import { hexCellCenter, hexCornerOffsets, hexLayout, hexPixelToCell } from '../core/topology';
import type { Cell, HexLayout } from '../core/topology';

const PALETTE = [
  '#ff2222', '#7ac943', '#29a8ff', '#ffe135', '#ff8c00', '#b04df0',
  '#3fd9c8', '#ff4fa3', '#9c6b30', '#ffffff', '#c6ff00', '#ff6a00',
  '#00e676', '#f48fb1',
];

/** Hex color with an alpha channel for washes and glows. */
function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

@Component({
  selector: 'flow-board',
  template: `
    <div #wrap class="flex h-full w-full items-center justify-center">
      <canvas
        #canvas
        data-testid="board"
        class="block cursor-crosshair touch-none select-none"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="onCancel($event)"
        (lostpointercapture)="onCancel($event)"
        (contextmenu)="onMenu($event)"
      ></canvas>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent implements AfterViewInit, OnDestroy {
  private readonly store = inject(FlowStore);
  private readonly zone = inject(NgZone);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly wrapRef = viewChild<ElementRef<HTMLDivElement>>('wrap');

  private cssW = 300;
  private cssH = 300;
  private hexLay: HexLayout | null = null;
  private ro: ResizeObserver | null = null;
  private warpGhost: HTMLCanvasElement | null = null;

  constructor() {
    // Repaint whenever the store reports an engine mutation (new level,
    // undo, reset, hint, win). Pointer drags repaint themselves directly.
    // Guards handle the pre-view-init run where canvas/wrap don't exist yet.
    effect(() => {
      this.store.renderTick();
      this.fit();
    });
  }

  ngAfterViewInit(): void {
    this.fit();
    this.draw();
    if (typeof ResizeObserver !== 'undefined' && this.wrapRef()?.nativeElement) {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(this.wrapRef()?.nativeElement as Element);
    }
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.fit();
  }

  /** Redraw after external state changes (undo/reset/hint/new level). */
  redraw(): void {
    this.draw();
  }

  private fit(): void {
    const wrap = this.wrapRef()?.nativeElement;
    const canvas = this.canvasRef()?.nativeElement;
    if (!wrap || !canvas) return;
    const r = wrap.getBoundingClientRect();
    const availW = r.width || 320;
    const availH = r.height || 320;
    const e = this.store.engine;
    let w: number;
    let h: number;
    if (e.topo.kind === 'hex') {
      const unit = hexLayout(e.topo.rows, e.topo.cols, 1);
      const s = Math.max(8, Math.floor(Math.min(availW / unit.w, availH / unit.h)));
      this.hexLay = hexLayout(e.topo.rows, e.topo.cols, s);
      w = Math.floor(this.hexLay.w);
      h = Math.floor(this.hexLay.h);
    } else {
      this.hexLay = null;
      // Warp boards reserve half a cell of margin on every side for the
      // mirrored, fading continuation of wrapped pipes.
      const extra = e.topo.warp ? 1 : 0;
      const cell = Math.max(16, Math.floor(Math.min(availW / (e.topo.cols + extra), availH / (e.topo.rows + extra))));
      w = cell * (e.topo.cols + extra);
      h = cell * (e.topo.rows + extra);
    }
    this.cssW = w;
    this.cssH = h;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const pixelW = Math.round(w * dpr);
    const pixelH = Math.round(h * dpr);
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
    this.draw();
  }

  private center(r: number, c: number): [number, number] {
    const e = this.store.engine;
    if (e.topo.kind === 'hex' && this.hexLay) {
      const p = hexCellCenter(this.hexLay, r, c);
      return [p.x, p.y];
    }
    const m = this.squareMetrics();
    return [m.ox + (c + 0.5) * m.w, m.oy + (r + 0.5) * m.h];
  }

  /** Square-grid pixel metrics. Warp boards keep a half-cell margin around
   *  the board (the ghost bleed lives there), so the origin is offset. */
  private squareMetrics(): { w: number; h: number; ox: number; oy: number } {
    const e = this.store.engine;
    const extra = e.topo.warp ? 1 : 0;
    const w = this.cssW / (e.topo.cols + extra);
    const h = this.cssH / (e.topo.rows + extra);
    return { w, h, ox: e.topo.warp ? w / 2 : 0, oy: e.topo.warp ? h / 2 : 0 };
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const e = this.store.engine;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.cssW, this.cssH);

    let pipeW: number;
    let dotR: number;
    let edge: number;
    if (e.topo.kind === 'hex' && this.hexLay) {
      this.drawHexGrid(g);
      const s = this.hexLay.s;
      pipeW = s * 1.04;
      dotR = s * 0.52;
      edge = s * 0.12;
    } else {
      if (e.chain) this.drawChainTint(g);
      if (e.topo.mask) this.drawPolyGrid(g);
      else if (!e.topo.warp) this.drawSquareGrid(g);
      const m = this.squareMetrics();
      const cell = Math.min(m.w, m.h);
      pipeW = cell * 0.62;
      dotR = cell * 0.31;
      edge = 3;
    }

    const drawFlows = (ctx: CanvasRenderingContext2D): void => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.paintChainTunnels(ctx, dotR);
      for (let i = 0; i < e.numPairs; i++) {
        const path = e.paths[i];
        if (path.length < 2) continue;
        const col = PALETTE[i % PALETTE.length];
        const strokes = this.pathStrokes(path);
        const paint = (width: number, style: string): void => {
          ctx.lineWidth = width;
          ctx.strokeStyle = style;
          for (const pts of strokes) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
            ctx.stroke();
          }
        };
        paint(pipeW + edge, 'rgba(0,0,0,0.55)');
        paint(pipeW, col);
      }
      for (let i = 0; i < e.numPairs; i++) {
        const col = PALETTE[i % PALETTE.length];
        for (let k = 0; k < 2; k++) {
          const [x, y] = this.center(e.pairs[i][k][0], e.pairs[i][k][1]);
          ctx.beginPath();
          ctx.arc(x, y, dotR + edge * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          if (e.done[i]) {
            ctx.beginPath();
            ctx.arc(x, y, dotR + edge * 1.2, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
      if (e.active) {
        const [x, y] = this.center(e.active.last[0], e.active.last[1]);
        ctx.beginPath();
        ctx.arc(x, y, dotR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    };
    if (e.topo.warp) {
      this.drawWarpSeams(g, drawFlows);
    } else {
      drawFlows(g);
    }
    if (e.chain) this.drawChainWalls(g);
  }

  /** Chain tunnels: color-to-color bridges between the canonical link dots
   *  (exit of one flow blending into the entry of the next). One dot-radius
   *  wide and twice the gap long (tucked under both dots), painted first so
   *  pipes and dots sit on top of the joints. */
  private paintChainTunnels(ctx: CanvasRenderingContext2D, dotR: number): void {
    const e = this.store.engine;
    if (e.topo.kind !== 'square' || e.chainLinks.length === 0) return;
    ctx.save();
    ctx.lineWidth = dotR;
    ctx.lineCap = 'butt';
    for (const [a, b, ca, cb] of e.chainLinks) {
      const dr = b[0] - a[0];
      const dc = b[1] - a[1];
      if (Math.abs(dr) + Math.abs(dc) !== 1) continue; // wrapped link: enforced, not drawn
      const [ax, ay] = this.center(a[0], a[1]);
      const [bx, by] = this.center(b[0], b[1]);
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // Gradient spans rim to rim; the stroke runs double the gap so its
      // ends hide under the dots (gradient end colors clamp beyond stops).
      const fx = ax + ux * dotR;
      const fy = ay + uy * dotR;
      const tx = bx - ux * dotR;
      const ty = by - uy * dotR;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const half = Math.hypot(tx - fx, ty - fy);
      const grad = ctx.createLinearGradient(fx, fy, tx, ty);
      grad.addColorStop(0, PALETTE[ca % PALETTE.length]);
      grad.addColorStop(1, PALETTE[cb % PALETTE.length]);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(mx - ux * half, my - uy * half);
      ctx.lineTo(mx + ux * half, my + uy * half);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Chain territory wash: each owned cell tinted its flow's color under the
   *  grid and pipes (chain boards only). */
  private drawChainTint(g: CanvasRenderingContext2D): void {
    const e = this.store.engine;
    if (e.topo.kind !== 'square') return;
    const m = this.squareMetrics();
    for (let r = 0; r < e.topo.rows; r++) {
      for (let c = 0; c < e.topo.cols; c++) {
        const ci = e.grid[e.key(r, c)];
        if (ci < 0) continue;
        g.fillStyle = hexA(PALETTE[ci % PALETTE.length], 0.15);
        g.fillRect(m.ox + c * m.w, m.oy + r * m.h, m.w + 0.5, m.h + 0.5);
      }
    }
  }

  /** Chain funnel walls: cream brackets on the blocked edges around the
   *  run's start/end dots (square boards only; logic holds everywhere). */
  private drawChainWalls(g: CanvasRenderingContext2D): void {
    const e = this.store.engine;
    if (e.topo.kind !== 'square' || e.chainWalls.length === 0) return;
    const m = this.squareMetrics();
    g.save();
    g.strokeStyle = 'rgba(240, 226, 182, 0.92)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.shadowColor = 'rgba(240, 226, 182, 0.5)';
    g.shadowBlur = 4;
    g.beginPath();
    for (const [a, b] of e.chainWalls) {
      const dr = Math.abs(a[0] - b[0]);
      const dc = Math.abs(a[1] - b[1]);
      if (dr + dc !== 1) continue; // wrapped seam edge: enforced, not drawn
      if (dr === 0) {
        const x = m.ox + Math.max(a[1], b[1]) * m.w;
        const y = m.oy + a[0] * m.h;
        g.moveTo(x, y + 2);
        g.lineTo(x, y + m.h - 2);
      } else {
        const y = m.oy + Math.max(a[0], b[0]) * m.h;
        const x = m.ox + a[1] * m.w;
        g.moveTo(x + 2, y);
        g.lineTo(x + m.w - 2, y);
      }
    }
    g.stroke();
    g.restore();
  }

  /** Warp boards: the board reads as a window on a torus. The interior stays
   *  fully opaque up to a glowing dashed frame; past each seam a half-cell
   *  margin shows the opposite edge's content mirrored, fading outward. */
  private drawWarpSeams(
    g: CanvasRenderingContext2D,
    drawFlows: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const e = this.store.engine;
    const W = this.cssW;
    const H = this.cssH;
    const m = this.squareMetrics();
    const bw = e.topo.cols * m.w;
    const bh = e.topo.rows * m.h;

    // Ghost layer: all eight translated copies of the flow content. Each
    // margin slice therefore shows the continuation from the opposite seam.
    // Axis tiles are clipped to their straight bands: without this, three
    // tiles would overlap in each corner square and only the diagonal one
    // is torus-correct there. Diagonals touch only their corner square.
    const cc = this.warpGhostLayer(canvas.width, canvas.height);
    if (!cc) return;
    cc.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        cc.save();
        // Clip diagonal copies too: wrapped stroke stubs extend beyond
        // their source tile and otherwise bleed into the adjacent bands,
        // painting rounded caps and dark outlines over another copy.
        const x = i < 0 ? 0 : i > 0 ? m.ox + bw : m.ox;
        const y = j < 0 ? 0 : j > 0 ? m.oy + bh : m.oy;
        cc.beginPath();
        cc.rect(x, y, i === 0 ? bw : m.ox, j === 0 ? bh : m.oy);
        cc.clip();
        cc.translate(i * bw, j * bh);
        drawFlows(cc);
        cc.restore();
      }
    }
    this.fadeWarpGhost(cc, W, H, m.ox, m.oy);

    g.drawImage(cc.canvas, 0, 0, cc.canvas.width, cc.canvas.height, 0, 0, W, H);

    // The real board paints last and opaque, clipped at the seams, so the
    // ghosts can never sit on top of the live board or the active head.
    g.save();
    g.beginPath();
    g.rect(m.ox, m.oy, bw, bh);
    g.clip();
    g.fillStyle = '#000';
    g.fillRect(m.ox, m.oy, bw, bh);
    this.drawSquareGrid(g, false);
    drawFlows(g);
    g.restore();
    this.drawWarpFrame(g, m.w, m.h, m.ox, m.oy, bw, bh);
  }

  /** Cached offscreen layer for the warp ghost composite (cleared per use). */
  private warpGhostLayer(w: number, h: number): CanvasRenderingContext2D | null {
    let cv = this.warpGhost;
    if (!cv) {
      cv = document.createElement('canvas');
      this.warpGhost = cv;
    }
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
    }
    return ctx;
  }

  /** Limits the ghost layer to the margins outside the board and fades it
   *  outward. The ghost holds peak through the inner part of the margin and
   *  only dissolves near the outer edge. Both passes fill the whole canvas
   *  so 'destination-in' multiplies alpha instead of clearing it; the two
   *  peaks multiply, so 0.65 per pass lands the seam at ~0.42 (a readable
   *  mirror that still sits clearly under the board). */
  private fadeWarpGhost(cc: CanvasRenderingContext2D, W: number, H: number, mx: number, my: number): void {
    const zero = 'rgba(0,0,0,0)';
    const peak = 'rgba(0,0,0,1)';
    // Fraction of the margin that holds peak before the fade-out begins.
    const hold = 0.45;
    const hg = cc.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, zero);
    hg.addColorStop((mx / W) * hold, peak);
    hg.addColorStop(mx / W, peak);
    hg.addColorStop(1 - mx / W, peak);
    hg.addColorStop(1 - (mx / W) * hold, peak);
    hg.addColorStop(1, zero);
    const vg = cc.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, zero);
    vg.addColorStop((my / H) * hold, peak);
    vg.addColorStop(my / H, peak);
    vg.addColorStop(1 - my / H, peak);
    vg.addColorStop(1 - (my / H) * hold, peak);
    vg.addColorStop(1, zero);
    cc.globalCompositeOperation = 'destination-in';
    cc.fillStyle = hg;
    cc.fillRect(0, 0, W, H);
    cc.fillStyle = vg;
    cc.fillRect(0, 0, W, H);
    cc.globalCompositeOperation = 'source-over';
  }

  /** Glowing dashed border marking the warp seams (all four sides wrap). */
  private drawWarpFrame(
    g: CanvasRenderingContext2D,
    cellW: number,
    cellH: number,
    ox: number,
    oy: number,
    bw: number,
    bh: number,
  ): void {
    g.save();
    g.lineCap = 'round';
    g.setLineDash([cellW * 0.22, cellW * 0.16]);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.shadowColor = 'rgba(150,190,255,0.8)';
    g.shadowBlur = 8;
    g.strokeRect(ox + 1, oy + 1, bw - 2, bh - 2);
    g.restore();
  }

  /** Pixel polylines for a flow, one stroke per seam-to-seam run. A step that
   *  wraps ends its stroke with a stub to the seam it exits and starts the
   *  next stroke with a stub from the opposite seam, so every point stays
   *  within half a cell of its true cell: the board clip keeps the whole
   *  flow opaque and only the margin bleed stays dim. Without the split,
   *  points after a wrap would stay displaced by a full board and the
   *  wrapped continuation would only survive as a ghost. */
  private pathStrokes(path: Cell[]): Array<Array<[number, number]>> {
    const e = this.store.engine;
    // Hex cells don't sit on a rectangular lattice (odd-r rows are offset),
    // so delta accumulation doesn't apply: map each cell to its center.
    if (e.topo.kind === 'hex') return [path.map(([r, c]) => this.center(r, c))];
    const warp = !!e.topo.warp;
    const m = this.squareMetrics();
    const strokes: Array<Array<[number, number]>> = [[this.center(path[0][0], path[0][1])]];
    for (let k = 1; k < path.length; k++) {
      const [pr, pc] = path[k - 1];
      const [r, c] = path[k];
      let dr = r - pr;
      let dc = c - pc;
      let wrapped = false;
      if (warp) {
        const rawR = dr;
        const rawC = dc;
        if (dr > e.topo.rows / 2) dr -= e.topo.rows;
        else if (dr < -e.topo.rows / 2) dr += e.topo.rows;
        if (dc > e.topo.cols / 2) dc -= e.topo.cols;
        else if (dc < -e.topo.cols / 2) dc += e.topo.cols;
        wrapped = dr !== rawR || dc !== rawC;
      }
      const tail = strokes[strokes.length - 1];
      if (wrapped) {
        const prev = tail[tail.length - 1];
        tail.push([prev[0] + dc * m.w, prev[1] + dr * m.h]);
        const [cx, cy] = this.center(r, c);
        strokes.push([
          [cx - (dc * m.w) / 2, cy - (dr * m.h) / 2],
          [cx, cy],
        ]);
      } else {
        const prev = tail[tail.length - 1];
        tail.push([prev[0] + dc * m.w, prev[1] + dr * m.h]);
      }
    }
    return strokes;
  }

  private drawPolyGrid(g: CanvasRenderingContext2D): void {
    const e = this.store.engine;
    const mask = e.topo.mask;
    if (!mask) return;
    const cols = e.topo.cols;
    const rows = e.topo.rows;
    const cw = this.cssW / cols;
    const ch = this.cssH / rows;
    const playable = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols && mask(r, c);
    // Interior walls are drawn solid; outside-of-shape holes stay empty.
    const walls = e.walls;
    if (walls) {
      g.fillStyle = '#3f3f46';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (walls(r, c) && !mask(r, c)) {
            g.fillRect(Math.round(c * cw), Math.round(r * ch), Math.ceil(cw), Math.ceil(ch));
          }
        }
      }
    }
    // Faint interior lines shared by two playable cells.
    g.strokeStyle = '#232323';
    g.lineWidth = 1;
    g.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask(r, c)) continue;
        if (playable(r, c + 1)) {
          const x = Math.round((c + 1) * cw) + 0.5;
          g.moveTo(x, Math.round(r * ch));
          g.lineTo(x, Math.round((r + 1) * ch));
        }
        if (playable(r + 1, c)) {
          const y = Math.round((r + 1) * ch) + 0.5;
          g.moveTo(Math.round(c * cw), y);
          g.lineTo(Math.round((c + 1) * cw), y);
        }
      }
    }
    g.stroke();
    // Silhouette: every edge of a playable cell that faces a non-playable cell.
    g.strokeStyle = '#3d3d3d';
    g.lineWidth = 2;
    g.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask(r, c)) continue;
        const x = Math.round(c * cw);
        const y = Math.round(r * ch);
        const x2 = Math.round((c + 1) * cw);
        const y2 = Math.round((r + 1) * ch);
        if (!playable(r - 1, c)) { g.moveTo(x, y); g.lineTo(x2, y); }
        if (!playable(r + 1, c)) { g.moveTo(x, y2); g.lineTo(x2, y2); }
        if (!playable(r, c - 1)) { g.moveTo(x, y); g.lineTo(x, y2); }
        if (!playable(r, c + 1)) { g.moveTo(x2, y); g.lineTo(x2, y2); }
      }
    }
    g.stroke();
  }

  private drawSquareGrid(g: CanvasRenderingContext2D, frame = true): void {
    const e = this.store.engine;
    const cols = e.topo.cols;
    const rows = e.topo.rows;
    const m = this.squareMetrics();
    const x0 = m.ox;
    const y0 = m.oy;
    const bw = cols * m.w;
    const bh = rows * m.h;
    g.strokeStyle = '#232323';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < cols; i++) {
      const p = Math.round(x0 + i * m.w) + 0.5;
      g.moveTo(p, y0);
      g.lineTo(p, y0 + bh);
    }
    for (let i = 1; i < rows; i++) {
      const p = Math.round(y0 + i * m.h) + 0.5;
      g.moveTo(x0, p);
      g.lineTo(x0 + bw, p);
    }
    g.stroke();
    if (frame) {
      g.strokeStyle = '#3d3d3d';
      g.lineWidth = 2;
      g.strokeRect(x0 + 1, y0 + 1, bw - 2, bh - 2);
    }
  }

  private drawHexGrid(g: CanvasRenderingContext2D): void {
    const e = this.store.engine;
    const lay = this.hexLay as HexLayout;
    const offs = hexCornerOffsets(lay.s);
    g.strokeStyle = '#232323';
    g.lineWidth = 1;
    g.beginPath();
    for (let r = 0; r < e.topo.rows; r++) {
      for (let c = 0; c < e.topo.cols; c++) {
        const ctr = hexCellCenter(lay, r, c);
        for (let k = 0; k < 6; k++) {
          const a = offs[k];
          const b = offs[(k + 1) % 6];
          g.moveTo(ctr.x + a.x, ctr.y + a.y);
          g.lineTo(ctr.x + b.x, ctr.y + b.y);
        }
      }
    }
    g.stroke();
  }

  private evCell(ev: PointerEvent, wrap = false): [number, number] | null {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return null;
    const e = this.store.engine;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (e.topo.kind === 'hex' && this.hexLay) {
      return hexPixelToCell(this.hexLay, e.topo.rows, e.topo.cols, x, y);
    }
    const cellW = rect.width / (e.topo.cols + (e.topo.warp ? 1 : 0));
    const cellH = rect.height / (e.topo.rows + (e.topo.warp ? 1 : 0));
    const offX = e.topo.warp ? cellW / 2 : 0;
    const offY = e.topo.warp ? cellH / 2 : 0;
    const c = Math.floor((x - offX) / cellW);
    const r = Math.floor((y - offY) / cellH);
    if (wrap && e.topo.warp) {
      // A captured drag that leaves the canvas continues on the opposite
      // edge, so the stroke wraps around like the pipes do. Raw coords are
      // clamped to one cell past each edge so a far overshoot can't jump the
      // head across the whole board.
      const rr = Math.max(-1, Math.min(r, e.topo.rows));
      const cc2 = Math.max(-1, Math.min(c, e.topo.cols));
      return [
        ((rr % e.topo.rows) + e.topo.rows) % e.topo.rows,
        ((cc2 % e.topo.cols) + e.topo.cols) % e.topo.cols,
      ];
    }
    if (!e.inBounds(r, c)) return null;
    return [r, c];
  }

  onDown(ev: PointerEvent): void {
    const e = this.store.engine;
    if (e.won || e.active || ev.button !== 0) return;
    this.store.sound.unlock();
    const cell = this.evCell(ev);
    if (!cell) return;
    const canvas = this.canvasRef()?.nativeElement;
    try {
      canvas?.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    // Run input outside Angular: canvas redraws are manual, signals update on release.
    this.zone.runOutsideAngular(() => {
      e.pointerDown(cell[0], cell[1], ev.pointerId);
    });
    if (this.store.engine.active?.changed) this.store.ensureClock();
    this.store.checkpointDaily();
    this.draw();
    if (ev.cancelable) ev.preventDefault();
  }

  onMove(ev: PointerEvent): void {
    const e = this.store.engine;
    if (!e.active || ev.pointerId !== e.active.pid) return;
    if (ev.cancelable) ev.preventDefault();
    const cell = this.evCell(ev, true);
    if (!cell) return;
    if (cell[0] === e.active.last[0] && cell[1] === e.active.last[1]) return;
    this.zone.runOutsideAngular(() => {
      e.pointerMove(cell[0], cell[1], ev.pointerId);
    });
    if (e.active?.changed) this.store.ensureClock();
    this.store.checkpointDaily();
    this.draw();
    // Live HUD while dragging (cheap signal writes, no CD cost in zoneless).
    this.store.moves.set(e.moves);
    this.store.filled.set(e.filledPct());
    this.store.linked.set(`${e.connectedCount()}/${e.numPairs}`);
  }

  onUp(ev: PointerEvent): void {
    const e = this.store.engine;
    if (!e.active || ev.pointerId !== e.active.pid) return;
    const changed = e.pointerUp(ev.pointerId);
    if (changed) this.store.ensureClock();
    this.store.refresh();
  }

  onCancel(ev: PointerEvent): void {
    if (this.store.engine.active?.pid !== ev.pointerId) return;
    this.store.engine.cancelStroke(ev.pointerId);
    this.store.engine.checkWin();
    this.store.refresh();
  }

  onMenu(ev: Event): void {
    ev.preventDefault();
    const cell = this.evCell(ev as PointerEvent);
    if (!cell) return;
    const e = this.store.engine;
    const ci = e.grid[e.key(cell[0], cell[1])];
    if (ci >= 0 && e.clearColor(ci)) {
      this.store.ensureClock();
      this.store.refresh();
      this.store.sound.click();
    }
  }
}

/** Odd-r offset to axial, mirrored here so render math needs no import cycle. */
function hexAxial(r: number, c: number): { q: number; rr: number } {
  return { q: c - ((r - (r & 1)) >> 1), rr: r };
}
