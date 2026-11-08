import { it, expect } from "vitest";
import { normalize } from "../src/model";
import { bindIdentities } from "../src/identity";
import { wrapText } from "../src/text-layout";
it("maps a rotated paragraph local frame to the displayed CropBox", () => {
  const v = normalize(
    {
      height: 550,
      paragraphs: [
        {
          id: 7,
          rotation: -90,
          box: { x: -510, top: 718.928, w: 286, h: 45.696 },
          runs: [{ text: "文字" }],
        },
      ],
    },
    0,
  );
  expect(v.objects[0].x).toBeCloseTo(673.232);
  expect(v.objects[0].y).toBeCloseTo(40);
  expect(v.objects[0].height).toBeCloseTo(286);
});
it("retains stable identities when fresh PDFium model IDs are allocated", () => {
  const project: any = {};
  const model = (id: number) =>
    normalize(
      {
        height: 100,
        paragraphs: [
          {
            id,
            box: { x: 10, top: 80, w: 40, h: 12 },
            runs: [{ text: "Paragraph" }],
          },
        ],
      },
      0,
    );
  const first = bindIdentities(model(1), project).objects[0].id;
  expect(bindIdentities(model(73), project).objects[0].id).toBe(first);
  expect(JSON.stringify(project.identities)).not.toContain("engineId");
});
it("wraps Chinese and supplementary characters without breaking code points", () => {
  expect(wrapText("中文測試😀內容", 3, (s) => [...s].length)).toEqual([
    "中文測",
    "試😀內",
    "容",
  ]);
  expect(wrapText("one two three", 7, (s) => s.length)).toEqual([
    "one two",
    "three",
  ]);
});

it("reserves stationary duplicate identities before matching a moved paragraph", () => {
  const project: any = {};
  const model = (x: number) =>
    normalize(
      {
        height: 200,
        paragraphs: [
          {
            id: 1 + x,
            box: { x, top: 180, w: 30, h: 12 },
            runs: [{ text: "same" }],
          },
          {
            id: 900,
            box: { x: 100, top: 180, w: 30, h: 12 },
            runs: [{ text: "same" }],
          },
        ],
      },
      0,
    );
  const before = bindIdentities(model(0), project).objects.map((o) => o.id);
  expect(bindIdentities(model(110), project).objects.map((o) => o.id)).toEqual(
    before,
  );
});
