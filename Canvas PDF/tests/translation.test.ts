import { describe, it, expect, vi } from "vitest";
import {
  GeminiFrames,
  translateLocalText,
  parseTranslations,
  protectedDifference,
  translateBlocks,
} from "../src/translation";
const frame = (s: string) =>
  JSON.stringify([
    ["wrb.fr", null, JSON.stringify([null, null, null, null, [[null, [s]]]])],
  ]) + "\n";
describe("translation protocol boundaries", () => {
  it("keeps latest cumulative answer across arbitrary stream chunks", () => {
    const p = new GeminiFrames(),
      s = ")]}'\n" + frame("你") + frame("你好，世界");
    for (let i = 0; i < s.length; i += 3) p.push(s.slice(i, i + 3));
    expect(p.finish()).toBe("你好，世界");
    expect(p.frames).toBe(2);
  });
  it("rejects duplicate, missing and unrelated result IDs", () => {
    expect(() =>
      parseTranslations('[{"id":"a","text":"甲"},{"id":"a","text":"乙"}]', [
        "a",
        "b",
      ]),
    ).toThrow();
    expect(() =>
      parseTranslations('[{"id":"x","text":"甲"}]', ["a"]),
    ).toThrow();
  });
  it("accepts only complete scoped translation maps", () => {
    expect([
      ...parseTranslations('```json\n[{"id":"a","text":"譯文"}]\n```', ["a"]),
    ]).toEqual([["a", "譯文"]]);
  });
  it("surfaces numerical discrepancies for review", () => {
    expect(
      protectedDifference(
        "Amount 100 on 2026-11-07",
        "金額 200，日期 2026-11-07",
      ),
    ).toEqual(["100"]);
  });
  it("blocks a request with unknown prior outcome before transport", async () => {
    vi.stubGlobal("self", {});
    const records: any[] = [];
    const b = [{ id: "a", source: "one" }],
      options = {
        provider: "gemini" as const,
        from: "en",
        to: "zh-Hant",
        glossary: "",
      };
    const { hash } = await import("../src/storage");
    const inputHash = await hash(
      new TextEncoder().encode(
        JSON.stringify({ group: b, options, version: 1 }),
      ),
    );
    await expect(
      translateBlocks(
        b,
        options,
        new AbortController().signal,
        [
          {
            id: "old",
            kind: "translation",
            inputHash,
            status: "unknown",
            started: 0,
          },
        ],
        async (j) => {
          records.push(j);
        },
        () => {},
      ),
    ).rejects.toThrow("結果未知");
    expect(records).toHaveLength(0);
  });
});

it("keeps sentence context while enforcing a verified glossary replacement", async () => {
  const translate = vi.fn(async (s: string) =>
    s === "Original" ? "原始" : "原始可編輯段落。",
  );
  expect(
    await translateLocalText(
      { translate },
      "Original editable paragraph.",
      "Original＝最初版",
      new AbortController().signal,
      new Map(),
    ),
  ).toBe("最初版可編輯段落。");
  expect(translate.mock.calls[0][0]).toBe("Original editable paragraph.");
});
it("rejects formula loss while retaining the source for review", async () => {
  await expect(
    translateLocalText(
      { translate: async () => "formula lost" },
      "Formula $a+b$",
      "",
      new AbortController().signal,
      new Map(),
    ),
  ).rejects.toThrow("公式");
});
