# Canvas PDF 0.1.0 本機交付

> 本文是本機交付時的歷史憑證。ZIP 與 SHA 清單保留於本機，以下本機產物連結不代表 GitHub 可下載附件；當時的提交／驗收狀態依原紀錄保留，目前狀態以 [STATUS.md](STATUS.md) 為準。

已實作原生 PDF 編輯、掃描 OCR、Chrome 本機／匿名 Gemini 翻譯、雙語與搜尋輸出，並交付離線插件及對應原始碼。此摘要位於 ZIP 之外，記錄最終檔案身分。

## 檔案

- [canvas-pdf-0.1.0-offline.zip](<../dist/canvas-pdf-0.1.0-offline.zip>)（169,028,708 bytes）
- [canvas-pdf-0.1.0-source.zip](<../dist/canvas-pdf-0.1.0-source.zip>)（146,938,339 bytes）
- [canvas-pdf-0.1.0-SHA256.txt](<../dist/canvas-pdf-0.1.0-SHA256.txt>)（189 bytes）

[安裝與使用指南](<public/GUIDE.html>) · [驗收紀錄](<ACCEPTANCE.md>)

## 安裝

將離線 ZIP 解壓到固定資料夾，在 Chrome 157 以上的 chrome://extensions 啟用開發人員模式，載入含 manifest.json 的解壓資料夾。也可直接載入此工作區的 Canvas PDF/dist。

## 驗證

- 18 個單元測試與 TypeScript 通過。
- 真實 MV3 的原生／DOM 模式、原生編輯、批次貼上與單步復原、備份恢復、掃描重建、翻譯及雙語輸出通過。
- CPU 1／2／4 緒、medium 與實際 WebGPU 推論完成；最終 ZIP 解壓後再通過離線開檔、OCR、WebGPU 與可搜尋 PDF 輸出。
- 最終 ZIP 逐檔摘要、四組模型、字型、EditCore、來源封存及授權內容均核對。
- 40 頁原創合成集 CER 0%；真實文件人工金標尚未提供，此結果不能推定真實掃描準確率。

## 保留的驗收邊界

公開 HTTPS、本機 file PDF 及獨立分頁交接通過；loopback HTTP 的一次性來源／POST／內嵌重跑仍有導航停滯，原因待隔離，失敗紀錄隨包保留。接管預設關閉。實體 IME、使用者設定檔及廣泛文件保真度仍待驗收。

本輪未公開發布、上架或安裝到使用者設定檔。既有三個插件保留原授權；Canvas PDF 依整合的 BentoPDF／EditCore 採獨立 AGPL-3.0-only。

## SHA-256

```text
8dfc46684722e2b65cfef52d87251afa7ca815d8bb165f300c2ac89d6dbff8e1  canvas-pdf-0.1.0-offline.zip
e180bd06e5d33f2e173074ef2d6094da074dcd611b3e2946a7e3957e7d32f619  canvas-pdf-0.1.0-source.zip
```
