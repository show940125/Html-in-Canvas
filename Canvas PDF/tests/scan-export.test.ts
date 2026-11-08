import { it, expect } from "vitest";
import { scanExportAction } from "../src/scan-export";
const box = { x: 10, y: 10, width: 80, height: 12 };
it("omits hidden OCR over existing native text", () => {
  expect(scanExportAction(box, [box], false, false)).toBe("skip");
  expect(scanExportAction(box, [], false, false)).toBe("draw");
});
it("requires explicit raster output for OCR replacement over native text", () => {
  expect(() => scanExportAction(box, [box], true, false)).toThrow("點陣化");
  expect(scanExportAction(box, [box], true, true)).toBe("draw");
});
