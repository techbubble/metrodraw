import { AGREEMENT_STYLE, LINE_W, hullPath, lineYs, type Scene, type SceneStation } from "./scene";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const f = (n: number) => n.toFixed(1);

export function symbolSvg(s: SceneStation): string {
  const sym = s.symbol;
  if (sym.type === "tick") return `<line x1="${f(sym.from[0])}" y1="${f(sym.from[1])}" x2="${f(sym.to[0])}" y2="${f(sym.to[1])}" stroke="${sym.color}" stroke-width="4" stroke-linecap="round"/>`;
  if (sym.type === "ring") return `<circle cx="${f(sym.c[0])}" cy="${f(sym.c[1])}" r="5.5" fill="#fff" stroke="#111" stroke-width="2.5"/>`;
  const st = AGREEMENT_STYLE[s.agreement ?? "convergent"];
  const out = `<path d="${hullPath(sym.a, sym.b, sym.r)}" fill="#fff" stroke="${st.stroke}" stroke-width="3"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;
  return out;
}

// Static SVG for export: same scene as the interactive view plus the
// attribution mark and short URL.
export function sceneToSvg(scene: Scene, opts: { attribution?: string; title?: string } = {}): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" font-family="${FONT}">`);
  if (opts.title) parts.push(`<title>${esc(opts.title)}</title>`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  for (const l of scene.lines) parts.push(`<path d="${l.d}" fill="none" stroke="${l.color}" stroke-width="${LINE_W}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const s of scene.stations) parts.push(symbolSvg(s));
  for (const l of scene.labels) {
    const ys = lineYs(l.y, l.lines.length, scene.fonts.station, l.baseline);
    const spans = l.lines.map((t, i) => `<tspan x="${f(l.x)}" y="${f(ys[i])}">${esc(t)}</tspan>`).join("");
    parts.push(`<text font-size="${scene.fonts.station}" text-anchor="${l.anchor}" dominant-baseline="${l.baseline}" fill="#111" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${spans}</text>`);
  }
  for (const l of scene.lines) {
    parts.push(`<text x="${f(l.labelX)}" y="${f(l.labelY)}" font-size="${scene.fonts.line}" font-weight="700" text-anchor="${l.labelAnchor}" dominant-baseline="${l.labelBaseline}" fill="${l.color}" stroke="#fff" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${esc(l.label)}</text>`);
  }
  if (opts.attribution) {
    const y = scene.height - 18;
    parts.push(`<g font-size="13" fill="#6c757d"><rect x="${scene.width - 14 - 96}" y="${y - 11}" width="12" height="12" rx="6" fill="none" stroke="#111" stroke-width="2"/><rect x="${scene.width - 14 - 90}" y="${y - 5}" width="8" height="2" fill="#111"/><text x="${scene.width - 14 - 80}" y="${y}"><tspan font-weight="700" fill="#111">MetroDraw</tspan></text><text x="${scene.width - 14}" y="${y + 16}" text-anchor="end">${esc(opts.attribution)}</text></g>`);
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}
