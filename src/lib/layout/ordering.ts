import type { Pt } from "../types";
import type { LineGraph, LGEdge } from "./linegraph";

// Line ordering per edge, after LOOM: minimise crossings and separations at
// nodes. Order is stored left to right when looking from u toward v.
// Initial order from the exit angles at both ends, then a local search over
// permutations per edge.

type Routes = Map<string, Pt[]>;

function unit(a: Pt, b: Pt): Pt { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }

// Direction of edge e leaving node n.
function outDir(e: LGEdge, n: string, routes: Routes): Pt {
  const c = routes.get(e.id)!;
  return e.u === n ? unit(c[0], c[1]) : unit(c[c.length - 1], c[c.length - 2]);
}

// Signed angle from a to b; positive = clockwise on screen (y down) = right.
function turn(a: Pt, b: Pt): number { return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]); }

function seenFrom(order: string[], e: LGEdge, n: string): string[] { return e.u === n ? order : [...order].reverse(); }

export function orderLines(lg: LineGraph, routes: Routes): Map<string, string[]> {
  const orders = new Map<string, string[]>();
  const contOf = (e: LGEdge, n: string, line: string): LGEdge | null => {
    for (const fid of lg.adj.get(n) ?? []) { if (fid === e.id) continue; const f = lg.edges.get(fid)!; if (f.lines.includes(line)) return f; }
    return null;
  };
  // Angular key of a line at node n on edge e: where its continuation exits.
  const angleKey = (e: LGEdge, n: string, line: string): number | null => {
    const f = contOf(e, n, line);
    if (!f) return null;
    return turn(outDir(e, n, routes), outDir(f, n, routes));
  };
  for (const e of lg.edges.values()) {
    const keyed = e.lines.map((l) => {
      const ku = angleKey(e, e.u, l), kv = angleKey(e, e.v, l);
      // Looking u->v: at u we look back, so the sign flips.
      const parts = [ku === null ? null : -ku, kv].filter((x): x is number => x !== null);
      return { l, k: parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : 0 };
    });
    keyed.sort((a, b) => a.k - b.k || (a.l < b.l ? -1 : 1));
    orders.set(e.id, keyed.map((x) => x.l));
  }
  const costAt = (e: LGEdge, n: string, order: string[]): number => {
    const mine = seenFrom(order, e, n);
    let cost = 0;
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i], b = mine[j];
      const fa = contOf(e, n, a), fb = contOf(e, n, b);
      if (!fa || !fb) continue;
      if (fa.id === fb.id) {
        const other = seenFrom(orders.get(fa.id)!, fa, n);
        // Continuing through n, left and right swap: same order means a crossing.
        if (other.indexOf(a) < other.indexOf(b)) cost += 3;
        else if (j === i + 1 && Math.abs(other.indexOf(a) - other.indexOf(b)) !== 1) cost += 1;
      } else {
        const ta = turn(outDir(e, n, routes), outDir(fa, n, routes));
        const tb = turn(outDir(e, n, routes), outDir(fb, n, routes));
        // a is left of b when looking away from n, so a's exit must be more to the left (smaller turn).
        if (ta > tb + 1e-9) cost += 3;
      }
    }
    return cost;
  };
  const edgeCost = (e: LGEdge, order: string[]) => costAt(e, e.u, order) + costAt(e, e.v, order);
  const perms = (arr: string[]): string[][] => {
    if (arr.length <= 1) return [arr];
    const out: string[][] = [];
    arr.forEach((x, i) => { for (const p of perms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...p]); });
    return out;
  };
  const ids = [...lg.edges.keys()].sort();
  for (let sweep = 0; sweep < 4; sweep++) {
    let improved = false;
    for (const id of ids) {
      const e = lg.edges.get(id)!;
      if (e.lines.length < 2) continue;
      const cur = orders.get(id)!;
      let best = cur, bestC = edgeCost(e, cur);
      const cands = e.lines.length <= 5 ? perms(cur) : cur.flatMap((_, i) => i < cur.length - 1 ? [[...cur.slice(0, i), cur[i + 1], cur[i], ...cur.slice(i + 2)]] : []);
      for (const c of cands) { const cc = edgeCost(e, c); if (cc < bestC) { bestC = cc; best = c; } }
      if (best !== cur) { orders.set(id, best); improved = true; }
    }
    if (!improved) break;
  }
  return orders;
}
