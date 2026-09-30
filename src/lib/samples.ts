import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_DOC_BYTES } from "./extract/text";

// Bundled sample corpus under samples/<domain>/<file>. Each subdirectory is a
// domain; files at the top level of samples/ are ignored.

const ROOT = join(process.cwd(), "samples");
const EXT = /\.(pdf|txt|md)$/i;
const safeSeg = (s: string) => /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(s) && !s.includes("..");

export type SampleFile = { name: string; size: number };
export type SampleDomain = { id: string; label: string; files: SampleFile[] };

export function domainLabel(id: string): string {
  const s = id.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function listSampleDomains(): Promise<SampleDomain[]> {
  let entries: string[];
  try {
    entries = await readdir(ROOT);
  } catch {
    return [];
  }
  const out: SampleDomain[] = [];
  for (const id of entries.sort()) {
    if (!safeSeg(id)) continue;
    const dir = join(ROOT, id);
    if (!(await stat(dir)).isDirectory()) continue;
    const files: SampleFile[] = [];
    for (const name of (await readdir(dir)).sort()) {
      if (!EXT.test(name) || !safeSeg(name)) continue;
      const st = await stat(join(dir, name));
      if (st.isFile() && st.size > 0 && st.size <= MAX_DOC_BYTES) files.push({ name, size: st.size });
    }
    if (files.length > 0) out.push({ id, label: domainLabel(id), files });
  }
  return out;
}

export async function readSample(domain: string, name: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!safeSeg(domain) || !safeSeg(name) || !EXT.test(name)) return null;
  try {
    const bytes = await readFile(join(ROOT, domain, name));
    const mime = name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain; charset=utf-8";
    return { bytes, mime };
  } catch {
    return null;
  }
}
