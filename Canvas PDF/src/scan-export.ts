import type { Rect } from "./types";

export function intersects(a: Rect, b: Rect) {
  return (
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
  );
}

/** Hidden OCR over native text duplicates extraction; visible edits require flattening. */
export function scanExportAction(
  mask: Rect,
  native: Rect[],
  replace: boolean,
  raster: boolean,
) {
  if (!native.some((n) => intersects(mask, n))) return "draw";
  if (!replace) return "skip";
  if (!raster)
    throw Error(
      "OCR 編輯區與既有 PDF 文字重疊。請使用原生段落編輯，或選擇「點陣化 PDF」輸出，以移除原文字後保留新內容。",
    );
  return "draw";
}
