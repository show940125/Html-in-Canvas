import { PaddleOCR } from "@paddleocr/paddleocr-js";
let ocr: any,
  key = "",
  idle: ReturnType<typeof setTimeout>;
let spawnedPthreads = 0;
const NativeWorker = globalThis.Worker;
globalThis.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options);
    spawnedPthreads++;
  }
};
self.addEventListener("unhandledrejection", (event: any) =>
  self.postMessage({ fatal: String(event.reason?.stack || event.reason) }),
);
self.onmessage = async (e) => {
  const { id, args } = e.data;
  clearTimeout(idle);
  try {
    const wanted = Math.min(
      4,
      Math.max(
        1,
        args.threads === "auto"
          ? Math.floor((navigator.hardwareConcurrency || 2) / 2)
          : Number(args.threads),
      ),
    );
    const threads =
      globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined"
        ? wanted
        : 1;
    (globalThis as any).__canvasOcrProvider = args.backend;
    const next = [args.profile, args.backend, threads].join("/");
    if (next !== key) {
      await ocr?.dispose();
      ocr = undefined;
      key = "";
      self.postMessage({ id, phase: "載入本機模型與辨識環境…" });
      const tier = args.profile === "medium" ? "medium" : "small",
        base = args.base;
      ocr = await PaddleOCR.create({
        initialize: false,
        fetch: async (input: any, options: any) => {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
            base,
          );
          if (url.origin !== new URL(base).origin)
            throw Error("OCR 僅允許插件本地資產");
          return fetch(input, options);
        },
        textDetectionModelName: `PP-OCRv6_${tier}_det`,
        textRecognitionModelName: `PP-OCRv6_${tier}_rec`,
        textDetectionModelAsset: {
          url: new URL(`models/PP-OCRv6_${tier}_det.tar`, base).href,
        },
        textRecognitionModelAsset: {
          url: new URL(`models/PP-OCRv6_${tier}_rec.tar`, base).href,
        },
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 6,
        ortOptions: {
          backend: args.backend,
          wasmPaths: new URL("ort/", base).href,
          numThreads: threads,
          simd: true,
          proxy: false,
        },
      });
      // The SDK's direct entry assumes DOM canvases. Keep its pipeline, adapting the
      // input boundary to a real dedicated worker and accepting extension origins.
      ocr.ensureServedFromHttp = () => {};
      ocr.sourceToMat = (cv: any, s: any) => {
        const mat = cv.matFromImageData(
          new ImageData(new Uint8ClampedArray(s.data), s.width, s.height),
        );
        return {
          mat,
          width: s.width,
          height: s.height,
          dispose() {
            mat.delete();
          },
        };
      };
      await ocr.initialize();
      key = next;
    }
    self.postMessage({ id, phase: "偵測文字與辨識行框…" });
    const [result] = await ocr.predict(args.image, {
      textDetLimitSideLen: 1600,
      textDetLimitType: "max",
      textDetMaxSideLimit: 2400,
      textRecScoreThresh: 0,
    });
    self.postMessage({
      id,
      result: {
        ...result,
        threads: ocr.ort?.env?.wasm.numThreads || threads,
        spawnedPthreads,
        wantedThreads: wanted,
        isolated: globalThis.crossOriginIsolated,
        profile: args.profile,
        initialization: ocr.getInitializationSummary(),
      },
    });
  } catch (error) {
    await ocr?.dispose();
    ocr = undefined;
    key = "";
    self.postMessage({
      id,
      error: error instanceof Error ? error.stack : String(error),
    });
  } finally {
    idle = setTimeout(async () => {
      await ocr?.dispose();
      ocr = undefined;
      key = "";
    }, 60_000);
  }
};
