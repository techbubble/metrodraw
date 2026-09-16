import { extractText, getDocumentProxy } from "unpdf";
import type { DocumentRecord } from "../types";

export const MAX_DOC_BYTES = 15 * 1024 * 1024;
export const MAX_DOC_CHARS = 80_000;
export const MAX_DOCS = 8;

// Turns an uploaded file into a DocumentRecord with page offsets. PDF text
// comes out per page; plain text is a single page.
export async function extractDocument(id: string, file: File): Promise<DocumentRecord> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  let pagesText: string[];
  if (isPdf) {
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: false });
    pagesText = text.map(cleanPage);
  } else {
    pagesText = [new TextDecoder("utf-8", { fatal: false }).decode(buf)];
  }
  const pages: number[] = [];
  let text = "";
  for (const p of pagesText) {
    pages.push(text.length);
    text += p;
    if (!text.endsWith("\n")) text += "\n";
  }
  if (text.length > MAX_DOC_CHARS) text = text.slice(0, MAX_DOC_CHARS);
  return { id, name: file.name, mime: isPdf ? "application/pdf" : "text/plain", text, pages: pages.filter((p) => p < text.length) };
}

// pdf.js splits words at column boundaries and emits soft hyphens; collapse
// the obvious artefacts without changing character content the LLM will
// quote back (we only normalise whitespace).
function cleanPage(s: string): string {
  return s.replace(/­/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function pageOf(doc: DocumentRecord, charIndex: number): number {
  let page = 1;
  for (let i = 0; i < doc.pages.length; i++) if (doc.pages[i] <= charIndex) page = i + 1;
  return page;
}
