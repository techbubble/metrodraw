import { NextResponse } from "next/server";
import { listSampleDomains } from "@/lib/samples";

// GET: the bundled sample corpus, grouped by domain.
export async function GET() {
  return NextResponse.json({ domains: await listSampleDomains() });
}
