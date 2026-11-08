import type { PageView, PageObject, Project } from "./types";
export type ObjectIdentity = Pick<
  PageObject,
  "id" | "kind" | "text" | "x" | "y" | "width" | "height" | "index"
>;
/** Runtime PDFium handles stay out of the persisted identity table. */
export function bindIdentities(
  view: PageView,
  project: Project,
  hints: Map<number, string> = new Map(),
  removed: string[] = [],
) {
  const previous = (project.identities?.[view.page] || []).filter(
      (o) => !removed.includes(o.id),
    ),
    used = new Set<string>(),
    assigned = new Map<number, string>();
  // Reserve unchanged objects first so a moved duplicate cannot steal their IDs.
  for (const o of view.objects) {
    const hint = hints.get(o.engineId);
    if (hint && !used.has(hint)) {
      assigned.set(o.engineId, hint);
      used.add(hint);
    }
  }
  for (const o of view.objects) {
    if (assigned.has(o.engineId)) continue;
    const exact = previous.find(
      (p) =>
        !used.has(p.id) &&
        p.kind === o.kind &&
        (o.kind !== "text" || p.text === o.text) &&
        ["x", "y", "width", "height"].every(
          (k) => Math.abs((p as any)[k] - (o as any)[k]) < 0.01,
        ),
    );
    if (exact) {
      assigned.set(o.engineId, exact.id);
      used.add(exact.id);
    }
  }
  view.objects = view.objects.map((o) => {
    const reserved = assigned.get(o.engineId);
    if (reserved) return { ...o, id: reserved };
    const candidates = previous.filter(
      (p) =>
        !used.has(p.id) &&
        p.kind === o.kind &&
        ((o.kind === "text" && p.text === o.text) || o.kind !== "text"),
    );
    candidates.sort(
      (a, b) =>
        Math.abs(a.x - o.x) +
        Math.abs(a.y - o.y) +
        Math.abs(a.width - o.width) +
        Math.abs(a.height - o.height) -
        (Math.abs(b.x - o.x) +
          Math.abs(b.y - o.y) +
          Math.abs(b.width - o.width) +
          Math.abs(b.height - o.height)),
    );
    const matched = candidates[0],
      id = matched?.id || crypto.randomUUID();
    used.add(id);
    return { ...o, id };
  });
  project.identities = {
    ...project.identities,
    [view.page]: view.objects.map(
      ({ id, kind, text, x, y, width, height, index }) => ({
        id,
        kind,
        text,
        x,
        y,
        width,
        height,
        index,
      }),
    ),
  };
  return view;
}
