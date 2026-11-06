# Canvas Slides v0.1.0 預覽版驗收

## v0.1.1 增補

維他命 C 五頁風格 A 的實際匯入測試發現：`--accent-on` 同時存在於兩套風格，導致雜誌風被誤判為瑞士風。修正為優先讀取 `html[data-family]`，舊檔則以實際 `.slide .canvas-card` 結構作為瑞士風判斷。新增的雜誌風、瑞士風與舊版雜誌風回歸案例，在修正前有兩項失敗，修正後全部通過。

v0.1.1 單元測試為 20 項；原生／HTML 主流程重新執行。五頁設計樣本另記錄於 `examples/vitamin-c-style-a/output/verification.json`，驗證風格 A 辨識、中文改字、換圖、卡片拆開與五頁／備註匯出。既有待人工驗收項目不變。

日期：2026-11-04（Asia/Taipei）。這份紀錄描述本機開發驗收，沒有宣稱商店審核、正式發布或使用者人工驗收完成。

## 環境

- Windows、Chrome 156.0.8078.80、隔離設定檔；原生模式啟用 CanvasDrawElement。
- Node.js 24.22.1、Python 3.14、Playwright 1.64.1。
- 實際 Manifest V3 建置以 CDP 載入，未修改使用者 Chrome 設定檔。
- 固定公開 manifest key；插件 ID `ehmlgpnbnkmfggnamoknkaadeojokeki`，與 Canvas Clipper 分離。

## 自動檢查

| 檢查 | 結果與範圍 |
|---|---|
| TypeScript／正式建置 | 通過，產出 MV3 主介面、獨立沙箱 runtime 與授權清單 |
| 單元測試 | 17 項：HTML 結構／備註、安全邊界、根樣式、歷史、ID、ZIP 與匯出 |
| 原生主流程 | 13 項：真實游標中文輸入、復原重做、歸藏版型、ZIP、離線 HTML、PDF、講者模式、重開保存 |
| HTML 相容主流程 | 同上 13 項，未啟用 CanvasDrawElement；圖片輸出維持不可用提示 |
| 自由物件與一般 HTML | 17 項：素材解碼、未知腳本停用、拆開不推動鄰近排版、實際拖拉與縮放、旋轉、群組、群組縮放及解散前後幾何、鎖定、PNG 與 ZIP 重匯入 |
| 版型 | 32 項：原生繪製、可見內容、DOM 文字邊界，另保存全尺寸截圖與縮圖 |
| 離線播放 | 32 頁動畫執行與可見性、兩套原版講者介面，共 34 項；零未捕捉錯誤、零 HTTP(S) 請求 |

瀏覽器檢查共 109 個記錄項目。各項測試證明指定路徑，沒有推論成任意 HTML／CSS／腳本皆可無損編輯。

## 證據

- `output/acceptance/results-native.json`、`results-dom.json`：實際 MV3 主流程；含介面、離線 HTML 與講者畫面截圖。
- `output/acceptance/searchable-native.pdf`、`searchable-dom.pdf`：兩頁 PDF，經 PyMuPDF 確認文字可擷取。
- `output/advanced/results.json`：一般 HTML 與自由物件；`generic-export.png`、`generic-project.zip` 保存實際輸出。
- `output/layouts/results.json`：32 個版型的繪製與 DOM 邊界；`public/previews/` 使用實際 Canvas 縮圖。
- `output/playback/results.json`：32 頁播放及兩套講者介面；記錄未捕捉錯誤與外部網路請求。

證據檔案位於 Git 忽略的 output，測試程式與固定版型來源可重現結果。新增 CI workflow 已配置，尚未在遠端 GitHub Actions 執行。

## 本輪已修正的問題

- 原生 canvas 祖先被誤判成禁止文字編輯的內容，造成所有原生文字無法雙擊編輯。
- 拆開後 `translate: none` 被解析成 NaN，造成拖拉沒有更新位置。
- 重新整理建立新空白草稿，改為恢復上次專案。
- Lucide ESM 需要明確提供 icons 字典，補上與原始 UMD runtime 的相容包裝。
- 預設版型含縮略重複項目、缺少中線或圖片未解碼，補齊實際預設內容並等待解碼後輸出。
- 非同步縮圖在切頁後可能混入另一頁，改以畫布與頁面 ID 核對。
- 鎖定物件仍可刪除、匯入遺漏 html 根樣式與 class，均已修正。
- 群組錯用旋轉後的外框位置作為 CSS 位置，改以局部座標保留群組前外觀；解散時合成父子矩陣，保留群組縮放與旋轉。

## 待人工與擴充驗收

- [ ] Chrome 157 實體 GPU 及一般使用者設定檔（原生 API 已通過 headless 自動測試）。
- [ ] Windows 實體 IME 候選窗、候選字選取、跨螢幕 DPI 與不同縮放比例。
- [ ] 原生檔案／資料夾選取、拖放多種資料夾結構與系統列印位置。
- [ ] 使用者自己的歸藏及其他 AI HTML：複雜巢狀 transform、偽元素、遮罩、特殊字型、SVG／表格等。
- [ ] 第三方地圖、React 客戶端生成內容與未知腳本的專用適配器。
- [ ] 原版講者模式的完整雙螢幕、雷射／圈選、排練、視窗同步與現場操作。
- [ ] 長時間、大型素材與 200 頁上限的工作量／記憶體測試。
- [ ] Chrome Web Store 打包、政策審核與發布。

目前交付定位：可載入與試用的本機預覽版。上述待辦保持開啟。

## v0.1.2 修正驗收（2026-11-06）

本輪本機 Chrome 157.0.8103.39、隔離設定檔、自動化 headless 原生 API 與明確關閉 API 的 HTML 相容模式。24 項單元測試通過。瀏覽器記錄共 144 項：原生 13、HTML 13、自由物件 17、版型 32、播放 34、色彩與完整輸出 35。

新增 `scripts/fidelity_acceptance.py` 的 `output/fidelity/results.json`：兩次 ZIP 匯入、PNG、獨立 HTML、播放及 PDF 的森林綠像素；低動態模式仍逐項顯示；播放填滿可用區域；實際列印按鈕在所有 iframe／字型／圖片就緒後才呼叫 print。PDF 五頁均有可擷取文字，與完整靜態畫面逐頁比對，平均每通道差異依頁為 1.29、1.88、2.40、2.17、1.50（0–255，門檻 5）；最後一頁四個步驟完整。另測獨立 HTML 的 Ctrl+P。

最初使用者回報的間歇性黑底，在再次匯入後恢復，未固定重現原始狀態；已修正可重現的模板背景與遮罩顏色偏移，並補跨輸出像素回歸。實體 Windows IME、使用者設定檔、跨螢幕 DPI、實體 GPU、原生檔案對話框及系統列印操作仍待人工驗收。遠端 CI 結果另以發布提交的 Actions 為準。
