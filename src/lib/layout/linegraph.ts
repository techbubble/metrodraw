import type { MetroGraph, Pt } from "../types";
import type { LineOrder } from "./order";

// The line graph: nodes are junctions and per-line terminals; an edge is a
// bundle of lines that travel between the same two nodes consecutively.

export type LGNode = { id: string; kind: "junction" | "terminal"; station: string | null; line: string | null; pos: Pt };
export type LGEdge = {
  id: string;
  u: string;
  v: string;
  /** lines on this edge, in no particular order */
  lines: string[];
  /** per line: exclusive station ids between u and v, ordered u -> v, and whether the line travels u -> v */
  per: Map<string, { stations: string[]; forward: boolean; turning: Set<string> }>;
  /** max exclusive stations of any single line on the edge */
  k: number;
  /** turning-point budget for routing */
  budget: number;
};

export type LineGraph = { nodes: Map<string, LGNode>; edges: Map<string, LGEdge>; adj: Map<string, string[]>; lineEdges: Map<string, string[]> };

export function buildLineGraph(graph: MetroGraph, orders: Map<string, LineOrder>): LineGraph {
  const junction = new Set(graph.stations.filter((s) => s.lines.length >= 2).map((s) => s.id));
  const nodes = new Map<string, LGNode>();
  const edges = new Map<string, LGEdge>();
  const adj = new Map<string, string[]>();
  const lineEdges = new Map<string, string[]>();
  for (const j of junction) nodes.set(`J:${j}`, { id: `J:${j}`, kind: "junction", station: j, line: null, pos: [0, 0] });
  const link = (n: string, e: string) => { if (!adj.has(n)) adj.set(n, []); adj.get(n)!.push(e); };
  for (const l of graph.lines) {
    const ord = orders.get(l.id)!.order;
    const tp = new Set(l.turningPoints.map((i) => l.stations[i]).filter(Boolean));
    // Split the ordered stations into node-delimited runs.
    type Run = { from: string; to: string; stations: string[] };
    const runs: Run[] = [];
    let cur: Run = { from: `T:${l.id}:a`, to: "", stations: [] };
    for (const sid of ord) {
      if (junction.has(sid)) { cur.to = `J:${sid}`; runs.push(cur); cur = { from: `J:${sid}`, to: "", stations: [] }; }
      else cur.stations.push(sid);
    }
    cur.to = `T:${l.id}:b`; runs.push(cur);
    // Drop empty terminal stubs (line starts or ends at a junction).
    const kept = runs.filter((r) => !(r.from.startsWith("T:") && r.stations.length === 0 && runs.length > 1) && !(r.to.startsWith("T:") && r.stations.length === 0 && runs.length > 1));
    for (const r of kept) {
      for (const t of [r.from, r.to]) if (t.startsWith("T:") && !nodes.has(t)) nodes.set(t, { id: t, kind: "terminal", station: null, line: l.id, pos: [0, 0] });
      const forward = r.from < r.to;
      const [u, v] = forward ? [r.from, r.to] : [r.to, r.from];
      const id = `${u}|${v}`;
      if (!edges.has(id)) { edges.set(id, { id, u, v, lines: [], per: new Map(), k: 0, budget: 0 }); link(u, id); link(v, id); }
      const e = edges.get(id)!;
      e.lines.push(l.id);
      const stations = forward ? r.stations : [...r.stations].reverse();
      e.per.set(l.id, { stations, forward, turning: new Set(stations.filter((s) => tp.has(s))) });
      e.k = Math.max(e.k, r.stations.length);
      e.budget = Math.max(e.budget, stations.filter((s) => tp.has(s)).length + (junction.has(r.from.slice(2)) && tp.has(r.from.slice(2)) ? 1 : 0));
      if (!lineEdges.has(l.id)) lineEdges.set(l.id, []);
      lineEdges.get(l.id)!.push(id);
    }
  }
  return { nodes, edges, adj, lineEdges };
}

// Bast et al. 4.1: process nodes by line degree, dangling-first.
export function routingOrder(lg: LineGraph): string[] {
  const ldeg = (n: string) => (lg.adj.get(n) ?? []).reduce((s, e) => s + lg.edges.get(e)!.lines.length, 0);
  const unprocessed = new Set(lg.nodes.keys());
  const order: string[] = [];
  const seen = new Set<string>();
  while (unprocessed.size) {
    let best = "";
    for (const n of unprocessed) if (!best || ldeg(n) > ldeg(best) || (ldeg(n) === ldeg(best) && n < best)) best = n;
    const dangling: string[] = [best];
    while (dangling.length) {
      dangling.sort((a, b) => ldeg(b) - ldeg(a) || (a < b ? -1 : 1));
      const vd = dangling.shift()!;
      unprocessed.delete(vd);
      const out = (lg.adj.get(vd) ?? []).filter((e) => !seen.has(e)).map((e) => lg.edges.get(e)!).sort((a, b) => {
        const oa = a.u === vd ? a.v : a.u, ob = b.u === vd ? b.v : b.u;
        return ldeg(ob) - ldeg(oa) || (a.id < b.id ? -1 : 1);
      });
      for (const e of out) {
        seen.add(e.id); order.push(e.id);
        const other = e.u === vd ? e.v : e.u;
        if (unprocessed.has(other) && !dangling.includes(other)) dangling.push(other);
      }
    }
  }
  return order;
}
