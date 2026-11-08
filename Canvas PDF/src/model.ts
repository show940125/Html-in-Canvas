import type { PageObject, PageView } from "./types";
export function normalize(r: any, page: number): PageView {
  const objects: PageObject[] = [];
  // EditCore model coordinates are page-space (top-left); raw PDF objects use bottom-left.
  for (const p of r.paragraphs || []) {
    const b = p.box;
    if (!b) continue;
    const angle = ((p.rotation || 0) * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle),
      corners = [
        [b.x, b.top],
        [b.x + b.w, b.top],
        [b.x, b.top - b.h],
        [b.x + b.w, b.top - b.h],
      ].map(([x, y]) => ({ x: c * x - s * y, y: s * x + c * y }));
    const x = Math.min(...corners.map((p) => p.x)),
      right = Math.max(...corners.map((p) => p.x)),
      top = Math.max(...corners.map((p) => p.y)),
      bottom = Math.min(...corners.map((p) => p.y)),
      y = r.height - top,
      width = right - x,
      height = top - bottom;
    objects.push({
      id: `p${page}-t${p.id}`,
      kind: "text",
      engineId: p.id,
      x,
      y,
      width,
      height,
      editable: p.editable !== false,
      text: (p.runs || []).map((x: any) => x.text).join(""),
      runs: p.runs,
      format: p.format,
      raw: p,
      reason: p.lockReason ? `引擎限制 ${p.lockReason}` : undefined,
    });
  }
  for (const o of r.objects || []) {
    if (![2, 3, 5].includes(o.type) || !o.bounds) continue;
    const b = o.bounds;
    objects.push({
      id: `p${page}-o${o.index}`,
      kind: o.type === 3 ? "image" : o.type === 2 ? "path" : "form",
      engineId: o.handle,
      index: o.index,
      x: b.x,
      y: r.height - b.y - b.h,
      width: b.w,
      height: b.h,
      editable: true,
      raw: o,
    });
  }
  return { ...r, page, objects };
}
