// Shared helpers: draw on the canvas with real PointerEvents built in the
// app window's realm, and translate board cells to screen coordinates.
import { generateLevel } from '../../src/app/core/flow-generator';

export type Cell = [number, number];

export function boardRect(): Cypress.Chainable<DOMRect> {
  return cy.get('[data-testid=board]').then(($c) => $c[0].getBoundingClientRect());
}

export function cellCenter(rect: DOMRect, size: number, r: number, c: number): { x: number; y: number } {
  const cell = rect.width / size;
  return { x: rect.left + (c + 0.5) * cell, y: rect.top + (r + 0.5) * cell };
}

export function drawPath(rect: DOMRect, size: number, path: Cell[]): void {
  cy.window().then((win) => {
    const canvas = win.document.querySelector('[data-testid=board]') as HTMLCanvasElement;
    const fire = (type: string, x: number, y: number) => {
      canvas.dispatchEvent(
        new win.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 }),
      );
    };
    const [x0, y0] = [cellCenter(rect, size, path[0][0], path[0][1])].map((p) => [p.x, p.y])[0] as [number, number];
    fire('pointerdown', x0, y0);
    for (let i = 1; i < path.length; i++) {
      const p = cellCenter(rect, size, path[i][0], path[i][1]);
      fire('pointermove', p.x, p.y);
    }
    const last = cellCenter(rect, size, path[path.length - 1][0], path[path.length - 1][1]);
    fire('pointerup', last.x, last.y);
  });
}

/** Solution for Regular Pack level 1 (5x5, deterministic seed). */
export function regularLevel1() {
  return generateLevel('flow-regular-1', 5, null);
}

export function gotoRegularLevel1(): void {
  cy.visit('/');
  cy.get('[data-testid=packs-view]').should('be.visible');
  cy.get('[data-testid=pack-regular]').click();
  cy.get('[data-testid=levels-view]').should('be.visible');
  cy.get('[data-testid=level-1]').click();
  cy.get('[data-testid=board]').should('be.visible');
}
