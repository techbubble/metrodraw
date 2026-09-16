"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteMapButton({ id, afterDelete, size = "sm" }: { id: string; afterDelete?: "home" | "refresh"; size?: "sm" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm("Delete this map? The link will stop working.")) return;
    setBusy(true);
    const res = await fetch(`/api/maps/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { alert("Could not delete this map."); return; }
    if (afterDelete === "home") router.push("/"); else router.refresh();
  }
  return <button type="button" className={`btn btn-${size} btn-outline-danger`} disabled={busy} onClick={del}>Delete</button>;
}
