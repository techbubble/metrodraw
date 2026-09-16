import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { LAYOUT_VERSION, type MapRecord, type MetroGraph } from "./types";
import { layoutGraph } from "./layout";

// Filesystem persistence. One JSON per map under data/maps, an index per
// account under data/accounts, extracted graphs cached by input hash under
// data/cache. Swap for Blob or a database when deploying beyond one host.

const ROOT = join(process.cwd(), "data");
export const MAP_CAP_PER_ACCOUNT = 25;

async function ensure(dir: string) {
  await mkdir(dir, { recursive: true });
}

export function newId(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

const safe = (id: string) => /^[a-z0-9-]{6,64}$/.test(id);

export async function saveMap(rec: MapRecord): Promise<void> {
  await ensure(join(ROOT, "maps"));
  await writeFile(join(ROOT, "maps", `${rec.id}.json`), JSON.stringify(rec));
  await ensure(join(ROOT, "accounts"));
  const ids = await accountMaps(rec.account);
  ids.push(rec.id);
  await writeFile(join(ROOT, "accounts", `${rec.account}.json`), JSON.stringify(ids));
}

// Records laid out by an older engine are re-laid out on load and saved
// back, so URLs survive layout changes.
export async function loadMap(id: string): Promise<MapRecord | null> {
  if (!safe(id)) return null;
  let rec: MapRecord;
  try {
    rec = JSON.parse(await readFile(join(ROOT, "maps", `${id}.json`), "utf8")) as MapRecord;
  } catch {
    return null;
  }
  if (rec.layout?.version !== LAYOUT_VERSION) {
    rec.layout = layoutGraph(rec.graph);
    await writeFile(join(ROOT, "maps", `${id}.json`), JSON.stringify(rec));
  }
  return rec;
}

export async function accountMaps(account: string): Promise<string[]> {
  if (!safe(account)) return [];
  try {
    return JSON.parse(await readFile(join(ROOT, "accounts", `${account}.json`), "utf8")) as string[];
  } catch {
    return [];
  }
}

export async function cachedGraph(hash: string): Promise<MetroGraph | null> {
  try {
    return JSON.parse(await readFile(join(ROOT, "cache", `${hash}.json`), "utf8")) as MetroGraph;
  } catch {
    return null;
  }
}

export async function cacheGraph(hash: string, graph: MetroGraph): Promise<void> {
  await ensure(join(ROOT, "cache"));
  await writeFile(join(ROOT, "cache", `${hash}.json`), JSON.stringify(graph));
}

export async function listMaps(): Promise<string[]> {
  try {
    return (await readdir(join(ROOT, "maps"))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

// Removes a map the given account owns. Returns false when it does not
// exist or belongs to someone else.
export async function deleteMap(id: string, account: string): Promise<boolean> {
  const rec = await loadMap(id);
  if (!rec || rec.account !== account) return false;
  await unlink(join(ROOT, "maps", `${id}.json`));
  const ids = (await accountMaps(account)).filter((x) => x !== id);
  await writeFile(join(ROOT, "accounts", `${account}.json`), JSON.stringify(ids));
  return true;
}
