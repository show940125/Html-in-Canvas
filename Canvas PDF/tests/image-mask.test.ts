import { it, expect } from "vitest";
import { paintImageMask } from "../src/image-mask";
it("erases only source pixels covered by a rotated page-space mask", () => {
  const pixels = new Uint8Array(4 * 4 * 4);
  pixels.fill(17);
  // Source image is rotated 90 degrees and translated on the page.
  paintImageMask(
    pixels,
    4,
    4,
    [0, 2, -2, 0, 18, 10],
    { x: 14, y: 10, width: 4, height: 4 },
    "#ff0000",
  );
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++)
      expect([...pixels.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4)]).toEqual(
        x < 2 && y < 2 ? [255, 0, 0, 255] : [17, 17, 17, 17],
      );
});
