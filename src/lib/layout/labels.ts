import type { Box, LabelPlacement, LayoutLine, LayoutStation, Pt } from "../types";
import { LINE_W } from "./geometry";

// Labels in pixel space. Eight candidate positions around each station
// symbol at two distances, greedy by conflict count (junctions first),
// then two passes of local re-placement. Horizontal text only.

export const STATION_FONT = 16;
export const LINE_FONT = 20;
export const CHAR_W = 0.56;
export const LINE_H = 1.15; // line height in em
export const WRAP_AT = 15; // characters per line before wrapping

// Word-wrap a label into at most three lines, balancing line lengths.
export function wrapLabel(text: string, maxChars = WRAP_AT): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  const lines = Math.min(3, Math.ceil(text.length / maxChars));
  let best: string[] = [text], bestScore = Infinity;
  const tryLines = (n: number) => {
    if (n === 1) return;
    // Enumerate split points (n-1 cuts) and take the most balanced.
    const cuts = (start: number, left: number): number[][] => left === 0 ? [[]] : Array.from({ length: words.length - start - left }, (_, i) => start + i + 1).flatMap((c) => cuts(c, left - 1).map((rest) => [c, ...rest]));
    for (const cut of cuts(0, n - 1)) {
      const parts: string[] = [];
      let prev = 0;
      for (const c of [...cut, words.length]) { parts.push(words.slice(prev, c).join(" ")); prev = c; }
      const longest = Math.max(...parts.map((p) => p.length));
      const score = longest * 10 + parts.reduce((s, p) => s + Math.abs(p.length - longest), 0);
      if (score < bestScore) { bestScore = score; best = parts; }
    }
  };
  tryLines(lines);
  if (Math.max(...best.map((p) => p.length)) > maxChars + 4 && lines < 3) { bestScore = Infinity; tryLines(lines + 1); }
  return best;
}

type Anchor = LabelPlacement["anchor"];
type Baseline = LabelPlacement["baseline"];
type Cand = { x: number; y: number; anchor: Anchor; baseline: Baseline; pref: number };

