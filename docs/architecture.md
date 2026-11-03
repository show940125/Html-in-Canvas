# 架構與技術對照

Canvas Clipper 把網頁圖文整理為結構化文件和本機圖片，再將相同資料投影到閱讀桌、書本及輸出文件。畫布是呈現與互動層；來源、編輯稿、分類和關係各自保存。

## 一份資料，四種呈現

| 功能 | 實作 | 保留的能力 |
|---|---|---|
| 閱讀桌 | 真實 HTML 卡片由 `drawElementImage()` 繪入 2D Canvas，SVG 描述關係 | 原生文字輸入、選取、連結、可變框型 |
| 聚焦與磁吸 | 純版面函式產生暫態 `DropPreview`，分層描繪主題、材料與插入回饋 | 放下前預覽，取消不寫入，放下一步復原 |
| 書本閱讀 | 富文字量測分頁，再將實際 HTML 頁面上傳 WebGL 紋理 | 停穩時可選字、複製和開連結，筆記獨立保存 |
| 組圖／PDF | 組圖建立包含框型及關係 SVG 的獨立 HTML 合成樹；PDF 使用 HTML/CSS 列印 | 圖片保存視覺版面；PDF 保持可搜尋文字 |

## 磁吸版面

`computeDropPreview(project, intent)` 是沒有儲存副作用的函式。輸入是拖曳開始時的快照、選取文章、世界座標位移、游標、縮放及吸附狀態。結果包含卡片矩形、主題矩形、歸屬和插入提示。

1. 使用原始主題邊界和進出遲滯判定目標，避免框體伸縮造成抖動。
2. 依相鄰文章的邊緣決定橫向／縱向插入，保留選取塊內的相對位置。
3. 以 24px 間距開出空位，重新計算來源與目標主題範圍。
4. 沿插入方向解開局部碰撞，搬動主題時連同全部成員移動。
5. 拖曳期間只顯示結果。放下後以同一份結果一次提交，復原保留整次變更。

`outline` 決定文件章節和順序，與空間位置分別保存。

## HTML 與像素對齊

瀏覽器先排版 HTML，paint 事件再繪製快照。DPI 用於 Canvas backing store，元素目的尺寸明確採 CSS 寬高。Chrome 156 的實驗實作以回傳矩陣加上 `updateElementGeometry()` 登記命中；新實作採原生幾何更新。共用層直接探測 API 行為。

WebGL 紋理上傳優先使用預先配置的 texture 和 `texElementSubImage2D()`，以 `getElementImageDefaultSize()` 取得配置大小。Chrome 156 的舊實作回退到三參數 `texElementImage2D(TEXTURE_2D, RGBA8, element)`。

翻動中的彎曲網格不具單一平面矩陣，因此暫時清除頁面命中並設為 inert。停穩後以 CSS 座標矩陣恢復幾何；這可避免按鈕與連結在翻動時錯位。

## 真正分頁

字型及本機圖片準備完成後，使用與閱讀頁相同的字體、內容寬度和高度量測。段落過長時，以 DOM Range 和 grapheme 邊界切分，保留行內標記；清單、程式碼和圖說保留全部文字。圖片等比例縮小，圖說可接續下一頁。

分頁是派生資料，不改寫原始 RichDoc。閱讀位置保存文章 ID、內容節點路徑及文字偏移，重排時找到包含錨點的頁面。編輯期間使用平面編輯器，完成後重新排頁。

## 儲存與備份

IndexedDB 保存專案、原始／編輯稿、圖片 Blob 和偏好。圖片經格式、大小、像素數及 SHA-256 驗證。ZIP v3 保存專案、圖片及閱讀錨點；v1／v2 匯入補入預設外觀並重映射引用。整份備份驗證完成後才以單一交易寫入。

自動儲存採樂觀畫面與序列寫入。非同步重新讀取會檢查編輯世代及待寫佇列，避免以舊快照覆蓋剛完成的操作。

## 來源與參考

- [Chrome HTML-in-Canvas](https://developer.chrome.com/docs/web-platform/html-in-canvas/)
- [WebGL 紋理與幾何](https://developer.chrome.com/docs/web-platform/html-in-canvas/webgl)
- [HTML-to-Image 範例](https://html-in-canvas.dev/demos/html-to-image/)
- [Page Curl 範例](https://html-in-canvas.dev/demos/page-curl-book-turn/)

本次以 Canvas 2D 和 WebGL 2 支援具體功能。WebGPU、Worker 及大量資料最佳化留待實際工作量需要時加入。
