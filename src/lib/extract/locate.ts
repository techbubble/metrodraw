import type { DocumentRecord } from "../types";

// Locates a verbatim quote in extracted text and returns character offsets
// in the original string. Matching is done on a normalised copy (lowercase,
// punctuation stripped, whitespace collapsed) with an index map back to the
// original, so PDF line breaks, ligatures and curly quotes do not defeat it.

type Norm = { text: string; map: number[] };

const normCache = new WeakMap<DocumentRecord, { spaced: Norm; joined: Norm }>();

// `joinLines` drops line breaks (and hyphenation at line ends) entirely, for
// PDFs that wrap mid-word.
function normalise(s: string, joinLines = false): Norm {
  const out: string[] = [];
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    if (joinLines && s[i] === "\n") continue;
    if (joinLines && s[i] === "-" && s[i + 1] === "\n") continue;
    let ch = s[i].toLowerCase();
    if (ch === "ﬁ") ch = "fi";
    else if (ch === "ﬂ") ch = "fl";
    else if (/[‘’“”"'`]/.test(ch)) continue;
    else if (/[\s ]/.test(ch)) ch = " ";
    else if (/[^\p{L}\p{N} ]/u.test(ch)) ch = " ";
    for (const c of ch) {
      if (c === " ") {
        if (lastSpace) continue;
        lastSpace = true;
      } else lastSpace = false;
      out.push(c);
      map.push(i);
    }
  }
  return { text: out.join(""), map };
}

export function locateQuote(doc: DocumentRecord, quote: string): { charStart: number; charEnd: number } | null {
  let cached = normCache.get(doc);
  if (!cached) {
    cached = { spaced: normalise(doc.text), joined: normalise(doc.text, true) };
    normCache.set(doc, cached);
  }
  let norm = cached.spaced;
  const q = normalise(quote).text.trim();
  if (q.length < 4) return null;
  let idx = norm.text.indexOf(q);
  let len = q.length;
  if (idx < 0) {
    const j = cached.joined.text.indexOf(q);
    if (j >= 0) { norm = cached.joined; idx = j; }
  }
  if (idx < 0) {
    // Fall back to the longest prefix of whole words that still matches.
    const words = q.split(" ");
    for (let n = words.length - 1; n >= 3; n--) {
      const prefix = words.slice(0, n).join(" ");
      idx = norm.text.indexOf(prefix);
      if (idx >= 0) {
        len = prefix.length;
        break;
      }
    }
    if (idx < 0) {
      for (let n = words.length - 1; n >= 3; n--) {
        const suffix = words.slice(words.length - n).join(" ");
        idx = norm.text.indexOf(suffix);
        if (idx >= 0) {
          len = suffix.length;
          break;
        }
      }
    }
  }
  if (idx < 0) return null;
  const charStart = norm.map[idx];
  const charEnd = norm.map[idx + len - 1] + 1;
  return { charStart, charEnd };
}
