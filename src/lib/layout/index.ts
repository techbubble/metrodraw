import { LAYOUT_VERSION, type Layout, type LayoutStation, type MetroGraph, type Pt } from "../types";
import { aggregateOrder } from "./order";
import { placeJunctions, MIN_JUNCTION_GAP } from "./junctions";
import { routeEdge, COST, type Occupancy, type Grid } from "./route";
import { buildLineGraph, routingOrder, type LineGraph, type LGEdge } from "./linegraph";
import { placeEdgeStations } from "./stations";
import { orderLines } from "./ordering";
import { edgeGeometry, linePaths, hullSymbol, CELL, type EdgeGeometry } from "./geometry";
import { placeLabels } from "./labels";
import { DIRS, key, dirIndex, cheb, snapDir, angleSteps } from "./geom";
import { makeRng, hashString } from "./rng";

export { CELL, STATION_FONT, LINE_FONT } from "./geometry-exports";

const LOCAL_SEARCH_SWEEPS = 12;
const SPRING = 20;

// Deterministic layout pipeline after Bast, Brosi and Storandt: place
// junctions, route bundled edges between settled nodes, local-search node
// positions, order lines per edge, place stations, build parallel-offset
// geometry, label.
export function layoutGraph(graph: MetroGraph): Layout {
  const orders = aggregateOrder(graph);
  const L = graph.lines.length;
  const maxLen = Math.max(2, ...graph.lines.map((l) => l.stations.length));
  const junctionCount = graph.stations.filter((s) => s.lines.length >= 2).length;
  const W = Math.min(80, Math.max(28, Math.ceil(maxLen * 2.8), Math.ceil(Math.sqrt(junctionCount * 24) * 1.6)));
  const H = Math.min(56, Math.max(18, L * 5 + 6, Math.ceil(W * 0.55)));
  const grid: Grid = { W, H };
  const rng = makeRng(hashString(JSON.stringify(graph.lines.map((l) => l.stations))));
  const jpos = placeJunctions(graph, orders, W, H, rng);
  const lg = buildLineGraph(graph, orders);
  for (const n of lg.nodes.values()) if (n.kind === "junction") n.pos = jpos.get(n.station!)!;

  // Terminal seeds: extrapolate away from the line's first two junctions,
  // far enough for the stations on the terminal edge.
  const rowOf = new Map(graph.lines.map((l, i) => [l.id, Math.round(3 + ((i + 0.5) * (H - 6)) / L)]));
  for (const n of lg.nodes.values()) {
    if (n.kind !== "terminal") continue;
    const eid = lg.adj.get(n.id)![0];
    const e = lg.edges.get(eid)!;
    const otherId = e.u === n.id ? e.v : e.u;
    const other = lg.nodes.get(otherId)!;
    const need = 2 * (e.k + 1);
    if (other.kind === "terminal") {
      const y = rowOf.get(n.line!)!;
      n.pos = n.id.endsWith(":a") ? [Math.max(1, Math.floor(W / 2 - need)), y] : [Math.min(W - 2, Math.ceil(W / 2 + need)), y];
      continue;
    }
    const js = orders.get(n.line!)!.order.filter((s) => jpos.has(s));
    const j1 = jpos.get(other.station!)!;
    const nextJ = n.id.endsWith(":a") ? js[1] : js[js.length - 2];
    const prefer: Pt = nextJ ? [j1[0] - jpos.get(nextJ)![0], j1[1] - jpos.get(nextJ)![1]] : n.id.endsWith(":a") ? [-1, 0] : [1, 0];
    n.pos = terminalSeed(grid, j1, prefer, need, lg, n.id);
  }

  // ---- routing ----
  const routes = new Map<string, { cells: Pt[]; cost: number }>();
  const occ: Occupancy = new Map();
  const order = routingOrder(lg);
  const nodeCells = () => new Set([...lg.nodes.values()].map((n) => key(n.pos)));
  const addOcc = (eid: string, cells: Pt[]) => { for (const c of cells) { const k = key(c); if (!occ.has(k)) occ.set(k, new Set()); occ.get(k)!.add(eid); } };
  const removeOcc = (eid: string) => { for (const [k, s] of occ) { s.delete(eid); if (!s.size) occ.delete(k); } };

  // Heading of edge f at node n: the direction of its first step away from n.
  const portDir = (f: LGEdge, n: string): number => {
    const c = routes.get(f.id)!.cells;
    return f.u === n ? dirIndex(c[1][0] - c[0][0], c[1][1] - c[0][1]) : dirIndex(c[c.length - 2][0] - c[c.length - 1][0], c[c.length - 2][1] - c[c.length - 1][1]);
  };
  // Per-port costs for edge e at node n. `leaving` selects whether the
  // heading passed in is away from n (start) or toward n (end).
  const portCosts = (e: LGEdge, n: string, leaving: boolean): number[] => {
    const costs = new Array<number>(8).fill(0);
    const used = new Set<number>();
    for (const fid of lg.adj.get(n) ?? []) {
      if (fid === e.id || !routes.has(fid)) continue;
      const f = lg.edges.get(fid)!;
      const pd = portDir(f, n);
      used.add(pd);
      const shared = e.lines.filter((l) => f.lines.includes(l)).length;
      if (!shared) continue;
      for (let d = 0; d < 8; d++) {
        // Heading away from n along e is d (leaving) or the reverse of the arrival heading.
        const away = leaving ? d : (d + 4) % 8;
        const bend = angleSteps(away, (pd + 4) % 8); // straight through = opposite ports
        costs[d] += COST.turn[bend] * shared;
      }
    }
    for (let d = 0; d < 8; d++) {
      const port = leaving ? d : (d + 4) % 8;
      if (used.has(port)) costs[d] = Infinity;
    }
    return costs;
  };
  const nearCells = (exclude: string[]) => {
    const s = new Set<number>();
    for (const n of lg.nodes.values()) if (!exclude.includes(n.id)) for (const d of DIRS) s.add(key([n.pos[0] + d[0], n.pos[1] + d[1]]));
    return s;
  };
  const route = (e: LGEdge): boolean => {
    const u = lg.nodes.get(e.u)!, v = lg.nodes.get(e.v)!;
    const blocked = nodeCells(); blocked.delete(key(u.pos)); blocked.delete(key(v.pos));
    const res = routeEdge(grid, u.pos, v.pos, portCosts(e, e.u, true), portCosts(e, e.v, false), e.budget, blocked, nearCells([e.u, e.v]), occ, e.id);
    if (!res) return false;
    routes.set(e.id, res);
    addOcc(e.id, res.cells);
    return true;
  };
  const fallback = (e: LGEdge) => {
    const u = lg.nodes.get(e.u)!.pos, v = lg.nodes.get(e.v)!.pos;
    const cells: Pt[] = [u];
    let [x, y] = u;
    while (x !== v[0] || y !== v[1]) { x += Math.sign(v[0] - x); y += Math.sign(v[1] - y); cells.push([x, y]); }
    routes.set(e.id, { cells, cost: 1000 });
    addOcc(e.id, cells);
  };
  for (const eid of order) { const e = lg.edges.get(eid)!; if (!route(e)) fallback(e); }

  // ---- local search on node positions (Bast et al. 4.6, 4.7) ----
  const spring = (e: LGEdge) => {
    const l = routes.get(e.id)!.cells.length - 1;
    const need = 2 * (e.k + 1);
    return e.k > 0 && l < need ? (SPRING / (2 * e.k)) * (need - l) ** 2 : 0;
  };
  const edgeScore = (e: LGEdge) => routes.get(e.id)!.cost + spring(e);
  const nodeIds = [...lg.nodes.keys()].sort((a, b) => Number(lg.nodes.get(b)!.kind === "junction") - Number(lg.nodes.get(a)!.kind === "junction") || (a < b ? -1 : 1));
  const canPlace = (n: string, p: Pt): boolean => {
    if (p[0] < 1 || p[1] < 1 || p[0] > W - 2 || p[1] > H - 2) return false;
    const me = lg.nodes.get(n)!;
    for (const o of lg.nodes.values()) {
      if (o.id === n) continue;
      const gap = me.kind === "junction" && o.kind === "junction" ? MIN_JUNCTION_GAP : 2;
      if (cheb(o.pos, p) < gap) return false;
    }
    const adjE = new Set(lg.adj.get(n) ?? []);
    const used = occ.get(key(p));
    if (used && [...used].some((e) => !adjE.has(e))) return false;
    return true;
  };
  for (let sweep = 0; sweep < LOCAL_SEARCH_SWEEPS; sweep++) {
    let improved = false;
    for (const n of nodeIds) {
      const node = lg.nodes.get(n)!;
      const adjIds = (lg.adj.get(n) ?? []).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const adjE = adjIds.map((id) => lg.edges.get(id)!);
      const before = adjE.reduce((s, e) => s + edgeScore(e), 0);
      const saved = new Map(adjE.map((e) => [e.id, routes.get(e.id)!]));
      const origin = node.pos;
      let best: { pos: Pt; delta: number; routes: Map<string, { cells: Pt[]; cost: number }> } | null = null;
      for (const d of DIRS) {
        const p: Pt = [origin[0] + d[0], origin[1] + d[1]];
        if (!canPlace(n, p)) continue;
        for (const e of adjE) { removeOcc(e.id); routes.delete(e.id); }
        node.pos = p;
        let ok = true;
        for (const e of adjE) if (!route(e)) { ok = false; break; }
        if (ok) {
          const after = adjE.reduce((s, e) => s + edgeScore(e), 0);
          const delta = after - before;
          if (delta < -1e-9 && (!best || delta < best.delta)) best = { pos: p, delta, routes: new Map(adjE.map((e) => [e.id, routes.get(e.id)!])) };
        }
        for (const e of adjE) { removeOcc(e.id); routes.delete(e.id); }
        node.pos = origin;
        for (const e of adjE) { routes.set(e.id, saved.get(e.id)!); addOcc(e.id, saved.get(e.id)!.cells); }
      }
      if (best) {
        for (const e of adjE) { removeOcc(e.id); routes.delete(e.id); }
        node.pos = best.pos;
        for (const e of adjE) { routes.set(e.id, best.routes.get(e.id)!); addOcc(e.id, best.routes.get(e.id)!.cells); }
        improved = true;
      }
    }
    if (!improved) break;
  }

  // ---- line ordering, stations, geometry ----
  const routeCells = new Map([...routes].map(([id, r]) => [id, r.cells]));
  const lineOrder = orderLines(lg, routeCells);
  const geo = new Map<string, EdgeGeometry>();
  for (const e of lg.edges.values()) geo.set(e.id, edgeGeometry(e, routes.get(e.id)!.cells, lineOrder.get(e.id)!));
  const stationAt = new Map<string, { edge: string; index: number; line: string }>();
  const trims = new Map<string, { from: number; to: number }>();
  for (const e of lg.edges.values()) {
    const cells = routes.get(e.id)!.cells;
    const uT = lg.nodes.get(e.u)!.kind === "terminal", vT = lg.nodes.get(e.v)!.kind === "terminal";
    const placed = placeEdgeStations(cells, e, uT, vT);
    for (const [l, p] of e.per) {
      let lo = 0, hi = cells.length - 1;
      for (const sid of p.stations) {
        const i = placed.get(sid)!;
        stationAt.set(sid, { edge: e.id, index: i, line: l });
      }
      if (uT && p.stations.length) lo = Math.min(...p.stations.map((s) => placed.get(s)!));
      if (vT && p.stations.length) hi = Math.max(...p.stations.map((s) => placed.get(s)!));
      if (lo !== 0 || hi !== cells.length - 1) trims.set(`${e.id}|${l}`, { from: lo, to: hi });
    }
  }
  const lines = linePaths(graph, lg, geo, trims);
  const colorOf = new Map(graph.lines.map((l) => [l.id, l.color]));
  const stations: LayoutStation[] = [];
  for (const s of graph.stations) {
    const oos = graph.lines.filter((l) => orders.get(l.id)!.outOfSequence.includes(s.id)).map((l) => l.id);
    if (s.lines.length >= 2) {
      const nid = `J:${s.id}`;
      const pts: Pt[] = [];
      for (const eid of lg.adj.get(nid) ?? []) {
        const g = geo.get(eid)!;
        for (const [, p] of g.per) pts.push(g.edge.u === nid ? p.pts[0] : p.pts[p.pts.length - 1]);
      }
      if (!pts.length) continue;
      const sym = hullSymbol(pts, s.lines.length >= 3 ? 10 : 9);
      const c: Pt = sym.type === "hull" ? [(sym.a[0] + sym.b[0]) / 2, (sym.a[1] + sym.b[1]) / 2] : pts[0];
      stations.push({ id: s.id, c, symbol: sym, outOfSequence: oos });
    } else {
      const at = stationAt.get(s.id);
      if (!at) continue;
      const g = geo.get(at.edge)!;
      const p = g.per.get(at.line)!;
      const pt = p.pts[at.index];
      // Ordinary stations are circles in the line colour.
      stations.push({ id: s.id, c: pt, symbol: { type: "ring", c: pt, color: colorOf.get(at.line)! }, outOfSequence: oos });
    }
  }
  const labelOf = new Map(graph.stations.map((s) => [s.id, s.label]));
  const lineLabelOf = new Map(graph.lines.map((l) => [l.id, l.label]));
  const junctionIds = new Set(graph.stations.filter((s) => s.lines.length >= 2).map((s) => s.id));
  const { labels, lineLabels, bbox } = placeLabels(stations, labelOf, (id) => junctionIds.has(id), lines, lineLabelOf, { x0: 0, y0: 0, x1: W * CELL, y1: H * CELL });
  return { version: LAYOUT_VERSION, grid, bbox, lines, stations, labels, lineLabels };
}

