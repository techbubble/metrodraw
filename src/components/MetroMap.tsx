"use client";

import { useState } from "react";
import { AGREEMENT_STYLE, LINE_W, hullPath, lineYs, type Scene, type SceneStation } from "@/lib/render/scene";
import { FONT } from "@/lib/render/svg";

type Props = {
  scene: Scene;
  lineLabels: Map<string, string>;
  onOpenSource: (id: string) => void;
};

function Symbol({ s }: { s: SceneStation }) {
  const sym = s.symbol;
  if (sym.type === "tick") return <line x1={sym.from[0]} y1={sym.from[1]} x2={sym.to[0]} y2={sym.to[1]} stroke="#111" strokeWidth={4} strokeLinecap="round" />;
  if (sym.type === "ring") return <circle cx={sym.c[0]} cy={sym.c[1]} r={5.5} fill="#fff" stroke="#111" strokeWidth={2.5} />;
  const st = AGREEMENT_STYLE[s.agreement ?? "convergent"];
  return (
    <>
      <path d={hullPath(sym.a, sym.b, sym.r)} fill="#fff" stroke={st.stroke} strokeWidth={3} strokeDasharray={st.dash} />
    </>
  );
}

// Interactive renderer: same scene as the export. Clicking a station opens
// a popup anchored to it; clicking the same station again, the map
// background, or the popup's close button dismisses it. The popup's
// document icon opens the source passage.
export default function MetroMap({ scene, lineLabels, onOpenSource }: Props) {
  const [hover, setHover] = useState<SceneStation | null>(null);
  const toggle = (s: SceneStation) => setHover((cur) => (cur?.id === s.id ? null : s));
  const popupLeft = hover ? Math.min(hover.x + 14, scene.width - 310) : 0;
  const popupTop = hover ? hover.y + 14 : 0;
  return (
    <div className="position-relative" style={{ overflow: "auto", background: "#fff" }}>
      <svg width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`} style={{ fontFamily: FONT, display: "block", maxWidth: "none" }} onClick={(e) => { if (e.target === e.currentTarget) setHover(null); }}>
        {scene.lines.map((l) => <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth={LINE_W} strokeLinecap="round" strokeLinejoin="round" />)}
        {scene.stations.map((s) => (
          <g key={s.id} style={{ cursor: "pointer" }} onClick={() => toggle(s)}>
            <circle cx={s.x} cy={s.y} r={14} fill="transparent" />
            <Symbol s={s} />
          </g>
        ))}
        {scene.labels.map((l) => {
          const ys = lineYs(l.y, l.lines.length, scene.fonts.station, l.baseline);
          return (
            <text key={l.id} fontSize={scene.fonts.station} textAnchor={l.anchor} dominantBaseline={l.baseline} fill="#111" stroke="#fff" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
              {l.lines.map((t, i) => <tspan key={i} x={l.x} y={ys[i]}>{t}</tspan>)}
            </text>
          );
        })}
        {scene.lines.map((l) => (
          <text key={`ll-${l.id}`} x={l.labelX} y={l.labelY} fontSize={scene.fonts.line} fontWeight={700} textAnchor={l.labelAnchor} dominantBaseline={l.labelBaseline} fill={l.color} stroke="#fff" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round" style={{ pointerEvents: "none" }}>{l.label}</text>
        ))}
      </svg>
      {hover && (
        <div className="card shadow-sm" style={{ position: "absolute", left: popupLeft, top: popupTop, width: 300, zIndex: 20 }}>
          <div className="card-body py-2 px-3">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div className="fw-semibold">{hover.label}</div>
                {hover.kind === "junction" && <div className="small" style={{ color: AGREEMENT_STYLE[hover.agreement ?? "convergent"].stroke }}>{hover.lineCount} sources, {hover.agreement}</div>}
              </div>
              <span className="d-inline-flex gap-1 flex-shrink-0">
                <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center" title="View source passage" aria-label="View source passage" onClick={() => onOpenSource(hover.id)}>
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 1.5h5.5L13 5v9.5H4z" />
                    <path d="M9.5 1.5V5H13" />
                    <path d="M6 8h5M6 10.5h5" />
                  </svg>
                </button>
                <button type="button" className="btn-close btn-sm align-self-center" aria-label="Close" onClick={() => setHover(null)} />
              </span>
            </div>
            <div className="small text-body mt-1">{hover.detail}</div>
            {hover.outOfSequence.length > 0 && <div className="small text-secondary mt-1">Out of document order on {hover.outOfSequence.map((id) => lineLabels.get(id) ?? id).join(", ")}.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
