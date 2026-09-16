// Shared data model. The graph (topology) is produced by the LLM; the
// layout (geometry) is produced deterministically from the graph.

export type Agreement = "convergent" | "divergent" | "mixed";
export type Stance = "agree" | "contradict" | "neutral";

export type Source = {
  doc: string;
  page: number | null;
  quote: string;
  charStart: number | null;
  charEnd: number | null;
};

export type Station = {
  id: string;
  label: string;
  lines: string[];
  kind: "station" | "junction";
  agreement?: Agreement;
  /** Per-line stance, parallel to `lines`; only for mixed junctions. */
  stances?: Stance[];
  detail: string;
  sources: Source[];
};

export type Line = {
  id: string;
  label: string;
  color: string;
  stations: string[];
  /** Indices into `stations` after which a bend is allowed at discount. */
  turningPoints: number[];
};

export type MetroGraph = {
  lines: Line[];
  stations: Station[];
};

export type DocumentRecord = {
  id: string;
  name: string;
  mime: string;
  /** Full extracted text; page breaks are recorded in `pages`. */
  text: string;
  /** charStart of each page in `text` (index 0 = page 1). */
  pages: number[];
};

// ---- layout output ----
// All layout geometry is in pixels at the reference scale (CELL px per grid
// cell), origin at grid cell (0,0). The renderer only translates.

export type Pt = [number, number];
export type Box = { x0: number; y0: number; x1: number; y1: number };

export type Polyline = { pts: Pt[]; radii: number[] };

export type StationSymbol =
  | { type: "tick"; from: Pt; to: Pt; color: string }
  | { type: "ring"; c: Pt; color: string }
  | { type: "hull"; a: Pt; b: Pt; r: number };

export type LayoutStation = {
  id: string;
  /** centre for label anchoring and hit testing */
  c: Pt;
  symbol: StationSymbol;
  /** lines whose document order this junction breaks */
  outOfSequence: string[];
};

export type LayoutLine = {
  id: string;
  path: Polyline;
};

export type LabelPlacement = {
  id: string;
  x: number;
  y: number;
  /** text split into display lines */
  lines: string[];
  anchor: "start" | "middle" | "end";
  baseline: "hanging" | "middle" | "alphabetic";
};

export const LAYOUT_VERSION = 3;

export type Layout = {
  version: number;
  grid: { W: number; H: number };
  /** extent of everything drawn, labels included */
  bbox: Box;
  lines: LayoutLine[];
  stations: LayoutStation[];
  labels: LabelPlacement[];
  lineLabels: LabelPlacement[];
};

export type MapRecord = {
  id: string;
  createdAt: string;
  account: string;
  title: string;
  documents: DocumentRecord[];
  graph: MetroGraph;
  layout: Layout;
  /** hash of documents + prompt; identical inputs reuse the graph */
  inputHash: string;
};