const WEIGHT = { label: 60, track: 10, trackCap: 40, marker: 20, bounds: 60 };
const overlap = (a: Box, b: Box, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

export function textBox(x: number, y: number, lines: string[], font: number, anchor: Anchor, baseline: Baseline): Box {
  const w = Math.max(...lines.map((l) => l.length)) * font * CHAR_W;
  const h = font * LINE_H * lines.length;
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const y0 = baseline === "hanging" ? y : baseline === "alphabetic" ? y - h : y - h / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

export function symbolBox(s: LayoutStation["symbol"]): Box {
  if (s.type === "tick") {
    const xs = [s.from[0], s.to[0]], ys = [s.from[1], s.to[1]];
    return { x0: Math.min(...xs) - 3, y0: Math.min(...ys) - 3, x1: Math.max(...xs) + 3, y1: Math.max(...ys) + 3 };
  }
  if (s.type === "ring") return { x0: s.c[0] - 8, y0: s.c[1] - 8, x1: s.c[0] + 8, y1: s.c[1] + 8 };
  const r = s.r + 2;
  return { x0: Math.min(s.a[0], s.b[0]) - r, y0: Math.min(s.a[1], s.b[1]) - r, x1: Math.max(s.a[0], s.b[0]) + r, y1: Math.max(s.a[1], s.b[1]) + r };
}

function around(box: Box, gap: number, pref: number): Cand[] {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return [
    { x: box.x1 + gap, y: cy, anchor: "start", baseline: "middle", pref },
    { x: box.x0 - gap, y: cy, anchor: "end", baseline: "middle", pref },
    { x: cx, y: box.y0 - gap, anchor: "middle", baseline: "alphabetic", pref: pref + 1 },
    { x: cx, y: box.y1 + gap, anchor: "middle", baseline: "hanging", pref: pref + 1 },
    { x: box.x1 + gap * 0.6, y: box.y0 - gap * 0.6, anchor: "start", baseline: "alphabetic", pref: pref + 2 },
    { x: box.x0 - gap * 0.6, y: box.y0 - gap * 0.6, anchor: "end", baseline: "alphabetic", pref: pref + 2 },
    { x: box.x1 + gap * 0.6, y: box.y1 + gap * 0.6, anchor: "start", baseline: "hanging", pref: pref + 2 },
    { x: box.x0 - gap * 0.6, y: box.y1 + gap * 0.6, anchor: "end", baseline: "hanging", pref: pref + 2 },
  ];
}

export function placeLabels(
  stations: LayoutStation[],
  labelOf: Map<string, string>,
  isJunction: (id: string) => boolean,
  lines: LayoutLine[],
  lineLabelOf: Map<string, string>,
  gridBox: Box
): { labels: LabelPlacement[]; lineLabels: LabelPlacement[]; bbox: Box } {
  const trackBoxes: Box[] = [];
  const hw = LINE_W / 2 + 1;
  for (const l of lines) {
    const p = l.path.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const len = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      const steps = Math.max(1, Math.ceil(len / 8));
      for (let s = 0; s <= steps; s++) {
        const x = p[i][0] + ((p[i + 1][0] - p[i][0]) * s) / steps, y = p[i][1] + ((p[i + 1][1] - p[i][1]) * s) / steps;
        trackBoxes.push({ x0: x - hw, y0: y - hw, x1: x + hw, y1: y + hw });
      }
    }
  }
  const markerBoxes = stations.map((s) => symbolBox(s.symbol));
  const bounds: Box = { x0: gridBox.x0 - 60, y0: gridBox.y0 - 60, x1: gridBox.x1 + 60, y1: gridBox.y1 + 60 };
  const placed = new Map<string, Box>();
  const score = (box: Box, self: string, selfMarker: number) => {
    let s = 0;
    const over = Math.max(0, bounds.x0 - box.x0) + Math.max(0, box.x1 - bounds.x1) + Math.max(0, bounds.y0 - box.y0) + Math.max(0, box.y1 - bounds.y1);
    s += Math.min(WEIGHT.bounds, over / 30);
    for (const [id, b] of placed) if (id !== self && overlap(box, b)) s += WEIGHT.label;
    let t = 0;
    for (const b of trackBoxes) if (overlap(box, b, 0)) t += WEIGHT.track;
    s += Math.min(WEIGHT.trackCap, t);
    for (let j = 0; j < markerBoxes.length; j++) if (j !== selfMarker && overlap(box, markerBoxes[j])) s += WEIGHT.marker;
    return s;
  };
  type Item = { id: string; lines: string[]; font: number; cands: Cand[]; marker: number; junction: boolean };
  const items: Item[] = [];
  for (const l of lines) {
    const p = l.path.pts;
    if (p.length < 2) continue;
    const d: Pt = [p[0][0] - p[1][0], p[0][1] - p[1][1]];
    const len = Math.hypot(d[0], d[1]) || 1;
    const dx = d[0] / len, dy = d[1] / len;
    const [x, y] = p[0];
    const cands: Cand[] = [
      { x: x + dx * 18, y: y + dy * 18, anchor: Math.abs(dx) < 0.3 ? "middle" : dx > 0 ? "start" : "end", baseline: Math.abs(dy) < 0.3 ? "middle" : dy > 0 ? "hanging" : "alphabetic", pref: 0 },
      { x: x + dx * 40, y: y + dy * 40, anchor: Math.abs(dx) < 0.3 ? "middle" : dx > 0 ? "start" : "end", baseline: Math.abs(dy) < 0.3 ? "middle" : dy > 0 ? "hanging" : "alphabetic", pref: 2 },
      { x, y: y - 20, anchor: "middle", baseline: "alphabetic", pref: 6 },
      { x, y: y + 20, anchor: "middle", baseline: "hanging", pref: 6 },
      { x: x + 14, y: y - 18, anchor: "start", baseline: "alphabetic", pref: 8 },
      { x: x - 14, y: y - 18, anchor: "end", baseline: "alphabetic", pref: 8 },
      { x: x + 14, y: y + 18, anchor: "start", baseline: "hanging", pref: 8 },
      { x: x - 14, y: y + 18, anchor: "end", baseline: "hanging", pref: 8 },
    ];
    items.push({ id: `line:${l.id}`, lines: [lineLabelOf.get(l.id) ?? l.id], font: LINE_FONT, cands, marker: -1, junction: false });
  }
  stations.forEach((s, i) => {
    const box = markerBoxes[i];
    items.push({ id: s.id, lines: wrapLabel(labelOf.get(s.id) ?? s.id), font: STATION_FONT, cands: [...around(box, 5, 0), ...around(box, 18, 4), ...around(box, 34, 8)], marker: i, junction: isJunction(s.id) });
  });
  // Line names first (large, at terminals), then junctions, then the rest.
  items.sort((a, b) => Number(b.id.startsWith("line:")) - Number(a.id.startsWith("line:")) || Number(b.junction) - Number(a.junction) || (a.id < b.id ? -1 : 1));
  const choice = new Map<string, Cand>();
  const pick = (it: Item) => {
    let best: { c: Cand; s: number; box: Box } | null = null;
    for (const c of it.cands) {
      const box = textBox(c.x, c.y, it.lines, it.font, c.anchor, c.baseline);
      const sc = score(box, it.id, it.marker) + c.pref;
      if (!best || sc < best.s) best = { c, s: sc, box };
    }
    placed.set(it.id, best!.box);
    choice.set(it.id, best!.c);
  };
  for (const it of items) pick(it);
  for (let pass = 0; pass < 2; pass++) for (const it of items) pick(it);
  const toPlacement = (it: Item): LabelPlacement => { const c = choice.get(it.id)!; return { id: it.id.replace(/^line:/, ""), x: c.x, y: c.y, lines: it.lines, anchor: c.anchor, baseline: c.baseline }; };
  const labels = items.filter((i) => !i.id.startsWith("line:")).map(toPlacement);
  const lineLabels = items.filter((i) => i.id.startsWith("line:")).map(toPlacement);
  // Content-only bounds. The grid is sized generously for routing and is
  // usually much larger than what gets drawn, so it must not pad the bbox.
  const all = [...placed.values(), ...trackBoxes, ...markerBoxes];
  const bbox: Box = all.length === 0 ? gridBox : {
    x0: Math.min(...all.map((b) => b.x0)),
    y0: Math.min(...all.map((b) => b.y0)),
    x1: Math.max(...all.map((b) => b.x1)),
    y1: Math.max(...all.map((b) => b.y1)),
  };
  return { labels, lineLabels, bbox };
}
