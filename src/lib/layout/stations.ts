import type { Pt } from "../types";
import { dirIndex } from "./geom";
import type { LGEdge } from "./linegraph";

// Exclusive stations of every line on an edge are pooled and spread along
// the shared path: turning-point stations snap to bends, the rest take even
// spacing at least 2 cells from bends, node ends and each other, relaxing
// in stages when the edge is too short.
export function placeEdgeStations(cells: Pt[], e: LGEdge, uIsTerminal: boolean, vIsTerminal: boolean): Map<string, number> {
  const out = new Map<string, number>();
  const n = cells.length - 1;
  const bends = new Set<number>();
  for (let i = 1; i < n; i++) {
    const d0 = dirIndex(cells[i][0] - cells[i - 1][0], cells[i][1] - cells[i - 1][1]);
    const d1 = dirIndex(cells[i + 1][0] - cells[i][0], cells[i + 1][1] - cells[i][1]);
    if (d0 !== d1) bends.add(i);
  }
  const lo = uIsTerminal ? 0 : 2, hi = vIsTerminal ? n : n - 2;
  type Item = { sid: string; target: number; turning: boolean };
  const pool: Item[] = [];
  for (const [, p] of e.per) {
    const m = p.stations.length;
    p.stations.forEach((sid, k) => pool.push({ sid, target: lo + ((k + 1) * (hi - lo)) / (m + 1), turning: p.turning.has(sid) }));
  }
  pool.sort((a, b) => a.target - b.target || (a.sid < b.sid ? -1 : 1));
  const taken: number[] = [];
  for (const it of pool) {
    if (!it.turning) continue;
    let best = -1, bestD = Infinity;
    for (const bi of bends) {
      if (bi < lo || bi > hi || taken.some((t) => Math.abs(t - bi) < 2)) continue;
      const d = Math.abs(bi - it.target);
      if (d < bestD) { bestD = d; best = bi; }
    }
    if (best >= 0) { out.set(it.sid, best); taken.push(best); }
  }
  const stages = [
    { bend: 2, gap: 2 },
    { bend: 0, gap: 2 },
    { bend: 0, gap: 1 },
    { bend: 0, gap: 0 },
  ];
  for (const it of pool) {
    if (out.has(it.sid)) continue;
    let best = -1;
    for (const st of stages) {
      let bestD = Infinity;
      for (let i = Math.max(0, lo); i <= Math.min(n, hi); i++) {
        if (st.bend > 0 && [...bends].some((bi) => Math.abs(bi - i) < st.bend)) continue;
        if (st.gap > 0 && taken.some((t) => Math.abs(t - i) < st.gap)) continue;
        const d = Math.abs(i - it.target);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) break;
    }
    if (best < 0) best = Math.max(0, Math.min(n, Math.round(it.target)));
    out.set(it.sid, best); taken.push(best);
  }
  return out;
}
