// Move counting across strokes: consecutive same-color work collapses into
// one move; touching a new color banks another. Real browser.
import { boardRect, drawPath, gotoRegularLevel1, regularLevel1 } from '../support/board';

describe('move counting', () => {
  it('partial stroke plus finishing stroke counts one move', () => {
    const lv = regularLevel1();
    const sg = lv.solution[0];
    const mid = Math.floor(sg.length / 2);
    gotoRegularLevel1();
    boardRect().then((rect) => {
      drawPath(rect, lv.size, sg.slice(0, mid));
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 1');
    boardRect().then((rect) => {
      // continue from the head of the partial pipe (overlap one cell)
      drawPath(rect, lv.size, sg.slice(mid - 1));
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 1');
    cy.get('[data-testid=linked-badge]').should('contain', '1/4');
  });

  it('switching colors banks a new move', () => {
    const lv = regularLevel1();
    const a = lv.solution[0];
    const b = lv.solution[1];
    const mid = Math.max(2, Math.floor(a.length / 2));
    gotoRegularLevel1();
    boardRect().then((rect) => {
      drawPath(rect, lv.size, a.slice(0, mid));
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 1');
    boardRect().then((rect) => {
      drawPath(rect, lv.size, b);
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 2');
  });

  it('immediate redo of a finished color stays one move, touch ids included', () => {
    const lv = regularLevel1();
    const sg = lv.solution[2];
    gotoRegularLevel1();
    cy.window().then((win) => {
      const canvas = win.document.querySelector('[data-testid=board]') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const cell = rect.width / lv.size;
      const xy = (r: number, c: number): [number, number] => [rect.left + (c + 0.5) * cell, rect.top + (r + 0.5) * cell];
      const fire = (type: string, r: number, c: number, pid: number) => {
        const [x, y] = xy(r, c);
        canvas.dispatchEvent(
          new win.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: pid }),
        );
      };
      // first touch (pid 42), then a second touch (pid 43) redrawing it
      for (const pid of [42, 43]) {
        fire('pointerdown', sg[0][0], sg[0][1], pid);
        for (let i = 1; i < sg.length; i++) fire('pointermove', sg[i][0], sg[i][1], pid);
        fire('pointerup', sg[sg.length - 1][0], sg[sg.length - 1][1], pid);
      }
    });
    cy.get('[data-testid=moves-badge]').should('contain', 'Moves 1');
  });
});
