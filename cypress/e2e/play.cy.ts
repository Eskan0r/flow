// Full win flow in a real browser: draw every solution path with pointer
// events, expect the win dialog, stars saved, Next advances the pack.
import { boardRect, drawPath, gotoRegularLevel1, regularLevel1 } from '../support/board';

describe('play to a win', () => {
  it('draws the full solution and wins with 3 stars', () => {
    const lv = regularLevel1();
    expect(lv.size).to.eq(5);

    gotoRegularLevel1();

    boardRect().then((rect) => {
      for (const path of lv.solution) drawPath(rect, lv.size, path);
    });

    cy.get('[data-testid=win-dialog]').should('be.visible');
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 4');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('flow.stars.regular.1')).to.eq('3');
    });
  });

  it('non-perfect win shows the completed icon, not perfect', () => {
    const lv = regularLevel1();
    gotoRegularLevel1();
    boardRect().then((rect) => {
      drawPath(rect, lv.size, lv.solution[0]);
    });
    cy.get('[data-testid=undo-btn]').click();
    boardRect().then((rect) => {
      for (const path of lv.solution) drawPath(rect, lv.size, path);
    });
    cy.get('[data-testid=win-dialog]').should('be.visible');
    cy.get('[data-testid=win-dialog]').should('contain', 'COMPLETE');
    cy.get('[data-testid=win-dialog]').should('not.contain', 'PERFECT');
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 5');

    cy.get('[data-testid=replay-btn]').click();
    cy.get('[data-testid=back-btn]').first().click();
    cy.get('[data-testid=level-1]').should('contain', '✓');
  });

  it('next button advances to level 2 and progress persists', () => {
    const lv = regularLevel1();
    gotoRegularLevel1();
    boardRect().then((rect) => {
      for (const path of lv.solution) drawPath(rect, lv.size, path);
    });
    cy.get('[data-testid=next-btn]').click();
    cy.contains(/regular pack · 2/i).should('be.visible');
    cy.get('[data-testid=board]').should('be.visible');

    // level 1 kept its star
    cy.get('[data-testid=back-btn]').first().click();
    cy.get('[data-testid=levels-view]').should('be.visible');
    cy.get('[data-testid=level-1]').should('contain', '★');

    // reload restores the last-played board (level 2)
    cy.reload();
    cy.contains(/regular pack · 2/i).should('be.visible');

    // packs list shows the recorded progress
    cy.get('[data-testid=back-btn]').first().click();
    cy.get('[data-testid=back-btn]').first().click();
    cy.get('[data-testid=packs-view]').should('be.visible');
    cy.contains('1 / 150').should('be.visible');
  });
});
