# Html in Canvas

以真實、可操作的 HTML 建立 Canvas 應用的開源插件系列。

**A collection of practical HTML-in-Canvas browser extensions and annotated examples.** Live DOM, native text input and accessible content, composed through Canvas 2D and WebGL.

## 第一個插件：Canvas Clipper

收集網頁圖文、並排閱讀、主題分類、標籤、關係連線、完整本機備份及可搜尋 PDF。

目前公開的是 **v0.2 開發基線**。原生圖片來源授權的端到端驗收尚未完成，完整 v0.3 正在開發。

- `Canvas Clipper/`：插件原始碼、測試與建置工具。
- `shared/`：通用能力探測、繪製及互動座標相容層。
- `examples/`：可獨立執行的技術範例。
- `docs/`：架構、相容性與開發說明。

## 開發

Node.js 24，Python 3.14 用於瀏覽器驗收。

```sh
npm --prefix "Canvas Clipper" ci
npm --prefix "Canvas Clipper" test
npm --prefix "Canvas Clipper" run build
```

在 Chrome 的擴充功能頁開啟開發人員模式，以「載入未封裝項目」選擇 `Canvas Clipper/dist`。資料存於使用中的瀏覽器設定檔；更新或移除前先匯出備份。

Chrome 156 需啟用 `canvas-draw-element` 實驗功能。程式依實際 API 能力探測；一般 HTML 模式提供閱讀、編輯及列印。

## 授權

原創程式使用 [Apache-2.0](LICENSE)。依賴及參考素材保留各自授權，見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本專案為獨立社群應用。
