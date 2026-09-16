import type { Layout, MetroGraph, Pt, Agreement, StationSymbol, Polyline } from "../types";
import { STATION_FONT, LINE_FONT, LINE_H } from "../layout/labels";
export { LINE_W } from "../layout/geometry";

// Turns graph + layout into a pixel scene shared by the interactive view
// and the static SVG export. Layout is already in pixels; this translates
// so the bounding box (labels included) starts at PAD.

export const PAD = 48;

export type SceneLine = { id: string; label: string; color: string; d: string; labelX: number; labelY: number; labelAnchor: "start" | "middle" | "end"; labelBaseline: "hanging" | "middle" | "alphabetic" };
export type SceneStation = {
  id: string; label: string; detail: string; kind: "station" | "junction"; agreement?: Agreement;
  x: number; y: number; lineCount: number; symbol: StationSymbol; outOfSequence: string[];
};
export type SceneLabel = { id: string; x: number; y: number; anchor: "start" | "middle" | "end"; baseline: "hanging" | "middle" | "alphabetic"; lines: string[] };

// y of each display line so the block honours the placement baseline:
// hanging = first line at y, alphabetic = last line at y, middle = centred.
export function lineYs(y: number, n: number, font: number, baseline: SceneLabel["baseline"]): number[] {
  const lh = font * LINE_H;
  return Array.from({ length: n }, (_, i) => baseline === "hanging" ? y + i * lh : baseline === "alphabetic" ? y - (n - 1 - i) * lh : y + (i - (n - 1) / 2) * lh);
}
export type Scene = { width: number; height: number; lines: SceneLine[]; stations: SceneStation[]; labels: SceneLabel[]; fonts: { station: number; line: number } };

// Polyline with per-vertex corner radii to an SVG path with quadratic corners.
export function roundedPath(poly: Polyline): string {
  const { pts, radii } = poly;
  const f = (n: number) => n.toFixed(1);
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], v = pts[i], n = pts[i + 1];
    const lIn = Math.hypot(v[0] - p[0], v[1] - p[1]) || 1, lOut = Math.hypot(n[0] - v[0], n[1] - v[1]) || 1;
    const rr = Math.min(radii[i] ?? 0, lIn / 2.05, lOut / 2.05);
    if (rr < 0.5) { d += ` L${f(v[0])} ${f(v[1])}`; continue; }
    const a: Pt = [v[0] - ((v[0] - p[0]) / lIn) * rr, v[1] - ((v[1] - p[1]) / lIn) * rr];
    const b: Pt = [v[0] + ((n[0] - v[0]) / lOut) * rr, v[1] + ((n[1] - v[1]) / lOut) * rr];
    d += ` L${f(a[0])} ${f(a[1])} Q${f(v[0])} ${f(v[1])} ${f(b[0])} ${f(b[1])}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${f(last[0])} ${f(last[1])}`;
  return d;
}

// Stadium (capsule) between two points, or a circle when they coincide.
export function hullPath(a: Pt, b: Pt, r: number): string {
  const f = (n: number) => n.toFixed(1);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.5) return `M${f(a[0] - r)} ${f(a[1])} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const v: Pt = [-u[1] * r, u[0] * r];
  return `M${f(a[0] + v[0])} ${f(a[1] + v[1])} L${f(b[0] + v[0])} ${f(b[1] + v[1])} A${r} ${r} 0 0 0 ${f(b[0] - v[0])} ${f(b[1] - v[1])} L${f(a[0] - v[0])} ${f(a[1] - v[1])} A${r} ${r} 0 0 0 ${f(a[0] + v[0])} ${f(a[1] + v[1])} Z`;
}

export function buildScene(graph: MetroGraph, layout: Layout): Scene {
  const bb = layout.bbox;
  const tx = PAD - bb.x0, ty = PAD - bb.y0;
  const T = (p: Pt): Pt => [p[0] + tx, p[1] + ty];
  const lineById = new Map(graph.lines.map((l) => [l.id, l]));
  const stationById = new Map(graph.stations.map((s) => [s.id, s]));
  const lines: SceneLine[] = layout.lines.map((ll) => {
    const g = lineById.get(ll.id)!;
    const lab = layout.lineLabels.find((x) => x.id === ll.id)!;
    return { id: ll.id, label: g.label, color: g.color, d: roundedPath({ pts: ll.path.pts.map(T), radii: ll.path.radii }), labelX: lab.x + tx, labelY: lab.y + ty, labelAnchor: lab.anchor, labelBaseline: lab.baseline };
  });
  const moveSymbol = (s: StationSymbol): StationSymbol =>
    s.type === "tick" ? { ...s, from: T(s.from), to: T(s.to) } : s.type === "ring" ? { ...s, c: T(s.c) } : { ...s, a: T(s.a), b: T(s.b) };
  const stations: SceneStation[] = layout.stations.map((ls) => {
    const g = stationById.get(ls.id)!;
    const [x, y] = T(ls.c);
    return { id: ls.id, label: g.label, detail: g.detail, kind: g.kind, agreement: g.agreement, x, y, lineCount: g.lines.length, symbol: moveSymbol(ls.symbol), outOfSequence: ls.outOfSequence };
  });
  const labels: SceneLabel[] = layout.labels.map((l) => ({ id: l.id, x: l.x + tx, y: l.y + ty, anchor: l.anchor, baseline: l.baseline, lines: l.lines?.length ? l.lines : [stationById.get(l.id)?.label ?? l.id] }));
  return { width: bb.x1 - bb.x0 + PAD * 2, height: bb.y1 - bb.y0 + PAD * 2, lines, stations, labels, fonts: { station: STATION_FONT, line: LINE_FONT } };
}

export const AGREEMENT_STYLE: Record<Agreement, { stroke: string; dash?: string }> = {
  convergent: { stroke: "#111111" },
  divergent: { stroke: "#d32f2f", dash: "5 3" },
  mixed: { stroke: "#e69500", dash: "5 3" },
};
