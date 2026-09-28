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
    expect(document.querySelector('header h1')?.textContent).toContain('roflow');
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

  it('opens the daily list from the packs card', async () => {
    const { fixture, store } = await boot();
    store.showDailies();
    expect(store.view()).toBe('dailies');
    fixture.detectChanges();
    expect(document.querySelector('[data-testid=dailies-view]')).toBeTruthy();
  });

  it('reset is refused on dailies', async () => {
    const { fixture, store } = await boot();
    store.daily(1);
    expect(store.view()).toBe('game');
    fixture.detectChanges();
    const canvas = boardCanvas();
    const size = store.engine.size;
    const sg = store.engine.solution[0];
    const [x0, y0] = cellXY(sg[0][0], sg[0][1], size);
    pointer(canvas, 'pointerdown', x0, y0);
    const [x1, y1] = cellXY(sg[1][0], sg[1][1], size);
    pointer(canvas, 'pointermove', x1, y1);
    pointer(canvas, 'pointerup', x1, y1);
    expect(store.engine.paths[0].length).toBeGreaterThan(0);
    store.reset();
    expect(store.engine.paths[0].length).toBeGreaterThan(0);
    expect(store.toastMsg()).toBe('No resets on dailies');
    expect(document.querySelector('[data-testid=reset-btn]')?.hasAttribute('disabled')).toBe(true);
  });

  it('daily win hides Share until all 5 dailies are done', async () => {
    const { fixture, store } = await boot();
    store.daily(1);
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
    fixture.detectChanges();
    // Only 1 of 5 done: no copiable share card yet, and no Replay (one-shot).
    expect(document.querySelector('[data-testid=share-btn]')).toBeNull();
    expect(document.querySelector('[data-testid=share-text]')).toBeNull();
    expect(document.querySelector('[data-testid=replay-btn]')).toBeNull();
    const today = store.dailyLabelToday();
    expect(store.shareText(today)).toBe(
      `roflow daily ${today}\n⭐⬛⬛⬛⬛\nstreak: 0\nroflow.ronakchavva.com`,
    );
  });

  it('daily win shows Share once the full set of 5 is complete', async () => {
    const { fixture, store } = await boot();
    const today = store.dailyLabelToday();
    // Pretend the first 4 dailies are already done today.
    localStorage.setItem(
      'flow.daily.done',
      JSON.stringify([`${today}-1`, `${today}-2`, `${today}-3`, `${today}-4`]),
    );
    store.progressVersion.update((v) => v + 1);
    store.daily(5);
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
    fixture.detectChanges();
    expect(document.querySelector('[data-testid=share-btn]')).toBeTruthy();
    expect(document.querySelector('[data-testid=share-text]')?.textContent).toContain(`roflow daily ${today}`);
    // One-shot: final daily win shows Home (not Replay).
    expect(document.querySelector('[data-testid=replay-btn]')).toBeNull();
    expect(document.querySelector('[data-testid=next-btn]')?.textContent).toContain('Home');
  });

  it('completed dailies cannot be replayed — menu returns instead of board', async () => {
    const { fixture, store } = await boot();
    const today = store.dailyLabelToday();
    localStorage.setItem('flow.daily.done', JSON.stringify([`${today}-1`, `${today}-2`]));
    store.progressVersion.update((v) => v + 1);
    store.showDailies();
    fixture.detectChanges();
    await fixture.whenStable();
    // Clicking an already-done daily pulls up the menu, not the board.
    store.daily(1);
    expect(store.view()).toBe('dailies');
    expect(store.toastMsg()).toContain('Already completed');
    // next() skips completed levels (3 is open, 4 done -> lands on 5).
    localStorage.setItem(
      'flow.daily.done',
      JSON.stringify([`${today}-1`, `${today}-2`, `${today}-4`]),
    );
    store.progressVersion.update((v) => v + 1);
    store.daily(3);
    expect(store.view()).toBe('game');
    expect(store.engine.seed).toContain(`${today}-3`);
    store.next();
    expect(store.engine.seed).toContain(`${today}-5`);
    // replay() after completion routes onward instead of reloading.
    localStorage.setItem(
      'flow.daily.done',
      JSON.stringify([`${today}-1`, `${today}-2`, `${today}-3`, `${today}-4`, `${today}-5`]),
    );
    store.progressVersion.update((v) => v + 1);
    store.replay();
    expect(store.view()).toBe('dailies');
  });

  it('dailies menu hides the share card until all 5 are done', async () => {
    const { fixture, store } = await boot();
    const today = store.dailyLabelToday();
    localStorage.setItem('flow.daily.done', JSON.stringify([`${today}-1`]));
    store.progressVersion.update((v) => v + 1);
    store.showDailies();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('[data-testid=daily-share-card]')).toBeNull();
  });

  it('dailies menu shows the copiable share card at the bottom once all 5 are done', async () => {
    const { fixture, store } = await boot();
    const today = store.dailyLabelToday();
    localStorage.setItem(
      'flow.daily.done',
      JSON.stringify([`${today}-1`, `${today}-2`, `${today}-3`, `${today}-4`, `${today}-5`]),
    );
    store.progressVersion.update((v) => v + 1);
    store.showDailies();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('[data-testid=daily-share-card]')).toBeTruthy();
    expect(document.querySelector('[data-testid=daily-share-text]')?.textContent).toContain(
      `roflow daily ${today}`,
    );
    expect(document.querySelector('[data-testid=daily-share-copy-btn]')).toBeTruthy();
    // Clicking any daily once everything is done stays on the menu with the card.
    store.daily(2);
    expect(store.view()).toBe('dailies');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('[data-testid=daily-share-card]')).toBeTruthy();
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
    // Non-daily wins keep Replay; no share card.
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('[data-testid=replay-btn]')).toBeTruthy();
    expect(document.querySelector('[data-testid=share-btn]')).toBeNull();
    // Full CD sweep across overlay views too: the win dialog's stable
    // aria wiring must not trip dev-mode NG0100 (check-no-changes).
    expect(() => TestBed.inject(ApplicationRef).tick()).not.toThrow();
  });
});
