import type { ScanBlock, Rect, PageObject } from "./types";
export function bounds(points: { x: number; y: number }[]): Rect {
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function overlaps(a: Rect, b: Rect) {
  const area =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}
export function scanBlocks(
  result: any,
  page: number,
  w: number,
  h: number,
  native: PageObject[],
): ScanBlock[] {
  if (
    !result.image?.width ||
    !result.image?.height ||
    !Array.isArray(result.items)
  )
    throw Error("OCR 結果格式無效");
  const sx = w / result.image.width,
    sy = h / result.image.height;
  return result.items
    .map((i: any, index: number) => {
      const points = i.poly.map((p: any) =>
        Array.isArray(p) ? { x: p[0], y: p[1] } : p,
      );
      if (
        points.length < 3 ||
        points.some((p: any) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
      )
        throw Error("OCR 行框座標無效");
      const b = bounds(points);
      const r = {
        x: b.x * sx,
        y: b.y * sy,
        width: b.width * sx,
        height: b.height * sy,
      };
      return {
        ...r,
        id: crypto.randomUUID(),
        page,
        source: i.text,
        original: i.text,
        translation: "",
        score: i.score,
        detScore: Number.isFinite(i.detectionScore)
          ? i.detectionScore
          : undefined,
        order: index,
        mode: "search",
        fill: "#ffffff",
        size: Math.max(7, r.height * 0.85),
        mask: { ...r },
        rotation: 0,
        needsReview: i.score < 0.8,
      };
    })
    .filter(
      (b: ScanBlock) =>
        b.source.trim() &&
        !native.some((n) => n.kind === "text" && overlaps(n, b) > 0.7),
    );
}
export class OcrClient {
  worker: Worker | undefined;
  seq = 0;
  config = "";
  pending = new Map<
    number,
    {
      resolve: (r: any) => void;
      reject: (e: Error) => void;
      phase: (s: string) => void;
    }
  >();
  call(args: any, phase: (s: string) => void): Promise<any> {
    const config = [args.backend, args.threads].join("/");
    if (this.worker && config !== this.config) this.cancel("切換 OCR 運算設定");
    this.config = config;
    if (!this.worker) {
      this.worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (e) => {
        if (e.data.fatal) {
          this.cancel(e.data.fatal);
          return;
        }
        const p = this.pending.get(e.data.id);
        if (!p) return;
        if (e.data.phase) {
          p.phase(e.data.phase);
          return;
        }
        this.pending.delete(e.data.id);
        e.data.error ? p.reject(Error(e.data.error)) : p.resolve(e.data.result);
      };
      this.worker.onerror = (e) => this.cancel(e.message);
    }
    return new Promise<any>((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject, phase });
      this.worker!.postMessage({
        id,
        args: { ...args, base: new URL(".", location.href).href },
      });
    }).catch(async (error: Error) => {
      if (/取消|切換/.test(error.message)) throw error;
      if (args.backend === "webgpu") {
        phase("GPU 無法完成，釋放後改用 CPU；已完成區域保留");
        this.cancel("GPU fallback");
        return {
          ...(await this.call({ ...args, backend: "wasm" }, phase)),
          fallbackReason: String(error),
          requestedBackend: "webgpu",
        };
      }
      if (args.threads !== "1") {
        phase("多執行緒初始化失敗，改用單緒");
        this.cancel("single-thread fallback");
        return {
          ...(await this.call({ ...args, threads: "1" }, phase)),
          threadFallbackReason: String(error),
        };
      }
      throw error;
    });
  }
  cancel(reason = "OCR 已取消；已完成的辨識保留") {
    this.worker?.terminate();
    this.worker = undefined;
    for (const p of this.pending.values()) p.reject(Error(reason));
    this.pending.clear();
  }
}
