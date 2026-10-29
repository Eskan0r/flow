/* App-level smoke tests: boot to packs, open a pack, play a full solution
 * through real pointer events to a win with the dialog. Run: ng test */
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import type { FlowEngine } from './core/flow-engine';
import type { Cell } from './core/flow-generator';
import { FlowStore } from './core/flow-store';
import { flowChainPath } from './core/flow-generator';
import { PACKS, dailySpec } from './core/packs';

function cellXY(r: number, c: number, size: number, side = 400): [number, number] {
  const cell = side / size;
  return [(c + 0.5) * cell, (r + 0.5) * cell];
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  (ev as unknown as Record<string, unknown>)['pointerId'] = 1;
  canvas.dispatchEvent(ev);
}

/** Draw cells straight through the engine (no pixels): daily categories
 *  rotate by date, so canvas geometry can't be assumed here. */
function drawCells(e: FlowEngine, cells: Cell[], pid = 1): void {
  e.pointerDown(cells[0][0], cells[0][1], pid);
  for (let i = 1; i < cells.length; i++) e.pointerMove(cells[i][0], cells[i][1], pid);
  e.pointerUp(pid);
}

describe('App', () => {
  async function boot(url?: string): Promise<{ fixture: ComponentFixture<App>; store: FlowStore }> {
    localStorage.clear();
    history.replaceState(null, '', url ?? '/');
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
    const e = store.engine;
    const sg = e.solution[0];
    e.pointerDown(sg[0][0], sg[0][1], 1);
    e.pointerMove(sg[1][0], sg[1][1], 1);
    e.pointerUp(1);
    expect(e.paths[0].length).toBeGreaterThan(0);
    store.reset();
    expect(e.paths[0].length).toBeGreaterThan(0);
    expect(store.toastMsg()).toBe('No resets on dailies');
    expect(document.querySelector('[data-testid=reset-btn]')?.hasAttribute('disabled')).toBe(true);
  });

  it('reload resumes daily paths, move costs, hints and undo history', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-1');
    const e = store.engine;
    drawCells(e, e.solution[0]);
    drawCells(e, e.solution[1]);
    store.hint();
    store.undo();
    store.ensureClock();
    store.refresh();
    const snapshot = e.snapshot();
    const depth = e.history.length;
    const reloaded = TestBed.runInInjectionContext(() => new FlowStore());
    reloaded.boot();
    expect(reloaded.engine.snapshot()).toEqual(snapshot);
    expect(reloaded.engine.history.length).toBe(depth);
    reloaded.undo();
    expect(reloaded.engine.moves).toBe(snapshot.moves);
    expect(reloaded.engine.hints).toBe(1);
  });

  it('checkpoints an unfinished drag when the page is hidden', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-1');
    const path = store.engine.solution[0];
    store.engine.pointerDown(path[0][0], path[0][1], 1);
    store.engine.pointerMove(path[1][0], path[1][1], 1);
    store.ensureClock();
    document.dispatchEvent(new Event('visibilitychange'));
    const reloaded = TestBed.runInInjectionContext(() => new FlowStore());
    reloaded.boot();
    expect(reloaded.engine.moves).toBe(1);
    expect(reloaded.engine.paths[0]).toEqual(path.slice(0, 2));
    expect(reloaded.engine.active).toBeNull();
  });

  it('reopening a daily through settings or the seed field preserves the canonical attempt', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-3');
    drawCells(store.engine, store.engine.solution[0]);
    const snapshot = store.engine.snapshot();
    store.showPacks();
    store.playCustom('daily-2026-09-26-3', 5, 'hex');
    const spec = dailySpec('2026-09-26', 3);
    expect(store.engine.rows).toBe(spec.rows);
    expect(store.engine.cols).toBe(spec.cols);
    expect(store.engine.topo.kind).toBe(spec.kind);
    expect(store.engine.snapshot()).toEqual(snapshot);
    store.setSize(5);
    expect(store.engine.snapshot()).toEqual(snapshot);
  });

  it('completed daily seeds cannot bypass the menu guard and undo cannot reopen a win', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-1');
    for (const path of store.engine.solution) drawCells(store.engine, path);
    store.refresh();
    const snapshot = store.engine.snapshot();
    store.undo();
    expect(store.engine.won).toBe(true);
    expect(store.engine.snapshot()).toEqual(snapshot);
    store.playCustom('daily-2026-09-26-1', 5, 'square');
    expect(store.view()).toBe('dailies');
  });

  it('custom replay preserves rectangular and variant rules and resets the displayed clock', async () => {
    const { store } = await boot('/?seed=replay-rect&size=6&rows=4&cols=7&warp=1&chain=1');
    const pairs = JSON.stringify(store.engine.pairs);
    store.time.set('2:12');
    store.replay();
    expect(store.engine.rows).toBe(4);
    expect(store.engine.cols).toBe(7);
    expect(store.engine.warp).toBe(true);
    expect(store.engine.chain).toBe(true);
    expect(JSON.stringify(store.engine.pairs)).toBe(pairs);
    expect(store.time()).toBe('0:00');
  });

  it('ignores a damaged daily checkpoint without breaking play', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-1');
    const key = `flow.attempt.${store.engine.seed}`;
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.state.paths[0] = [[999, 999]];
    localStorage.setItem(key, JSON.stringify(saved));
    const reloaded = TestBed.runInInjectionContext(() => new FlowStore());
    expect(() => reloaded.boot()).not.toThrow();
    expect(reloaded.engine.moves).toBe(0);
    expect(reloaded.engine.paths.every((p) => p.length === 0)).toBe(true);
  });

  it('pauses daily time in menus and preserves elapsed time for a winning hint', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-1');
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      for (const path of store.engine.solution.slice(0, -1)) drawCells(store.engine, path);
      store.ensureClock();
      clock.mockReturnValue(now + 12000);
      store.showDailies();
      const saved = JSON.parse(localStorage.getItem(`flow.attempt.${store.engine.seed}`)!);
      expect(saved.running).toBe(false);
      expect(saved.elapsed).toBe(12);
      clock.mockReturnValue(now + 72000);
      store.daily(1, '2026-09-26');
      expect(store.time()).toBe('0:12');
      store.hint();
      expect(store.engine.won).toBe(true);
      expect(store.time()).toBe('0:12');
      const best = JSON.parse(localStorage.getItem(`flow.best.${store.engine.seed}.s${store.engine.rows}x${store.engine.cols}`)!);
      expect(best.t).toBe(12);
    } finally { clock.mockRestore(); }
  });

  it('daily win hides Share until all 5 dailies are done', async () => {
    const { fixture, store } = await boot();
    store.daily(1);
    expect(store.view()).toBe('game');
    fixture.detectChanges();
    for (const sg of store.engine.solution) drawCells(store.engine, sg);
    expect(store.engine.won).toBe(true);
    store.refresh();
    fixture.detectChanges();
    // Only 1 of 5 done: no copiable share card yet, and no Replay (one-shot).
    expect(document.querySelector('[data-testid=share-btn]')).toBeNull();
    expect(document.querySelector('[data-testid=share-text]')).toBeNull();
    expect(document.querySelector('[data-testid=replay-btn]')).toBeNull();
    const today = store.dailyLabelToday();
    const mark = store.engine.win?.perfect ? '⭐' : '✅';
    expect(store.shareText(today)).toBe(
      `roflow daily ${today}\n${mark}⬛⬛⬛⬛\nstreak: 0\nroflow.ronakchavva.com`,
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
    for (const sg of store.engine.solution) drawCells(store.engine, sg);
    expect(store.engine.won).toBe(true);
    store.refresh();
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

  it('chains two touching flows in one stroke on chain boards', async () => {
    const { fixture, store } = await boot();
    const chains = PACKS.find((p) => p.id === 'chains');
    expect(chains).toBeTruthy();
    store.playPackLevel(chains!, 1);
    expect(store.view()).toBe('game');
    const e = store.engine;
    expect(e.chain).toBe(true);
    expect(store.subtitle()).toContain('chain');
    fixture.detectChanges();

    const ch = flowChainPath(e.pairs, e.topo);
    expect(ch).not.toBeNull();
    expect(ch!.order.length).toBe(e.numPairs);
    const canvas = boardCanvas();
    const size = e.size;
    // draw the first two chain flows as one unbroken drag through real events
    const sg0 = e.solution[ch!.order[0]];
    const sg1 = e.solution[ch!.order[1]];
    const [en0] = ch!.entries[0];
    const [en1] = ch!.entries[1];
    const cells0 = (en0[0] === sg0[0][0] && en0[1] === sg0[0][1]) ? sg0 : sg0.slice().reverse();
    const cells1 = (en1[0] === sg1[0][0] && en1[1] === sg1[0][1]) ? sg1 : sg1.slice().reverse();
    const [x0, y0] = cellXY(cells0[0][0], cells0[0][1], size);
    pointer(canvas, 'pointerdown', x0, y0);
    for (let i = 1; i < cells0.length; i++) {
      const [x, y] = cellXY(cells0[i][0], cells0[i][1], size);
      pointer(canvas, 'pointermove', x, y);
    }
    expect(e.done[ch!.order[0]]).toBe(true);
    for (const [r, c] of cells1) {
      const [x, y] = cellXY(r, c, size);
      pointer(canvas, 'pointermove', x, y);
    }
    const [xe, ye] = cellXY(cells1[cells1.length - 1][0], cells1[cells1.length - 1][1], size);
    pointer(canvas, 'pointerup', xe, ye);
    expect(e.done[ch!.order[1]]).toBe(true);
    expect(e.moves).toBe(1);
  });

  it('prev/next level buttons step pack levels from the game view', async () => {
    const { fixture, store } = await boot();
    const pack = PACKS.find((p) => p.id === 'regular')!;
    store.playPackLevel(pack, 3);
    expect(store.view()).toBe('game');
    fixture.detectChanges();
    await fixture.whenStable();
    const next = document.querySelector('[data-testid=next-level-btn]') as HTMLButtonElement;
    const prev = document.querySelector('[data-testid=prev-level-btn]') as HTMLButtonElement;
    expect(next).toBeTruthy();
    expect(prev).toBeTruthy();
    next.click();
    expect(store.packLevel()).toBe(4);
    expect(store.view()).toBe('game');
    prev.click();
    prev.click();
    expect(store.packLevel()).toBe(2);
    // custom seeds have no level order: steppers stay hidden
    store.newRandom();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('[data-testid=next-level-btn]')).toBeNull();
    expect(document.querySelector('[data-testid=prev-level-btn]')).toBeNull();
  });

  it('boots a daily link through the date rotation, not URL params', async () => {
    const { store } = await boot('/?seed=daily-2026-09-26-3&size=5');
    expect(store.view()).toBe('game');
    expect(store.engine.seed).toBe('daily-2026-09-26-3');
    // geometry comes from the spec for that date, whatever the params say
    const spec = dailySpec('2026-09-26', 3);
    expect(store.engine.rows).toBe(spec.rows);
    expect(store.engine.cols).toBe(spec.cols);
    expect(store.engine.topo.kind).toBe(spec.kind);
    expect(store.engine.warp).toBe(spec.warp ?? false);
    expect(store.engine.chain).toBe(spec.chain ?? false);
  });

  it('boots custom seed links with warp/chain flags round-tripped', async () => {
    const { store } = await boot('/?seed=flagtest&size=6&warp=1&chain=1');
    expect(store.view()).toBe('game');
    expect(store.engine.seed).toBe('flagtest');
    expect(store.engine.warp).toBe(true);
    expect(store.engine.chain).toBe(true);
  });

  it('dailies menu shows each board shape and category', async () => {
    const { fixture, store } = await boot();
    store.showDailies();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 1; i <= 5; i++) {
      const btn = document.querySelector(`[data-testid=daily-${i}]`);
      expect(btn?.textContent).toContain(store.dailyBlurb(i).split(' ')[0]);
    }
  });

  it('bumping walls plays no sound but other sounds still fire', async () => {
    const { store } = await boot();
    const badSpy = vi.spyOn(store.sound, 'bad');
    const clickSpy = vi.spyOn(store.sound, 'click');
    const pack = PACKS.find((p) => p.id === 'regular')!;
    store.playPackLevel(pack, 1);
    expect(clickSpy).toHaveBeenCalled();
    // drag a live stroke straight into a foreign dot (blocked bumps),
    // then run the HUD sync that would have sounded them
    const e = store.engine;
    const a = e.pairs[0][0];
    const foreign = e.pairs[1][0];
    drawCells(e, [a, foreign]);
    store.refresh();
    expect(badSpy).not.toHaveBeenCalled();
  });
});
