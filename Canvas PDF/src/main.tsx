import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { PdfClient, normalize } from "./pdf";
import { demoPdf } from "./demo";
import { Stage } from "./Stage";
import { OcrClient, scanBlocks, bounds } from "./ocr";
import {
  newProject,
  saveProject,
  listProjects,
  hash,
  backup,
  restore,
  download,
  getOcrCache,
  putOcrCache,
} from "./storage";
import { pageOperation, exportPdf } from "./export";
import {
  translateBlocks,
  protectedDifference,
  createLocalTranslator,
} from "./translation";
import {
  PDFDocument,
  rgb,
  PDFName,
  PDFHexString as PDFString,
  degrees,
} from "pdf-lib";
import {
  defaultFormat,
  fontFamily,
  type Project,
  type PageView,
  type ScanBlock,
  type Rect,
  type Job,
} from "./types";
import "./styles.css";
import { editRuns, alignment, pasteOffset } from "./editing";
import { bindIdentities } from "./identity";
import assetLock from "../assets.lock.json";
import { wrapText } from "./text-layout";
import { inverse, point, type Matrix } from "./coordinates";
const client = new PdfClient(),
  ocr = new OcrClient();
let initialized: Promise<void>;
function initialize() {
  return (initialized ||= (async () => {
    const f = new FontFace(
      "Canvas TC",
      `url(${new URL("fonts/NotoSansCJKtc-Regular.otf", location.href)})`,
    );
    document.fonts.add(await f.load());
    await client.init();
  })());
}
function App() {
  const [project, setProject] = useState<Project | null>(null),
    [view, setViewState] = useState<PageView | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("準備本機編輯環境…"),
    [error, setError] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [zoom, setZoom] = useState(0.95),
    [tab, setTab] = useState("edit"),
    [recent, setRecent] = useState<Project[]>([]),
    [undo, setUndo] = useState<Project[]>([]),
    [redo, setRedo] = useState<Project[]>([]),
    [profile, setProfile] = useState("small"),
    [backend, setBackend] = useState("wasm"),
    [threads, setThreads] = useState("auto"),
    [runtime, setRuntime] = useState<any>(null),
    [provider, setProvider] = useState<"chrome" | "gemini">("chrome"),
    [from, setFrom] = useState("en"),
    [to, setTo] = useState("zh-Hant"),
    [glossary, setGlossary] = useState(""),
    [scope, setScope] = useState("selection"),
    [preview, setPreview] = useState(false),
    [regionMode, setRegionMode] = useState(false),
    [range, setRange] = useState(""),
    [copied, setCopied] = useState<any[]>([]),
    [translationInputs, setTranslationInputs] = useState<
      { id: string; source: string }[] | null
    >(null),
    [draft, setDraft] = useState("");
  const [thumbs, setThumbs] = useState<Record<number, string>>({}),
    [mimeEnabled, setMimeEnabled] = useState(false),
    [mimeContext, setMimeContext] = useState(false),
    [savedLocally, setSavedLocally] = useState(false),
    [mimeStreamConsumed, setMimeStreamConsumed] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    mergeInput = useRef<HTMLInputElement>(null),
    current = useRef<Project | null>(null),
    running = useRef(false),
    checkpointTaken = useRef(false),
    abort = useRef<AbortController | null>(null);
  const liveView = useRef<PageView | null>(view);
  function setView(next: PageView | null) {
    liveView.current = next;
    setViewState(next);
  }
  current.current = project;
  const selected = view?.objects.filter((x) => selection.includes(x.id)) || [],
    scans =
      project?.scans
        .filter((b) => b.page === view?.page)
        .map((b) => ({
          ...b,
          translation: project.translations?.[b.id] ?? b.translation,
        })) || [],
    scan = scans.find((b) => selection.includes(b.id)),
    object = selected[0];
  let scanHeight = 0;
  if (scan) {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${scan.size}px "Canvas TC"`;
    scanHeight =
      wrapText(
        preview ? scan.translation || scan.source : scan.source,
        scan.width,
        (t) => ctx.measureText(t).width,
      ).length *
      scan.size *
      1.25;
  }
  async function run(label: string, work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    checkpointTaken.current = false;
    setBusy(true);
    setError("");
    setStatus(label);
    try {
      await work();
      setStatus("已儲存於本機");
    } catch (e) {
      setError(String(e));
      setStatus("操作未完成；文件已保留");
      (window as any).__canvasPdfLastError = String(e);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    initialize()
      .then(async () => {
        setReady(true);
        setStatus("本機編輯環境已準備好");
        const saved = await listProjects();
        setRecent(saved);
        const id = new URLSearchParams(location.hash.slice(1)).get("project"),
          resume = saved.find((p) => p.id === id);
        if (resume)
          await run("恢復專案…", () => open(resume.bytes, resume.name, resume));
      })
      .catch((e) => setError(String(e)));
    return () => ocr.cancel();
  }, []);
  useEffect(
    () => setDraft(scan?.source ?? object?.text ?? ""),
    [scan?.id, scan?.source, object?.id, object?.text],
  );
  useEffect(() => {
    const pending = copied.filter((o) => o.kind === "image" && !o.imageData);
    if (!pending.length || !view) return;
    void (async () => {
      for (const o of pending) {
        try {
          const data = await client.call("imageData", {
            id: o.engineId,
            generation: view.generation,
          });
          setCopied((c) =>
            c.map((x) => (x.id === o.id ? { ...x, imageData: data } : x)),
          );
        } catch (e) {
          setError(String(e));
          setCopied((c) => c.filter((x) => x.id !== o.id));
        }
      }
    })();
  }, [copied]);
  useEffect(() => {
    if (!view) return;
    const c = document.createElement("canvas");
    c.width = view.image.width;
    c.height = view.image.height;
    c.getContext("2d")!.putImageData(
      new ImageData(new Uint8ClampedArray(view.image.data), c.width, c.height),
      0,
      0,
    );
    const thumb = document.createElement("canvas");
    thumb.width = 120;
    thumb.height = Math.round((120 * view.height) / view.width);
    thumb.getContext("2d")!.drawImage(c, 0, 0, thumb.width, thumb.height);
    setThumbs((t) => ({ ...t, [view.page]: thumb.toDataURL() }));
  }, [view]);
  useEffect(() => {
    if (!ready) return;
    const mime = (globalThis as any).chrome?.mimeHandler;
    if (!mime) return;
    void mime
      .getMimeHandlerOptions("application/pdf")
      .then((o: any) => setMimeEnabled(o.enabled !== false));
    void (async () => {
      let info: any;
      try {
        info = await mime.getStreamInfo();
      } catch {
        return;
      }
      if (info?.streamUrl) {
        setMimeContext(true);
        await run("開啟 PDF 串流…", async () => {
          const response = await fetch(info.streamUrl);
          if (!response.ok) throw Error("PDF 串流 HTTP " + response.status);
          const bytes = new Uint8Array(await response.arrayBuffer());
          setMimeStreamConsumed(true);
          await open(
            bytes,
            decodeURIComponent(
              new URL(info.originalUrl).pathname.split("/").pop() || "文件.pdf",
            ),
          );
        });
      }
    })();
  }, [ready]);
  async function persist(p: Project) {
    setSavedLocally(false);
    const next = {
      ...p,
      revision: Math.max(p.revision, current.current?.revision || 0) + 1,
      updated: Date.now(),
    };
    current.current = next;
    setProject(next);
    await saveProject(next);
    setSavedLocally(true);
  }
  function checkpoint() {
    if (!current.current || (running.current && checkpointTaken.current))
      return;
    if (running.current) checkpointTaken.current = true;
    const p = structuredClone(current.current);
    setUndo((a) => {
      const next = [...a, p].slice(-24);
      while (
        next.length > 1 &&
        next.reduce((n, p) => n + p.bytes.length, 0) > 128 * 1024 * 1024
      )
        next.shift();
      return next;
    });
    setRedo([]);
  }
  async function refresh(p = current.current!) {
    const v = bindIdentities(await client.open(p.bytes, p.page), p);
    setView(v);
    setSelection([]);
    setEditing(null);
  }
  async function open(bytes: Uint8Array, name: string, p?: Project) {
    await initialize();
    setSavedLocally(false);
    const next = p || (await newProject(bytes, name));
    let v: PageView;
    try {
      v = await client.open(next.bytes, next.page);
    } catch (e) {
      if (!/password.protected/i.test(String(e))) throw e;
      const password = prompt("PDF 開啟密碼");
      if (password === null) throw Error("已取消開啟");
      v = await client.open(next.bytes, next.page, password);
      if (v.info.canModify === false)
        throw Error("文件權限限制修改，請使用允許修改的密碼");
      next.signatureCount = v.info.signatures || 0;
      next.bytes = await client.call("decrypt");
      v = await client.open(next.bytes, next.page);
    }
    next.jobs = next.jobs.map((j) =>
      j.status === "submitted"
        ? {
            ...j,
            status: j.kind === "translation" ? "unknown" : "cancelled",
            message: "先前工作階段已中斷；已完成結果保留",
          }
        : j,
    );
    next.signatureCount ??= v.info.signatures || 0;
    v = bindIdentities(v, next);
    next.page = v.page;
    current.current = next;
    setProject(next);
    setView(v);
    setUndo([]);
    setRedo([]);
    setThumbs({});
    setSelection([]);
    await saveProject(next);
    setSavedLocally(true);
  }
  async function align(
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) {
    const items = [
        ...selected,
        ...scans.filter((b) => selection.includes(b.id)),
      ],
      deltas = alignment(items, mode);
    await run("對齊物件…", async () => {
      const native = selected.map((o, i) => ({ ...o, ...deltas[i] }));
      if (native.length) await command("layout", { items: native });
      if (items.length > native.length) {
        if (!native.length) checkpoint();
        await persist({
          ...current.current!,
          scans: current.current!.scans.map((b) => {
            const i = items.findIndex((x) => x.id === b.id);
            return i < 0
              ? b
              : { ...b, x: b.x + deltas[i].dx, y: b.y + deltas[i].dy };
          }),
        });
      }
    });
  }
  async function importFile(f?: File) {
    if (!f) return;
    await run("開啟文件…", async () => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (f.name.endsWith(".zip")) {
        const p = await restore(bytes);
        await open(p.bytes, p.name, p);
      } else await open(bytes, f.name);
    });
  }
  async function navigate(page: number) {
    if (!view || page < 0 || page >= view.count) return;
    await run("切換頁面…", async () => {
      const p = { ...current.current!, page };
      await refresh(p);
      await persist(p);
    });
  }
  async function command(type: string, args: any) {
    const activeView = liveView.current;
    if (!activeView) return;
    checkpoint();
    const before = current.current!;
    try {
      const r = await client.call(type, {
        ...args,
        generation: activeView.generation,
      });
      const next = { ...before, bytes: r.bytes };
      const removed =
        type === "delete"
          ? args.items.map((o: any) => o.id)
          : type === "split"
            ? [args.object.id]
            : type === "merge"
              ? args.items.map((o: any) => o.id)
              : [];
      const hints = new Map<number, string>(
        activeView.objects
          .filter((o) => !removed.includes(o.id))
          .map((o) => [o.engineId, o.id]),
      );
      const normalized = normalize(r.view, activeView.page);
      if (type === "text") {
        const changed = activeView.objects.find((o) => o.engineId === args.id);
        if (changed) {
          for (const [key, value] of hints)
            if (value === changed.id) hints.delete(key);
          const text = args.runs.map((r: any) => r.text).join("");
          const candidates = normalized.objects.filter(
            (o) =>
              o.kind === "text" &&
              o.text?.replace(/\s/gu, "") === text.replace(/\s/gu, ""),
          );
          if (text.trim() && !candidates.length)
            throw Error(
              "文字寫回驗證失敗，已還原原段落；此字型或字元暫不支援安全編輯。",
            );
          candidates.sort(
            (a, b) =>
              Math.hypot(a.x - changed.x, a.y - changed.y) -
              Math.hypot(b.x - changed.x, b.y - changed.y),
          );
          if (candidates[0]) hints.set(candidates[0].engineId, changed.id);
        }
      }
      const v = bindIdentities(normalized, next, hints, removed);
      if (type === "text") {
        next.translations = { ...next.translations };
        const changed = activeView.objects.find((o) => o.engineId === args.id);
        if (changed) delete next.translations[changed.id];
      }
      await persist(next);
      setView(v);
    } catch (e) {
      await refresh(before);
      throw e;
    }
  }
  async function editText(id: string, text: string) {
    const b = scans.find((b) => b.id === id);
    if (b) {
      await changeScan(id, {
        source: text,
        mode: "rebuild",
        translation: "",
        needsReview: false,
      });
      return;
    }
    const o = view!.objects.find((o) => o.id === id);
    if (!o?.editable) throw Error(o?.reason || "此文字無法編輯");
    await command("text", {
      id: o.engineId,
      runs: editRuns(o.runs || [], text),
      format: o.format,
    });
    const p = current.current!,
      translations = { ...p.translations };
    delete translations[id];
    await persist({ ...p, translations });
  }
  async function changeScan(id: string, patch: Partial<ScanBlock>) {
    for (const key of [
      "x",
      "y",
      "width",
      "height",
      "size",
      "rotation",
      "order",
    ] as const)
      if (patch[key] !== undefined && !Number.isFinite(patch[key]))
        throw Error("文字框數值無效");
    if (
      patch.mask &&
      (!Object.values(patch.mask).every(Number.isFinite) ||
        patch.mask.width <= 0 ||
        patch.mask.height <= 0)
    )
      throw Error("遮罩範圍無效");
    checkpoint();
    const translations = { ...current.current!.translations };
    if (patch.source !== undefined) delete translations[id];
    await persist({
      ...current.current!,
      translations,
      scans: current.current!.scans.map((b) =>
        b.id === id
          ? {
              ...b,
              ...patch,
              ...(patch.source !== undefined ? { translation: "" } : {}),
            }
          : b,
      ),
    });
  }
  async function move(dx: number, dy: number) {
    await run("移動物件…", async () => {
      if (selected.length)
        await command("move", { items: selected, dx, dy: -dy });
      if (scans.some((b) => selection.includes(b.id))) {
        if (!selected.length) checkpoint();
        await persist({
          ...current.current!,
          scans: current.current!.scans.map((b) =>
            selection.includes(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b,
          ),
        });
      }
    });
  }
  async function resize(sx: number, sy: number) {
    await run("調整物件大小…", async () => {
      if (selected.length > 1) {
        const x = Math.min(...selected.map((o) => o.x)),
          y = Math.min(...selected.map((o) => o.y));
        await command("scaleGroup", { items: selected, sx, sy, x, y });
      } else if (scan)
        await changeScan(scan.id, {
          width: Math.max(8, scan.width * sx),
          height: Math.max(8, scan.height * sy),
        });
      else if (object)
        await command("resize", {
          id: object.engineId,
          kind: object.kind,
          width: (object.raw?.box?.w || object.width) * sx,
          sx,
          sy,
          x: object.x,
          y: view!.height - object.y - object.height,
        });
    });
  }
  async function remove() {
    await run("刪除選取內容…", async () => {
      if (selected.length) await command("delete", { items: selected });
      if (scans.some((b) => selection.includes(b.id))) {
        if (!selected.length) checkpoint();
        await persist({
          ...current.current!,
          scans: current.current!.scans.filter(
            (b) => !selection.includes(b.id),
          ),
        });
      }
      setSelection([]);
    });
  }
  async function history(back: boolean) {
    const list = back ? undo : redo;
    if (!list.length) return;
    await run(back ? "復原…" : "重做…", async () => {
      const next = structuredClone(list.at(-1)!);
      next.jobs = current.current!.jobs;
      if (back) {
        setUndo(list.slice(0, -1));
        setRedo((a) => [...a, structuredClone(current.current!)]);
      } else {
        setRedo(list.slice(0, -1));
        setUndo((a) => [...a, structuredClone(current.current!)]);
      }
      await refresh(next);
      await persist(next);
    });
  }
  async function pages(action: any, extra?: Uint8Array) {
    if (!view || !project) return;
    await run("更新頁面…", async () => {
      const i = view.page,
        bytes = await pageOperation(project.bytes, action, i, extra);
      checkpoint();
      const remap = (n: number) =>
        action === "delete"
          ? n > i
            ? n - 1
            : n
          : action === "duplicate" || action === "insert"
            ? n > i
              ? n + 1
              : n
            : action === "up" || action === "down"
              ? n === i
                ? n + (action === "up" ? -1 : 1)
                : n === i + (action === "up" ? -1 : 1)
                  ? i
                  : n
              : n;
      const turn = (b: Rect) => ({
        x: view.height - b.y - b.height,
        y: b.x,
        width: b.height,
        height: b.width,
      });
      let blocks = project.scans
        .filter((b) => action !== "delete" || b.page !== i)
        .map((b) => ({
          ...b,
          page: remap(b.page),
          ...(action === "rotate" && b.page === i
            ? {
                ...turn(b),
                mask: turn(b.mask),
                rotation: (b.rotation + 90) % 360,
              }
            : {}),
        }));
      const identities: NonNullable<Project["identities"]> = {},
        translations = { ...project.translations },
        duplicates = new Map<string, string>();
      for (const [page, items] of Object.entries(project.identities || {})) {
        if (action === "delete" && +page === i) {
          for (const o of items) delete translations[o.id];
          continue;
        }
        identities[remap(+page)] = items.map((o) => ({
          ...o,
          ...(action === "rotate" && +page === i ? turn(o) : {}),
        }));
        if (action === "duplicate" && +page === i)
          identities[i + 1] = items.map((o) => {
            const id = crypto.randomUUID();
            duplicates.set(o.id, id);
            return { ...o, id };
          });
      }
      if (action === "delete")
        for (const o of project.scans.filter((b) => b.page === i))
          delete translations[o.id];
      if (action === "duplicate")
        blocks.push(
          ...project.scans
            .filter((b) => b.page === i)
            .map((b) => {
              const id = crypto.randomUUID();
              duplicates.set(b.id, id);
              return { ...b, id, page: i + 1 };
            }),
        );
      for (const [old, id] of duplicates)
        if (translations[old]) translations[id] = translations[old];
      const ids = new Set([
          ...Object.values(identities)
            .flat()
            .map((o) => o.id),
          ...blocks.map((b) => b.id),
        ]),
        groups = Object.fromEntries(
          Object.entries(project.groups)
            .map(([id, g]) => [id, g.filter((id) => ids.has(id))])
            .filter(([, g]) => g.length > 1),
        );
      const next = {
        ...project,
        bytes,
        page: action === "delete" ? Math.min(i, view.count - 2) : i,
        scans: blocks,
        groups,
        translations,
        identities,
      };
      await refresh(next);
      await persist(next);
    });
  }

  async function addText() {
    await run("新增文字框…", () =>
      command("addText", {
        x: 48,
        y: view!.height - 80,
        width: 280,
        runs: [
          {
            text: "在這裡輸入文字",
            family: fontFamily,
            size: 16,
            rgba: 0x193d31ff,
            sourceIndex: -1,
          },
        ],
        format: defaultFormat,
      }),
    );
  }
  async function image(f?: File) {
    if (!f) return;
    await run("載入圖片…", async () => {
      const b = await createImageBitmap(f);
      if (b.width * b.height > 40_000_000) {
        b.close();
        throw Error("圖片超過四千萬像素");
      }
      const c = document.createElement("canvas");
      c.width = b.width;
      c.height = b.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(b, 0, 0);
      b.close();
      await command(object?.kind === "image" ? "replaceImage" : "image", {
        id: object?.engineId,
        rgba: ctx.getImageData(0, 0, c.width, c.height).data,
        pw: c.width,
        ph: c.height,
        x: 48,
        y: view!.height - 280,
        width: 240,
        height: (240 * c.height) / c.width,
      });
    });
  }
  async function shape(kind: string) {
    await run("新增圖形…", async () => {
      const d = await PDFDocument.load(project!.bytes),
        p = d.getPage(view!.page);
      if (kind === "ellipse")
        p.drawEllipse({
          x: 140,
          y: 580,
          xScale: 80,
          yScale: 40,
          borderColor: rgb(0.2, 0.4, 0.3),
          borderWidth: 2,
        });
      else
        p.drawRectangle({
          x: 48,
          y: 540,
          width: kind === "highlight" ? 280 : 160,
          height: kind === "highlight" ? 20 : 80,
          ...(kind === "highlight"
            ? { color: rgb(1, 0.85, 0.2), opacity: 0.3 }
            : { borderColor: rgb(0.2, 0.4, 0.3), borderWidth: 2 }),
        });
      checkpoint();
      const next = { ...current.current!, bytes: await d.save() };
      await refresh(next);
      await persist(next);
    });
  }
  async function record(job: Job) {
    const p = current.current!;
    await persist({
      ...p,
      jobs: p.jobs.filter((j) => j.id !== job.id).concat(job),
    });
  }
  async function recognize(rect?: Rect) {
    if (!project || !view) return;
    const corrected = project.scans.some(
      (b) =>
        b.page === view.page &&
        (!rect ||
          (b.x >= rect.x &&
            b.y >= rect.y &&
            b.x < rect.x + rect.width &&
            b.y < rect.y + rect.height)) &&
        (b.source !== b.original ||
          b.mode === "rebuild" ||
          b.translation ||
          project.translations?.[b.id]),
    );
    if (
      corrected &&
      !confirm(
        "此範圍已有校正或重建的 OCR 文字。重新辨識會取代這些文字框；可用復原取回。要繼續重新辨識嗎？",
      )
    )
      return;
    await run("準備 OCR…", async () => {
      const page = view.page,
        job: Job = {
          id: crypto.randomUUID(),
          kind: "ocr",
          inputHash: await hash(project.bytes),
          status: "submitted",
          started: Date.now(),
        };
      await record(job);
      try {
        const r = await client.call("render", { page, scale: 2 });
        let image = r;
        if (rect) {
          const c = document.createElement("canvas");
          c.width = r.width;
          c.height = r.height;
          c.getContext("2d")!.putImageData(
            new ImageData(new Uint8ClampedArray(r.data), r.width, r.height),
            0,
            0,
          );
          const o = document.createElement("canvas");
          o.width = Math.round((rect.width * r.width) / view.width);
          o.height = Math.round((rect.height * r.height) / view.height);
          o.getContext("2d")!.drawImage(
            c,
            (rect.x / view.width) * r.width,
            (rect.y / view.height) * r.height,
            o.width,
            o.height,
            0,
            0,
            o.width,
            o.height,
          );
          image = {
            width: o.width,
            height: o.height,
            data: o.getContext("2d")!.getImageData(0, 0, o.width, o.height)
              .data,
          };
        }
        const cacheKey = await hash(
          new TextEncoder().encode(
            JSON.stringify({
              image: await hash(new Uint8Array(image.data)),
              width: image.width,
              height: image.height,
              profile,
              models: assetLock.files
                .filter((f) => f.path.includes("PP-OCRv6_" + profile))
                .map((f) => f.sha256),
              pipeline: "paddle0.4.2-det1600-rec6-v2",
            }),
          ),
        );
        const cached = await getOcrCache(cacheKey);
        const result = cached
          ? { ...cached, cacheHit: true }
          : await ocr.call({ image, profile, backend, threads }, setStatus);
        if (!cached) await putOcrCache(cacheKey, result);
        setRuntime(result);
        let blocks = scanBlocks(
          result,
          page,
          rect?.width || view.width,
          rect?.height || view.height,
          rect ? [] : view.objects,
        );
        if (rect)
          blocks = blocks.map((b) => ({
            ...b,
            x: b.x + rect.x,
            y: b.y + rect.y,
            mask: { ...b.mask, x: b.mask.x + rect.x, y: b.mask.y + rect.y },
          }));
        checkpoint();
        await persist({
          ...current.current!,
          scans: [
            ...current.current!.scans.filter(
              (b) =>
                b.page !== page ||
                (!!rect &&
                  !(
                    b.x >= rect.x &&
                    b.y >= rect.y &&
                    b.x < rect.x + rect.width &&
                    b.y < rect.y + rect.height
                  )),
            ),
            ...blocks,
          ],
        });
        await record({
          ...job,
          status: "complete",
          finished: Date.now(),
          diagnostic: {
            runtime: result.runtime,
            threads: result.threads,
            spawnedPthreads: result.spawnedPthreads,
            isolated: result.isolated,
            profile: result.profile,
            cacheKey,
            cacheHit: !!cached,
            metrics: result.metrics,
          },
        });
        setView(bindIdentities(await client.view(page), current.current!));
        setSelection(blocks.length ? [blocks[0].id] : []);
        setTab(blocks.length ? "edit" : "ocr");
        setRegionMode(false);
      } catch (e) {
        await record({
          ...job,
          status: /取消/.test(String(e)) ? "cancelled" : "failed",
          finished: Date.now(),
          message: String(e),
        });
        throw e;
      }
    });
  }
  async function translateStart() {
    if (!project || !view || running.current) return;
    const controller = new AbortController();
    abort.current = controller;
    const localSession =
      provider === "chrome"
        ? createLocalTranslator({ from, to }, controller.signal, setStatus)
        : undefined;
    localSession?.catch(() => {});
    let collected = false;
    const input: { id: string; source: string }[] = [];
    await run("整理翻譯段落…", async () => {
      for (const page of scope === "document"
        ? Array.from({ length: view.count }, (_, i) => i)
        : [view.page]) {
        controller.signal.throwIfAborted();
        const v =
          page === view.page
            ? view
            : bindIdentities(await client.view(page), current.current!);
        input.push(
          ...v.objects
            .filter(
              (o) =>
                o.kind === "text" &&
                o.text &&
                (scope !== "selection" || selection.includes(o.id)),
            )
            .map((o) => ({ id: o.id, source: o.text! })),
          ...project.scans
            .filter(
              (s) =>
                s.page === page &&
                (scope !== "selection" || selection.includes(s.id)),
            )
            .map((s) => ({ id: s.id, source: s.source })),
        );
      }
      setView(bindIdentities(await client.view(view.page), current.current!));
      await persist({ ...current.current! });
      if (!input.length) throw Error("請選取文字，或先執行 OCR");
      collected = true;
      if (provider === "gemini") setTranslationInputs(input);
    });
    if (collected && provider === "chrome")
      await performTranslation(input, localSession, controller);
    else if (!collected) {
      controller.abort();
      localSession?.then((t) => t.destroy?.()).catch(() => {});
    }
  }
  async function applyTranslations(result: Map<string, string>) {
    checkpoint();
    await persist({
      ...current.current!,
      translations: {
        ...current.current!.translations,
        ...Object.fromEntries(result),
      },
      scans: current.current!.scans.map((b) =>
        result.has(b.id) ? { ...b, translation: result.get(b.id)! } : b,
      ),
    });
    setPreview(true);
  }
  async function performTranslation(
    input = translationInputs!,
    localSession?: Promise<any>,
    controller?: AbortController,
  ) {
    setTranslationInputs(null);
    await run("翻譯文件…", async () => {
      abort.current = controller || new AbortController();
      if (
        provider === "gemini" &&
        (globalThis as any).chrome?.permissions &&
        !(await (globalThis as any).chrome.permissions.request({
          origins: ["https://gemini.google.com/*"],
        }))
      )
        throw Error("未取得 Gemini 權限");
      try {
        await applyTranslations(
          await translateBlocks(
            input,
            { provider, from, to, glossary },
            abort.current.signal,
            current.current!.jobs,
            record,
            setStatus,
            localSession,
          ),
        );
      } catch (e) {
        if ((e as any).partial?.size)
          await applyTranslations((e as any).partial);
        throw e;
      }
    });
  }
  async function output(
    mode: "edited" | "search" | "translated" | "bilingual" | "raster",
  ) {
    if (!project) return;
    await run("產生並驗證 PDF…", async () => {
      let indices: number[] | undefined;
      if (range.trim()) {
        indices = range.split(",").flatMap((s) => {
          const [a, b] = s.split("-").map(Number);
          if (b && b - a > 10000) throw Error("頁碼範圍過大");
          return b
            ? Array.from(
                { length: Math.max(0, b - a + 1) },
                (_, i) => a + i - 1,
              )
            : [a - 1];
        });
        if (
          !indices.length ||
          indices.some((i) => !Number.isInteger(i) || i < 0 || i >= view!.count)
        )
          throw Error("頁碼範圍無效");
      }
      const bytes = await exportPdf(current.current!, client, mode, indices);
      const { validatePdf } = await import("./validate");
      const result = await validatePdf(bytes);
      if (!result.pages) throw Error("匯出驗證失敗");
      download(
        bytes,
        project.name.replace(/\.pdf$/i, "") + "-" + mode + ".pdf",
        "application/pdf",
      );
      await refresh();
    });
  }
  function copySelection() {
    setCopied(
      structuredClone([
        ...selected,
        ...scans.filter((b) => selection.includes(b.id)),
      ]),
    );
  }
  async function paste() {
    if (!copied.length) return;
    await run("貼上物件…", async () => {
      if (copied.some((o) => o.kind === "path" || o.kind === "form"))
        throw Error("此圖形／Form 尚無可靠的複製方式；請使用框選抽取圖片");
      if (copied.some((o) => o.kind === "image" && !o.imageData))
        throw Error("圖片仍在準備複製");
      const { dx, dy } = pasteOffset(
        copied,
        liveView.current!.objects.filter((o) => o.kind === "text"),
        {
          x: 0,
          y: 0,
          width: liveView.current!.width,
          height: liveView.current!.height,
        },
      );
      for (const o of copied) {
        if (o.kind === "text")
          await command("addText", {
            x: o.x + dx,
            y: view!.height - o.y - dy,
            width: o.width,
            runs: o.runs.map((r: any) => ({
              ...r,
              family: fontFamily,
              sourceIndex: -1,
            })),
            format: o.format,
          });
        else if (o.kind === "image") {
          if (!o.imageData) throw Error("圖片仍在準備複製");
          await command("image", {
            rgba: o.imageData.data,
            pw: o.imageData.width,
            ph: o.imageData.height,
            x: o.x + dx,
            y: view!.height - o.y - o.height - dy,
            width: o.width,
            height: o.height,
          });
        } else if (o.source !== undefined) {
          checkpoint();
          await persist({
            ...current.current!,
            scans: [
              ...current.current!.scans,
              {
                ...o,
                id: crypto.randomUUID(),
                page: view!.page,
                x: o.x + dx,
                y: o.y + dy,
              },
            ],
          });
        }
      }
    });
  }
  async function region(rect: Rect) {
    if (tab === "ocr") return recognize(rect);
    await run("抽取區域圖片…", async () => {
      const v = view!,
        source = document.createElement("canvas"),
        crop = document.createElement("canvas");
      source.width = v.image.width;
      source.height = v.image.height;
      source
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(v.image.data),
            source.width,
            source.height,
          ),
          0,
          0,
        );
      crop.width = Math.round(rect.width * 2);
      crop.height = Math.round(rect.height * 2);
      crop
        .getContext("2d")!
        .drawImage(
          source,
          (rect.x / v.width) * source.width,
          (rect.y / v.height) * source.height,
          (rect.width / v.width) * source.width,
          (rect.height / v.height) * source.height,
          0,
          0,
          crop.width,
          crop.height,
        );
      const blob = await new Promise<Blob>((resolve, reject) =>
        crop.toBlob(
          (b) => (b ? resolve(b) : reject(Error("區域影像建立失敗"))),
          "image/png",
        ),
      );
      const d = await PDFDocument.load(current.current!.bytes),
        p = d.getPage(v.page),
        inv = inverse((v as any).transform as Matrix),
        scale = Math.hypot(inv[0], inv[1]),
        angle = (Math.atan2(inv[1], inv[0]) * 180) / Math.PI,
        mask = point(inv, rect.x, v.height - rect.y - rect.height);
      // A separate native mask stays below the extracted image in PDF paint order.
      // It is a reversible visual edit; the project retains the original content.
      p.drawRectangle({
        x: mask.x,
        y: mask.y,
        width: rect.width * scale,
        height: rect.height * scale,
        color: rgb(1, 1, 1),
        rotate: degrees(angle),
      });
      const at = point(inv, rect.x + 20, v.height - rect.y - rect.height - 20),
        image = await d.embedPng(await blob.arrayBuffer());
      p.drawImage(image, {
        x: at.x,
        y: at.y,
        width: rect.width * scale,
        height: rect.height * scale,
        rotate: degrees(angle),
      });
      checkpoint();
      const next = { ...current.current!, bytes: await d.save() };
      await refresh(next);
      await persist(next);
      setRegionMode(false);
    });
  }
  function select(ids: string[], reveal = true) {
    setSelection(
      Object.values(project?.groups || {}).find(
        (g) => ids.length === 1 && g.includes(ids[0]),
      ) || ids,
    );
    if (ids.length && reveal) setTab("edit");
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void history(!e.shiftKey);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c")
        copySelection();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void paste();
      }
      if (e.key === "Delete" && selection.length) void remove();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });
  useEffect(() => {
    (window as any).canvasPDF = {
      client,
      ocr,
      demoPdf,
      open,
      project,
      view,
      output,
      recognize,
      command,
      setSelection,
      translateBlocks,
      backup,
      restore,
      exportPdf,
      pageOperation,
      ready,
    };
  }, [project, view, ready]);
  const B = (label: string, fn: () => any, disabled = false) => (
    <button key={label} disabled={busy || disabled} onClick={fn}>
      {label}
    </button>
  );
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void importFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        hidden
        ref={file}
        type="file"
        accept=".pdf,.zip"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void image(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={mergeInput}
        type="file"
        accept=".pdf"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await pages("merge", new Uint8Array(await f.arrayBuffer()));
          e.target.value = "";
        }}
      />
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">C▱</span>
          <span>
            Canvas <b>PDF</b>
            <small>文件，自由編排。</small>
          </span>
        </a>
        <div className="filename">
          {project?.name || "你的文件工作台"}
          {project && (
            <small>
              {savedLocally ? "已保存 · 本機" : "尚待保存 · 本機"}
              {(project.signatureCount || 0) > 0
                ? " · 原檔含簽章，修改將影響驗證"
                : ""}
            </small>
          )}
        </div>
        <div className="header-actions">
          <span className="local-badge">● 本機處理</span>
          {B("開啟文件", () => file.current?.click(), !ready)}
          {B(
            "從網址開啟",
            () => {
              const url = prompt("PDF 網址（HTTP／HTTPS）");
              if (url)
                void run("取得文件…", async () => {
                  const u = new URL(url);
                  if (!["http:", "https:"].includes(u.protocol))
                    throw Error("網址格式不支援");
                  if (
                    (globalThis as any).chrome?.permissions &&
                    !(await (globalThis as any).chrome.permissions.request({
                      origins: [u.origin + "/*"],
                    }))
                  )
                    throw Error("未取得來源權限");
                  const r = await fetch(u);
                  if (!r.ok) throw Error("HTTP " + r.status);
                  await open(
                    new Uint8Array(await r.arrayBuffer()),
                    decodeURIComponent(
                      u.pathname.split("/").pop() || "文件.pdf",
                    ),
                  );
                });
            },
            !ready,
          )}
          {mimeContext &&
            B(
              "獨立分頁編輯",
              () => {
                (globalThis as any).chrome.tabs.create({
                  url:
                    (globalThis as any).chrome.runtime.getURL("index.html") +
                    "#project=" +
                    project?.id,
                });
              },
              !project,
            )}
          <a className="help" href="GUIDE.html" target="_blank">
            使用指南 ↗
          </a>
        </div>
      </header>
      {!project || !view ? (
        <main className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow">THE FOURTH CANVAS TOOL</span>
            <h1>
              文件的下一步，
              <br />
              <em>由你編排。</em>
            </h1>
            <p>
              改一段文字，搬一張圖片。
              <br />
              讓掃描頁變得可搜尋，讓譯文回到版面。
            </p>
            <div className="welcome-actions">
              {B("＋ 開啟 PDF", () => file.current?.click(), !ready)}
              {B(
                "試用範例文件",
                () =>
                  run("建立範例文件…", async () =>
                    open(await demoPdf(), "Canvas PDF 範例.pdf"),
                  ),
                !ready,
              )}
            </div>
            <small>拖入 PDF 或專案 ZIP。OCR 模型已隨插件提供。</small>
          </div>
          <div className="welcome-art">
            <div className="paper">
              <span>CANVAS FIELD NOTES</span>
              <h2>
                留住內容。
                <br />
                打開可能。
              </h2>
              <div className="paper-text" />
              <div className="paper-text short" />
              <div className="paper-chart">
                {[40, 75, 55, 100, 125].map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </div>
              <div className="paper-tag">可編輯文字框 ↗</div>
              <footer>01 / DOCUMENT WORKSPACE</footer>
            </div>
            <span className="floating-note">編輯 · 辨識 · 翻譯</span>
          </div>
          {recent.length > 0 && (
            <div className="recents">
              <h3>繼續編輯</h3>
              {recent.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    run("恢復專案…", () => open(p.bytes, p.name, p))
                  }
                >
                  <b>▤</b>
                  <span>
                    {p.name}
                    <small>{new Date(p.updated).toLocaleString("zh-TW")}</small>
                  </span>
                  ↗
                </button>
              ))}
            </div>
          )}
        </main>
      ) : (
        <>
          <nav className="tools">
            <div>
              {B("↶ 復原", () => history(true), !undo.length)}
              {B("↷ 重做", () => history(false), !redo.length)}
              <i />
              {B("T 文字", addText)}
              {B("▧ 圖片", () => imageInput.current?.click())}
              {B("□ 方框", () => shape("rect"))}
              {B("○ 橢圓", () => shape("ellipse"))}
              {B("▰ 標記", () => shape("highlight"))}
              <i />
              {B(
                "複製",
                () =>
                  setCopied(
                    structuredClone([
                      ...selected,
                      ...scans.filter((b) => selection.includes(b.id)),
                    ]),
                  ),
                !selection.length,
              )}
              {B("貼上", paste, !copied.length)}
              {B("刪除", remove, !selection.length)}
            </div>
            <div>
              <button onClick={() => setZoom(Math.max(0.25, zoom - 0.1))}>
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.min(3, zoom + 0.1))}>
                ＋
              </button>
              {B("適合頁寬", () =>
                setZoom(Math.min(1.4, (innerWidth - 560) / view.width)),
              )}
            </div>
          </nav>
          <main className="workspace">
            <aside className="pages">
              <div className="panel-heading">
                <span>頁面</span>
                <small>{view.count} 頁</small>
              </div>
              <div className="page-tools">
                {B("↑", () => pages("up"), view.page === 0)}
                {B("↓", () => pages("down"), view.page === view.count - 1)}
                {B("旋轉", () => pages("rotate"))}
                {B("複製頁", () => pages("duplicate"))}
                {B("刪頁", () => pages("delete"))}
                {B("空白頁", () => pages("insert"))}
                {B("插入 PDF", () => mergeInput.current?.click())}
              </div>
              <div className="thumb-list">
                {Array.from({ length: view.count }, (_, i) => (
                  <button
                    className={"thumb " + (view.page === i ? "active" : "")}
                    key={i}
                    disabled={busy}
                    onClick={() => navigate(i)}
                  >
                    {thumbs[i] ? (
                      <img
                        className="thumb-image"
                        src={thumbs[i]}
                        alt={`第 ${i + 1} 頁縮圖`}
                      />
                    ) : (
                      <div className="thumb-placeholder">
                        <span>CANVAS PDF</span>
                        <b>{i + 1}</b>
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                    <span>{String(i + 1).padStart(2, "0")}</span>
                  </button>
                ))}
              </div>
            </aside>
            <section className="stage-scroll">
              <div className="stage-caption">
                <span>
                  {String(view.page + 1).padStart(2, "0")} <i>/</i>{" "}
                  {String(view.count).padStart(2, "0")}
                </span>
                <span>
                  {regionMode
                    ? "框選要處理的區域"
                    : "點選物件 · 雙擊文字編輯 · Shift 多選"}
                </span>
              </div>
              <Stage
                view={view}
                zoom={zoom}
                scans={scans}
                selection={selection}
                select={select}
                move={move}
                resize={resize}
                edit={(id, t) => void run("更新文字…", () => editText(id, t))}
                editing={editing}
                setEditing={(id) => {
                  if (id) setTab("edit");
                  setEditing(id);
                }}
                region={region}
                regionMode={regionMode}
                preview={preview}
                busy={busy}
              />
              <div className="page-navigation">
                {B("← 上一頁", () => navigate(view.page - 1), view.page === 0)}
                <span>第 {view.page + 1} 頁</span>
                {B(
                  "下一頁 →",
                  () => navigate(view.page + 1),
                  view.page === view.count - 1,
                )}
              </div>
            </section>
            <aside className="inspector">
              <div className="tabs">
                {[
                  ["edit", "編輯"],
                  ["ocr", "OCR"],
                  ["translate", "翻譯"],
                  ["export", "輸出"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={tab === k ? "active" : ""}
                    onClick={() => setTab(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="inspector-body">
                {tab === "edit" && (
                  <>
                    <span className="eyebrow">OBJECT PROPERTIES</span>
                    <h2>
                      {scan
                        ? "掃描文字框"
                        : object?.kind === "text"
                          ? "段落文字"
                          : object?.kind === "image"
                            ? "圖片物件"
                            : selection.length
                              ? "選取物件"
                              : "選取一個物件"}
                    </h2>
                    {!selection.length ? (
                      <p className="hint">
                        在頁面上選取文字、圖片或框選一組圖表。內容依照你的安排，留在原始版面。
                      </p>
                    ) : (
                      <>
                        <div className="dimensions">
                          {Math.round(scan?.width || object?.width || 0)} ×{" "}
                          {Math.round(scan?.height || object?.height || 0)} pt ·{" "}
                          {selection.length} 個物件
                        </div>
                        {(scan || object?.kind === "text") && (
                          <>
                            <label>
                              文字內容
                              <textarea
                                aria-label="文字內容"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                              />
                            </label>
                            {B("套用文字", () =>
                              run("更新文字…", () =>
                                editText(scan?.id || object!.id, draft),
                              ),
                            )}
                            {scan && (
                              <p className="hint">
                                套用文字會擦除來源區域並顯示新文字。僅修正搜尋文字時，請到
                                OCR 分頁使用「套用校正」。
                              </p>
                            )}
                            {object?.kind === "text" && !object.editable && (
                              <p role="alert">
                                {object.reason ||
                                  "此段落無法直接修改；可使用 OCR 框選辨識，再選擇點陣化輸出。"}
                              </p>
                            )}
                            <label>
                              字級
                              <input
                                type="number"
                                min="4"
                                max="300"
                                key={scan?.id || object?.id}
                                defaultValue={
                                  scan?.size || object?.runs?.[0]?.size || 14
                                }
                                onBlur={(e) => {
                                  const size = +e.target.value;
                                  if (size < 4 || size > 300) return;
                                  void run("更新字級…", () =>
                                    scan
                                      ? changeScan(scan.id, { size })
                                      : command("text", {
                                          id: object!.engineId,
                                          runs: object!.runs!.map((r) => ({
                                            ...r,
                                            size,
                                            family: fontFamily,
                                            sourceIndex: -1,
                                          })),
                                          format: object!.format,
                                        }),
                                  );
                                }}
                              />
                            </label>
                            {scan && scanHeight > scan.height + 1 && (
                              <div className="notice">
                                文字超出框高，請調整字級、位置或增高。
                                {B("增高文字框", () =>
                                  run("調整框高…", () =>
                                    changeScan(scan.id, { height: scanHeight }),
                                  ),
                                )}
                                {B("縮字以適合", () =>
                                  run("縮字…", () =>
                                    changeScan(scan.id, {
                                      size: Math.max(4, scan.size * 0.9),
                                    }),
                                  ),
                                )}
                              </div>
                            )}
                            <label>
                              文字框寬度
                              <input
                                type="number"
                                min="8"
                                key={"w" + (scan?.id || object?.id)}
                                defaultValue={Math.round(
                                  scan?.width || object?.width || 100,
                                )}
                                onBlur={(e) => {
                                  if (+e.target.value >= 8)
                                    void resize(
                                      +e.target.value /
                                        (scan?.width || object!.width),
                                      1,
                                    );
                                }}
                              />
                            </label>
                            {object?.kind === "text" && (
                              <>
                                <label>
                                  行距
                                  <input
                                    type="number"
                                    min=".8"
                                    max="4"
                                    step=".1"
                                    defaultValue={
                                      object.format?.lineSpacing || 1.2
                                    }
                                    onBlur={(e) =>
                                      void run("更新行距…", () =>
                                        command("text", {
                                          id: object.engineId,
                                          runs: object.runs,
                                          format: {
                                            ...object.format,
                                            lineSpacing: +e.target.value,
                                          },
                                        }),
                                      )
                                    }
                                  />
                                </label>
                                <div className="button-row">
                                  {["靠左", "置中", "靠右", "左右對齊"].map(
                                    (l, i) =>
                                      B(l, () =>
                                        run("更新對齊…", () =>
                                          command("text", {
                                            id: object.engineId,
                                            runs: object.runs,
                                            format: {
                                              ...object.format,
                                              align: i,
                                            },
                                          }),
                                        ),
                                      ),
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        )}
                        <div className="button-row">
                          {B("左移", () => move(-5, 0))}
                          {B("右移", () => move(5, 0))}
                          {B("上移", () => move(0, -5))}
                          {B("下移", () => move(0, 5))}
                        </div>
                        <div className="button-row">
                          {B("縮小", () => resize(0.9, 0.9))}
                          {B("放大", () => resize(1.1, 1.1))}
                          {B(
                            "旋轉 90°",
                            () =>
                              scan
                                ? run("旋轉文字…", () =>
                                    changeScan(scan.id, {
                                      rotation: (scan.rotation + 90) % 360,
                                    }),
                                  )
                                : run("旋轉物件…", () =>
                                    command("rotate", {
                                      id: object!.engineId,
                                      degrees: 90,
                                    }),
                                  ),
                            !scan && object?.kind === "text",
                          )}
                        </div>
                        {B(
                          "群組選取物件",
                          () =>
                            run("建立群組…", async () => {
                              checkpoint();
                              await persist({
                                ...project,
                                groups: {
                                  ...project.groups,
                                  [crypto.randomUUID()]: selection,
                                },
                              });
                            }),
                          selection.length < 2,
                        )}
                        {B("解除群組", () =>
                          run("解除群組…", async () => {
                            checkpoint();
                            await persist({
                              ...project,
                              groups: Object.fromEntries(
                                Object.entries(project.groups).filter(
                                  ([, g]) =>
                                    !g.some((id) => selection.includes(id)),
                                ),
                              ),
                            });
                          }),
                        )}
                      </>
                    )}
                    {B(regionMode ? "取消區域抽取" : "框選抽取圖片", () =>
                      setRegionMode(!regionMode),
                    )}
                  </>
                )}
                {tab === "ocr" && (
                  <>
                    <span className="eyebrow">READ THE IMAGE</span>
                    <h2>讓掃描頁開口。</h2>
                    <p className="hint">
                      辨識在你的電腦執行。先核對原文，再重建文字框或保留原圖。
                    </p>
                    <label>
                      模型
                      <select
                        value={profile}
                        onChange={(e) => setProfile(e.target.value)}
                      >
                        <option value="small">PP-OCRv6 small · 標準</option>
                        <option value="medium">PP-OCRv6 medium · 高品質</option>
                      </select>
                    </label>
                    <div className="two-fields">
                      <label>
                        運算
                        <select
                          value={backend}
                          onChange={(e) => setBackend(e.target.value)}
                        >
                          <option value="wasm">CPU / WASM</option>
                          <option value="webgpu">GPU / WebGPU</option>
                        </select>
                      </label>
                      <label>
                        CPU 緒數
                        <select
                          value={threads}
                          onChange={(e) => setThreads(e.target.value)}
                        >
                          {["auto", "1", "2", "4"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="button-row">
                      {B("辨識目前頁面", () => recognize())}
                      {B(regionMode ? "取消框選" : "框選辨識", () =>
                        setRegionMode(!regionMode),
                      )}
                    </div>
                    {view.objects.some((o) => o.kind === "text") && (
                      <>
                        {B("整頁強制辨識（含既有文字）", () =>
                          recognize({
                            x: 0,
                            y: 0,
                            width: view.width,
                            height: view.height,
                          }),
                        )}
                        <p className="hint">
                          適用於既有文字層無法直接編輯的 PDF。辨識後可編輯 OCR
                          框；與原生文字重疊的可見修改需使用點陣化 PDF 輸出。
                        </p>
                      </>
                    )}
                    {runtime && (
                      <div className="runtime">
                        {runtime.cacheHit ? "快取 · " : ""}
                        {runtime.profile} · {runtime.runtime.detProvider} /{" "}
                        {runtime.runtime.recProvider}
                        <br />
                        {runtime.threads} 緒 ·{" "}
                        {Math.round(runtime.metrics.totalMs)} ms ·{" "}
                        {runtime.items.length} 行
                      </div>
                    )}
                    <div className="ocr-list">
                      {[...scans]
                        .sort((a, b) => a.order - b.order)
                        .map((b) => (
                          <button
                            key={b.id}
                            className={selection.includes(b.id) ? "active" : ""}
                            onClick={() => select([b.id], false)}
                          >
                            <span>{b.order + 1}</span>
                            <p>{b.source || "圖像擦除區"}</p>
                            <small>{Math.round(b.score * 100)}%</small>
                          </button>
                        ))}
                    </div>
                    {runtime && !scans.length && (
                      <p className="notice">
                        未建立 OCR 文字框。與既有 PDF
                        文字重疊的辨識結果會略過，以避免重複搜尋文字；可直接選取下方段落編輯，或使用框選辨識。
                      </p>
                    )}
                    {!scans.length &&
                      view.objects
                        .filter((o) => o.kind === "text")
                        .map((o) => (
                          <button key={o.id} onClick={() => select([o.id])}>
                            編輯段落：{o.text?.slice(0, 60)}
                          </button>
                        ))}
                    {scan && (
                      <>
                        <p className="hint">
                          偵測{" "}
                          {scan.detScore === undefined
                            ? "—"
                            : Math.round(scan.detScore * 100) + "%"}{" "}
                          · 辨識 {Math.round(scan.score * 100)}%
                        </p>
                        <label>
                          校正原文
                          <textarea
                            aria-label="校正原文"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                          />
                        </label>
                        {B("套用校正", () =>
                          run("保存校正…", () =>
                            changeScan(scan.id, {
                              source: draft,
                              translation: "",
                              needsReview: false,
                            }),
                          ),
                        )}
                        <p className="hint">
                          「保留原圖」模式只更新搜尋文字；要改變頁面顯示，請選擇「擦除來源／重建文字框」或到編輯分頁套用文字。
                        </p>
                        <label>
                          工作方式
                          <select
                            value={scan.mode}
                            onChange={(e) =>
                              void run("更新工作方式…", () =>
                                changeScan(scan.id, {
                                  mode: e.target.value as any,
                                }),
                              )
                            }
                          >
                            <option value="search">保留原圖／搜尋文字</option>
                            <option value="rebuild">
                              擦除來源／重建文字框
                            </option>
                          </select>
                        </label>
                        <label>
                          讀序
                          <input
                            type="number"
                            value={scan.order + 1}
                            onChange={(e) =>
                              void run("更新讀序…", () =>
                                changeScan(scan.id, {
                                  order: +e.target.value - 1,
                                }),
                              )
                            }
                          />
                        </label>
                        <label>
                          擦除背景
                          <input
                            type="color"
                            value={scan.fill}
                            onChange={(e) =>
                              void run("更新背景…", () =>
                                changeScan(scan.id, { fill: e.target.value }),
                              )
                            }
                          />
                        </label>
                        {B("取樣遮罩背景", () =>
                          run("取樣背景…", async () => {
                            const r = scan.mask,
                              x = Math.max(
                                0,
                                Math.min(
                                  view.image.width - 1,
                                  Math.round(
                                    (r.x / view.width) * view.image.width,
                                  ),
                                ),
                              ),
                              y = Math.max(
                                0,
                                Math.min(
                                  view.image.height - 1,
                                  Math.round(
                                    ((r.y - 2) / view.height) *
                                      view.image.height,
                                  ),
                                ),
                              ),
                              i = (y * view.image.width + x) * 4;
                            await changeScan(scan.id, {
                              fill:
                                "#" +
                                [...view.image.data.slice(i, i + 3)]
                                  .map((v) => v.toString(16).padStart(2, "0"))
                                  .join(""),
                            });
                          }),
                        )}
                        <div className="two-fields">
                          {(["x", "y", "width", "height"] as const).map((k) => (
                            <label key={k}>
                              遮罩 {k}
                              <input
                                type="number"
                                defaultValue={Math.round(scan.mask[k])}
                                key={scan.id + k}
                                onBlur={(e) =>
                                  void run("調整遮罩…", () =>
                                    changeScan(scan.id, {
                                      mask: {
                                        ...scan.mask,
                                        [k]: +e.target.value,
                                      },
                                    }),
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                        {B("重辨選取區域", () => recognize(scan.mask))}
                        {B("拆成兩行", () =>
                          run("拆分行框…", async () => {
                            checkpoint();
                            const n = Math.ceil(scan.source.length / 2);
                            await persist({
                              ...project,
                              scans: project.scans.flatMap((b) =>
                                b.id !== scan.id
                                  ? [b]
                                  : [
                                      {
                                        ...b,
                                        source: b.source.slice(0, n),
                                        translation: "",
                                        height: b.height / 2,
                                      },
                                      {
                                        ...b,
                                        id: crypto.randomUUID(),
                                        source: b.source.slice(n),
                                        translation: "",
                                        y: b.y + b.height / 2,
                                        height: b.height / 2,
                                        order: b.order + 0.5,
                                      },
                                    ],
                              ),
                            });
                          }),
                        )}
                      </>
                    )}
                    {B(
                      "合併選取行框",
                      () =>
                        run("合併行框…", async () => {
                          const bs = scans
                              .filter((b) => selection.includes(b.id))
                              .sort((a, b) => a.order - b.order),
                            r = bounds(
                              bs.flatMap((b) => [
                                { x: b.x, y: b.y },
                                { x: b.x + b.width, y: b.y + b.height },
                              ]),
                            );
                          checkpoint();
                          await persist({
                            ...project,
                            scans: [
                              ...project.scans.filter(
                                (b) => !selection.includes(b.id),
                              ),
                              {
                                ...bs[0],
                                ...r,
                                source: bs.map((b) => b.source).join("\n"),
                                mask: { ...r },
                                translation: "",
                              },
                            ],
                          });
                        }),
                      scans.filter((b) => selection.includes(b.id)).length < 2,
                    )}
                  </>
                )}
                {tab === "translate" && (
                  <>
                    <span className="eyebrow">WORDS, IN YOUR LANGUAGE</span>
                    <h2>譯文，也能編排。</h2>
                    <label>
                      翻譯來源
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as any)}
                      >
                        <option value="chrome">Chrome 本機翻譯</option>
                        <option value="gemini">Gemini 匿名 RPC</option>
                      </select>
                    </label>
                    <div className="two-fields">
                      <label>
                        原文
                        <select
                          value={from}
                          onChange={(e) => setFrom(e.target.value)}
                        >
                          {["en", "ja", "zh-Hant", "zh", "ko", "de", "fr"].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <label>
                        譯文
                        <select
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                        >
                          {["zh-Hant", "en", "ja", "zh", "ko", "de", "fr"].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    <label>
                      翻譯範圍
                      <select
                        value={scope}
                        onChange={(e) => setScope(e.target.value)}
                      >
                        <option value="selection">選取段落</option>
                        <option value="page">目前頁面</option>
                        <option value="document">整份文件</option>
                      </select>
                    </label>
                    <label>
                      術語與固定譯名
                      <textarea
                        value={glossary}
                        onChange={(e) => setGlossary(e.target.value)}
                        placeholder="例如 appeal＝上訴"
                      />
                    </label>
                    {B("開始翻譯", translateStart)}
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={preview}
                        onChange={(e) => setPreview(e.target.checked)}
                      />
                      預覽掃描頁譯文
                    </label>
                    {selection[0] && (
                      <>
                        <label>
                          譯文校訂
                          <textarea
                            value={
                              project.translations?.[selection[0]] ||
                              scan?.translation ||
                              ""
                            }
                            onChange={(e) =>
                              void persist({
                                ...current.current!,
                                translations: {
                                  ...current.current!.translations,
                                  [selection[0]]: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        {B(
                          "套用譯文至文字框",
                          () =>
                            run("套用譯文…", () =>
                              editText(
                                selection[0],
                                project.translations?.[selection[0]] ||
                                  scan?.translation ||
                                  "",
                              ),
                            ),
                          !project.translations?.[selection[0]],
                        )}
                        {protectedDifference(
                          draft,
                          project.translations?.[selection[0]] || "",
                        ).length > 0 && (
                          <p className="hint">
                            請核對數字：
                            {protectedDifference(
                              draft,
                              project.translations?.[selection[0]] || "",
                            ).join("、")}
                          </p>
                        )}
                      </>
                    )}
                    <details>
                      <summary>工作紀錄</summary>
                      {project.jobs
                        .filter((j) => j.kind === "translation")
                        .slice(-12)
                        .map((j) => (
                          <div className="job" key={j.id}>
                            {j.status} ·{" "}
                            {new Date(j.started).toLocaleTimeString()}
                            <small>{j.message}</small>
                            {["unknown", "submitted"].includes(j.status) &&
                              B("確認並解除此請求鎖定", () =>
                                run("解除鎖定…", async () => {
                                  if (
                                    confirm(
                                      "先前請求可能已完成。解除後可由你手動重送，確定解除？",
                                    )
                                  )
                                    await record({
                                      ...j,
                                      status: "failed",
                                      message: "使用者明確解除結果未知鎖定",
                                    });
                                }),
                              )}
                          </div>
                        ))}
                    </details>
                  </>
                )}
                {tab === "export" && (
                  <>
                    <span className="eyebrow">TAKE YOUR WORK WITH YOU</span>
                    <h2>保存你的版本。</h2>
                    <label>
                      匯出頁碼
                      <input
                        value={range}
                        onChange={(e) => setRange(e.target.value)}
                        placeholder="全部，或 1-3,5"
                      />
                    </label>
                    <div className="export-options">
                      {B("下載編輯後 PDF", () => output("edited"))}
                      {B("原圖＋搜尋文字 PDF", () => output("search"))}
                      {B("譯文 PDF", () => output("translated"))}
                      {B("原文／譯文配對頁", () => output("bilingual"))}
                      {B("整頁點陣化 PDF（文字變圖片）", () =>
                        output("raster"),
                      )}
                      {B("下載完整專案 ZIP", () =>
                        download(
                          backup(project),
                          project.name + ".canvas-pdf.zip",
                        ),
                      )}
                    </div>
                    <p className="hint">
                      每次另存副本。專案包保留原始 PDF、校正、譯文與編輯狀態。
                    </p>
                    {(project.signatureCount || 0) > 0 && (
                      <p className="notice">
                        原始文件含數位簽章，修改輸出會影響簽章驗證。
                      </p>
                    )}
                    <details>
                      <summary>來源與檔案資訊</summary>
                      <p className="hash">SHA-256 {project.sourceHash}</p>
                      <p>Canvas PDF 0.1.1 · AGPL-3.0</p>
                      <a href="licenses/AGPL-3.0.txt" target="_blank">
                        查看授權
                      </a>
                    </details>
                  </>
                )}
                {tab === "edit" && (
                  <>
                    <hr />
                    <h3>格式與編排</h3>
                    {object?.kind === "text" && (
                      <>
                        <label>
                          字型
                          <select
                            defaultValue="original"
                            key={"family" + object.id}
                            onChange={(e) =>
                              void run("更新字型…", () =>
                                command("text", {
                                  id: object.engineId,
                                  runs: object.runs!.map((r, i) => ({
                                    ...r,
                                    family:
                                      e.target.value === "original"
                                        ? r.family
                                        : fontFamily,
                                    sourceIndex:
                                      e.target.value === "original" ? i : -1,
                                  })),
                                  format: object.format,
                                }),
                              )
                            }
                          >
                            <option value="original">保留來源字型</option>
                            <option value="noto">Noto Sans CJK TC</option>
                          </select>
                        </label>
                        <label>
                          文字顏色
                          <input
                            type="color"
                            defaultValue={
                              "#" +
                              ((object.runs?.[0]?.rgba || 255) >>> 8)
                                .toString(16)
                                .padStart(6, "0")
                            }
                            onChange={(e) =>
                              void run("更新文字顏色…", () =>
                                command("text", {
                                  id: object.engineId,
                                  runs: object.runs!.map((r, i) => ({
                                    ...r,
                                    rgba:
                                      (parseInt(e.target.value.slice(1), 16) *
                                        256 +
                                        255) >>>
                                      0,
                                    sourceIndex: i,
                                  })),
                                  format: object.format,
                                }),
                              )
                            }
                          />
                        </label>
                        <div className="button-row">
                          {B("粗體", () =>
                            run("更新粗體…", () =>
                              command("text", {
                                id: object.engineId,
                                runs: object.runs!.map((r, i) => ({
                                  ...r,
                                  bold: !r.bold,
                                  sourceIndex: i,
                                })),
                                format: object.format,
                              }),
                            ),
                          )}
                          {B("斜體", () =>
                            run("更新斜體…", () =>
                              command("text", {
                                id: object.engineId,
                                runs: object.runs!.map((r, i) => ({
                                  ...r,
                                  italic: !r.italic,
                                  sourceIndex: i,
                                })),
                                format: object.format,
                              }),
                            ),
                          )}
                        </div>
                        {B("拆分原生段落", () => {
                          const text = prompt(
                            "以換行指定拆分位置",
                            object.text,
                          );
                          if (text?.includes("\n"))
                            void run("拆分段落…", () =>
                              command("split", {
                                object,
                                parts: text.split("\n").filter(Boolean),
                              }),
                            );
                        })}
                        {(object.y + object.height > view.height ||
                          object.x + object.width > view.width) && (
                          <p className="notice">
                            文字框超出頁面，請調整位置、框寬或字級。
                          </p>
                        )}
                      </>
                    )}
                    {B(
                      "合併選取原生段落",
                      () =>
                        run("合併段落…", () =>
                          command("merge", {
                            items: selected
                              .filter((o) => o.kind === "text")
                              .sort((a, b) => a.y - b.y),
                            width: Math.max(...selected.map((o) => o.width)),
                          }),
                        ),
                      selected.filter((o) => o.kind === "text").length < 2,
                    )}
                    <div className="button-row">
                      {(
                        [
                          "left",
                          "center",
                          "right",
                          "top",
                          "middle",
                          "bottom",
                        ] as const
                      ).map((v, i) =>
                        B(
                          [
                            "左對齊",
                            "水平置中",
                            "右對齊",
                            "頂端對齊",
                            "垂直置中",
                            "底端對齊",
                          ][i],
                          () => align(v),
                          selection.length < 2,
                        ),
                      )}
                    </div>
                    {object && object.kind !== "text" && (
                      <div className="button-row">
                        {B("移到前層", () =>
                          run("調整圖層…", () =>
                            command("arrange", {
                              id: object.engineId,
                              op: "front",
                            }),
                          ),
                        )}
                        {B("移到後層", () =>
                          run("調整圖層…", () =>
                            command("arrange", {
                              id: object.engineId,
                              op: "back",
                            }),
                          ),
                        )}
                      </div>
                    )}
                    {B("新增註解", () => {
                      const text = prompt("註解內容");
                      if (text)
                        void run("新增註解…", async () => {
                          const d = await PDFDocument.load(project.bytes),
                            p = d.getPage(view.page),
                            a = d.context.register(
                              d.context.obj({
                                Type: "Annot",
                                Subtype: "Text",
                                Rect: [48, 600, 72, 624],
                                Contents: PDFString.fromText(text),
                                Name: "Note",
                              }),
                            ),
                            arr = p.node.Annots();
                          if (arr) arr.push(a);
                          else
                            p.node.set(
                              PDFName.of("Annots"),
                              d.context.obj([a]),
                            );
                          checkpoint();
                          const next = { ...project, bytes: await d.save() };
                          await refresh(next);
                          await persist(next);
                        });
                    })}
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={mimeEnabled}
                        onChange={(e) =>
                          void run("更新 PDF 開啟方式…", async () => {
                            const enabled = e.target.checked,
                              mime = (globalThis as any).chrome?.mimeHandler;
                            if (!mime)
                              throw Error("此瀏覽器尚無 MIME Handler API");
                            await mime.setMimeHandlerOptions(
                              "application/pdf",
                              { enabled, canEmbed: true },
                            );
                            setMimeEnabled(enabled);
                          })
                        }
                      />
                      以 Canvas PDF 接管 PDF
                    </label>
                  </>
                )}
              </div>
            </aside>
          </main>
        </>
      )}
      <footer className="statusbar">
        <span>
          {busy ? "◌" : "●"} {status}
        </span>
        {busy && (
          <button
            onClick={() => {
              ocr.cancel();
              abort.current?.abort();
            }}
          >
            取消辨識／翻譯
          </button>
        )}
        <span>
          {project
            ? `${project.scans.length} 個 OCR 行框 · ${Math.round(project.bytes.length / 1024)} KB`
            : "Canvas PDF 0.1.1"}
        </span>
      </footer>
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          {mimeStreamConsumed && (
            <button
              onClick={() =>
                void (
                  globalThis as any
                ).chrome.mimeHandler.abortAndFallbackToNativeHandler()
              }
            >
              交回 Chrome 原生閱讀器
            </button>
          )}
          <button onClick={() => setError("")}>關閉</button>
        </div>
      )}
      {translationInputs && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>使用 Gemini 翻譯</h2>
            <p>
              將選定的 {translationInputs.length} 段文字（共{" "}
              {translationInputs.reduce((n, b) => n + b.source.length, 0)}{" "}
              字）與術語送至 gemini.google.com。PDF 與頁面圖片留在本機。
            </p>
            <p>下方預覽最多 10,000 字；實際傳送完整選定段落。</p>
            <pre>
              {translationInputs
                .map((b) => b.source)
                .join("\n\n")
                .slice(0, 10000)}
            </pre>
            <div className="button-row">
              <button onClick={() => performTranslation()}>
                傳送選定文字並翻譯
              </button>
              <button onClick={() => setTranslationInputs(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
