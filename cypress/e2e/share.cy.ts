// Daily share card: win a daily, copy the Wordle-style result text.
import { generateLevel } from '../../src/app/core/flow-generator';
import { boardRect, drawPath } from '../support/board';

function todayLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stubClipboard(calls: unknown[][]): void {
  cy.window().then((win) => {
    Object.defineProperty(win.navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(win.navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          calls.push([text]);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
}

describe('daily share', () => {
  it('copies the exact share card on a daily win', () => {
    const label = todayLabel();
    const lv = generateLevel(`daily-${label}-1`, 5, null);
    const calls: unknown[][] = [];

    cy.visit('/');
    cy.get('[data-testid=daily-card]').click();
    cy.get('[data-testid=daily-1]').click();
    cy.get('[data-testid=board]').should('be.visible');

    stubClipboard(calls);
    boardRect().then((rect) => {
      for (const path of lv.solution) drawPath(rect, lv.size, path);
    });

    cy.get('[data-testid=win-dialog]').should('be.visible');
    cy.get('[data-testid=share-btn]').click();
    cy.then(() => {
      expect(calls, 'clipboard writes').to.have.length(1);
      const lines = (calls[0][0] as string).split('\n');
      expect(lines[0]).to.eq(`roflow daily ${label}`);
      expect(lines[1]).to.eq('⭐⬛⬛⬛⬛');
      expect(lines[2]).to.eq('streak: 0');
      expect(lines[3]).to.eq('roflow.ronakchavva.com');
      expect(lines).to.have.length(4);
    });
  });

  it('dailies list has a working share button', () => {
    const calls: unknown[][] = [];
    cy.visit('/');
    cy.get('[data-testid=daily-card]').click();
    stubClipboard(calls);
    cy.get('[data-testid=share-daily-btn]').click();
    cy.contains('Copied to clipboard').should('be.visible');
    cy.then(() => {
      expect(calls, 'clipboard writes').to.have.length(1);
    });
  });
});
