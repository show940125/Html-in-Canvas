import { describe, it, expect } from "vitest";
import { editRuns, alignment, validRect } from "../src/editing";
import { fontFamily } from "../src/types";
const runs = [
  { text: "Hello ", family: "Helvetica", size: 12, rgba: 255 },
  { text: "world", family: "Times", size: 16, rgba: 0xff0000ff, bold: true },
];
describe("paragraph editing", () => {
  it("preserves mixed unchanged styles while inserting CJK", () => {
    const r = editRuns(runs, "Hello 繁體world");
    expect(r.map((x) => x.text).join("")).toBe("Hello 繁體world");
    expect(r.at(-1)?.family).toBe("Times");
    expect(r.at(-1)?.bold).toBe(true);
    expect(r.find((x) => x.text === "繁體")?.family).toBe(fontFamily);
  });
  it("does not split a surrogate pair when editing", () => {
    const r = editRuns([{ ...runs[0], text: "A😀B" }], "A😀測試B");
    expect(r.map((x) => x.text).join("")).toBe("A😀測試B");
  });
  it("preserves deletion and empty text", () => {
    expect(
      editRuns(runs, "Hello ")
        .map((x) => x.text)
        .join(""),
    ).toBe("Hello ");
    expect(
      editRuns(runs, "")
        .map((x) => x.text)
        .join(""),
    ).toBe("");
  });
  it("aligns independently sized objects on a shared right edge", () => {
    const items = [
      { x: 0, y: 0, width: 20, height: 10 },
      { x: 30, y: 5, width: 40, height: 20 },
    ];
    const d = alignment(items, "right");
    expect(items.map((r, i) => r.x + r.width + d[i].dx)).toEqual([70, 70]);
  });
  it("rejects invalid geometric boundaries", () => {
    expect(validRect({ x: NaN, y: 0, width: 10, height: 10 })).toBe(false);
    expect(validRect({ x: 0, y: 0, width: -1, height: 10 })).toBe(false);
  });
});

it("finds separated native paragraph paste positions and refuses a full page", async () => {
  const { pasteOffset } = await import("../src/editing");
  const items = [
      {
        kind: "text",
        x: 20,
        y: 20,
        width: 100,
        height: 30,
        runs: [{ size: 14 }],
      },
    ],
    obstacles = [{ x: 20, y: 20, width: 100, height: 30 }];
  const r = pasteOffset(items, obstacles, {
    x: 0,
    y: 0,
    width: 300,
    height: 400,
  });
  expect(r.dy).toBeGreaterThanOrEqual(58);
  expect(() =>
    pasteOffset(items, [{ x: 0, y: 0, width: 300, height: 400 }], {
      x: 0,
      y: 0,
      width: 300,
      height: 400,
    }),
  ).toThrow("空間");
});