// Walk from a junction in the best octilinear direction and stop `need`
// cells out (or at the grid edge), avoiding cells other nodes occupy.
function terminalSeed(g: Grid, from: Pt, prefer: Pt, need: number, lg: LineGraph, self: string): Pt {
  const taken = new Set([...lg.nodes.values()].filter((n) => n.id !== self).map((n) => key(n.pos)));
  const pl = Math.hypot(prefer[0], prefer[1]) || 1;
  let best: { p: Pt; score: number } | null = null;
  for (let d = 0; d < 8; d++) {
    const [dx, dy] = DIRS[d];
    const dl = Math.hypot(dx, dy);
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * prefer[0] + dy * prefer[1]) / (dl * pl))));
    let p: Pt = from, len = 0;
    for (let i = 0; i < need; i++) {
      const np: Pt = [p[0] + dx, p[1] + dy];
      if (np[0] < 1 || np[1] < 1 || np[0] > g.W - 2 || np[1] > g.H - 2) break;
      if ([...taken].some((k) => cheb([k >> 12, k & 4095], np) < 2)) break;
      p = np; len++;
    }
    if (len < 1) continue;
    const score = (need - len) * 2 + ang;
    if (!best || score < best.score) best = { p, score };
  }
  if (best) return best.p;
  // Nothing free along any ray: nearest cell at least 2 from every node.
  let fallback: Pt = from, bestD = Infinity;
  for (let y = 1; y < g.H - 1; y++) for (let x = 1; x < g.W - 1; x++) {
    if ([...taken].some((k) => cheb([k >> 12, k & 4095], [x, y]) < 2)) continue;
    const d = cheb([x, y], from);
    if (d < bestD) { bestD = d; fallback = [x, y]; }
  }
  return fallback;
}

export { snapDir };
