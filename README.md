# MetroDraw

Upload several documents; get one metro map. Each document is a line,
stations are the points it makes, junctions are the points several
documents share. Hover a station for its summary; click it to open the
source document with the passage highlighted. Junctions where sources
agree, contradict, or split are drawn distinctly. Every map has its own URL
and exports to SVG or PNG with an attribution mark.

## Run

```
npm install
echo 'AI_GATEWAY_API_KEY="..."' > .env.local
npm run dev
```

## How it works

The model emits topology only; a deterministic layout engine emits geometry.
No coordinates come from the LLM.

1. `src/lib/extract/text.ts` turns PDF or text uploads into plain text with
   page offsets (pdf.js via `unpdf`).
2. `src/lib/extract/graph.ts` sends every document to the model with the
   brief in `extract.md` and receives lines, stations, junctions, agreement
   and verbatim source quotes. `locate.ts` resolves each quote to character
   offsets in the extracted text. One structural repair round if the graph
   is inconsistent. Graphs are cached by input hash under `data/cache`.
3. `src/lib/layout/` lays the graph out on an integer grid, following
   Bast, Brosi and Storandt (Metro Maps on Octilinear Grid Graphs, CGF
   2020) and LOOM for line ordering:
   `order.ts` resolves station-order conflicts by aggregate position;
   `linegraph.ts` builds the line graph (junctions and terminals as nodes,
   bundles of lines as edges) and the line-degree routing order;
   `junctions.ts` seeds junction positions (seeded force-directed, snapped,
   spaced); `route.ts` routes each bundled edge octilinearly with A* over
   (cell, heading, run length, discounted turns) and per-port bend costs at
   settled nodes; `index.ts` then local-searches node positions by
   re-routing adjacent edges (with a spring term so edges stay long enough
   for their stations); `ordering.ts` orders the lines on each edge to
   minimise crossings and separations at nodes; `stations.ts` spreads each
   edge's stations along the shared path; `geometry.ts` builds parallel
   offset polylines with mitred joins and concentric bend radii, tick and
   ring station symbols, and hull (stadium) interchange symbols spanning
   the tracks; `labels.ts` places labels from candidates around each
   symbol, junctions first, with a re-placement pass.
   Routing costs (`route.ts`): hop 2, diagonal +1, bends 2/5/12 for 45/90/135
   degrees, +8 for a bend within 3 cells of the previous one, turning-point
   bends at a quarter, 15 for sharing a cell with another edge.
4. `src/lib/render/scene.ts` turns graph + layout into pixel geometry shared
   by the interactive view (`components/MetroMap.tsx`) and the static SVG
   export (`render/svg.ts`).

Maps persist as JSON under `data/maps`, one index per anonymous account
(cookie) under `data/accounts`, capped at 25 maps per account. Replace
`src/lib/store.ts` with Blob or a database before deploying to more than one
host.

## Limits

- 8 documents per map, 15 MB and 80,000 characters per document.
- Exports carry the MetroDraw mark and the map's short URL.
