# 歸藏來源與本機適配

- 上游：op7418/guizang-ppt-skill，基準 `93d21bf4a73a851907a6eb00acbf30618236667a`；MIT，Copyright (c) 2026 op7418（歸藏）。
- 本機來源：使用者既有 guizang-html-ppt skill 的四個模板、Motion 本地副本及兩套版型參考文件。沒有修改來源 skill。
- `src/vendor/guizang.json` 的 `sources` 記錄四個模板的 SHA-256。來源 CSS、主題與可信 runtime 固定在插件內。
- `scripts/import-guizang.mjs` 是明確執行的開發匯入工具；一般建置不讀取 skill 路徑、不更新上游。
- 10 種雜誌風使用參考文件中的完整 section。22 種瑞士風按 `swiss-layout-lock.md` 登記的版型 ID；完整範例使用原有結構，縮略範例透過 `scripts/finish-layouts.mjs` 展開。
- S12–S21 部分參考只有文字說明，使用該登記版型所述骨架補成預設內容。S03、S05 按登記骨架調整；S02、S04、S06、S07、S11 展開原有重複項目；S13／S14 補齊中線與尺寸。這些是本機適配版型，沒有原始 22 頁 golden source 的逐像素保真承諾。
- 範例圖片為本專案新增的幾何 SVG，可直接替換。`public/previews/` 是適配後版型的原生 Canvas 縮圖。
- 本機備註抽取只讀取靜態 `SPEAKER_NOTES` 字面值，使用 Acorn 解析，不執行來源程式。
- Motion 的本地副本與 Lucide 隨插件打包；移除 CDN loader，以固定 runtime 支援離線播放。
- `src/generated/playback.js` 是建置產物，由 esbuild 自動生成；不手動編輯。

版型擷取、欄位、動畫及講者 runtime 更新後須重新跑版型、離線播放與專案往返驗收。遠端地圖等第三方互動元件尚未列入完整支援。
