# Canvas Clipper 0.6.0

本機 HTML-in-Canvas 互動式閱讀桌。請參閱 [使用指南](GUIDE.html)、[技術架構](../docs/architecture.md) 與 [開發說明](../docs/development.md)。

網頁圖文收集、主題框與多標籤、磁吸預覽和局部讓位、定向關係、聚焦與雙篇比較、長文分頁及原生 HTML WebGL 翻頁。

三區可收合，提供六組配色與六種框型。圖片組圖保存卡片和關係，PDF 保留可搜尋全文。ZIP v3 包含原文、編輯稿、筆記、原始圖片、分類、關係、外觀及閱讀位置，並繼續支援 v1／v2 匯入。

資料保存在目前瀏覽器設定檔的 IndexedDB。先備份再更新；載入建置後的 `dist` 目錄。首次試用可建立獨立合成範例專案。

空白專案提供收集整篇、摘錄一段與新增筆記。Ctrl+K 搜尋顯示材料的主題與命中片段，方向鍵選取，Enter 定位。書本排頁失敗時可重試或切回原段落的一般閱讀。備份可拖放或選檔，驗證及匯入結果會留在視窗內。主題框右上角 ⚙ 可設定形狀、顏色與文章預設樣式。

[下載 v0.6.0](https://github.com/show940125/Html-in-Canvas/releases/tag/canvas-clipper-v0.6.0) · [本輪修改、驗收與候選清單](../docs/UX_REFINEMENT.md)
