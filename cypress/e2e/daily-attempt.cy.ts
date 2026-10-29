import { generateLevel } from '../../src/app/core/flow-generator';
import { boardRect, drawPath } from '../support/board';

const seed = 'daily-2026-10-01-1';
const level = () => generateLevel(seed, 5, null);

describe('daily attempt integrity', () => {
  beforeEach(() => cy.visit(`/?seed=${seed}&size=5`));

  it('keeps drawn paths and move costs across a page refresh', () => {
    const lv = level();
    boardRect().then((rect) => {
      drawPath(rect, 5, lv.solution[0]);
      drawPath(rect, 5, lv.solution[1]);
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 2');
    cy.reload();
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 2');
    cy.get('[data-testid=linked-badge]').should('contain', '2/4');
    cy.get('[data-testid=undo-btn]').click();
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 2');
    cy.get('[data-testid=undo-btn]').click();
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 2');
    cy.get('[data-testid=linked-badge]').should('contain', '0/4');
    cy.reload();
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 2');
  });

  it('preserves an attempt when leaving and reopening the daily', () => {
    boardRect().then((rect) => drawPath(rect, 5, level().solution[0]));
    cy.get('[data-testid=back-btn]').first().click();
    cy.get('[data-testid=daily-1]').should('be.visible');
    // The menu lists today's puzzles; the archived link reopens this attempt.
    cy.visit(`/?seed=${seed}&size=9&kind=hex`);
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 1');
    cy.get('[data-testid=linked-badge]').should('contain', '1/4');
  });

  it('cannot undo a completed daily or reopen it through its URL', () => {
    boardRect().then((rect) => {
      for (const path of level().solution) drawPath(rect, 5, path);
    });
    cy.get('[data-testid=win-dialog]').should('be.visible');
    cy.get('body').trigger('keydown', { key: 'u' });
    cy.get('[data-testid=win-dialog]').should('be.visible');
    cy.reload();
    cy.get('[data-testid=dailies-view]').should('be.visible');
    cy.get('[data-testid=board]').should('not.exist');
  });
});
