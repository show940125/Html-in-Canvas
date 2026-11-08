import { inverse, point, type Matrix } from "./coordinates";
import type { Rect } from "./types";

/** Matrix maps decoded source pixels to the displayed page, including CropBox/rotation. */
export function paintImageMask(
  data: Uint8Array,
  width: number,
  height: number,
  toPage: Matrix,
  mask: Rect,
  fill: string,
) {
  const toPixels = inverse(toPage),
    corners = [
      [mask.x, mask.y],
      [mask.x + mask.width, mask.y],
      [mask.x, mask.y + mask.height],
      [mask.x + mask.width, mask.y + mask.height],
    ].map(([x, y]) => point(toPixels, x, y));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)))),
    x1 = Math.min(width, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)))),
    y1 = Math.min(height, Math.ceil(Math.max(...corners.map((p) => p.y))));
  const hex = /^#[a-f\d]{6}$/i.test(fill) ? fill : "#ffffff",
    rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = point(toPage, x + 0.5, y + 0.5);
      if (
        p.x < mask.x ||
        p.y < mask.y ||
        p.x >= mask.x + mask.width ||
        p.y >= mask.y + mask.height
      )
        continue;
      const i = (y * width + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
}
