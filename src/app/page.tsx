import Link from "next/link";
import { cookies } from "next/headers";
import Uploader from "@/components/Uploader";
import DeleteMapButton from "@/components/DeleteMapButton";
import { accountMaps, loadMap, MAP_CAP_PER_ACCOUNT } from "@/lib/store";

export default async function HomePage() {
  const account = (await cookies()).get("md_account")?.value ?? "";
  const ids = account ? await accountMaps(account) : [];
  const maps = (await Promise.all(ids.slice().reverse().map((id) => loadMap(id)))).filter((m) => m !== null);
  return (
    <>
      <Uploader />
      {maps.length > 0 && (
        <div className="mx-auto mt-5" style={{ maxWidth: 720 }}>
          <h2 className="h6 text-secondary">Your maps ({maps.length} of {MAP_CAP_PER_ACCOUNT})</h2>
          <ul className="list-group">
            {maps.map((m) => (
              <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
                <Link href={`/m/${m.id}`} className="text-truncate">{m.title}</Link>
                <span className="d-flex align-items-center gap-3 ms-3">
                  <span className="text-secondary small text-nowrap">
                    {m.graph.lines.length} docs, {m.graph.stations.filter((s) => s.kind === "junction").length} junctions
                  </span>
                  <DeleteMapButton id={m.id} afterDelete="refresh" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
