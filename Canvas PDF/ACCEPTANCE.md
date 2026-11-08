# Canvas PDF 驗收紀錄

## 0.1.1 修正驗收（2026-11-08）

本輪依使用者回報，重現原生／OCR 雙擊失效、選取後右側未帶出文字，以及搜尋模式校正未改變頁面顯示。另重現新增繁中字被來源字型誤配成空字元。修正及本輪測試詳見 [REVIEW-20261108.md](REVIEW-20261108.md)。

TypeScript 與 21 個單元測試通過；原生與 DOM 的實際點選、雙擊、右側文字、校正／重建及獨立 PDF 重開已測試。最終 ZIP 使用 `scripts/verify_package.py` 核對後，會再以解壓內容執行兩種模式的 `scripts/ocr_edit_acceptance.py`。每次結果保存在 `output/`；套件附入的 JSON 與缺少紀錄明列於 `verification/index.json`。

下列 0.1.0 紀錄保留其原始日期。當時部分改字驗收使用右側套用或程式介面，未覆蓋完整雙擊入口；其通過結果不能代表本輪回報的流程已被驗證。

## 0.1.0 歷史驗收

2026-11-07，本機預覽版。測試環境為 Windows、Chrome 157.0.8103.39、i5-12400（6 核／12 緒）、約 15.7 GiB RAM。WebGPU 實際 adapter 回報 `intel / gen-12lp`。自動驗收使用隔離 Chrome 設定檔與原創測試文件；使用者設定檔尚未安裝或修改。

## 已驗證

| 範圍 | 結果與證據 |
|---|---|
| 型別與單元測試 | TypeScript 通過；18 個測試通過，涵蓋文字 runs、對齊、旋轉座標、穩定 ID、OCR 座標、遮罩矩陣、換行、串流與譯文 ID／術語／公式核對 |
| 真實 MV3 | 原生 HTML-in-Canvas 與 DOM 模式各完成開檔、改字、復原／重做、圖片拖曳、OCR 與搜尋 PDF 輸出；無未處理 UI 錯誤或遠端 OCR／程式碼請求。`scripts/acceptance.py` |
| 編輯輸出 | PDF.js 逐頁擷取及渲染後才下載；測試再由 PyMuPDF 獨立重開，確認新文字存在、舊文字消失。旋轉／CropBox 文件改字與密碼文件工作副本通過 |
| 保存與頁面 | 重啟恢復穩定物件 ID、原檔摘要及專案 ZIP；複製頁與跨頁復原通過；多段原生文字及多個 OCR 行框的貼上各形成一個復原步驟。`scripts/extended_acceptance.py` |
| 掃描與譯文 | OCR 行框有限且位於頁內；校正重建、原生／掃描譯文寫回、原文移除及選頁雙語配對通過 |
| 共用圖片 | 跨頁及同頁重複使用同一 XObject；修改一個使用位置，其他使用位置像素維持一致。`scripts/shared_image_acceptance.py` |
| CPU 多緒 | small 1／2／4 緒與 medium 4 緒真實推論通過。4 緒實際建立 3 個 pthread 子 Worker，頁面 cross-origin isolated |
| WebGPU | small 的偵測與辨識 provider 均回報 `webgpu`，完成實際推論；初始化衝突已以依序建立 session 修正 |
| 取消 | 實際 OCR Worker 取消通過；完成頁面保留。匿名 RPC 已提交後的錯誤採結果未知，不自動重送 |
| 離線與大文件 | 斷網後開檔、DPR 2 命中與移圖、small OCR、快取命中、頁面旋轉、PDF.js 驗證輸出及明確的點陣化輸出通過；50／200 頁維持單一活動頁面。`scripts/runtime_acceptance.py` |
| Chrome 翻譯 | 真實 API 由 downloadable 狀態完成語言包初始化並翻譯 `Original editable paragraph.` → `原始可編輯段落。`，工作紀錄 complete。另以 mock 驗證多段 ID 對應；兩種證據分開保存 |
| Gemini RPC | 真實匿名請求完成 `Original editable paragraph. Amount: 123.` → `原始可編輯段落。金額：123。`；credentials omit，單次請求，無自動重送。測試 manifest 預先授權 Gemini 來源；正式插件的權限確認流程仍由使用者操作 |
| MIME handler | 真實 Chrome API 讀寫 enabled／canEmbed；公開 HTTPS 與本機 file PDF，以及獨立分頁的專案交接均已完成。早期測試曾完成一次性來源（僅一個請求）、POST 與內嵌流程；後續 loopback HTTP 重跑在送出 HTTP 前停住，原因仍待隔離。該組穩定性列入待驗收，保留失敗紀錄；接管預設關閉 |

