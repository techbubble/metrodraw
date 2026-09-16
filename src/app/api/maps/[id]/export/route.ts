import { NextResponse } from "next/server";
import { loadMap } from "@/lib/store";
import { buildScene } from "@/lib/render/scene";
import { sceneToSvg } from "@/lib/render/svg";
import { shortUrl } from "@/lib/urls";

// GET /api/maps/:id/export -> static SVG with attribution.
export async function GET(_req: Request, ctx: RouteContext<"/api/maps/[id]/export">) {
  const { id } = await ctx.params;
  const rec = await loadMap(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const svg = sceneToSvg(buildScene(rec.graph, rec.layout), { attribution: shortUrl(rec.id), title: rec.title });
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": `attachment; filename="metrodraw-${rec.id}.svg"` },
  });
}
