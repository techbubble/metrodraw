import type { MetroGraph, Pt } from "../types";
import type { LineOrder } from "./order";
import { cheb } from "./geom";

export const MIN_JUNCTION_GAP = 3;

// Stage 2: place junctions. A seeded force-directed pass on the junction-only
// graph gives initial positions; they are snapped to the integer grid and
// pushed apart until every pair is at least MIN_JUNCTION_GAP cells apart.
export function placeJunctions(
  graph: MetroGraph,
  orders: Map<string, LineOrder>,
  W: number,
  H: number,
  rng: () => number
): Map<string, Pt> {
  const junctions = graph.stations.filter((s) => s.lines.length >= 2).map((s) => s.id);
  const result = new Map<string, Pt>();
  if (junctions.length === 0) return result;
  const idx = new Map(junctions.map((j, i) => [j, i]));
  const m = 3;
  const L = graph.lines.length;
  const rowOf = new Map(graph.lines.map((l, i) => [l.id, m + ((i + 0.5) * (H - 2 * m)) / L]));

  // Targets: x from aggregate position, y from the mean row of the lines.
  const tx = new Float64Array(junctions.length);
  const ty = new Float64Array(junctions.length);
  const cnt = new Float64Array(junctions.length);
  const edges: { a: number; b: number; rest: number }[] = [];
  // Consecutive junction triples on a line; pushed toward straightness so
  // a line does not have to reverse at a junction.
  const triples: { a: number; c: number; rest: number }[] = [];
  for (const l of graph.lines) {
    const ord = orders.get(l.id)!.order;
    const n = Math.max(1, ord.length - 1);
    let prev = -1, gap = 0;
    const chain: number[] = [];
    ord.forEach((sid, i) => {
      const j = idx.get(sid);
      if (j === undefined) { gap++; return; }
      tx[j] += m + (i / n) * (W - 2 * m);
      ty[j] += rowOf.get(l.id)!;
      cnt[j]++;
      if (prev >= 0) edges.push({ a: prev, b: j, rest: Math.min(14, MIN_JUNCTION_GAP + 2 * gap + 1) });
      prev = j;
      gap = 0;
      chain.push(j);
    });
    for (let i = 2; i < chain.length; i++) {
      const e1 = edges[edges.length - (chain.length - i) - 1], e2 = edges[edges.length - (chain.length - i)];
      triples.push({ a: chain[i - 2], c: chain[i], rest: (e1?.rest ?? 4) + (e2?.rest ?? 4) });
    }
  }
  const x = new Float64Array(junctions.length);
  const y = new Float64Array(junctions.length);
  for (let i = 0; i < junctions.length; i++) {
    tx[i] /= cnt[i] || 1;
    ty[i] /= cnt[i] || 1;
    x[i] = tx[i] + (rng() - 0.5) * 4;
    y[i] = ty[i] + (rng() - 0.5) * 4;
  }
  const fx = new Float64Array(junctions.length);
  const fy = new Float64Array(junctions.length);
  for (let it = 0; it < 400; it++) {
    fx.fill(0); fy.fill(0);
    for (const e of edges) {
      const dx = x[e.b] - x[e.a], dy = y[e.b] - y[e.a];
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - e.rest) * 0.06;
      fx[e.a] += (f * dx) / d; fy[e.a] += (f * dy) / d;
      fx[e.b] -= (f * dx) / d; fy[e.b] -= (f * dy) / d;
    }
    for (const t of triples) {
      const dx = x[t.c] - x[t.a], dy = y[t.c] - y[t.a];
      const d = Math.hypot(dx, dy) || 0.01;
      if (d < t.rest) {
        const f = (t.rest - d) * 0.04;
        fx[t.a] -= (f * dx) / d; fy[t.a] -= (f * dy) / d;
        fx[t.c] += (f * dx) / d; fy[t.c] += (f * dy) / d;
      }
    }
    for (let i = 0; i < junctions.length; i++) {
      for (let j = i + 1; j < junctions.length; j++) {
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const d = Math.hypot(dx, dy) || 0.01;
        const R = MIN_JUNCTION_GAP * 2.5;
        if (d < R) {
          const f = ((R - d) / R) * 0.5;
          const ux = d < 0.02 ? (i < j ? 1 : -1) : dx / d;
          const uy = d < 0.02 ? 0 : dy / d;
          fx[i] -= f * ux; fy[i] -= f * uy;
          fx[j] += f * ux; fy[j] += f * uy;
        }
      }
      fx[i] += (tx[i] - x[i]) * 0.02;
      fy[i] += (ty[i] - y[i]) * 0.015;
    }
    const damp = 1 - it / 500;
    for (let i = 0; i < junctions.length; i++) {
      x[i] = Math.min(W - 1 - m, Math.max(m, x[i] + fx[i] * damp));
      y[i] = Math.min(H - 1 - m, Math.max(m, y[i] + fy[i] * damp));
    }
  }
  const pos: Pt[] = junctions.map((_, i) => [Math.round(x[i]), Math.round(y[i])]);
  // Grid collision resolution.
  for (let it = 0; it < 500; it++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        if (cheb(pos[i], pos[j]) >= MIN_JUNCTION_GAP) continue;
        moved = true;
        const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1];
        const axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
        const cur = axis === 0 ? dx : dy;
        const sign = cur > 0 ? 1 : cur < 0 ? -1 : (i + j) % 2 === 0 ? 1 : -1;
        const need = MIN_JUNCTION_GAP - Math.abs(cur);
        const lo = m, hi = axis === 0 ? W - 1 - m : H - 1 - m;
        const a = Math.ceil(need / 2), b = need - a;
        pos[i][axis] = Math.min(hi, Math.max(lo, pos[i][axis] - a * sign));
        pos[j][axis] = Math.min(hi, Math.max(lo, pos[j][axis] + b * sign));
        if (cheb(pos[i], pos[j]) < MIN_JUNCTION_GAP) {
          // Clamped against a wall: push the other one the full distance.
          const other = axis === 0 ? 1 : 0;
          const ohi = other === 0 ? W - 1 - m : H - 1 - m;
          pos[j][other] = Math.min(ohi, Math.max(lo, pos[j][other] + MIN_JUNCTION_GAP * ((i + j) % 2 === 0 ? 1 : -1)));
        }
      }
    }
    if (!moved) break;
  }
  junctions.forEach((j, i) => result.set(j, pos[i]));
  return result;
}
