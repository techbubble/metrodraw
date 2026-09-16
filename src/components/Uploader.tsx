"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_DOCS = 8;

export default function Uploader() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | File[]) {
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next.slice(0, MAX_DOCS));
    setError(null);
  }

  async function submit() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      const res = await fetch("/api/maps", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      router.push(`/m/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 720 }}>
      <h1 className="h3 mb-1">Draw a metro map of your documents</h1>
      <p className="text-secondary mb-4">
        Each document becomes a line. Stations are the points it makes. Where documents make the same point, the lines meet.
        Upload PDF, text or Markdown, up to {MAX_DOCS} documents.
      </p>
      <div
        className={`border rounded p-4 text-center mb-3 ${drag ? "border-primary bg-light" : "border-secondary-subtle"}`}
        style={{ borderStyle: "dashed", cursor: "pointer" }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" multiple accept=".pdf,.txt,.md,text/plain,application/pdf" hidden onChange={(e) => e.target.files && add(e.target.files)} />
        <div className="fw-semibold">Drop documents here or click to choose</div>
        <div className="text-secondary small">PDF, TXT, MD. 15 MB per document.</div>
      </div>
      {files.length > 0 && (
        <ul className="list-group mb-3">
          {files.map((f, i) => (
            <li key={i} className="list-group-item d-flex justify-content-between align-items-center">
              <span className="text-truncate">{f.name}</span>
              <span className="d-flex align-items-center gap-3">
                <span className="text-secondary small">{(f.size / 1024).toFixed(0)} KB</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="alert alert-danger py-2">{error}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || files.length === 0} onClick={submit}>
        {busy ? (<><span className="spinner-border spinner-border-sm me-2" />Reading and mapping. This takes a minute or two.</>) : "Draw the map"}
      </button>
    </div>
  );
}
