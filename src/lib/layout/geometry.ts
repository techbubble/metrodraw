import type { LayoutLine, LayoutStation, Polyline, Pt, MetroGraph } from "../types";
import type { LineGraph, LGEdge } from "./linegraph";

export const CELL = 40;
export const TRACK = 8;
export const LINE_W = 6;
export const BEND_R = CELL * 0.6;

const px = (c: Pt): Pt => [c[0] * CELL, c[1] * CELL];
const unit = (a: Pt, b: Pt): Pt => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
// Left-hand normal when travelling along d (screen coordinates, y down).
const left = (d: Pt): Pt => [d[1], -d[0]];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

// Parallel offset of a cell path: one vertex per cell, mitred at bends,
// with bend radii concentric to the centre line.
export function offsetPath(cells: Pt[], o: number): Polyline {
  const P = cells.map(px);
  const n = P.length - 1;
  if (n < 1) return { pts: P, radii: [0] };
  const dirs = P.slice(0, -1).map((p, i) => unit(p, P[i + 1]));
  const pts: Pt[] = [], radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n || same(dirs[i - 1], dirs[i])) {
      const d = dirs[Math.min(i, n - 1)];
      const nl = left(d);
      pts.push([P[i][0] + nl[0] * o, P[i][1] + nl[1] * o]);
      radii.push(i === 0 || i === n ? 0 : BEND_R);
      continue;
    }
    const d1 = dirs[i - 1], d2 = dirs[i];
    const n1 = left(d1), n2 = left(d2);
    const a: Pt = [P[i - 1][0] + n1[0] * o, P[i - 1][1] + n1[1] * o];
    const b: Pt = [P[i][0] + n2[0] * o, P[i][1] + n2[1] * o];
    // Intersection of a + t*d1 and b + s*d2.
    const den = cross(d1, d2);
    const t = cross([b[0] - a[0], b[1] - a[1]], d2) / den;
    pts.push([a[0] + d1[0] * t, a[1] + d1[1] * t]);
    // Inside of the turn is on the left for a left turn (cross < 0).
    const inside = cross(d1, d2) < 0 ? 1 : -1;
    radii.push(Math.max(2, BEND_R - o * inside));
  }
  return { pts, radii };
}

export type EdgeGeometry = { edge: LGEdge; cells: Pt[]; order: string[]; per: Map<string, Polyline> };

export function edgeGeometry(e: LGEdge, cells: Pt[], order: string[]): EdgeGeometry {
  const k = order.length;
  const per = new Map<string, Polyline>();
  order.forEach((l, r) => per.set(l, offsetPath(cells, ((k - 1) / 2 - r) * TRACK)));
  return { edge: e, cells, order, per };
}

// Assemble each line's full path from its edges, joining across nodes with
// straight connectors (hidden under the interchange symbol).
export function linePaths(graph: MetroGraph, lg: LineGraph, geo: Map<string, EdgeGeometry>, trims: Map<string, { from: number; to: number }>): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const l of graph.lines) {
    const pts: Pt[] = [], radii: number[] = [];
    for (const eid of lg.lineEdges.get(l.id) ?? []) {
      const g = geo.get(eid)!;
      const p = g.per.get(l.id)!;
      const fwd = g.edge.per.get(l.id)!.forward;
      let seg = p.pts.map((q, i) => ({ q, r: p.radii[i] }));
      const trim = trims.get(`${eid}|${l.id}`);
      if (trim) seg = seg.slice(trim.from, trim.to + 1);
      if (!fwd) seg.reverse();
      if (pts.length && Math.hypot(pts[pts.length - 1][0] - seg[0].q[0], pts[pts.length - 1][1] - seg[0].q[1]) < 0.5) seg = seg.slice(1);
      for (const s of seg) { pts.push(s.q); radii.push(s.r); }
      if (radii.length) radii[radii.length - 1] = 0;
      if (seg.length && pts.length > seg.length) radii[pts.length - seg.length] = 0;
    }
    out.push({ id: l.id, path: { pts, radii } });
  }
  return out;
}

export function tickSymbol(p: Pt, dir: Pt, side: number, color: string): LayoutStation["symbol"] {
  const nl = left(dir);
  const s = side;
  return { type: "tick", from: [p[0] + nl[0] * s * (LINE_W / 2), p[1] + nl[1] * s * (LINE_W / 2)], to: [p[0] + nl[0] * s * (LINE_W / 2 + 9), p[1] + nl[1] * s * (LINE_W / 2 + 9)], color };
}

export function hullSymbol(points: Pt[], r: number): LayoutStation["symbol"] {
  let a = points[0], b = points[0], best = -1;
  for (const p of points) for (const q of points) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d > best) { best = d; a = p; b = q; }
  }
  if (best < 1) b = a;
  return { type: "hull", a, b, r };
}

export function dirAt(pts: Pt[], i: number): Pt {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  return unit(a, b);
}

export function leftOf(d: Pt): Pt { return left(d); }
