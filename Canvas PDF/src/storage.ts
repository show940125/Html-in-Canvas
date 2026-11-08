import { openDB } from "idb";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Project } from "./types";
let database: ReturnType<typeof openDB> | undefined;
function db() {
  return (database ??= openDB("canvas-pdf", 2, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("projects"))
        d.createObjectStore("projects", { keyPath: "id" });
      if (!d.objectStoreNames.contains("ocr-cache"))
        d.createObjectStore("ocr-cache", { keyPath: "key" });
    },
  }));
}
let chain = Promise.resolve();
export async function hash(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function saveProject(p: Project) {
  const snapshot = structuredClone(p);
  chain = chain
    .catch(() => {})
    .then(async () => {
      const d = await db();
      const old = await d.get("projects", snapshot.id);
      if (!old || old.revision <= snapshot.revision)
        await d.put("projects", snapshot);
    });
  return chain;
}
export async function listProjects(): Promise<Project[]> {
  return (await (await db()).getAll("projects")).sort(
    (a, b) => b.updated - a.updated,
  );
}
export async function newProject(
  bytes: Uint8Array,
  name: string,
): Promise<Project> {
  return {
    schema: 1,
    id: crypto.randomUUID(),
    name,
    source: bytes.slice(),
    sourceHash: await hash(bytes),
    bytes: bytes.slice(),
    revision: 0,
    page: 0,
    scans: [],
    jobs: [],
    groups: {},
    updated: Date.now(),
  };
}
export function backup(p: Project) {
  const { source, bytes, ...meta } = p;
  return zipSync(
    {
      "project.json": strToU8(JSON.stringify(meta)),
      "source.pdf": source,
      "document.pdf": bytes,
    },
    { level: 6 },
  );
}
export async function restore(bytes: Uint8Array): Promise<Project> {
  if (bytes.length > 600_000_000) throw Error("專案包過大");
  const entries = unzipSync(bytes, {
    filter: (f) => {
      if (
        f.originalSize > (f.name === "project.json" ? 16_000_000 : 500_000_000)
      )
        throw Error("專案項目超過大小限制");
      return ["project.json", "source.pdf", "document.pdf"].includes(f.name);
    },
  });
  const m = JSON.parse(strFromU8(entries["project.json"] || new Uint8Array()));
  if (
    m.schema !== 1 ||
    typeof m.name !== "string" ||
    !Array.isArray(m.scans) ||
    m.scans.length > 100000 ||
    !Array.isArray(m.jobs) ||
    m.jobs.length > 100000
  )
    throw Error("無效的 Canvas PDF 專案");
  for (const b of m.scans) {
    if (
      typeof b.id !== "string" ||
      typeof b.source !== "string" ||
      typeof b.original !== "string" ||
      typeof b.translation !== "string" ||
      !["search", "rebuild"].includes(b.mode) ||
      ![
        b.x,
        b.y,
        b.width,
        b.height,
        b.page,
        b.size,
        b.rotation,
        b.order,
        b.score,
        b.mask?.x,
        b.mask?.y,
        b.mask?.width,
        b.mask?.height,
      ].every(Number.isFinite) ||
      b.width <= 0 ||
      b.height <= 0 ||
      b.page < 0
    )
      throw Error("專案包含無效的 OCR 區域");
  }
  const record = (v: any) => v && typeof v === "object" && !Array.isArray(v);
  if (
    !record(m.groups) ||
    Object.values(m.groups).some(
      (g: any) =>
        !Array.isArray(g) || g.some((id: any) => typeof id !== "string"),
    )
  )
    throw Error("專案群組格式無效");
  if (
    m.translations !== undefined &&
    (!record(m.translations) ||
      Object.values(m.translations).some((v) => typeof v !== "string"))
  )
    throw Error("專案譯文格式無效");
  if (m.identities !== undefined) {
    if (!record(m.identities)) throw Error("專案物件對應無效");
    for (const [page, items] of Object.entries(m.identities)) {
      if (
        !/^\d+$/.test(page) ||
        !Array.isArray(items) ||
        items.some(
          (o: any) =>
            !o ||
            typeof o.id !== "string" ||
            !["text", "image", "path", "form"].includes(o.kind) ||
            ![o.x, o.y, o.width, o.height].every(Number.isFinite),
        )
      )
        throw Error("專案物件座標無效");
    }
  }
  for (const j of m.jobs)
    if (
      !j ||
      typeof j.id !== "string" ||
      typeof j.inputHash !== "string" ||
      !["ocr", "translation"].includes(j.kind) ||
      !["submitted", "complete", "failed", "cancelled", "unknown"].includes(
        j.status,
      ) ||
      !Number.isFinite(j.started)
    )
      throw Error("專案工作紀錄無效");
  for (const key of ["source.pdf", "document.pdf"])
    if (!entries[key] || strFromU8(entries[key].slice(0, 5)) !== "%PDF-")
      throw Error("專案缺少有效的 PDF");
  if ((await hash(entries["source.pdf"])) !== m.sourceHash)
    throw Error("原始 PDF 摘要不符");
  return {
    ...m,
    id: crypto.randomUUID(),
    source: entries["source.pdf"],
    bytes: entries["document.pdf"],
    revision: 0,
    page: Number.isInteger(m.page) && m.page >= 0 ? m.page : 0,
    groups: m.groups && typeof m.groups === "object" ? m.groups : {},
    updated: Date.now(),
  };
}
export function download(
  bytes: Uint8Array,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function getOcrCache(key: string) {
  return (await (await db()).get("ocr-cache", key))?.result;
}
export async function putOcrCache(key: string, result: any) {
  const d = await db();
  await d.put("ocr-cache", { key, result, updated: Date.now() });
  const rows = await d.getAll("ocr-cache");
  for (const old of rows.sort((a, b) => b.updated - a.updated).slice(64))
    await d.delete("ocr-cache", old.key);
}
