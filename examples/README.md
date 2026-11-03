# 獨立技術範例

先在 repo 根目錄建置插件（同時產生共用 runtime）：

```sh
npm --prefix "Canvas Clipper" ci
npm --prefix "Canvas Clipper" run build
python -m http.server 4311 --bind 127.0.0.1 --directory examples
```

開啟 `http://127.0.0.1:4311/`。每個 HTML 均有附註原始碼；無 CDN、帳號或網路素材依賴。

1. **interactive-dom.html**：paint 排程、明確 CSS 尺寸、DPI 與原生輸入幾何。
2. **composition-export.html**：將 HTML 與 SVG 放入相同合成樹，再以 toBlob 匯出。
3. **book-turn.html**：共用紋理上傳、細分彎曲網格、雙面紋理與翻動期間的命中清理。

API 不支援時會顯示狀態。這些範例使用與插件相同的相容層；插件本身另提供完整平面閱讀備援。
