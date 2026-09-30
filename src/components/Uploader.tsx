"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_DOCS = 10;

type SampleDomain = { id: string; label: string; files: { name: string; size: number }[] };

function pickRandom<T>(items: T[], n: number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export default function Uploader() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [domains, setDomains] = useState<SampleDomain[]>([]);
  const [domain, setDomain] = useState("");
  const [loadingSamples, setLoadingSamples] = useState(false);

  useEffect(() => {
    fetch("/api/samples")
      .then((r) => (r.ok ? r.json() : { domains: [] }))
      .then((d: { domains: SampleDomain[] }) => setDomains(d.domains))
      .catch(() => {});
  }, []);

  // Replaces the current selection with up to MAX_DOCS random documents from
  // the chosen sample domain.
  async function loadSamples() {
    const dom = domains.find((d) => d.id === domain);
    if (!dom) return;
    setLoadingSamples(true);
    setError(null);
    try {
      const picked = pickRandom(dom.files, MAX_DOCS);
      const loaded = await Promise.all(
        picked.map(async (f) => {
          const res = await fetch(`/api/samples/${encodeURIComponent(dom.id)}/${encodeURIComponent(f.name)}`);
          if (!res.ok) throw new Error(`Could not load sample "${f.name}" (${res.status})`);
          const blob = await res.blob();
          return new File([blob], f.name, { type: blob.type || (f.name.endsWith(".pdf") ? "application/pdf" : "text/plain") });
        }),
      );
      setFiles(loaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSamples(false);
    }
  }

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
      {domains.length > 0 && (
        <div className="d-flex align-items-center gap-2 mb-3">
          <span className="text-secondary small text-nowrap">Or try a sample set:</span>
          <select className="form-select form-select-sm w-auto" value={domain} disabled={busy || loadingSamples} onChange={(e) => setDomain(e.target.value)}>
            <option value="">Choose a domain</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>{d.label} ({d.files.length})</option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" disabled={!domain || busy || loadingSamples} onClick={loadSamples}>
            {loadingSamples ? (<><span className="spinner-border spinner-border-sm me-2" />Loading</>) : `Load ${Math.min(MAX_DOCS, domains.find((d) => d.id === domain)?.files.length ?? MAX_DOCS)} at random`}
          </button>
        </div>
      )}
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
