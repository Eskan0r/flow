/* App-level smoke tests: boot to packs, open a pack, play a full solution
 * through real pointer events to a win with the dialog. Run: ng test */
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import type { FlowStore } from './core/flow-store';
import { PACKS } from './core/packs';

function cellXY(r: number, c: number, size: number, side = 400): [number, number] {
  const cell = side / size;
  return [(c + 0.5) * cell, (r + 0.5) * cell];
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  (ev as unknown as Record<string, unknown>)['pointerId'] = 1;
  canvas.dispatchEvent(ev);
}

describe('App', () => {
  async function boot(): Promise<{ fixture: ComponentFixture<App>; store: FlowStore }> {
    localStorage.clear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const store = (fixture.componentInstance as unknown as { store: FlowStore }).store;
    return { fixture, store };
  }

  function boardCanvas(): HTMLCanvasElement {
    const canvas = document.querySelector('flow-board canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 400, left: 0, top: 0, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    return canvas;
  }

  it('boots to the pack list', async () => {
    const { store } = await boot();
    expect(store.view()).toBe('packs');
    expect(document.querySelector('header h1')?.textContent).toContain('flow');
    for (const p of PACKS) {
      expect(document.body.textContent).toContain(p.name);
    }
  });

  it('new levels actually replace the board state', async () => {
    const { store } = await boot();
    store.newRandom();
    const first = store.engine.seed;
    const tick = store.renderTick();
    const pairs = JSON.stringify(store.engine.pairs);
    store.newRandom();
    expect(store.view()).toBe('game');
    expect(store.engine.seed).not.toBe(first);
    expect(JSON.stringify(store.engine.pairs)).not.toBe(pairs);
    expect(store.renderTick()).toBeGreaterThan(tick);
  });

  it('opens a pack grid and plays level 1 to a win with the dialog', async () => {
    const { fixture, store } = await boot();
    const pack = PACKS[0];
    store.openPack(pack);
    expect(store.view()).toBe('levels');
    store.playPackLevel(pack, 1);
    expect(store.view()).toBe('game');
    fixture.detectChanges();

    const canvas = boardCanvas();
    const size = store.engine.size;
    for (const sg of store.engine.solution) {
      const [x0, y0] = cellXY(sg[0][0], sg[0][1], size);
      pointer(canvas, 'pointerdown', x0, y0);
      for (let i = 1; i < sg.length; i++) {
        const [x, y] = cellXY(sg[i][0], sg[i][1], size);
        pointer(canvas, 'pointermove', x, y);
      }
      const [xe, ye] = cellXY(sg[sg.length - 1][0], sg[sg.length - 1][1], size);
      pointer(canvas, 'pointerup', xe, ye);
    }
    expect(store.engine.won).toBe(true);
    expect(store.engine.win?.stars).toBe(3);
    expect(store.winOpen()).toBe(true);
    expect(store.starsFor(pack.id, 1)).toBe(3);
    expect(store.packProgress(pack).done).toBe(1);
    // Full CD sweep across overlay views too: the win dialog's stable
    // aria wiring must not trip dev-mode NG0100 (check-no-changes).
    expect(() => TestBed.inject(ApplicationRef).tick()).not.toThrow();
  });
});
