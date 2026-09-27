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
import type { HexLayout } from '../core/topology';

const PALETTE = [
  '#ff2222', '#7ac943', '#29a8ff', '#ffe135', '#ff8c00', '#b04df0',
  '#3fd9c8', '#ff4fa3', '#9c6b30', '#ffffff', '#c6ff00', '#ff6a00',
  '#00e676', '#f48fb1',
];

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
      const side = Math.max(120, Math.floor(Math.min(availW, availH)));
      this.hexLay = null;
      w = side;
      h = side;
    }
    this.cssW = w;
    this.cssH = h;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    this.draw();
  }

  private center(r: number, c: number): [number, number] {
    const e = this.store.engine;
    if (e.topo.kind === 'hex' && this.hexLay) {
      const p = hexCellCenter(this.hexLay, r, c);
      return [p.x, p.y];
    }
    const cell = this.cssW / e.topo.cols;
    return [(c + 0.5) * cell, (r + 0.5) * cell];
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
      this.drawSquareGrid(g);
      const cell = this.cssW / e.topo.cols;
      pipeW = cell * 0.62;
      dotR = cell * 0.31;
      edge = 3;
    }

    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < e.numPairs; i++) {
      const path = e.paths[i];
      if (path.length < 2) continue;
      const col = PALETTE[i % PALETTE.length];
      const pts = path.map(([r, c]) => this.center(r, c));
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = pipeW + edge;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = pipeW;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
    }
    for (let i = 0; i < e.numPairs; i++) {
      const col = PALETTE[i % PALETTE.length];
      for (let k = 0; k < 2; k++) {
        const [x, y] = this.center(e.pairs[i][k][0], e.pairs[i][k][1]);
        g.beginPath();
        g.arc(x, y, dotR + edge * 0.7, 0, Math.PI * 2);
        g.fillStyle = '#000';
        g.fill();
        g.beginPath();
        g.arc(x, y, dotR, 0, Math.PI * 2);
        g.fillStyle = col;
        g.fill();
        if (e.done[i]) {
          g.beginPath();
          g.arc(x, y, dotR + edge * 1.2, 0, Math.PI * 2);
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.stroke();
        }
      }
    }
    if (e.active) {
      const [x, y] = this.center(e.active.last[0], e.active.last[1]);
      g.beginPath();
      g.arc(x, y, dotR * 0.45, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
    }
  }

  private drawSquareGrid(g: CanvasRenderingContext2D): void {
    const e = this.store.engine;
    const n = e.topo.cols;
    const S = this.cssW;
    const cell = S / n;
    g.strokeStyle = '#232323';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < n; i++) {
      const p = Math.round(i * cell) + 0.5;
      g.moveTo(p, 0);
      g.lineTo(p, S);
      g.moveTo(0, p);
      g.lineTo(S, p);
    }
    g.stroke();
    g.strokeStyle = '#3d3d3d';
    g.lineWidth = 2;
    g.strokeRect(1, 1, S - 2, S - 2);
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

  private evCell(ev: PointerEvent): [number, number] | null {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return null;
    const e = this.store.engine;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (e.topo.kind === 'hex' && this.hexLay) {
      return hexPixelToCell(this.hexLay, e.topo.rows, e.topo.cols, x, y);
    }
    const cell = rect.width / e.topo.cols;
    const c = Math.floor(x / cell);
    const r = Math.floor(y / cell);
    if (!e.inBounds(r, c)) return null;
    return [r, c];
  }

  onDown(ev: PointerEvent): void {
    const e = this.store.engine;
    if (e.won) return;
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
    this.draw();
    if (ev.cancelable) ev.preventDefault();
  }

  onMove(ev: PointerEvent): void {
    const e = this.store.engine;
    if (!e.active || ev.pointerId !== e.active.pid) return;
    if (ev.cancelable) ev.preventDefault();
    const cell = this.evCell(ev);
    if (!cell) return;
    this.zone.runOutsideAngular(() => {
      e.pointerMove(cell[0], cell[1], ev.pointerId);
    });
    if (e.active?.changed) this.store.ensureClock();
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
    this.draw();
  }

  onCancel(ev: PointerEvent): void {
    this.store.engine.cancelStroke(ev.pointerId);
    this.draw();
  }

  onMenu(ev: Event): void {
    ev.preventDefault();
    const cell = this.evCell(ev as PointerEvent);
    if (!cell) return;
    const e = this.store.engine;
    const ci = e.grid[e.key(cell[0], cell[1])];
    if (ci >= 0) {
      e.clearColor(ci);
      this.store.refresh();
      this.draw();
      this.store.sound.click();
    }
  }
}

/** Odd-r offset to axial, mirrored here so render math needs no import cycle. */
function hexAxial(r: number, c: number): { q: number; rr: number } {
  return { q: c - ((r - (r & 1)) >> 1), rr: r };
}
