"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MapRecord } from "@/lib/types";
import { buildScene } from "@/lib/render/scene";
import { sceneToSvg } from "@/lib/render/svg";
import { shortUrl } from "@/lib/urls";
import MetroMap from "./MetroMap";
import SourceViewer from "./SourceViewer";
import DeleteMapButton from "./DeleteMapButton";

export default function MapView({ record, mine }: { record: Omit<MapRecord, "account">; mine: boolean }) {
  const scene = useMemo(() => buildScene(record.graph, record.layout), [record]);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const station = record.graph.stations.find((s) => s.id === selected) ?? null;
  const lineLabels = useMemo(() => new Map(record.graph.lines.map((l) => [l.id, l.label])), [record]);
  const url = shortUrl(record.id);

  function exportSvg() {
    const svg = sceneToSvg(scene, { attribution: url, title: record.title });
    download(new Blob([svg], { type: "image/svg+xml" }), `metrodraw-${record.id}.svg`);
  }

  async function exportPng() {
    const svg = sceneToSvg(scene, { attribution: url, title: record.title });
    const scale = 2;
    const img = new Image();
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("render failed")); img.src = blobUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = scene.width * scale;
    canvas.height = scene.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(blobUrl);
    canvas.toBlob((b) => b && download(b, `metrodraw-${record.id}.png`), "image/png");
  }

  async function copyLink() {
    const full = typeof window !== "undefined" ? `${window.location.origin}/m/${record.id}` : url;
    try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <div className="h5 mb-0">{record.title}</div>
          <div className="small text-secondary">
            {record.graph.lines.length} documents, {record.graph.stations.length} stations, {record.graph.stations.filter((s) => s.kind === "junction").length} junctions
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={exportSvg}>Export SVG</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={exportPng}>Export PNG</button>
        {mine && <DeleteMapButton id={record.id} afterDelete="home" />}
        <Link href="/" className="btn btn-sm btn-primary">New map</Link>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-2 small">
        {record.graph.lines.map((l) => (
          <span key={l.id} className="d-inline-flex align-items-center gap-1">
            <span style={{ width: 18, height: 6, background: l.color, borderRadius: 3, display: "inline-block" }} />
            {l.label}
            <span className="text-secondary">({record.documents.find((d) => d.id === l.id)?.name})</span>
          </span>
        ))}
        <span className="ms-auto text-secondary">
          <span className="me-2"><Ring stroke="#111" /> agree</span>
          <span className="me-2"><Ring stroke="#d32f2f" dash /> contradict</span>
          <span><Ring stroke="#e69500" dash /> mixed</span>
        </span>
      </div>
      <div className="row g-3">
        <div className={station ? "col-lg-8" : "col-12"}>
          <div className="border rounded">
            <MetroMap scene={scene} lineLabels={lineLabels} onOpenSource={setSelected} />
          </div>
        </div>
        {station && (
          <div className="col-lg-4">
            <SourceViewer key={station.id} station={station} lines={record.graph.lines} documents={record.documents} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Ring({ stroke, dash }: { stroke: string; dash?: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" style={{ verticalAlign: -2 }}>
      <circle cx={7} cy={7} r={5} fill="#fff" stroke={stroke} strokeWidth={2} strokeDasharray={dash ? "3 2" : undefined} />
    </svg>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
