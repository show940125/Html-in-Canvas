# 固定來源與適配

Canvas PDF 自有衍生程式採 AGPL-3.0-only。根專案與其餘插件保留原授權。

| 元件 | 固定來源 | 適配 |
|---|---|---|
| BentoPDF EditCore JS | alam00000/bentopdf `ed197274e906a2d378d7c566b0de88e403321b50` | 保留核心及 stream/type3/tag/shading 處理；載入器改為插件本地路徑；上層 UI、工作交易與 Worker 協定獨立實作 |
| EditCore WASM | bentopdf-pdfium `0.0.0-3f6b6114b166`，BentoPDF vendor tgz | 本地載入；原始碼對應 alam00000/bentopdf-pdfium-viewer `3f6b6114b166760de18923d9e737932a5c0adbcb` 的 packages/pdfium/build/code/editcore 與建置腳本 |
| PaddleOCR.js | npm `@paddleocr/paddleocr-js@0.4.2` | 保留官方偵測、裁切、辨識；Worker 輸入適配；本地模型／WASM；明確區分 CPU 與 WebGPU 載入；依序初始化偵測與辨識工作階段，移除 SDK 的遠端模型預設與第二層 Worker 入口 |
| PP-OCRv6 | 官方 small/medium det/rec ONNX tar | 原始模型與 YAML 字典隨包提供，未量化；精確來源與 SHA-256 見 assets.lock.json |
| OpenCV.js | `@techstark/opencv-js@4.10.0-release.1` | vite.config.ts 將固定版四個 embind 動態函式工廠改為等價 closure；保留 MV3 CSP，不開 unsafe-eval |
| ONNX Runtime Web | `1.30.0` | CPU 與 GPU 專用入口，外部本地 WASM；asyncify／JSEP emval 工廠以 scripts/stage-runtime.mjs 改為 closure |
| Noto Sans CJK TC | Noto CJK Serif2.003 tag 中 Sans/OTF/TraditionalChinese | 字型及 SIL OFL 隨包；PDF-lib 以完整 CFF 嵌入，避免此版子集在 PDFium 中缺字。0.1.1 的 EditCore 使用獨立 provider 名稱 `Canvas PDF TC`，避免誤用來源 PDF 內相近名稱的字型 |
| 匿名 Gemini 協定 | Comic Transcriber src/gemini-web.ts；MIT Sophomoresty/gemini-web2api 公開協定觀察 | 一般文件段落 ID、語言與錯誤狀態獨立適配；credentials omit，未採帳號 Cookie 或模型分級覆寫 |
| HTML-in-Canvas | 根專案 shared/html-in-canvas/canvas.ts，Apache-2.0 | 直接共用能力、繪製與幾何同步 |

參考研究：Stirling PDF 的編輯與回歸案例、S-PDF 的原生編輯限制、BabelDOC 的段落與排版方法。這些專案未整套加入執行依賴。

重建：Node 24；`npm ci` → `python scripts/prepare_assets.py` → `npm test` → `npm run build`。assets.lock.json 與 package-lock.json 固定分發身分。原生核心完整來源：

- https://github.com/alam00000/bentopdf/tree/ed197274e906a2d378d7c566b0de88e403321b50
- https://github.com/alam00000/bentopdf-pdfium-viewer/tree/3f6b6114b166760de18923d9e737932a5c0adbcb

模型、執行庫與字型在打包前下載，使用者執行時使用插件本地檔案。
