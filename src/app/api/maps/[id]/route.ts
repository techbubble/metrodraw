import { NextRequest, NextResponse } from "next/server";
import { deleteMap, loadMap } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/maps/[id]">) {
  const { id } = await ctx.params;
  const rec = await loadMap(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { account: _account, ...pub } = rec;
  void _account;
  return NextResponse.json(pub);
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/maps/[id]">) {
  const { id } = await ctx.params;
  const account = req.cookies.get("md_account")?.value ?? "";
  if (!account) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const ok = await deleteMap(id, account);
  if (!ok) return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
