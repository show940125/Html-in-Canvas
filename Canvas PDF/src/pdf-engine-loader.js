export const ENGINE_BUILD = "bentopdf-pdfium@3f6b6114b166";
export async function createEngineModule(options = {}) {
  const base = new URL("editcore/", globalThis.__canvasPdfAssets);
  const module = await import(
    /* @vite-ignore */ new URL("editcore.js", base).href
  );
  return module.default({
    ...options,
    locateFile: (name) =>
      new URL(name.endsWith(".wasm") ? "editcore.wasm" : name, base).href,
  });
}
