import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { extractDocument, MAX_DOCS, MAX_DOC_BYTES } from "@/lib/extract/text";
import { extractGraph } from "@/lib/extract/graph";
import { layoutGraph } from "@/lib/layout";
import { accountMaps, cacheGraph, cachedGraph, MAP_CAP_PER_ACCOUNT, newId, saveMap } from "@/lib/store";
import type { DocumentRecord, MapRecord } from "@/lib/types";

export const maxDuration = 300;

const ACCOUNT_COOKIE = "md_account";

// POST multipart/form-data with one or more `files`. Extracts text, asks the
// model for the graph (cached by input hash), lays it out, stores the map.
export async function POST(req: NextRequest) {
  let account = req.cookies.get(ACCOUNT_COOKIE)?.value ?? "";
  const fresh = !/^[a-z0-9]{10,}$/.test(account);
  if (fresh) account = newId(16);
  const existing = await accountMaps(account);
  if (existing.length >= MAP_CAP_PER_ACCOUNT) {
    return NextResponse.json({ error: `Map limit reached (${MAP_CAP_PER_ACCOUNT} per account).` }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "No documents provided." }, { status: 400 });
  if (files.length > MAX_DOCS) return NextResponse.json({ error: `At most ${MAX_DOCS} documents per map.` }, { status: 400 });
  for (const f of files) if (f.size > MAX_DOC_BYTES) return NextResponse.json({ error: `"${f.name}" exceeds the ${MAX_DOC_BYTES / 1024 / 1024} MB per-document limit.` }, { status: 413 });

  const documents: DocumentRecord[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      documents.push(await extractDocument(`doc-${i + 1}`, files[i]));
    } catch (e) {
      return NextResponse.json({ error: `Could not read "${files[i].name}": ${(e as Error).message}` }, { status: 422 });
    }
  }
  for (const d of documents) if (d.text.trim().length < 200) return NextResponse.json({ error: `"${d.name}" has too little extractable text.` }, { status: 422 });

  const prompt = readFileSync(join(process.cwd(), "extract.md"), "utf8");
  const hasher = createHash("sha256").update(prompt);
  for (const d of documents) hasher.update(`\n--- ${d.id} ---\n`).update(d.text);
  const inputHash = hasher.digest("hex").slice(0, 32);
  let graph = await cachedGraph(inputHash);
  if (!graph) {
    try {
      graph = await extractGraph(documents);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
    if (graph.lines.length === 0 || graph.stations.length === 0) return NextResponse.json({ error: "The model returned an empty graph." }, { status: 502 });
    await cacheGraph(inputHash, graph);
  }
  const layout = layoutGraph(graph);
  const rec: MapRecord = {
    id: newId(10),
    createdAt: new Date().toISOString(),
    account,
    title: documents.map((d) => d.name.replace(/\.[^.]+$/, "")).join(" / ").slice(0, 120),
    documents,
    graph,
    layout,
    inputHash,
  };
  await saveMap(rec);
  const res = NextResponse.json({ id: rec.id });
  if (fresh) res.cookies.set(ACCOUNT_COOKIE, account, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
