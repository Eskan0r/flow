# roflow - Angular + shadcn-style UI

Flow Free rebuilt with **Angular 21**, **Tailwind CSS v4**, and **Spartan**
(the shadcn-style component system for Angular: brain primitives from npm,
helm styles owned in `src/app/ui/`).

Connect matching dots, fill the whole board. Same seeded generator as
before — every puzzle solvable by construction.

## Screens

- **Packs** — Daily Puzzles (5 fresh boards a day, sizes 5-5-6-7-8 with
  hexes mixed in, streak for full clears), Regular Pack (150), Bonus Pack
  (150), Hexes (60 hexagonal-tile levels),
  Bridges (60 levels introducing one, two, then three or four crossings),
  each with done / total progress, plus free play.
- **Levels** — numbered grid per pack; finished levels keep their stars.
- **Game** — the board fills the viewport; controls dock in a side rail on
  desktop and collapse to a bottom bar on phones.

## Run it

```sh
npm install          # first time only (repo ships a .npmrc: npm 10 needs --legacy-peer-deps)
npm start            # dev server → http://localhost:4200
```

Production:

```sh
npm run build        # → dist/flow-web/
npx --yes serve dist/flow-web/browser
```

## Test it

```sh
npm test             # six framework-free node suites, plain node:
                     #   topology → generator/validate → hex → engine → bridges → packs
npm run test:unit    # vitest: engine specs + full AppComponent play-through to a win dialog
```

Each node suite prints `ALL … CHECKS PASSED` on success (topology math,
generator solvability, hex fuzz, engine gameplay, pack integrity). Plain
node runs the TypeScript sources directly via `--experimental-strip-types`
plus the `tests/hooks.mjs` ESM loader.

End-to-end (real browser, headless Electron):

```sh
npm run test:e2e      # starts ng serve, waits for :4200, runs cypress run
npx cypress open      # interactive runner (needs the dev server up: npm start)
```

6 e2e specs / 23 tests in `cypress/e2e/` (`controls` 8, `packs` 6, `moves`
3, `play` 3, `share` 2, `hex` 1): pack navigation, a full pointer-event
play-through of Regular 1 to a 3-star win (solution computed from the same
seeded generator), Next-to-level-2 with persisted progress, undo / reset /
hint / new / seed / daily / right-click clear. Stable selectors live on
`data-testid` attributes.

## How levels work

The Bridges pack has 60 precomputed, validated square boards: levels 1–20
are 5×5 with one bridge; 21–40 are 6×6 with two; 41–50 are 7×7 with three;
51–60 are 7×7 with four. Each crossing has independent horizontal and vertical
lanes. Pipes go straight through a bridge; filling both lanes with different
colors is required for a win. Drawing or hinting one lane preserves the
perpendicular pipe. Tap an exposed arm of a crossing to grab its pipe; the
center selects the raised pipe. Right-click uses the same lane selection.

Original white arched bridge assets are in `public/assets/bridges/`, with
horizontal and vertical SVGs plus transparent PNGs at 256 and 512 pixels.
The pipe colors are drawn dynamically beneath the white outlines.

Across every mode, matching endpoints must be nonadjacent (including across
open warp seams), and a pipe cannot pad its length by touching an earlier,
nonconsecutive part of itself. Such moves are refused while drawing and
cannot win. Bridge lanes are checked independently. The bridge pack is
generated with the same rule, so its published solutions contain no such
loops. Regenerated bridge boards use fresh progress and best-score keys.

`npm run generate:bridges` regenerates and validates the deterministic pack
offline using a graph with two separate vertices at each bridge. Shipped
boards include their solutions for hints, so playing does not run a search.

The Warps pack introduces one left/right passage in levels 1–20, one
top/bottom passage in 21–25, one passage on each axis in 26–30, two on each
axis in 31–35, and three on each axis in 36–40. Levels 41–60 have fully
wrapped edges. Solid border segments are walls; glowing dashed segments
are warp passages. Every introductory solution uses its available warp
axis (both axes on mixed boards).

Starting October 30, 2026, about 2% of daily puzzles are warps, only in
slots 4–5 and at most once a day. Most use one or two passages per active
axis; roughly 5% of those warp dailies have fully wrapped edges (about
0.1% of all dailies). Earlier daily boards keep their published rules.

