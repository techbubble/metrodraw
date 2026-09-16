import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentRecord, MetroGraph, Station, Line, Agreement, Stance } from "../types";
import { locateQuote } from "./locate";

const PROMPT = readFileSync(join(process.cwd(), "extract.md"), "utf8");
const MODEL = "anthropic/claude-opus-5";
export const PALETTE = ["#e4002b", "#0019a8", "#00843d", "#ffd329", "#9b0058", "#ff6600", "#0098d4", "#6c757d"];

const TOOL = {
  name: "metro_graph",
  description: "Report the documents as a metro map graph: one line per document, stations for the points made, junctions for points shared across documents. Topology only; no coordinates.",
  parameters: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Document id from the <document> tag" },
            label: { type: "string", description: "Citation-style document name, max 24 chars" },
            color: { type: "string", description: "Hex color from the palette" },
            stations: { type: "array", items: { type: "string" }, description: "Ordered station ids" },
            turningPoints: { type: "array", items: { type: "integer" }, description: "Indices into stations where the document pivots" },
          },
          required: ["id", "label", "color", "stations", "turningPoints"],
        },
      },
      stations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Short slug, unique" },
            label: { type: "string", description: "1-4 words, max 26 chars" },
            lines: { type: "array", items: { type: "string" }, description: "Line ids through this station" },
            kind: { type: "string", enum: ["station", "junction"] },
            agreement: { type: "string", enum: ["convergent", "divergent", "mixed"], description: "Junctions only" },
            stances: { type: "array", items: { type: "string", enum: ["agree", "contradict", "neutral"] }, description: "Mixed junctions only, parallel to lines" },
            detail: { type: "string" },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  doc: { type: "string" },
                  page: { type: ["integer", "null"] },
                  quote: { type: "string", description: "Verbatim excerpt, 8-40 words" },
                },
                required: ["doc", "page", "quote"],
              },
            },
          },
          required: ["id", "label", "lines", "kind", "detail", "sources"],
        },
      },
    },
    required: ["lines", "stations"],
  },
};

export function buildDocumentBlock(docs: DocumentRecord[]): string {
  return docs
    .map((d) => {
      let body = "";
      if (d.pages.length > 1) {
        for (let i = 0; i < d.pages.length; i++) {
          const start = d.pages[i];
          const end = i + 1 < d.pages.length ? d.pages[i + 1] : d.text.length;
          body += `<page n="${i + 1}">\n${d.text.slice(start, end)}\n</page>\n`;
        }
      } else body = d.text;
      return `<document id="${d.id}" name="${escapeAttr(d.name)}">\n${body}\n</document>`;
    })
    .join("\n\n");
}

