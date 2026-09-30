import { NextResponse } from "next/server";
import { readSample } from "@/lib/samples";

// GET: one sample document's bytes.
export async function GET(_req: Request, ctx: RouteContext<"/api/samples/[domain]/[file]">) {
  const { domain, file } = await ctx.params;
  const s = await readSample(domain, file);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(s.bytes), {
    headers: { "content-type": s.mime, "content-length": String(s.bytes.length), "cache-control": "public, max-age=3600" },
  });
}
