// Hex boards in a real browser: open the Hexes pack, play level 1 to a win.
import { generateLevel } from '../../src/app/core/flow-generator';
import { hexCellCenter, hexLayout } from '../../src/app/core/topology';

const SIZE = 5;

function hexLevel1() {
  return generateLevel('flow-hexes-1', SIZE, null, { kind: 'hex', rows: SIZE, cols: SIZE });
}

function drawHexPath(
  win: Window,
  canvas: HTMLCanvasElement,
  lay: { s: number; w: number; h: number; ox: number; oy: number },
  path: Array<[number, number]>,
): void {
  const rect = canvas.getBoundingClientRect();
  const fire = (type: string, r: number, c: number) => {
    const p = hexCellCenter(lay, r, c);
    canvas.dispatchEvent(
      new win.PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + p.x,
        clientY: rect.top + p.y,
        pointerId: 1,
      }),
    );
  };
  fire('pointerdown', path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) fire('pointermove', path[i][0], path[i][1]);
  const last = path[path.length - 1];
  fire('pointerup', last[0], last[1]);
}

describe('hex play', () => {
  it('plays hexes level 1 to a win', () => {
    const lv = hexLevel1();
    expect(lv.kind).to.eq('hex');

    cy.visit('/');
    cy.get('[data-testid=pack-hexes]').click();
    cy.get('[data-testid=level-1]').click();
    cy.get('[data-testid=board]').should('be.visible');

    cy.window().then((win) => {
      const canvas = win.document.querySelector('[data-testid=board]') as HTMLCanvasElement;
      const wrap = canvas.parentElement as HTMLElement;
      const wr = wrap.getBoundingClientRect();
      const unit = hexLayout(SIZE, SIZE, 1);
      const s = Math.max(8, Math.floor(Math.min((wr.width || 320) / unit.w, (wr.height || 320) / unit.h)));
      const lay = hexLayout(SIZE, SIZE, s);
      for (const path of lv.solution) drawHexPath(win, canvas, lay, path as Array<[number, number]>);
    });

    cy.get('[data-testid=win-dialog]').should('be.visible');
    cy.get('[data-testid=moves-badge]').should('contain', `Moves ${lv.numPairs}`);
    cy.window().then((win) => {
      expect(win.localStorage.getItem('flow.stars.hexes.1')).to.eq('3');
    });
  });
});
