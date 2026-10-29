import type { BridgeAxis } from '../core/bridges';

type Command = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

// Reference artwork in a 128-unit tile: the 96-unit arch clears the
// 79.36-unit pipe underneath, with an 18-unit rise and short white tails.
const size = 128;
const pipeRatio = .62;
const halfPipe = size * pipeRatio / 2;
const upper = size / 2 - halfPipe;
const lower = size / 2 + halfPipe;
const apexRise = 18;
// Small rounded shoulders meet the straight tails horizontally. The central
// curve keeps the reference apex, and its tangents meet both shoulders.
const curve = (y: number, reverse = false): Command[] => {
  const x = (value: number): number => reverse ? size - value : value;
  const crownLift = (apexRise - 1) / .75;
  return [
    ['C', x(17), y, x(18.5), y - 2.25, x(20), y - 4],
    ['C', x(36), y - crownLift, x(92), y - crownLift, x(108), y - 4],
    ['C', x(109.5), y - 2.25, x(111), y, x(112), y],
  ];
};
const contour = (y: number, left: number, right: number): Command[] => [
  ['M', left, y], ['L', 16, y], ...curve(y), ['L', right, y],
];
const outline = [...contour(upper, 8, 120), ...contour(lower, 8, 120)];
const fill: Command[] = [
  ...contour(upper, 0, size), ['L', size, lower], ['L', 112, lower],
  ...curve(lower, true), ['L', 0, lower], ['Z'],
];

export const BRIDGE_ARTWORK = {
  size, pipeRatio, strokeWidth: 3, apexRise,
} as const;

/** Canvas and exported SVGs use these same contours, including the shoulders. */
export function traceBridgeArtwork(g: CanvasRenderingContext2D, part: 'fill' | 'outline'): void {
  g.beginPath();
  for (const command of part === 'fill' ? fill : outline) {
    switch (command[0]) {
      case 'M': g.moveTo(command[1], command[2]); break;
      case 'L': g.lineTo(command[1], command[2]); break;
      case 'C': g.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]); break;
      case 'Z': g.closePath(); break;
    }
  }
}

/** Transparent asset export; the live board supplies the raised pipe's color. */
export function bridgeArtworkSvg(axis: BridgeAxis): string {
  const name = axis === 'h' ? 'Horizontal' : 'Vertical';
  const path = outline.map(([command, ...values]) => command + values.map(value => Number(value.toFixed(5))).join(' ')).join('');
  const transform = axis === 'v' ? ` transform="translate(${size} 0) rotate(90)"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 ${size} ${size}" fill="none">
  <title>${name} bridge</title>
  <desc>White outlined arch spanning the full underlying pipe. Transparent background and center.</desc>
  <path${transform} d="${path}" stroke="#fff" stroke-width="${BRIDGE_ARTWORK.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}