逐次 JSON、PDF 與畫面位於本機 `output/`；主要結果另隨離線包保存於 `verification/`。腳本的 controlled mock 明確標示，不能代替真實來源品質。

## OCR 合成評估

已凍結並執行 **40 頁原創合成資料、200 行已知文字**，small FP32／WASM 4 緒，逐頁保存結果、座標、行數、數字差異及耗時。NFKC 正規化並移除空白後，CER 為 **0%**。參考 PDF 的 SHA-256：

`f3f25376b5181a5e39c3b8aebd5de17ab0cc04893ed67796e2232e6061bc1d16`

這是清晰排版的合成測試；人工真實文件金標、AI 覆核與量化校準資料均未混入。此結果不能推定真實掃描、印章、直排、跨欄、姓名或低解析度文件的準確率。凍結輸入與參考 JSON 隨來源包提供。

同一範例掃描頁的推論時間如下。每格為單次觀察，**未包含模型初始化**，不屬於統計中位數或一般文件效能保證：

| 模型／後端 | 初次推論 | 暖機推論 |
|---|---:|---:|
| small CPU 1 緒 | 3,102 ms | 2,432 ms |
| small CPU 2 緒 | 1,507 ms | 1,377 ms |
| small CPU 4 緒 | 1,048 ms | 998 ms |
| medium CPU 4 緒 | 4,855 ms | 4,830 ms |
| small WebGPU | 4,362 ms | 1,292 ms |

因此首版維持 CPU 4 緒上限的自動配置。INT8 尚未通過本案的品質／速度門檻，包內使用官方 FP32。冷啟動全流程、峰值原生記憶體及多輪統計仍需另外量測；JavaScript heap 不代表全部程序記憶體。

## 交付邊界

- 已建立本機離線插件及對應原始碼的打包流程、資產鎖檔、逐檔 SHA-256、第三方授權與使用指南。公開發布與商店上架尚未執行。
- 本輪使用固定來源的 EditCore WASM，已核對對應 C++ 封存與二進位摘要；尚未在本機重新編譯該原生 WASM，也未宣稱位元完全一致的原生重建。
- 來源圖片含裁切或透明合成時，像素替換明示限制；保留原圖模式可使用，整頁點陣化由使用者明確選擇。
- HTML-in-Canvas 自動化驗證涵蓋滑鼠、幾何及 DPR 2；實體中文 IME 與跨螢幕行為仍需人手確認。

## 待驗收

- [ ] 40 頁真實文件人工金標；繁中直排、多欄、印章、公式、低解析度、姓名／數字／日期／否定詞分項評估。
- [ ] 本機 HTTP 一次性來源／POST／內嵌測試的重跑穩定性；公開 HTTPS 與 file 入口已有正向證據。
- [ ] 使用者實際 Chrome 設定檔的安裝、更新、下載、實體 IME、GPU、DPI 與 Gemini 權限彈窗。
- [ ] 更廣的文件保真度：特殊 CID／Type3 字型、複雜透明合成、巢狀 Form XObject、PDF/A、含真實簽章文件及多種加密權限。
- [ ] 冷啟動、記憶體峰值、60 秒閒置資源釋放的多輪量測與量化模型評估。

文章跨框／跨頁流、表格語意編輯、正式遮蔽、表單及數位簽章工具依原規劃留待後續版本。
