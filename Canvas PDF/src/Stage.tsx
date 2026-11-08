import React, { useEffect, useRef, useState } from "react";
import {
  supportsCanvas,
  prepareCanvas,
  syncGeometry,
  type DrawableCanvas,
  type DrawableContext,
} from "../../shared/html-in-canvas/canvas";
import type { PageView, PageObject, ScanBlock, Rect } from "./types";
type Props = {
  view: PageView;
  zoom: number;
  scans: ScanBlock[];
  selection: string[];
  select: (ids: string[]) => void;
  move: (dx: number, dy: number) => void;
  resize: (sx: number, sy: number) => void;
  edit: (id: string, text: string) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  region: (rect: Rect) => void;
  regionMode: boolean;
  preview: boolean;
  busy: boolean;
};
export function Stage(p: Props) {
  const bg = useRef<HTMLCanvasElement>(null),
    surface = useRef<DrawableCanvas>(null),
    root = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLDivElement>(null),
    cancelledEdit = useRef(false),
    drag = useRef<any>(null),
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [marquee, setMarquee] = useState<Rect | null>(null);
  const native = supportsCanvas(),
    w = p.view.width,
    h = p.view.height,
    z = p.zoom;
  const objects = [
    ...p.view.objects,
    ...p.scans.map((b) => ({ ...b, kind: "scan" as const, text: b.source })),
  ];
  useEffect(() => {
    const c = bg.current!;
    c.width = p.view.image.width;
    c.height = p.view.image.height;
    c.getContext("2d")!.putImageData(
      new ImageData(
        new Uint8ClampedArray(p.view.image.data),
        c.width,
        c.height,
      ),
      0,
      0,
    );
  }, [p.view]);
  useEffect(() => {
    if (!native || !surface.current || !root.current) return;
    const c = surface.current;
    prepareCanvas(c);
    root.current.setAttribute("drawable", "");
    const draw = () => {
      const dpr = devicePixelRatio || 1;
      c.width = Math.round(w * z * dpr);
      c.height = Math.round(h * z * dpr);
      const ctx = c.getContext("2d") as DrawableContext;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w * z, h * z);
      const result = ctx.drawElementImage(root.current!, 0, 0, w * z, h * z);
      syncGeometry(c, root.current!, result);
      c.dataset.paints = String(Number(c.dataset.paints || 0) + 1);
    };
    c.addEventListener("paint", draw);
    c.requestPaint();
    return () => c.removeEventListener("paint", draw);
  }, [p.view, p.scans, p.selection, p.editing, p.preview, z, offset, marquee]);
  useEffect(() => {
    if (p.editing && editor.current) {
      cancelledEdit.current = false;
      const o = objects.find((x) => x.id === p.editing);
      editor.current.innerText = o?.text || "";
      editor.current.focus();
      const r = document.createRange();
      r.selectNodeContents(editor.current);
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  }, [p.editing]);
  function point(e: React.PointerEvent) {
    const r = host.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  }
  function down(e: React.PointerEvent, id?: string) {
    host.current!.dataset.lastDown = id || "box";
    if (p.busy || p.editing) return;
    e.preventDefault();
    e.stopPropagation();
    const start = point(e);
    if (id && !p.regionMode) {
      let ids = p.selection.includes(id)
        ? p.selection
        : e.shiftKey
          ? [...p.selection, id]
          : [id];
      p.select(ids);
      drag.current = { start, ids };
    } else {
      p.select([]);
      drag.current = { start, box: true };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const pt = point(e),
      dx = pt.x - d.start.x,
      dy = pt.y - d.start.y;
    if (d.resize) {
      setOffset({ x: dx, y: dy });
      return;
    }
    if (d.box)
      setMarquee({
        x: Math.min(pt.x, d.start.x),
        y: Math.min(pt.y, d.start.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    else setOffset({ x: dx, y: dy });
  }
  function up(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const pt = point(e),
      dx = pt.x - d.start.x,
      dy = pt.y - d.start.y;
    setOffset({ x: 0, y: 0 });
    if (d.resize) {
      p.resize(
        Math.max(0.05, 1 + dx / d.width),
        Math.max(0.05, 1 + dy / d.height),
      );
      return;
    }
    if (d.box) {
      const b = {
        x: Math.min(pt.x, d.start.x),
        y: Math.min(pt.y, d.start.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
      setMarquee(null);
      if (p.regionMode && b.width > 3 && b.height > 3) p.region(b);
      else
        p.select(
          objects
            .filter(
              (o) =>
                o.x >= b.x &&
                o.y >= b.y &&
                o.x + o.width <= b.x + b.width &&
                o.y + o.height <= b.y + b.height,
            )
            .map((o) => o.id),
        );
    } else if (Math.hypot(dx, dy) > 1) p.move(dx, dy);
  }
  const content = (
    <div
      ref={root}
      className="draw-root"
      style={{
        width: w,
        height: h,
        transform: native ? undefined : `scale(${z})`,
      }}
      onPointerDown={(e) => down(e)}
    >
      {p.scans.map((b) => (
        <React.Fragment key={"preview-" + b.id}>
          {(b.mode === "rebuild" || p.preview) && (
            <>
              <div
                className="scan-mask"
                style={{
                  left: b.mask.x,
                  top: b.mask.y,
                  width: b.mask.width,
                  height: b.mask.height,
                  background: b.fill,
                }}
              />
              <div
                className="scan-preview"
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.width,
                  fontSize: b.size,
                  transform: `rotate(${b.rotation}deg)`,
                }}
              >
                {p.preview ? b.translation || b.source : b.source}
              </div>
            </>
          )}
        </React.Fragment>
      ))}
      {objects.map((o) => {
        const selected = p.selection.includes(o.id),
          editing = p.editing === o.id;
        return (
          <div
            key={o.id}
            data-object={o.id}
            data-kind={o.kind}
            className={`object ${selected ? "selected" : ""} ${o.kind === "scan" ? "scan-object" : ""}`}
            style={{
              left: o.x + (selected ? offset.x : 0),
              top: o.y + (selected ? offset.y : 0),
              width: Math.max(4, o.width),
              height: Math.max(4, o.height),
            }}
            onPointerDown={(e) => down(e, o.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (
                !p.busy &&
                (o.kind === "scan" || (o.kind === "text" && o.editable))
              )
                p.setEditing(o.id);
            }}
            title={
              o.kind === "scan"
                ? "OCR 文字；雙擊編輯並重建"
                : o.kind === "text"
                  ? "雙擊編輯文字"
                  : "拖曳移動物件"
            }
          >
            {editing && (
              <div
                ref={editor}
                className="inline-editor"
                contentEditable
                suppressContentEditableWarning
                style={{
                  fontSize:
                    "runs" in o
                      ? (o as PageObject).runs?.[0]?.size || 14
                      : (o as ScanBlock).size,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onInput={() => surface.current?.requestPaint()}
                onBlur={(e) => {
                  if (
                    !cancelledEdit.current &&
                    e.currentTarget.innerText !== o.text
                  )
                    p.edit(o.id, e.currentTarget.innerText);
                  p.setEditing(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    cancelledEdit.current = true;
                    p.setEditing(null);
                  }
                  if (
                    e.key === "Enter" &&
                    (e.ctrlKey || e.metaKey) &&
                    !e.nativeEvent.isComposing
                  )
                    e.currentTarget.blur();
                }}
              />
            )}
            {selected && !editing && (
              <>
                <span className="object-label">
                  {o.kind === "text"
                    ? "文字"
                    : o.kind === "scan"
                      ? "OCR"
                      : o.kind === "image"
                        ? "圖片"
                        : "群組／圖形"}
                </span>
                <span
                  className="resize-handle"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drag.current = {
                      start: point(e),
                      resize: true,
                      width: o.width,
                      height: o.height,
                    };
                    host.current!.setPointerCapture(e.pointerId);
                  }}
                />
              </>
            )}
          </div>
        );
      })}
      {marquee && (
        <div
          className="marquee"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}
    </div>
  );
  return (
    <div
      ref={host}
      className={"page-surface " + (p.regionMode ? "crosshair" : "")}
      style={{ width: w * z, height: h * z }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        setOffset({ x: 0, y: 0 });
        setMarquee(null);
      }}
      data-renderer={native ? "native" : "dom"}
    >
      <canvas
        ref={bg}
        className="pdf-background"
        style={{ width: w * z, height: h * z }}
      />
      {native ? (
        <canvas
          ref={surface}
          className="interaction-canvas"
          style={{ width: w * z, height: h * z }}
        >
          {content}
        </canvas>
      ) : (
        content
      )}
    </div>
  );
}
