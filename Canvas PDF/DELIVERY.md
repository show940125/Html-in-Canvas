# Canvas PDF 0.1.1 本機修正版交付

> 本文是本機交付時的歷史憑證。ZIP 與 SHA 清單保留於本機，以下本機產物連結不代表 GitHub 可下載附件；當時的提交／驗收狀態依原紀錄保留，目前狀態以 [STATUS.md](STATUS.md) 為準。

2026-11-08。已修正頁面點選／雙擊編輯、右側文字未顯示、OCR 改字未切換重建，以及繁中文字型誤配造成空字元與選取失效。

## 檔案

- [canvas-pdf-0.1.1-offline.zip](<../dist/canvas-pdf-0.1.1-offline.zip>)（169,037,416 bytes）
- [canvas-pdf-0.1.1-source.zip](<../dist/canvas-pdf-0.1.1-source.zip>)（146,951,155 bytes）
- [canvas-pdf-0.1.1-SHA256.txt](<../dist/canvas-pdf-0.1.1-SHA256.txt>)（189 bytes）

[本輪審查與修正](<REVIEW-20261108.md>) · [安裝與使用指南](<public/GUIDE.html>) · [完整驗收紀錄](<ACCEPTANCE.md>)

## 更新與使用

1. 更新前可先下載專案 ZIP 保存編輯成果；使用新的資料夾載入會建立獨立插件儲存空間，可用專案 ZIP 恢復。
2. 解壓離線包到固定資料夾，在 Chrome 157 以上的 `chrome://extensions` 載入／重新載入插件，再重新整理編輯分頁。也可載入目前工作區的 `Canvas PDF/dist`。頁尾應顯示 0.1.1。
3. 原生文字點選後，右側會顯示文字；雙擊可直接輸入，Ctrl+Enter 提交，Escape 取消。
4. 掃描頁辨識後會自動選取第一框。編輯文字會重建可見文字；OCR 分頁的「套用校正」保留目前模式。
5. 已有文字層卻無法編輯時，可選「整頁強制辨識（含既有文字）」。OCR 修改與原生文字重疊時，依提示使用明確點陣化輸出，或改用原生段落編輯。

## 本輪實際驗證

- TypeScript 與 21 個單元測試通過。
- 最終 ZIP 解壓後，以實際 Chrome、隔離設定檔、斷網環境執行原生 HTML-in-Canvas 與 DOM 模式，各 20 項操作檢查通過：選取、右側文字、雙擊、中文寫回、取消、OCR、重辨取消、復原／重做、強制整頁辨識、獨立 PDF 重開與輸出保護。
- 五組原生繁中文字型回歸通過，包含原先失敗的「生死」。原有 UI 的圖片拖曳、復原／重做及搜尋 PDF 驗收重新通過。
- 最終套件驗證 15 項通過：雙 ZIP／逐檔摘要、四個模型、字型、EditCore 對應來源、授權、離線開檔／OCR、實際 WebGPU 推論與上述兩種 UI 流程。
- 無本機驗收紀錄的打包路徑也通過，確認不依賴或夾帶舊驗收附件。

逐次結果：`Canvas PDF/output/package/checks.json`、`Canvas PDF/output/ocr-edit/checks.json`、`Canvas PDF/output/ocr-edit-dom/checks.json`。套件內的 `verification/index.json` 列出實際附入的紀錄；0.1.0 歷史結果與本輪新驗證分別說明。

## GitHub 與保留邊界

GitHub 原失敗屬於 Canvas Clipper，遠端最新 [run 42254661174](https://github.com/show940125/Html-in-Canvas/actions/runs/42254661174) 已通過。Canvas PDF 專用 CI workflow 已在本機新增，尚未 commit／push／遠端執行；本輪保持本機交付。

舊 0.1.0 ZIP 與摘要保留。實體 IME、使用者當時操作的 PDF、廣泛文件保真度、人工 OCR 金標及 loopback MIME 穩定性仍有驗收邊界；40 頁合成資料的舊 CER 不能推定真實文件準確率。中英文段落、圖片、模型與翻譯服務的詳細限制見驗收與審查文件。

## SHA-256

```text
29af63b0ba0c996b143201fc38882999953edbee395446a5e1fd8cc1e42d653c  canvas-pdf-0.1.1-offline.zip
e0a14d23b26e70a1080518fd36ced2df482fa3bf67f68d0ee23d7fa76aaf3ac1  canvas-pdf-0.1.1-source.zip
```
