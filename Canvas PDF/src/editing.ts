import type { Run, PageObject, Rect } from "./types";
import { fontFamily } from "./types";
/** Preserve unchanged runs, source fonts and style across a paragraph edit. */
export function editRuns(runs: Run[], text: string): Run[] {
  if (!runs.length)
    return [{ text, family: fontFamily, size: 14, rgba: 255, sourceIndex: -1 }];
  const old = Array.from(runs.map((r) => r.text).join("")),
    next = Array.from(text);
  let start = 0,
    end = 0;
  while (
    start < old.length &&
    start < next.length &&
    old[start] === next[start]
  )
    start++;
  while (
    end < old.length - start &&
    end < next.length - start &&
    old.at(-1 - end) === next.at(-1 - end)
  )
    end++;
  const output: Run[] = [];
  let offset = 0;
  const slice = (from: number, to: number) => {
    let at = 0;
    for (let i = 0; i < runs.length; i++) {
      const chars = Array.from(runs[i].text),
        lo = Math.max(0, from - at),
        hi = Math.min(chars.length, to - at);
      if (hi > lo)
        output.push({
          ...runs[i],
          text: chars.slice(lo, hi).join(""),
          sourceIndex: i,
        });
      at += chars.length;
    }
  };
  slice(0, start);
  const inserted = next.slice(start, next.length - end).join("");
  if (inserted) {
    let style = 0;
    for (let i = 0; i < runs.length; i++) {
      offset += Array.from(runs[i].text).length;
      style = i;
      if (offset >= start) break;
    }
    output.push({
      ...runs[style],
      text: inserted,
      family: /[\u2e80-\u9fff]/.test(inserted)
        ? fontFamily
        : runs[style].family,
      sourceIndex: /[\u2e80-\u9fff]/.test(inserted) ? -1 : style,
    });
  }
  slice(old.length - end, old.length);
  return output.length ? output : [{ ...runs[0], text: "", sourceIndex: 0 }];
}
export function alignment(
  items: Rect[],
  mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
) {
  if (!items.length) return [];
  const x = Math.min(...items.map((o) => o.x)),
    right = Math.max(...items.map((o) => o.x + o.width)),
    y = Math.min(...items.map((o) => o.y)),
    bottom = Math.max(...items.map((o) => o.y + o.height));
  return items.map((o) => ({
    dx:
      mode === "left"
        ? x - o.x
        : mode === "center"
          ? (x + right - o.width) / 2 - o.x
          : mode === "right"
            ? right - o.x - o.width
            : 0,
    dy:
      mode === "top"
        ? y - o.y
        : mode === "middle"
          ? (y + bottom - o.height) / 2 - o.y
          : mode === "bottom"
            ? bottom - o.y - o.height
            : 0,
  }));
}
export function validRect(r: Rect) {
  return (
    [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.width > 0 &&
    r.height > 0
  );
}

/** Keep pasted native paragraphs separated so PDF reconstruction does not merge them. */
export function pasteOffset(items: any[], obstacles: Rect[], page: Rect) {
  if (!items.some((o) => o.kind === "text")) return { dx: 18, dy: 18 };
  const x = Math.min(...items.map((o) => o.x)),
    y = Math.min(...items.map((o) => o.y)),
    width = Math.max(...items.map((o) => o.x + o.width)) - x,
    height = Math.max(...items.map((o) => o.y + o.height)) - y;
  const gap = Math.max(
    24,
    ...items.flatMap((o) => (o.runs || []).map((r: any) => r.size * 2)),
  );
  const candidates = [
    { x: x + 18, y: y + 18 },
    { x: 48, y: 48 },
    ...obstacles.map((b) => ({
      x: Math.min(x, Math.max(0, page.width - width)),
      y: b.y + b.height + gap,
    })),
    ...obstacles.map((b) => ({
      x: b.x + b.width + gap,
      y: Math.min(y, Math.max(0, page.height - height)),
    })),
  ];
  const place = candidates.find(
    (c) =>
      c.x >= 0 &&
      c.y >= 0 &&
      c.x + width <= page.width &&
      c.y + height <= page.height &&
      !obstacles.some(
        (b) =>
          c.x < b.x + b.width + gap &&
          c.x + width > b.x - gap &&
          c.y < b.y + b.height + gap &&
          c.y + height > b.y - gap,
      ),
  );
  if (!place)
    throw Error("頁面沒有足夠空間可靠放置文字副本，請插入空白頁後貼上");
  return { dx: place.x - x, dy: place.y - y };
}
