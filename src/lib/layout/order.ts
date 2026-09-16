import type { MetroGraph } from "../types";

export type LineOrder = { order: string[]; outOfSequence: string[] };

// Stage 0: resolve station-order conflicts. Junctions are ordered by their
// aggregate position across every line that carries them. Exclusive
// stations keep their place between the junctions that flanked them in the
// document, by interpolating their key between those junctions' new keys.
// A junction is flagged for a line when its order relative to another
// junction on that line differs from the document order.
export function aggregateOrder(graph: MetroGraph): Map<string, LineOrder> {
  const agg = new Map<string, number[]>();
  for (const l of graph.lines) {
    const n = Math.max(1, l.stations.length - 1);
    l.stations.forEach((sid, i) => {
      if (!agg.has(sid)) agg.set(sid, []);
      agg.get(sid)!.push(i / n);
    });
  }
  const junction = new Set(graph.stations.filter((s) => s.lines.length >= 2).map((s) => s.id));
  const out = new Map<string, LineOrder>();
  for (const l of graph.lines) {
    const n = Math.max(1, l.stations.length - 1);
    const jIdx = l.stations.map((s, i) => i).filter((i) => junction.has(l.stations[i]));
    const jKey = (i: number) => { const a = agg.get(l.stations[i])!; return a.reduce((s, v) => s + v, 0) / a.length; };
    const keys = l.stations.map((sid, i) => {
      if (junction.has(sid)) return jKey(i);
      if (jIdx.length === 0) return i / n;
      const prev = [...jIdx].reverse().find((j) => j < i);
      const next = jIdx.find((j) => j > i);
      if (prev === undefined) return jKey(next!) - (next! - i) / n;
      if (next === undefined) return jKey(prev) + (i - prev) / n;
      const kp = jKey(prev), kn = jKey(next);
      return kp + ((i - prev) / (next - prev)) * (kn - kp);
    });
    const idx = l.stations.map((_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b);
    const order = idx.map((i) => l.stations[i]);
    const outOfSequence: string[] = [];
    for (const i of jIdx) {
      const inverted = jIdx.some((j) => j !== i && (idx.indexOf(j) < idx.indexOf(i)) !== (j < i));
      if (inverted) outOfSequence.push(l.stations[i]);
    }
    out.set(l.id, { order, outOfSequence });
  }
  return out;
}
