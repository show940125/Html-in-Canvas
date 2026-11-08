import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;
export async function validatePdf(bytes: Uint8Array) {
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    standardFontDataUrl: new URL("standard_fonts/", location.href).href,
    cMapUrl: new URL("cmaps/", location.href).href,
    cMapPacked: true,
    wasmUrl: new URL("pdfjs/", location.href).href,
  });
  try {
    const d = await task.promise;
    const texts: string[] = [],
      renders: { width: number; height: number }[] = [];
    for (let i = 1; i <= d.numPages; i++) {
      const p = await d.getPage(i);
      const c = await p.getTextContent();
      texts.push(c.items.map((t: any) => t.str || "").join("\n"));
      const v = p.getViewport({ scale: 0.4 }),
        canvas = document.createElement("canvas");
      canvas.width = Math.ceil(v.width);
      canvas.height = Math.ceil(v.height);
      await p.render({ canvas, viewport: v }).promise;
      renders.push({ width: canvas.width, height: canvas.height });
      canvas.width = canvas.height = 0;
      p.cleanup();
    }
    return { pages: d.numPages, texts, renders };
  } finally {
    await task.destroy();
  }
}
