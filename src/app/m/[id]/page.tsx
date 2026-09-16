import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { loadMap } from "@/lib/store";
import MapView from "@/components/MapView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const rec = await loadMap(id);
  return { title: rec ? `${rec.title} | MetroDraw` : "MetroDraw" };
}

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await loadMap(id);
  if (!rec) notFound();
  const { account, ...pub } = rec;
  const mine = (await cookies()).get("md_account")?.value === account;
  return <MapView record={pub} mine={mine} />;
}
