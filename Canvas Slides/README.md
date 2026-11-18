# Canvas Slides · HTML 簡報編輯器

Html in Canvas 系列的第二個 Chrome 插件。[v0.2.0 預覽版](https://github.com/show940125/Html-in-Canvas/releases/tag/canvas-slides-v0.2.0)：匯入 AI 生成的 HTML 簡報，在真實 HTML 上改字、換圖與自由排列，保存專案，再輸出可離線播放的 HTML。

## 使用

1. 將發布 ZIP 解壓到固定資料夾。
2. 開啟 Chrome 的擴充功能管理頁，啟用開發人員模式。
3. 按「載入未封裝項目」，選擇含 `manifest.json` 的資料夾。
4. 按插件圖示，開啟 Canvas Slides。
5. 首次開啟可匯入 HTML、開啟五頁「維他命 C」範例，或新建瑞士風／雜誌風簡報。之後可從「專案」續編。

Chrome 156 的原生模式需啟用 `chrome://flags/#canvas-draw-element` 後重新啟動瀏覽器。沒有原生 API 時保留 HTML 編輯、保存與 HTML／專案輸出；PNG 需要原生 API。Chrome 157 已通過本輪隔離設定檔的原生 MV3 自動測試；實體 IME、跨螢幕 DPI 與 GPU 驅動仍待人工驗收。

## 編輯

- 單擊選取、雙擊文字編輯、Esc 結束編輯；原生文字與中文組字仍由瀏覽器處理。
- 可新增文字、圖片、矩形、圓形、線條；調整字體、顏色、透明度、裁切焦點與圖片填滿方式。
- 控制框提供拖拉、縮放、旋轉；屬性欄可輸入 X／Y／寬／高，對齊頁面與其他物件時顯示吸附線。
- Shift 多選，也可從圖層面板選取，支援群組、解散、對齊、前後順序、鎖定及刪除。
- 「轉成自由物件」保留量測後的外觀，原位置留下佔位以維持周邊排版；復原可還原文件結構。
- 可拖曳縮圖排序，或在縮圖上按 Alt+↑／↓。「投影片動作」集中複製、隱藏、移動與刪除。備註依頁面 ID 保存。
- 「適合視窗」會顯示畫布實際倍率，也可切換至 100%。窄視窗一次開啟一側欄，寬視窗可按「專注畫布」收起兩側。
- Ctrl+Z／Ctrl+Shift+Z 復原與重做。方向鍵移動 1px，Shift+方向鍵移動 10px。

資料存於目前 Chrome 設定檔的 IndexedDB，重新開啟會回到上一份專案。文字在組字結束並短暫停止輸入後保存。講者頁只更新該頁提詞，與編輯器在不同欄位的修改會合併。同欄位衝突時可查看兩份內容、選擇保留的修改或匯出副本。保存失敗會在文件名稱下方顯示重試與備份入口。

## 匯入與輸出

| 格式 | 行為 |
|---|---|
| HTML＋素材 | 可拖放、多選檔案或選資料夾。檢查頁顯示頁數、風格、圖片與缺漏，可在同一畫面補入素材 |
| 一般 ZIP | 自動尋找 `index.html`，也可在匯入介面選擇入口檔案 |
| 專案 ZIP | 驗證 schema、頁面與路徑後匯入副本，保留原稿、備註、素材和編輯狀態 |
| 獨立 HTML | 保存已納入素材及打包的播放程式，不依賴插件與 CDN |
| PNG | 原生 Canvas 完成字型與圖片解碼後，輸出目前投影片 |
| PDF | 先建立完整靜態列印文件，等所有頁面字型與圖片完成，再選印表機或另存 PDF；文字保持可搜尋 |

投影片依 `#deck > .slide`、Reveal、`.slide` 或頂層 section 等結構辨識。「進階設定」可貼上 HTML、選擇入口或指定頁面容器。匯入最多 200 頁，HTML 原檔最多 16 MiB，素材解壓總量最多 250 MiB，單個 ZIP 項目最多 64 MiB。新增圖片最多 20 MiB／2400 萬像素。

## 歸藏整合

固定四個本機模板快照，提供 22 種瑞士風與 10 種雜誌風版型，縮圖來自實際 Canvas 輸出。部分參考文件只有縮略骨架，插件已將重複項目展開或依登記結構補成預設版型；來源與改寫範圍見 [SOURCES.md](SOURCES.md)。

「播放」從目前可見投影片開始，旁邊的下拉選單可從首頁播放。播放分頁提供講者備註、下一頁預覽、計時及黑白屏。畫面依可用區域等比例放大，點畫面、空白鍵或「下一步」逐項揭示流程。輸出的歸藏 HTML 含離線播放及講者模式。

匯入與匯出採用 [DesignBookmark Motion](https://designbookmark.com/motion) 的拖放、步驟與完成回饋。畫布與工具列參考 Focus Mode、Sidebar Collapse 及 [Kokonut UI Tool Dock](https://kokonutui.com/docs/navigation/toolbar) 的操作提示。元件用既有 React 與 CSS 實作。

## 相容性界線

- 匯入 HTML 的 JavaScript 不執行；程式產生的圖表、React 客戶端渲染、第三方地圖與遠端互動元件，需要靜態內容或後續適配器。
- 已知歸藏動畫使用插件內固定的可信 runtime；任意修改過的歸藏 JavaScript 無法原樣帶入。
- SVG、表格與複雜區塊以整體保留，首版沒有 SVG 路徑編輯器、表格儲存格工具或圖表資料編輯器。
- 拆開區塊會固定當下版面。偽元素、巢狀 transform、遮罩與複雜選擇器仍需用實際簡報檢查；首版不保證任意 CSS 無損往返。
- 外部字型／圖片若未納入素材，顯示匯入提示；字型可用系統 fallback，圖片使用預設佔位。
- 實體 Windows IME 候選窗、GPU 驅動、原生資料夾選取、系統列印位置及正式商店發布尚待驗收。

## 開發與驗收

在此插件目錄使用 Node.js 24：

```sh
npm ci
npm test
npm run build
```

瀏覽器驗收使用 Python 3.14 及 `requirements-test.txt`。Windows 優先使用安裝的 Chrome；其他環境先安裝 Playwright Chromium。

```sh
python scripts/acceptance.py
python scripts/acceptance.py --dom
python scripts/advanced_acceptance.py
python scripts/workbench_acceptance.py
python scripts/layouts_acceptance.py
node scripts/generate-fixtures.mjs
python scripts/playback_acceptance.py
```

全部使用隔離設定檔與合成材料，證據位於 Git 忽略的 `output/`。[驗收紀錄](ACCEPTANCE.md) 保留自動檢查與人工驗收的邊界。`npm run dev` 僅供一般網頁開發；真正 MV3 沙箱須以 `dist` 載入驗證。

原創程式 Apache-2.0；歸藏與其他依賴保留原授權，建置結果附完整 notices。

## v0.1.2 修正

統一主題與手動底色、列印前完成全部內容、播放填滿可用區域、流程逐步揭示，並修正 Chrome 157 上的相容模式測試。底色間歇性異常的原始觸發條件仍待確認。詳見 [技術說明與優化方向](TECHNICAL.md) 與 [驗收紀錄](ACCEPTANCE.md)。
