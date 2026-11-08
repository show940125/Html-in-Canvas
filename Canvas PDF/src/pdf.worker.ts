import { PdfEngine } from "./vendor/editcore/core.js";
import { defaultFormat, fontFamily } from "./types";
import { multiply, type Matrix } from "./coordinates";
import { paintImageMask } from "./image-mask";
import { replaceIsolatedImage } from "./replace-image";
import { bindIdentities } from "./identity";
import { normalize } from "./model";
let engine: any,
  generation = 0,
  base: string;
let queue = Promise.resolve();
let activeModel: any[] = [];
const E: any = PdfEngine;
async function init(assetBase: string) {
  base = assetBase;
  (globalThis as any).__canvasPdfAssets = base;
  if (!engine) {
    const url = new URL("fonts/NotoSansCJKtc-Regular.otf", base);
    const response = await fetch(url).catch((e) => {
      throw Error("字型載入 " + url + " " + e);
    });
    if (!response.ok) throw Error("字型 HTTP " + response.status);
    const font = new Uint8Array(await response.arrayBuffer());
    for (const name of [
      fontFamily,
      "Noto Sans TC",
      "Noto Sans SC",
      "Noto Sans CJK SC",
      "Arial Unicode MS",
    ])
      E.localFonts.set(name, font);
    engine = await E.create().catch((e: any) => {
      throw Error("EditCore 初始化 " + base + " " + e?.stack);
    });
  }
}
function sourceImage(copy: any, handle: number) {
  const M = copy.M,
    bmp = M._FPDFImageObj_GetBitmap(handle);
  if (!bmp) throw Error("掃描圖片無法解碼，請保留原圖模式");
  try {
    const width = M._FPDFBitmap_GetWidth(bmp),
      height = M._FPDFBitmap_GetHeight(bmp),
      stride = M._FPDFBitmap_GetStride(bmp),
      ptr = M._FPDFBitmap_GetBuffer(bmp),
      format = M._FPDFBitmap_GetFormat(bmp),
      data = new Uint8Array(width * height * 4);
    if (![1, 2, 3, 4].includes(format)) throw Error("來源影像像素格式不支援");
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const j =
            ptr + y * stride + x * (format === 1 ? 1 : format === 2 ? 3 : 4),
          i = (y * width + x) * 4;
        data[i] = M.HEAPU8[j + (format === 1 ? 0 : 2)];
        data[i + 1] = M.HEAPU8[j + (format === 1 ? 0 : 1)];
        data[i + 2] = M.HEAPU8[j];
        data[i + 3] = format === 4 ? M.HEAPU8[j + 3] : 255;
      }
    const m = M._malloc(24);
    let matrix: Matrix;
    try {
      if (!M._FPDFPageObj_GetMatrix(handle, m)) throw Error("來源影像矩陣無效");
      matrix = Array.from(M.HEAPF32.slice(m >> 2, (m >> 2) + 6)) as Matrix;
    } finally {
      M._free(m);
    }
    const toPage = multiply(
      [1, 0, 0, -1, 0, copy.pageHeight],
      multiply(
        copy.pageT,
        multiply(matrix, [1 / width, 0, 0, -1 / height, 0, 1]),
      ),
    );
    return { data, width, height, toPage };
  } finally {
    M._FPDFBitmap_Destroy(bmp);
  }
}
function data() {
  const r = engine.renderPage(1.5);
  return {
    image: { ...r, data: r.data.slice() },
    paragraphs: (activeModel = engine.buildModel()),
    width: engine.pageWidth,
    height: engine.pageHeight,
    count: engine.pageCount,
    generation: ++generation,
    info: engine.documentInfo(),
    transform: engine.pageT,
    objects: Array.from({ length: engine.objectCount() }, (_, i) => {
      const o = engine.objectAt(i);
      return { ...o, bounds: engine.objectBounds(o.handle) };
    }),
  };
}
function save() {
  const b = engine.save({ incremental: false });
  if (!b?.length) throw Error("PDF 引擎未產生有效檔案");
  return b;
}
async function act(type: string, a: any) {
  if (type === "init") {
    await init(a.base);
    return true;
  }
  if (type === "open") {
    engine.open(new Uint8Array(a.bytes), a.password || "");
    engine.loadPage(a.page || 0);
    return data();
  }
  if (type === "view") {
    engine.loadPage(a.page);
    return data();
  }
  if (type === "render") {
    engine.loadPage(a.page);
    const r = engine.renderPage(a.scale || 2);
    return { ...r, data: r.data.slice() };
  }
  if (type === "save") return save();
  if (type === "decrypt") {
    const M = engine.M,
      ptr = M._malloc(4),
      out = M._ec_save_document(engine.doc, 3, ptr),
      size = M.HEAPU32[ptr >> 2];
    M._free(ptr);
    if (!out || !size) throw Error("無法建立已解鎖的工作副本");
    const bytes = M.HEAPU8.slice(out, out + size);
    M._ec_string_free(out);
    return bytes;
  }
  if (type === "close") {
    engine?.close();
    return true;
  }
  if (type === "imageData") {
    if (a.generation !== generation) throw Error("圖片選取已過期");
    const image = engine.renderImageObject(a.id);
    if (!image) throw Error("圖片無法抽取");
    return image;
  }
  if (type === "rasterize") {
    const copy = await E.create();
    try {
      copy.open(new Uint8Array(a.bytes));
      const out = [];
      for (const page of a.indices ||
        Array.from({ length: copy.pageCount }, (_, i) => i)) {
        copy.loadPage(page);
        const r = copy.renderPage(2),
          c = new OffscreenCanvas(r.width, r.height);
        c.getContext("2d")!.putImageData(
          new ImageData(new Uint8ClampedArray(r.data), r.width, r.height),
          0,
          0,
        );
        out.push({
          width: copy.pageWidth,
          height: copy.pageHeight,
          png: new Uint8Array(
            await (await c.convertToBlob({ type: "image/png" })).arrayBuffer(),
          ),
        });
      }
      return out;
    } finally {
      copy.close();
    }
  }
  if (type === "prepareExport") {
    const copy = await E.create();
    try {
      copy.open(new Uint8Array(a.bytes));
      const geometries = [];
      for (let page = 0; page < copy.pageCount; page++) {
        copy.loadPage(page);
        const paragraphs = copy.buildModel();
        geometries.push({
          width: copy.pageWidth,
          height: copy.pageHeight,
          transform: copy.pageT,
        });
        const model = bindIdentities(
          normalize(
            { paragraphs, width: copy.pageWidth, height: copy.pageHeight },
            page,
          ),
          { identities: a.identities } as any,
        );
        Object.assign(geometries[page], {
          nativeText: model.objects.filter((o) => o.kind === "text"),
        });
        if (a.mode === "translated" || a.mode === "bilingual")
          for (const p of paragraphs) {
            const stable = model.objects.find((o) => o.engineId === p.id)?.id;
            const translated = stable ? a.translations[stable] : undefined;
            if (translated) {
              const result = copy.commitParagraph(
                p.id,
                [
                  {
                    ...p.runs[0],
                    text: translated,
                    family: fontFamily,
                    sourceIndex: -1,
                  },
                ],
                p.format,
              );
              if (!result) throw Error("第 " + (page + 1) + " 頁譯文無法寫回");
            }
          }
        const blocks = a.scans.filter(
          (b: any) =>
            b.page === page &&
            (a.mode === "translated" ||
              a.mode === "bilingual" ||
              (a.mode === "edited" && b.mode === "rebuild")),
        );
        if (blocks.length) {
          for (let index = 0; index < copy.objectCount(); index++) {
            const o = copy.objectAt(index);
            if (o.type !== 3) continue;
            const b = copy.objectBounds(o.handle);
            if (!b || b.w <= 0 || b.h <= 0) continue;
            const top = copy.pageHeight - b.y - b.h,
              masks = blocks.filter(
                (s: any) =>
                  s.mask.x < b.x + b.w &&
                  s.mask.x + s.mask.width > b.x &&
                  s.mask.y < top + b.h &&
                  s.mask.y + s.mask.height > top,
              );
            if (!masks.length) continue;
            const im = sourceImage(copy, o.handle);
            if (!im) throw Error("無法取得掃描來源影像");
            for (const s of masks)
              paintImageMask(
                im.data,
                im.width,
                im.height,
                im.toPage,
                s.mask,
                s.fill,
              );
            const bgra = new Uint8Array(im.data);
            for (let i = 0; i < bgra.length; i += 4) {
              const t = bgra[i];
              bgra[i] = bgra[i + 2];
              bgra[i + 2] = t;
            }
            replaceIsolatedImage(copy, o.handle, bgra, im.width, im.height);
          }
        }
        if (copy._pageDirty && !copy.generateContent())
          throw Error("輸出頁面寫回失敗");
      }
      const bytes = copy.save({ incremental: false });
      if (!bytes?.length) throw Error("輸出未產生有效內容");
      return { bytes, geometries };
    } finally {
      copy.close();
    }
  }
  if (a.generation !== generation) throw Error("頁面已更新，請重新選取物件");
  if (engine.documentInfo().canModify === false)
    throw Error("文件權限限制內容修改");
  engine.historyBeginStep(type);
  try {
    if (type === "text") {
      const r = engine.commitParagraph(a.id, a.runs, a.format);
      if (!r) throw Error("此段落無法安全修改");
    }
    if (type === "addText") {
      const r = engine.addParagraph(
        a.x,
        a.y,
        a.width,
        a.runs,
        a.format || defaultFormat,
      );
      if (!r) throw Error("無法建立文字框");
    }
    if (type === "move")
      for (const o of a.items) {
        if (o.kind === "text") {
          if (!engine.moveParagraph(o.engineId, a.dx, a.dy))
            throw Error("段落移動失敗");
        } else engine.translateObject(o.engineId, a.dx, a.dy);
      }
    if (type === "layout")
      for (const o of a.items) {
        if (o.kind === "text") engine.moveParagraph(o.engineId, o.dx, -o.dy);
        else engine.translateObject(o.engineId, o.dx, -o.dy);
      }
    if (type === "split") {
      const p = a.object;
      engine.deleteParagraph(p.engineId);
      for (let i = 0; i < a.parts.length; i++) {
        const text = a.parts[i];
        engine.addParagraph(
          p.x,
          engine.pageHeight - p.y - i * (p.height + 8),
          p.width,
          [{ ...p.runs[0], text, family: fontFamily, sourceIndex: -1 }],
          p.format,
        );
      }
    }
    if (type === "merge") {
      const first = a.items[0];
      for (const p of a.items) engine.deleteParagraph(p.engineId);
      engine.addParagraph(
        first.x,
        engine.pageHeight - first.y,
        a.width,
        [
          {
            ...first.runs[0],
            text: a.items.map((p: any) => p.text).join("\n"),
            family: fontFamily,
            sourceIndex: -1,
          },
        ],
        first.format,
      );
    }
    if (type === "scaleGroup")
      for (const o of a.items) {
        if (o.kind === "text") {
          const p = activeModel.find((p: any) => p.id === o.engineId);
          if (
            !p ||
            !engine.commitParagraph(
              p.id,
              p.runs.map((r: any) => ({
                ...r,
                size: r.size * a.sy,
                sourceIndex: -1,
              })),
              p.format,
            ) ||
            !engine.resizeParagraph(p.id, o.width * a.sx)
          )
            throw Error("群組文字縮放失敗");
          engine.moveParagraph(
            p.id,
            (o.x - a.x) * (a.sx - 1),
            -(o.y - a.y) * (a.sy - 1),
          );
        } else
          engine.scaleObject(
            o.engineId,
            a.sx,
            a.sy,
            a.x,
            engine.pageHeight - a.y,
          );
      }
    if (type === "resize") {
      if (a.kind === "text") engine.resizeParagraph(a.id, a.width);
      else engine.scaleObject(a.id, a.sx, a.sy, a.x, a.y);
    }
    if (type === "rotate") engine.rotateObject(a.id, a.degrees);
    if (type === "arrange") engine.arrangeObject(a.id, a.op);
    if (type === "delete")
      for (const o of a.items) {
        if (o.kind === "text") engine.deleteParagraph(o.engineId);
        else engine.removeObject(o.engineId);
      }
    if (type === "image")
      engine.insertImage(
        new Uint8Array(a.rgba),
        a.pw,
        a.ph,
        a.x,
        a.y,
        a.width,
        a.height,
      );
    if (type === "replaceImage") {
      const bgra = new Uint8Array(a.rgba);
      for (let i = 0; i < bgra.length; i += 4) {
        const x = bgra[i];
        bgra[i] = bgra[i + 2];
        bgra[i + 2] = x;
      }
      replaceIsolatedImage(engine, a.id, bgra, a.pw, a.ph);
    }
    engine._pageDirty = true;
  } finally {
    engine.historyEndStep();
  }
  if (!engine.generateContent()) throw Error("PDF 頁面內容寫回失敗");
  return { bytes: save(), view: data() };
}
self.onmessage = (e) => {
  const { id, type, args } = e.data;
  queue = queue.then(async () => {
    try {
      const result = await act(type, args);
      self.postMessage({ id, result });
    } catch (error) {
      self.postMessage({ id, error: String(error) });
    }
  });
};
