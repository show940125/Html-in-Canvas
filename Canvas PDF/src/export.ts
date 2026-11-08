import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Project, ScanBlock } from "./types";
import type { PdfClient } from "./pdf";
import { inverse, point, type Matrix } from "./coordinates";
import { wrapText } from "./text-layout";
import { scanExportAction } from "./scan-export";
export async function pageOperation(
  bytes: Uint8Array,
  action:
    "rotate" | "delete" | "duplicate" | "insert" | "up" | "down" | "merge",
  page: number,
  extra?: Uint8Array,
) {
  const d = await PDFDocument.load(bytes);
  const pages = d.getPages();
  if (action === "rotate")
    pages[page].setRotation(
      degrees((pages[page].getRotation().angle + 90) % 360),
    );
  if (action === "delete") {
    if (pages.length === 1) throw Error("文件至少保留一頁");
    d.removePage(page);
  }
  if (action === "duplicate") {
    const [p] = await d.copyPages(d, [page]);
    d.insertPage(page + 1, p);
  }
  if (action === "insert")
    d.insertPage(page + 1, [pages[page].getWidth(), pages[page].getHeight()]);
  if (action === "up" || action === "down") {
    const to = page + (action === "up" ? -1 : 1);
    if (to < 0 || to >= pages.length) return bytes;
    const [p] = await d.copyPages(d, [page]);
    d.removePage(page);
    d.insertPage(to, p);
  }
  if (action === "merge" && extra) {
    const other = await PDFDocument.load(extra);
    for (const p of await d.copyPages(other, other.getPageIndices()))
      d.addPage(p);
  }
  return d.save();
}
function color(hex: string) {
  const a = /^#[a-f\d]{6}$/i.test(hex) ? hex : "#ffffff";
  return rgb(
    parseInt(a.slice(1, 3), 16) / 255,
    parseInt(a.slice(3, 5), 16) / 255,
    parseInt(a.slice(5, 7), 16) / 255,
  );
}
export async function exportPdf(
  project: Project,
  client: PdfClient,
  mode: "edited" | "search" | "translated" | "bilingual" | "raster",
  indices?: number[],
) {
  const prepared = await client.call("prepareExport", {
    bytes: project.bytes,
    scans: project.scans,
    translations: project.translations || {},
    identities: project.identities || {},
    mode,
  });
  const original = await PDFDocument.load(prepared.bytes);
  original.registerFontkit(fontkit);
  const font = project.scans.some((b) => b.source.trim())
    ? await original.embedFont(
        await (
          await fetch(new URL("fonts/NotoSansCJKtc-Regular.otf", location.href))
        ).arrayBuffer(),
        { subset: false },
      )
    : undefined;
  const pages = original.getPages();
  for (const pageIndex of [...new Set(project.scans.map((s) => s.page))]) {
    const p = pages[pageIndex];
    if (!p) continue;
    const bs = project.scans.filter((s) => s.page === pageIndex),
      geom = prepared.geometries[pageIndex],
      height = geom.height,
      inv = inverse(geom.transform as Matrix),
      scale = Math.hypot(inv[0], inv[1]),
      angle = (Math.atan2(inv[1], inv[0]) * 180) / Math.PI;
    for (const b of bs) {
      const replace =
        mode === "translated" ||
        mode === "bilingual" ||
        ((mode === "edited" || mode === "raster") && b.mode === "rebuild");
      const text =
        mode === "translated" || mode === "bilingual"
          ? project.translations?.[b.id] || b.translation || b.source
          : b.source;
      if (
        scanExportAction(
          b.mask,
          geom.nativeText,
          replace,
          mode === "raster",
        ) === "skip"
      )
        continue;
      const size = b.size;
      if (replace) {
        const at = point(inv, b.mask.x, height - b.mask.y - b.mask.height);
        p.drawRectangle({
          x: at.x,
          y: at.y,
          width: b.mask.width * scale,
          height: b.mask.height * scale,
          color: color(b.fill),
          rotate: degrees(angle),
        });
      }
      // pdf-lib opacity zero still emits searchable PDF text. The original image remains visible.
      if (text.trim()) {
        const at = point(inv, b.x, height - b.y - size);
        p.drawText(
          wrapText(text, b.width * scale, (t) =>
            font!.widthOfTextAtSize(t, size * scale),
          ).join("\n"),
          {
            x: at.x,
            y: at.y,
            size: size * scale,
            font: font!,
            maxWidth: b.width * scale,
            lineHeight: size * scale * 1.25,
            color: rgb(0.08, 0.12, 0.1),
            opacity: replace ? 1 : 0,
            rotate: degrees(angle + b.rotation),
          },
        );
      }
    }
  }
  if (mode === "raster") {
    const out = await PDFDocument.create();
    const bytes = await original.save();
    for (const i of indices || pages.map((_, i) => i)) {
      const [im] = await client.call("rasterize", { bytes, indices: [i] });
      const png = await out.embedPng(im.png);
      out
        .addPage([im.width, im.height])
        .drawImage(png, { x: 0, y: 0, width: im.width, height: im.height });
    }
    return out.save();
  }
  if (mode === "bilingual") {
    const out = await PDFDocument.create(),
      src = await PDFDocument.load(project.bytes);
    for (const i of indices || pages.map((_, i) => i)) {
      const [a] = await out.copyPages(src, [i]),
        [b] = await out.copyPages(original, [i]);
      out.addPage(a);
      out.addPage(b);
    }
    return out.save();
  }
  if (indices) {
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(original, indices)) out.addPage(p);
    return out.save();
  }
  return original.save();
}
