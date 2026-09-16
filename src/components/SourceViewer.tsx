"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentRecord, Line, Station } from "@/lib/types";

type Props = { station: Station; lines: Line[]; documents: DocumentRecord[]; onClose: () => void };

function pageOf(doc: DocumentRecord, charIndex: number): number {
  let page = 1;
  for (let i = 0; i < doc.pages.length; i++) if (doc.pages[i] <= charIndex) page = i + 1;
  return page;
}

// Shows the station's sources and the source document with the passage
// highlighted and scrolled into view.
export default function SourceViewer({ station, lines, documents, onClose }: Props) {
  const [active, setActive] = useState(0);
  const mark = useRef<HTMLElement>(null);
  const src = station.sources[active];
  const doc = useMemo(() => documents.find((d) => d.id === src?.doc), [documents, src]);
  const line = lines.find((l) => l.id === src?.doc);

  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center" });
  }, [station.id, active, doc]);

  const located = !!(src && doc && src.charStart !== null && src.charEnd !== null && src.charEnd > src.charStart);
  const CONTEXT = 6000;
  let before = "", hit = "", after = "", truncatedStart = false, truncatedEnd = false;
  if (doc && located) {
    const s = src.charStart!, e = src.charEnd!;
    const startOffset = Math.max(0, s - CONTEXT);
    const end = Math.min(doc.text.length, e + CONTEXT);
    before = doc.text.slice(startOffset, s);
    hit = doc.text.slice(s, e);
    after = doc.text.slice(e, end);
    truncatedStart = startOffset > 0;
    truncatedEnd = end < doc.text.length;
  }

  return (
    <div className="card h-100">
      <div className="card-header d-flex justify-content-between align-items-start">
        <div>
          <div className="fw-semibold">{station.label}</div>
          <div className="small text-secondary">{station.detail}</div>
        </div>
        <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
      </div>
      {station.sources.length > 1 && (
        <div className="card-body py-2 border-bottom">
          <div className="btn-group btn-group-sm flex-wrap" role="group">
            {station.sources.map((s, i) => {
              const l = lines.find((x) => x.id === s.doc);
              const stance = station.stances?.[station.lines.indexOf(s.doc)];
              return (
                <button key={i} type="button" className={`btn ${i === active ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => setActive(i)} style={i === active ? { backgroundColor: l?.color, borderColor: l?.color } : { borderColor: l?.color, color: l?.color }}>
                  {l?.label ?? s.doc}{stance && stance !== "neutral" ? ` (${stance === "agree" ? "agrees" : "contradicts"})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {src && doc && (
        <div className="card-body py-2 border-bottom small">
          <span className="fw-semibold" style={{ color: line?.color }}>{line?.label}</span>
          <span className="text-secondary"> {doc.name}{located ? `, page ${pageOf(doc, src.charStart!)}` : src.page ? `, page ${src.page}` : ""}</span>
          {!located && <div className="text-warning-emphasis mt-1">Passage not located in the extracted text. Quoted: &ldquo;{src.quote}&rdquo;</div>}
        </div>
      )}
      <div className="card-body overflow-auto" style={{ maxHeight: "60vh", fontFamily: "Georgia, serif", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {doc && located ? (
          <>
            {truncatedStart && <span className="text-secondary">[...] </span>}
            {before}
            <mark ref={mark} style={{ backgroundColor: `${line?.color}33`, borderBottom: `2px solid ${line?.color}`, padding: "0 2px" }}>{hit}</mark>
            {after}
            {truncatedEnd && <span className="text-secondary"> [...]</span>}
          </>
        ) : doc ? (
          doc.text.slice(0, 12000)
        ) : (
          <span className="text-secondary">No source document for this station.</span>
        )}
      </div>
    </div>
  );
}
