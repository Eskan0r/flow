/* The game board: black canvas, flat dots, solid pipes. Pointer input with
 * swipe interpolation drives the FlowEngine via FlowStore. */

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

  private cssSide = 300;
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
    let side = Math.floor(Math.min(r.width || 320, r.height || 320));
    if (side < 120) side = Math.floor(r.width || 320);
    if (side < 120) side = 300;
    this.cssSide = side;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    this.draw();
  }

  private center(r: number, c: number): [number, number] {
    const cell = this.cssSide / this.store.engine.size;
    return [(c + 0.5) * cell, (r + 0.5) * cell];
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const e = this.store.engine;
    const n = e.size;
    const S = this.cssSide;
    const cell = S / n;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);

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

    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < e.numPairs; i++) {
      const path = e.paths[i];
      if (path.length < 2) continue;
      const col = PALETTE[i % PALETTE.length];
      const w = cell * 0.62;
      const pts = path.map(([r, c]) => this.center(r, c));
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = w + 3;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
    }
    for (let i = 0; i < e.numPairs; i++) {
      const col = PALETTE[i % PALETTE.length];
      for (let k = 0; k < 2; k++) {
        const [x, y] = this.center(e.pairs[i][k][0], e.pairs[i][k][1]);
        const rad = cell * 0.31;
        g.beginPath();
        g.arc(x, y, rad + 2, 0, Math.PI * 2);
        g.fillStyle = '#000';
        g.fill();
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fillStyle = col;
        g.fill();
        if (e.done[i]) {
          g.beginPath();
          g.arc(x, y, rad + 3.5, 0, Math.PI * 2);
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.stroke();
        }
      }
    }
    if (e.active) {
      const [x, y] = this.center(e.active.last[0], e.active.last[1]);
      g.beginPath();
      g.arc(x, y, cell * 0.14, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
    }
  }

  private evCell(ev: PointerEvent): [number, number] | null {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return null;
    const e = this.store.engine;
    const rect = canvas.getBoundingClientRect();
    const cell = rect.width / e.size;
    const c = Math.floor((ev.clientX - rect.left) / cell);
    const r = Math.floor((ev.clientY - rect.top) / cell);
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