function escapeAttr(s: string) {
  return s.replace(/["<>&]/g, (c) => ({ '"': "&quot;", "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

type RawGraph = {
  lines: { id: string; label: string; color?: string; stations: string[]; turningPoints?: number[] }[];
  stations: {
    id: string; label: string; lines: string[]; kind: string; agreement?: string; stances?: string[]; detail: string;
    sources: { doc: string; page: number | null; quote: string }[];
  }[];
};

// Structural checks the LLM can be asked to repair. Returns human-readable
// issues; an empty list means the graph is consistent.
export function validateGraph(g: RawGraph, docs: DocumentRecord[]): string[] {
  const issues: string[] = [];
  const docIds = new Set(docs.map((d) => d.id));
  const lineIds = new Set(g.lines.map((l) => l.id));
  const stationById = new Map(g.stations.map((s) => [s.id, s]));
  for (const d of docIds) if (!lineIds.has(d)) issues.push(`Document "${d}" has no line.`);
  for (const l of g.lines) {
    if (!docIds.has(l.id)) issues.push(`Line "${l.id}" is not a document id. Use the ids from the <document> tags.`);
    if (l.stations.length < 2) issues.push(`Line "${l.id}" has fewer than 2 stations.`);
    if (new Set(l.stations).size !== l.stations.length) issues.push(`Line "${l.id}" lists a station twice.`);
    for (const sid of l.stations) {
      const s = stationById.get(sid);
      if (!s) issues.push(`Line "${l.id}" references unknown station "${sid}".`);
      else if (!s.lines.includes(l.id)) issues.push(`Station "${sid}" is on line "${l.id}" but does not list it in its lines.`);
    }
    for (const t of l.turningPoints ?? []) {
      if (t <= 0 || t >= l.stations.length - 1) issues.push(`Line "${l.id}" turning point ${t} must be strictly between 0 and ${l.stations.length - 1}.`);
    }
  }
  const labels = new Map<string, string>();
  for (const s of g.stations) {
    const k = s.label.trim().toLowerCase();
    if (labels.has(k)) issues.push(`Stations "${labels.get(k)}" and "${s.id}" share the label "${s.label}". Merge them into one junction or rename one.`);
    labels.set(k, s.id);
    if (s.label.length > 30) issues.push(`Station "${s.id}" label is longer than 26 characters.`);
    if (s.lines.length === 0) issues.push(`Station "${s.id}" is on no line.`);
    for (const lid of s.lines) {
      const l = g.lines.find((x) => x.id === lid);
      if (!l) issues.push(`Station "${s.id}" references unknown line "${lid}".`);
      else if (!l.stations.includes(s.id)) issues.push(`Station "${s.id}" lists line "${lid}" but that line's stations do not include it.`);
    }
    const isJunction = s.lines.length >= 2;
    if (isJunction && s.kind !== "junction") issues.push(`Station "${s.id}" is on ${s.lines.length} lines; its kind must be "junction".`);
    if (!isJunction && s.kind === "junction") issues.push(`Station "${s.id}" is on one line; its kind must be "station".`);
    if (isJunction && !["convergent", "divergent", "mixed"].includes(s.agreement ?? "")) issues.push(`Junction "${s.id}" needs agreement: convergent, divergent or mixed.`);
    if (s.agreement === "mixed" && (!s.stances || s.stances.length !== s.lines.length)) issues.push(`Mixed junction "${s.id}" needs stances parallel to its lines.`);
    for (const lid of s.lines) if (!s.sources.some((src) => src.doc === lid)) issues.push(`Station "${s.id}" has no source quote for line "${lid}".`);
  }
  return issues;
}

function toGraph(g: RawGraph, docs: DocumentRecord[]): MetroGraph {
  const docById = new Map(docs.map((d) => [d.id, d]));
  const stations: Station[] = g.stations.map((s) => {
    const lines = s.lines.filter((l) => docById.has(l));
    const isJunction = lines.length >= 2;
    const sources = s.sources
      .filter((src) => docById.has(src.doc))
      .map((src) => {
        const loc = locateQuote(docById.get(src.doc)!, src.quote);
        return { doc: src.doc, page: src.page ?? null, quote: src.quote, charStart: loc?.charStart ?? null, charEnd: loc?.charEnd ?? null };
      });
    const st: Station = { id: s.id, label: s.label.trim(), lines, kind: isJunction ? "junction" : "station", detail: s.detail, sources };
    if (isJunction) {
      st.agreement = (["convergent", "divergent", "mixed"].includes(s.agreement ?? "") ? s.agreement : "convergent") as Agreement;
      if (st.agreement === "mixed") st.stances = lines.map((_, i) => (s.stances?.[i] ?? "neutral") as Stance);
    }
    return st;
  });
  const stationIds = new Set(stations.map((s) => s.id));
  const lines: Line[] = g.lines
    .filter((l) => docById.has(l.id))
    .map((l, i) => ({
      id: l.id,
      label: l.label,
      color: /^#[0-9a-f]{6}$/i.test(l.color ?? "") ? l.color! : PALETTE[i % PALETTE.length],
      stations: l.stations.filter((sid) => stationIds.has(sid)),
      turningPoints: (l.turningPoints ?? []).filter((t) => t > 0 && t < l.stations.length - 1),
    }));
  // Ensure every station's `lines` reflects the lines that actually list it.
  for (const s of stations) s.lines = lines.filter((l) => l.stations.includes(s.id)).map((l) => l.id);
  return { lines, stations: stations.filter((s) => s.lines.length > 0) };
}

async function callModel(key: string, messages: unknown[]): Promise<RawGraph | null> {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      tools: [{ type: "function", function: TOOL }],
      tool_choice: { type: "function", function: { name: TOOL.name } },
      messages,
    }),
  });
  if (!res.ok) {
    console.error("metro_graph call failed:", res.status, (await res.text()).slice(0, 500));
    return null;
  }
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    const parsed = typeof args === "string" ? JSON.parse(args) : args;
    if (!Array.isArray(parsed.lines) || !Array.isArray(parsed.stations)) return null;
    return parsed as RawGraph;
  } catch {
    return null;
  }
}

export async function extractGraph(docs: DocumentRecord[]): Promise<MetroGraph> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured.");
  const user = `${buildDocumentBlock(docs)}\n\n${PROMPT}`;
  const first = await callModel(key, [{ role: "user", content: user }]);
  if (!first) throw new Error("Graph extraction failed.");
  let result = first;
  const issues = validateGraph(result, docs);
  if (issues.length > 0) {
    const repair = await callModel(key, [
      { role: "user", content: user },
      { role: "assistant", content: `Previous graph:\n${JSON.stringify(result)}` },
      { role: "user", content: `The graph has consistency problems:\n- ${issues.slice(0, 25).join("\n- ")}\n\nReturn the COMPLETE corrected graph, keeping the same content.` },
    ]);
    if (repair) {
      const remaining = validateGraph(repair, docs);
      if (remaining.length <= issues.length) result = repair;
    }
  }
  return toGraph(result, docs);
}
