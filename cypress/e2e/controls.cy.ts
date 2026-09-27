// Board controls: undo, reset, hint, new, seed, daily.
import { boardRect, cellCenter, drawPath, gotoRegularLevel1, regularLevel1 } from '../support/board';

describe('board controls', () => {
  beforeEach(() => {
    gotoRegularLevel1();
  });

  it('draws one flow, then undo clears it', () => {
    const lv = regularLevel1();
    boardRect().then((rect) => {
      drawPath(rect, lv.size, lv.solution[0]);
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 1');
    cy.get('[data-testid=linked-badge]').should('contain', '1/4');
    cy.get('[data-testid=undo-btn]').click();
    cy.get('[data-testid=linked-badge]').should('contain', '0/4');
  });

  it('reset clears all pipes', () => {
    const lv = regularLevel1();
    boardRect().then((rect) => {
      drawPath(rect, lv.size, lv.solution[0]);
      drawPath(rect, lv.size, lv.solution[1]);
    });
    cy.get('[data-testid=linked-badge]').should('contain', '2/4');
    cy.get('[data-testid=reset-btn]').click();
    cy.get('[data-testid=linked-badge]').should('contain', '0/4');
  });

  it('hint completes a flow', () => {
    cy.get('[data-testid=hint-btn]').click();
    cy.get('[data-testid=linked-badge]').should('contain', '1/4');
  });

  it('new loads a different custom board', () => {
    cy.get('[data-testid=new-btn]').click();
    cy.contains('Custom').should('be.visible');
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 0');
  });

  it('seed box loads a deterministic board', () => {
    cy.get('[data-testid=menu-btn]').click();
    cy.get('[data-testid=seed-input]').type('sunrise-7');
    cy.get('[data-testid=size-7]').click();
    cy.get('[data-testid=go-btn]').click();
    cy.contains('sunrise-7').should('be.visible');
    cy.get('[data-testid=board]').should('be.visible');
  });

  it('daily loads the daily puzzle', () => {
    cy.get('[data-testid=menu-btn]').click();
    cy.get('[data-testid=rail-daily-btn]').click();
    cy.contains('Daily Puzzle').should('be.visible');
  });

  it('right-click clears a pipe', () => {
    const lv = regularLevel1();
    boardRect().then((rect) => {
      drawPath(rect, lv.size, lv.solution[0]);
      const p = cellCenter(rect, lv.size, lv.solution[0][1][0], lv.solution[0][1][1]);
      cy.get('[data-testid=board]').rightclick(p.x - rect.left, p.y - rect.top);
    });
    cy.get('[data-testid=linked-badge]').should('contain', '0/4');
  });
});
