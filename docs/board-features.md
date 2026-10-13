# Board Features Research

Planning notes for five new board features on top of the existing Flow
Free-style generator/engine. **No implementation yet** — this is the
research + design pass. We build them **one at a time** in the order at the
bottom.

## The seam: `Topology`

Everything in the generator/engine already talks to boards through the
`Topology` interface (`src/app/core/topology.ts:9`):

```
kind, rows, cols, total,
key(r,c), inBounds(r,c), neighbors(r,c), distance(a,b),
isBorder(cell), stepOptions(from,to), collinear(cells)
```

`hexTopology(rows, cols)` (`topology.ts:95`) already takes independent
`rows`/`cols`, and `carve.ts` fills arbitrary free-cell regions purely via
`neighbors()` (`carve.ts:29`). So four of the five features are "feed in a
different `Topology`"; only the chain feature (#5) is an input mechanic.

Live precedent (Big Duck spinoffs, Doug Osborne's generator post):

- **Rectangle / Extreme Rectangle** packs (8x11 .. 12x15).
- **Warps** — wrap-around edges.
- **Bridges / walls / portals**, and irregular "board patterns" (hive,
  step, block-step, river, inkblot).
- Osborne's key quote: warps "just update the adjacent tiles ... the
  generator itself hardly needed any changes"; different tile shapes "just
  need to be told which tiles are adjacent to each other". That is exactly
  our `neighbors()`.

---

## 1. Rectangular boards (non-square)

**Goal:** `rows != cols` square grids (e.g. 5x7).

**Approach**

- Add a `rectTopology(rows, cols)` **alongside** `squareTopology(size)` and
  keep `squareTopology` for backward compatibility (existing packs, dailies,
  bests keys and URL params all assume square `size`). Internally
  `squareTopology(n)` can become `rectTopology(n, n)`.
- Keying: `squareTopology.key` uses `r*size + c` (`topology.ts:42`). `rect`
  must use `r*cols + c` — which is exactly what `hexTopology.key` already
  does (`topology.ts:116`). Same stride rule for both.
- `buildSnake(rows, cols)` already takes independent dimensions
  (`flow-generator.ts:85`) — no change needed.
- `generateLevel` already accepts `opts.rows/cols` (`flow-generator.ts:373`)
  but the square branch indexes with `size` and ignores them
  (`flow-generator.ts:383`). Wire `rows/cols` through.
- `lengthBounds` / `defaultPairsForSize` use `size*size`
  (`flow-generator.ts:247,258`); use `rows*cols`.

**UI / persistence**

- `flow-engine.size` is a single number used in several places
  (`flow-engine.ts:69`, store subtitle `flow-store.ts:509`). Add `rows/cols`
  or a shape descriptor; keep `size` for square.
- `board.component.ts:107` sizes square boards to `min(availW, availH)` and
  `center()`/`evCell()` use `cssW / cols` only (`board.component.ts:128,262`).
  Needs `cellW = cssW/cols`, `cellH = cssH/rows`, and a `cssH` driven by
  rows.
- `Pack` (`packs.ts:6`) has `sizeForLevel(n) -> number`; change to a shape
  descriptor `{rows, cols}` (or `{kind, rows, cols, ...}` shared with 2-4).
- Best/route persistence keyed by `seed` + `size` (`flow-store.ts:721`,
  `persistRoute` `flow-store.ts:128`) must encode rows/cols.

**Tests:** extend `tests/topology.mjs`, `tests/validate.mjs`,
`tests/engine.mjs` with a non-square case; add a `rect` season to the
generator fuzz.

**Effort: low.** Do this first; it defines the shape descriptor the rest use.

---

## 2. Polyomino / irregular board shapes (square cells)

**Goal:** a connected region of square cells (stair-step, L/T/S tetromino,
"triangle piece") — **not** literal triangular tiles. Just a cell mask.

**Approach**

- New topology backed by a `Set<key>` of playable cells. `inBounds` = "in
  the shape"; `neighbors` filters to shape cells; `isBorder` = cell has a
  neighbour outside the shape. `key`/stride stay dense over the bounding
  rectangle.
- **Keep the dense `grid`** sized over the bounding rect and add a
  `playable(r,c)` mask; set `topo.total` = number of playable cells. Do
  **not** compact keys — renderer, tests and persistence assume dense
  `r*stride + c`.
- **Generation:** `buildSnake` only tiles a rectangle, and
  `analyzeCut`/`segClean`/`validateLevel` index `rows x cols` with the 2x2
  mono check (`flow-generator.ts:187,284,606`). For arbitrary polyominoes a
  boustrophedon snake may not exist, so **lean on `carve.ts`** (it already
  fills arbitrary free regions and is used for hex precisely because the
  cut pipeline tangles on non-rectangular graphs). If a shape does admit a
  region-aware snake we can keep the faster cut path, but carve is the
  general answer.
- Coverage validation must count shape cells, not `rows*cols`
  (`validateLevel` `flow-generator.ts:567`).
- **Rendering:** `drawSquareGrid` draws the full grid
  (`board.component.ts:210`); draw only shape cells and stroke the shape
  boundary (inner + outer silhouette). Hit-testing (`evCell`,
  `board.component.ts:252`) must return null outside the shape.

**Risks:** parity / Hamiltonian feasibility on odd shapes; carve retries on
thin corridors (`TRIES_PER_FLOW`, `PATH_BUDGET` `carve.ts:16`).

**Effort: medium.**

---

## 3. Walls

**Goal:** interior blocked cells ("courtyard" style).

**Approach**

- Walls are a **special case of the mask** from #2: remove wall cells from
  the walkable set. A wall counts as an edge for `isBorder`, so pipes hug
  walls exactly like the board border (strategically strong: a dot one cell
  from a wall is forced).
- **Generation:** pre-mark wall cells non-empty, then carve through free
  cells (`carve.ts` gates on `grid[k] === -1`, `carve.ts:110`), or weave a
  region-aware snake around them. Reject masks with isolated free regions
  smaller than `minLen` (>= 4).
- **Aesthetics (second pass):** Osborne notes generator changes are easy
  but *"the work came in making the levels look like the walls."* A generic
  generator draws pipes that ignore the wall pattern; a "follow the walls"
  scoring/line term makes flows contour the walls (analogous to the existing
  `borderBoth` / `straights` penalties in `scoreClean`
  `flow-generator.ts:356`). Optional for v1.
- Coverage counts free (non-wall) cells only.

**Risks:** walls change parity/coverability; thin corridors exhaust carve.

**Effort: medium** (much of it shared with #2).

---

## 4. Warps (wrap-around / toroidal edges)

**Goal:** stepping off one edge re-enters the opposite edge.

**Approach**

- `neighbors()` wraps (`c-1 < 0 -> cols-1`, etc.).
- `distance()` becomes toroidal Manhattan:
  `min(|dr|, rows-|dr|) + min(|dc|, cols-|dc|)`.
- Square `stepOptions` uses a hand-rolled sign walk (`topology.ts:47`);
  switch it to the distance-based form hex already uses
  (`topology.ts:121`) so `stepsBetween` (`flow-engine.ts:309`) keeps
  preferring non-cutting routes near the seams. The engine is
  topology-agnostic here; the fix lives in `topology.ts`.
- **Generation** essentially unchanged (Osborne). Snake on a torus is still
  contiguous; `analyzeCut`'s `rows x cols` loops still work.
- **`collinear` caveat:** a wrapped straight line is still collinear, but the
  current `collinear` is rectilinear only; verify across the seam.
- **Input** is seamless: dragging off an edge lands on the wrapped cell
  automatically because the engine steps via `neighbors()`.
- **Rendering (the real work):** a wrapping pipe must leave one edge and
  re-enter the opposite. Cleanest: draw the board 3x3 tiled, offset by
  +/-W/+/-H, clipped to the centre tile — no per-flow special-casing. Alt:
  split the polyline at seams and restart mirrored.

**Precedent / difficulty:** Flow Free: Warps, Gareth Moore's toroidal
numberlink. Wrap makes even 5x5 "very challenging" (Moore) because the board
is globally connected — **isolate warps in their own pack**, don't mix into
early levels.

**Effort: medium.**

---

## 5. Continuous chain ("never lift the click")

**Goal (clarified):** when a flow completes, its end dot has **another
flow's start dot in an orthogonally-adjacent square** (up/down/left/right)
with a small tunnel/connection between them. Moving the cursor from the
completed dot across into the adjacent dot starts the next flow, and so on,
so the whole board can be finished in **one uninterrupted stroke**.

**Approach**

- **Engine handoff:** today `applyStep` refuses to push past an endpoint
  once `done[color]` (`flow-engine.ts:373`) and `pointerUp` finalizes
  (`flow-engine.ts:293`). Chain mode instead: detect the head reaching the
  pair dot -> mark that colour complete -> keep `active` alive under the
  **same `pid`** -> seed the next flow when the cursor enters its adjacent
  start dot. This is an **adjacency** chain (not a teleport).
- **Move-counting is the sleeper problem.** The current rule collapses
  consecutive strokes on the same colour (`markChanged`,
  `flow-engine.ts:237`, `lastCounted`). A single stroke crossing *different*
  colours can't use colour-collapse; it needs a **chain/session id** so the
  whole run counts as one move. Undo/history must treat the handoff as a
  single action while preserving the "drag back out of the dot to re-route"
  invariant (`flow-engine.ts:273`).
- **Generation constraint:** on square boards, `buildSnake` produces a
  Hamiltonian path and `findCleanPartition` cuts it into **consecutive
  runs** (`flow-generator.ts:300`), so the end cell of segment *i* and the
  start cell of segment *i+1* are **adjacent by construction**. To make a
  level formally one-stroke solvable, add a pass that builds a graph over
  flows (edge when any endpoint of one is orthogonally adjacent to any
  endpoint of another) and checks for a Hamiltonian path over the flows.
  For `carve`-generated boards (hex / walls / shapes) adjacency is not
  automatic -> scoring bonus + retry, or a post-filter.
- **Ambiguity to resolve:** if several chains are possible, pick one (the
  level may be solvable in one stroke by *some* order). The requirement is
  "a full single-stroke solution exists and the engine can drive it".

**Effort: medium-high** (mostly engine/UX). Depends on endpoint geometry
across topologies -> do last.

---

## Cross-cutting

| Area | Location | Impact |
| --- | --- | --- |
| Shape descriptor | `Pack` `packs.ts:6`; seeds | `{kind, rows, cols, shape, walls, warps}` |
| Grid/indexing | `grid` sized `topo.total` (`flow-engine.ts:135`); `key` (`topology.ts:42`) | keep dense + `playable()` mask; `total` = playable count |
| Generator loops | `analyzeCut`/`segClean`/`validateLevel` (`flow-generator.ts:159,268,567`) | iterate the cell set, skip non-playable |
| Win check | `filledCount() === topo.total` (`flow-engine.ts:457`) | count playable cells only |
| Renderer | `fit`/`center`/`evCell`/`drawSquareGrid` (`board.component.ts:90-262`) | per-axis cell size; shape/wall outlines; warp seams |
| Persistence | `flow-store.ts:508`; bests key `flow-store.ts:721` | version the schema; encode shape in keys |
| Tests | `tests/*.mjs`; `npm test` (`package.json:9`) | add per-feature suites |

## Build order (one at a time)

- [x] **1. Rectangular (`rect`)** — DONE (2026-10-12). `rectTopology(rows, cols)`;
  `squareTopology(size)` now delegates. Generator uses `rows/cols`, seed
  namespace `::RxC:K` (identical to `::SxS` for squares). Engine `loadLevel`
  takes optional `rows/cols`; store routes/persists `rows`/`cols` params.
  `Pack.shapeForLevel(n)` added + new 60-level **Rectangles** pack (5x7 → 8x10).
  Board renderer sizes per-axis (fit/center/grid/evCell). `npm test` + build green.
- [x] **2. Polyomino mask** — DONE (2026-10-12). `maskTopology(rows, cols, mask)`
  + `Topology.cells`/`mask`; dense keys over the bounding rect, blocked cells
  seeded `-2` in carve. Masked boards carve (never the rect snake); deeper
  carve tuning + pair-count relaxation fallback. `GenerateOptions.mask`,
  `FlowLevel.mask`, engine `loadLevel(..., mask)`, `Pack.maskForLevel` + new
  60-level **Odd Shapes** pack (staircase/triangle/plus/band/U). Renderer draws
  only shape cells + silhouette. `npm test` + build green.
- [x] **3. Walls** — DONE (2026-10-12). Walls reuse the #2 mask: a board is
  the full rectangle minus a set of enclosed interior cells, and those cells
  are threaded as an explicit `walls` predicate (topology/`GenerateOptions`/
  `FlowLevel`/engine/`Pack.wallsForLevel`) so the renderer can tell a wall from
  an outside-of-shape hole. New 60-level **Walls** pack (6x6→8x8; centre
  block, pillars, bars, plus, staircase). Renderer fills wall cells solid.
  `npm test` + build green.
- [x] **4. Warps** — DONE (2026-10-12). `rectTopology(rows, cols, warp)` adds a
  torus: `neighbors` wrap, `distance` is toroidal Manhattan, `stepOptions` is
  distance-based (covers seams), `isBorder` is always false. Threaded through
  `GenerateOptions.warp`/`FlowLevel.warp` (own seed namespace `…:warp`),
  engine `loadLevel(..., warp)`, `Pack.warpForLevel` + new 60-level **Warps**
  pack (5x5→7x7). Renderer unwraps flow polylines and tiles the flow layer 3x3
  (clipped) so pipes/dots join across seams. `npm test` + build green.
- [x] **5. Continuous chain** — DONE (2026-10-13). Engine `chain` flag
  (`loadLevel(..., chain)`): completing a flow and dragging into an adjacent
  incomplete flow's dot hands the live stroke off under the same pid, history
  entry, and move (pre-claimed `lastCounted` via `ActiveStroke.preClaim`;
  single undo clears the whole chain). `flowChainPath(pairs, topo)` returns a
  traversable Hamiltonian order plus per-flow entry/exit dots; engine
  salt-retries chain boards until one is chainable (square snake partitions
  chain by construction, verified 120/120). Chain funnels: blocked edges
  (`engine.chainWalls`) wall the run's start/end dots on every side but the
  solution edge — enforced in `applyStep`/`stepsBetween`, drawn as cream
  brackets, solvability preserved since funneled dots touch no other
  solution. Chain perfect demands the single move (`moves <= 1`). Chain
  boards get a territory wash (owned cells tinted under grid/pipes). New
  60-level **Chains** pack (5x5→7x7, `Pack.chainForLevel`).
  `npm test` + build green.

## Review notes (independent pass)

- Confirmed: topology seam, polyomino-as-mask, chain-as-adjacency, snake
  adjacency-free-property.
- Level stability (2026-10-13): generation is fully deterministic — no
  wall-clock reads in the gen path (fixed iteration/restart counts replace
  time budgets; sort comparators draw jitter up front so rng call counts
  don't vary by JS engine). One seed deals the same level on every client;
  verified byte-identical across processes. No backend or baked level files
  needed (dailies are unbounded future dates, so they must generate live).
- Add: #5 move-count/session semantics + undo; dense grid + `playable()`
  (don't compact keys); `rect` alongside `squareTopology`; persistence
  schema versioning; new tests per feature; renderer boundary/warp handling;
  carve feasibility on thin corridors; retune invariants per topology (hex
  already tolerates more straights than square).


## Future Ideas

(prerequesite)
Requires backend, I have supabase account we can do it there unless you 
have a better idea, would just store google oauth credentials given
as well as preferences and money and such. 
- Add a shop tab that is disabled but visible to add users, when any
  users hover over the shop tab, a sign in with google button pops
  up like a disappearing game ui where if you do an action that 
  warrants seeing it then it'll pop up for like 30 seconds before 
  disappearing again or if you click a level, in which case it 
  would still be there but would look different or just be in 
  different places. Shop tab would have daily coins that you can
  collect, would be able to use money from the os.ronakchavva.com
  stock simulator.
- shop tab will have different skins, as well as a customizable base 
  background that any users as long as they have signed in with google
  would be able to change for free. like they could make their 
  background pink instead of white (default). 