Bridges also joins the daily rotation starting October 30, 2026. Early
slots use 5×5 boards with one bridge, the middle slot uses 6×6 boards with
two, and hard slots use 7×7 boards with three or four. The date selects a
validated board, rotation, reflection and color order. Bridge dailies keep
the same saved-attempt, hint, undo, one-shot completion and sharing rules.

`src/app/core/flow-generator.ts` (framework-free, also exercised by `npm test`):

1. Hamiltonian **snake** covers the board.
2. Seeded **backbite** shuffle keeps it smooth, not twisty.
3. **Sequential backtracking partition** cuts balanced segments, each
   verified clean as placed: no self-touch, no 2×2 blocks, endpoints never
   adjacent, at most one straight line, zero border-to-border straights.
   The partition IS a full-coverage solution.
4. Best of dozens of candidates by spread/balance/directness scoring, with
   medium-roughness and best-effort fallbacks that keep the same
   solvability guarantees. Minimum flow length 4 — never a 2-cell wriggle.

Same seed + size = same puzzle. Share via URL (`?seed=…&size=…`, `?level=…`).

## Controls

- Drag from a dot to draw. Drawing over a pipe cuts it; drag back in the
  same stroke to un-cut. Fast swipes prefer empty lanes over cutting.
- Touching the matching dot connects the flow, but the stroke stays live:
  pushing past the dot is refused, dragging back out keeps control to
  re-route the tail. Release finalizes the move.
- Drag from the middle of a pipe to re-route. Right-click a pipe to clear.
- Side rail (or bottom bar on phones): Undo (preserves moves already spent;
  no extra move penalty or hint refund) / Reset
  (clears the board and zeroes moves; disabled on dailies) / Hint / New. Menu: sizes, seeds,
  levels, daily, sound. Keyboard: `U` `R` `H` `N`.
- Moves collapse by color: consecutive strokes on the same color cost one
  move total — finishing a color across several releases, or immediately
  re-routing it, adds nothing. Touching a different color banks a new
  move, so switching back and forth is what costs.
- Win = all pairs linked and board 100% filled. Minimum moves with no
  hints earns ★ PERFECT, anything else gets a ✓ COMPLETE; both show time,
  moves, Replay, and Next (Home after a daily).
- Daily wins show the share card right in the dialog with a Copy button
  (Wordle-style: one glyph per daily, streak, total best time on full
  clears); the dailies list header shares too. Progress lives in
  localStorage — no accounts, no backend (see Storage below).

## Storage

Everything persists in the browser's localStorage, per device and per
subdomain — there is no backend:

- `flow.stars.<pack>.<level>` — best stars per pack level
- `flow.daily.done` — completed daily labels (`YYYY-MM-DD-index`)
- `flow.dstars.<date>-<index>` — best stars per daily
- `flow.best.<seed>.s<rows>x<cols>` — best time + moves per puzzle;
  hex, warp and chain variants have separate suffixes
- `flow.attempt.<daily-seed>` — unfinished daily paths, moves, hints, undo
  history and elapsed time; restored when that daily is opened again

Daily attempts survive refresh, menu navigation and seed entry. Daily seeds
always load their canonical board; settings cannot replace their geometry.
The clock pauses in menus. Refreshing an active daily retains its elapsed
time, including time since its last checkpoint. The current route lives in
the URL; a bare visit opens the pack list.

The streak counts consecutive days with all 5 dailies complete (ending
today or yesterday), computed from the stored completion dates — no
server clock involved. Same-device only: clearing site data wipes it,
and two devices don't sync. Share links work because boards are
deterministic from their seeds.

## Layout

- `src/app/core/` — `topology.ts` (square + hex grid math, snake build),
  `carve.ts` (backbite carving helpers), `flow-generator.ts`, `flow-engine.ts`
  (pure game logic, no DOM), `packs.ts` (pack defs + daily seeds/share
  cards), `flow-store.ts` (signals, clock, persistence, sounds, win dialog),
  `sound.ts`; `.spec.ts` files sit beside `flow-engine.ts` and `topology.ts`
- `src/app/board/` — black canvas renderer + pointer engine
- `src/app/win-dialog/` — win dialog content (opens via `HlmDialogService`)
- `src/app/app.ts` / `app.html` — shadcn-style shell (header, setup card,
  bottom bar, toast)
- `src/app/ui/` — helm components (button, input, dialog, badge, switch,
  separator, label, utils) generated from Spartan templates with the luma
  style transform applied
- `tests/` — node suites + tiny ESM loader so plain node can import the TS
  sources (`--experimental-strip-types`)
