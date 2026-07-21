# mewmew

A mobile-first, one-thumb whiteboard — interactive prototype.

Open [`index.html`](index.html) in any browser. No build, no dependencies, no backend — the whole app is a single self-contained file and all board state is saved locally in the browser (`localStorage`).

## What works

- **Notes** — add, move, edit, recolor, and resize sticky notes
- **Text** — drop free text anywhere
- **Arrows** — connect two notes; connectors re-route live as notes move
- **Pan & zoom** — one-finger pan, two-finger pinch, on-screen zoom, and wheel/trackpad zoom on desktop
- **Selection tools** — color swatches + delete for notes/text, delete for arrows
- **Persistence** — the board is restored automatically on reload

Optimized for touch/mobile, responsive up to large screens (the canvas grows; the controls stay a fixed size).
