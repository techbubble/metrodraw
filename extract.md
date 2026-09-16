# Metro Graph Extraction

You are given several documents. Produce the topology of one metro map that
compares them. You output structure only: which points each document makes,
in what order, and which points several documents share. You never output
coordinates; a layout engine draws the map from your graph.

## Lines

- Each document is exactly one line. Use the document id given in the
  `<document id="...">` tag as the line id. The line label is a short
  citation-style name for the document (author and year, or a short
  title), at most 24 characters, normal words, never truncated mid-word.
- A line's `stations` is the ordered list of station ids, in the order the
  document makes those points. Include every junction the document
  participates in. 4 to 14 stations per line.
- `turningPoints` are indices into `stations` where the document pivots:
  changes subject, moves from method to result, reverses its position.
  Typically 1 to 3 per line. Never index 0 or the last station.

## Stations

- A station is one point a document expresses: a claim, finding, method,
  assumption or conclusion. Label: 1 to 4 words, at most 26 characters,
  ordinary words separated by spaces, unique across the map. Never
  CamelCase, never a numeric suffix, never a word chopped mid-way.
- `detail`: 1 to 3 sentences for the hover popup, stating the point in
  plain language and, for junctions, how the documents relate on it.
- `sources`: one entry per line through the station. `quote` is a VERBATIM
  excerpt from that document, 8 to 40 words, copied exactly from the text
  including its punctuation, so the passage can be located and
  highlighted. `page` is the page number from the `<page n="...">` marker
  the quote sits in, or null when the document has no page markers.

## Junctions

A junction is a station listed by two or more lines: the same point,
expressed by several documents. This is the map's purpose; get it right.

- Two documents saying the same thing in different words resolve to ONE
  junction. Two documents saying different things in similar words do
  NOT. Test: could one sentence state the point such that each document
  would recognise it as its own claim? If yes, junction.
- `agreement`:
  - `convergent`: the documents make the point and agree on it.
  - `divergent`: the documents address the same point and contradict each
    other (opposite findings, opposite recommendations, one disputes the
    other).
  - `mixed`: three or more lines where some agree and at least one
    contradicts. Then also fill `stances`, parallel to `lines`, with
    `agree`, `contradict` or `neutral` for each line.
- A junction's `lines` lists every line that passes through it, and each
  of those lines lists the junction id in its `stations`.
- Aim for 2 to 8 junctions on a typical set. Do not force a junction where
  documents merely mention the same topic without making the same point.

## Ordering

If document A makes point X before Y and document B makes Y before X, keep
each line's own order in `stations`. The layout engine resolves it.

## Colors

Assign each line a distinct hex color from this palette, in order:
#e4002b, #0019a8, #00843d, #ffd329, #9b0058, #ff6600, #0098d4, #6c757d.
