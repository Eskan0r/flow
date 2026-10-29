# Bridge artwork

Original artwork for roflow. The horizontal bridge carries a left/right pipe;
the vertical bridge rotates the same artwork 90 degrees for an up/down pipe.
Both SVGs have transparent centers and backgrounds. PNG exports are provided
at 256 and 512 pixels.

The live board and SVG exports share `src/app/board/bridge-artwork.ts`.
Its 128-unit tile contains a 96-unit arch spanning a 79.36-unit lower pipe,
an 18-unit apex rise, 8-unit white tails, and a 3-unit white outline.
Small curved shoulders join the tails smoothly to the arch while preserving
the reference width and height.

Render the underlying pipe first, fill the raised lane with its own color,
then draw the white contours. The fill reaches the tile edges to join the
neighboring pipe; only the white contours have inset ends. No pipe colors
are baked into the assets.

Regenerate the SVGs from the repository root:

```sh
node --experimental-strip-types --no-warnings public/assets/bridges/export-svg.mjs
```

After changing the artwork, refresh both PNG sizes from the generated SVGs,
preserving transparency.
