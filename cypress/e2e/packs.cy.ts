// Pack navigation: list → grid → game.
describe('packs', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows the pack list with progress', () => {
    cy.get('[data-testid=packs-view]').should('be.visible');
    cy.contains('Daily Puzzles').should('be.visible');
    for (const name of ['Regular Pack', 'Bonus Pack', 'Hexes']) {
      cy.contains(name).should('be.visible');
    }
    cy.contains('0 / 150').should('be.visible');
  });

  it('opens the hexes pack grid with 60 levels', () => {
    cy.get('[data-testid=pack-hexes]').click();
    cy.get('[data-testid=levels-view]').should('be.visible');
    cy.get('[data-testid^="level-"]').should('have.length', 60);
  });

  it('opens the daily list with 5 puzzles', () => {
    cy.get('[data-testid=daily-card]').click();
    cy.get('[data-testid=dailies-view]').should('be.visible');
    cy.get('[data-testid^="daily-"]').should('have.length', 5);
    cy.contains('Hex').should('be.visible');
  });

  it('opens the regular pack grid with 150 levels', () => {
    cy.get('[data-testid=pack-regular]').click();
    cy.get('[data-testid=levels-view]').should('be.visible');
    cy.get('[data-testid^="level-"]').should('have.length', 150);
  });

  it('opens level 1 as a 5x5 game', () => {
    cy.get('[data-testid=pack-regular]').click();
    cy.get('[data-testid=level-1]').click();
    cy.get('[data-testid=board]').should('be.visible');
    cy.contains(/regular pack · 1/i).should('be.visible');
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 0');
  });

  it('back button returns to the level grid', () => {
    cy.get('[data-testid=pack-regular]').click();
    cy.get('[data-testid=level-1]').click();
    cy.get('[data-testid=back-btn]').first().click();
    cy.get('[data-testid=levels-view]').should('be.visible');
  });
});
