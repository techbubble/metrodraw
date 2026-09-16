import type { Pt } from "../types";
import { DIRS, angleSteps, key, cheb } from "./geom";

// Octilinear A* for one line-graph edge between two settled grid nodes,
// after Bast, Brosi and Storandt (CGF 2020). Search state is
// (cell, heading, run length since last bend, discounted turns used).
// Bends at the end nodes are charged through per-port start and end costs
// supplied by the caller, which knows the headings of edges already routed
// at those nodes.

// Calibrated so a bend costs roughly one to three grid steps (Bast et al.
// use hop 2, bends 1 to 2). Detours must not be cheaper than bends.
export const COST = {
  hop: 2,
  diagonal: 1, // surcharge per diagonal step, favouring orthogonal runs
  turn: [0, 2, 5, 12, Infinity], // by 45-degree steps of deviation
  minRunPenalty: 8,
  minRun: 3,
  turningDiscount: 0.25,
  overlap: 15, // cell already used by another edge
  nearNode: 2,
  edge: 3,
};

export type Grid = { W: number; H: number };
export type Occupancy = Map<number, Set<string>>;

const RUNS = 4, TURNS = 4;

class Heap {
  keys: number[] = []; vals: number[] = []; seq: number[] = []; n = 0;
  push(k: number, v: number) { const i = this.keys.length; this.keys.push(k); this.vals.push(v); this.seq.push(this.n++); this.up(i); }
  pop(): number {
    const top = this.vals[0];
    const lk = this.keys.pop()!, lv = this.vals.pop()!, ls = this.seq.pop()!;
    if (this.keys.length) { this.keys[0] = lk; this.vals[0] = lv; this.seq[0] = ls; this.down(0); }
    return top;
  }
  get size() { return this.keys.length; }
  less(a: number, b: number) { return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.seq[a] < this.seq[b]); }
  swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
    [this.seq[a], this.seq[b]] = [this.seq[b], this.seq[a]];
  }
  up(i: number) { while (i > 0) { const p = (i - 1) >> 1; if (this.less(i, p)) { this.swap(i, p); i = p; } else break; } }
  down(i: number) {
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < this.keys.length && this.less(l, m)) m = l;
      if (r < this.keys.length && this.less(r, m)) m = r;
      if (m === i) break; this.swap(i, m); i = m;
    }
  }
}

export type RouteResult = { cells: Pt[]; cost: number };

export function routeEdge(
  g: Grid,
  from: Pt,
  to: Pt,
  startCosts: number[], // cost of leaving `from` heading d, Infinity = port closed
  endCosts: number[], // cost of arriving at `to` heading d, Infinity = port closed
  budget: number,
  blocked: Set<number>, // cells of other nodes
  near: Set<number>, // cells adjacent to other nodes
  occ: Occupancy,
  edgeId: string
): RouteResult | null {
  const { W, H } = g;
  const N = W * H * 8 * RUNS * TURNS;
  const enc = (c: number, d: number, r: number, t: number) => ((c * 8 + d) * RUNS + r) * TURNS + t;
  const gcost = new Float64Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap();
  const cellOf = (p: Pt) => p[1] * W + p[0];
  const h = (x: number, y: number) => Math.max(Math.abs(x - to[0]), Math.abs(y - to[1])) * COST.hop;
  const startCell = cellOf(from), goalCell = cellOf(to), goalKey = key(to);
  const B = Math.min(TURNS - 1, budget);
  for (let d = 0; d < 8; d++) {
    if (!isFinite(startCosts[d])) continue;
    const s = enc(startCell, d, RUNS - 1, 0);
    gcost[s] = startCosts[d];
    heap.push(startCosts[d] + h(from[0], from[1]), s);
  }
  let found = -1;
  while (heap.size) {
    const s = heap.pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const t = s % TURNS, r = Math.floor(s / TURNS) % RUNS;
    const d = Math.floor(s / (TURNS * RUNS)) % 8, c = Math.floor(s / (TURNS * RUNS * 8));
    if (c === goalCell) { found = s; break; }
    const cx = c % W, cy = Math.floor(c / W);
    for (let nd = 0; nd < 8; nd++) {
      const a = angleSteps(d, nd);
      if (a >= 4) continue;
      if (c === startCell && nd !== d) continue; // first step follows the chosen port
      const nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = key([nx, ny]);
      const isGoal = nk === goalKey;
      if (!isGoal && blocked.has(nk)) continue;
      let cost = COST.hop + (nd % 2 === 1 ? COST.diagonal : 0);
      let nt = t;
      if (a > 0) {
        let tc = COST.turn[a];
        if (t < B) { tc *= COST.turningDiscount; nt = t + 1; }
        else if (r < COST.minRun) tc += COST.minRunPenalty;
        cost += tc;
      }
      if (isGoal) {
        if (!isFinite(endCosts[nd])) continue;
        cost += endCosts[nd];
      } else {
        const used = occ.get(nk);
        if (used && [...used].some((e) => e !== edgeId)) cost += COST.overlap;
        if (near.has(nk)) cost += COST.nearNode;
        if (nx === 0 || ny === 0 || nx === W - 1 || ny === H - 1) cost += COST.edge;
      }
      const nr = a > 0 ? 1 : Math.min(RUNS - 1, r + 1);
      const ns = enc(ny * W + nx, nd, nr, nt);
      const ng = gcost[s] + cost;
      if (ng < gcost[ns]) { gcost[ns] = ng; parent[ns] = s; heap.push(ng + h(nx, ny), ns); }
    }
  }
  if (found < 0) return null;
  const cells: Pt[] = [];
  let s = found;
  while (s >= 0) {
    const c = Math.floor(s / (TURNS * RUNS * 8));
    cells.push([c % W, Math.floor(c / W)]);
    s = parent[s];
  }
  cells.reverse();
  return { cells, cost: gcost[found] };
}

export const chebDist = cheb;
