import { it, expect } from "vitest";
import { scanBlocks } from "../src/ocr";
it("maps real OCR polygons into page coordinates and suppresses native duplicates", () => {
  const result = {
    image: { width: 200, height: 400 },
    items: [
      {
        poly: [
          [20, 40],
          [100, 40],
          [100, 60],
          [20, 60],
        ],
        text: "OCR text",
        score: 0.95,
      },
    ],
  };
  const b = scanBlocks(result, 2, 100, 200, []);
  expect(b[0]).toMatchObject({
    x: 10,
    y: 20,
    width: 40,
    height: 10,
    page: 2,
    mode: "search",
  });
  expect(
    scanBlocks(result, 2, 100, 200, [
      { ...b[0], kind: "text", engineId: 1, editable: true },
    ]),
  ).toHaveLength(0);
});
