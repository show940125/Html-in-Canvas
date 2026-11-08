# 失控 · Canvas Runaway

**入庫狀態（2026-11-08）：v0.2.0 本機預覽版原始碼快照。** 原始碼、生成素材與測試腳本可重建；離線包保留於本機，尚未建立正式 GitHub Release 或商店發行。造型及整體動作品質仍待使用者試看，歷史驗收與限制見 [ACCEPTANCE.md](ACCEPTANCE.md)。

本系列第三個插件，v0.2.0 本機預覽版。網頁內容在原地聚成半透明的奔跑人物，身體裡疊著原來的文字與圖片；哥斯拉剪影入侵、踩出裂紋與煙塵，人群帶著內容逃跑。角色採實際生成的 GIF 影格作遮罩，保留原生 HTML-in-Canvas 的文字材質。

v0.2 修正社群貼文與留言漏抓：掃描可見文字節點，辨識 `div`、`span`、角色屬性及 X 的 `tweetText`。擷取覆蓋與角色數分開，最多 160 個內容區塊依位置聚成 16 個逃難者。

## 試玩與安裝

建置後直接開啟專案目錄的 `失控-本機預覽.html`，可離線試玩。範例終點只示範變身，保留在本機預覽。

安裝真正的 Chrome 插件：

1. 開啟 `chrome://extensions`，啟用「開發人員模式」。
2. 按「載入未封裝項目」，選擇本目錄的 `dist` 資料夾。
3. 在一般 HTTP／HTTPS 網頁點擊插件，按「開始失控」。
4. 移動滑鼠引導怪獸；可暫停、重播，按 Esc 或「恢復網頁」結束。

從 v0.1 更新：在擴充功能頁重新載入「失控」，再重新整理要演出的網頁，讓新版內容腳本生效。

要前往指定網站，先在目標網站按「把目前頁面設為終點」，回到來源網站，將結尾選成「聚成終點頁，然後前往」。動畫使用記住的固定畫面，完成後讓來源分頁前往目標網址。終點快照可在面板清除。

## 目前能力與界線

- 處理目前可見區域，最多 160 個內容區塊、16 個角色；保留原網頁的節點、表單草稿與事件。尚未載入或在畫面外的留言會留待捲動後再次啟動。
- 一般文字產生原生 HTML 紋理；圖片、SVG、Canvas 等使用可見畫面裁片。原生繪製失敗時，該區塊回退到畫面素材。
- 哥斯拉、人物與裂紋／煙塵由側欄 ChatGPT 生成真正的透明 GIF，再無損解碼成 GPU 圖集；角色原始姿勢不經程序骨架扭曲。人物步態速度跟隨移動速度，同層人物會逐漸拉開間距。
- GIF 素材只在開發時生成。插件執行時全部讀取本機素材，不再次呼叫 ChatGPT。原始 GIF 保留在 `public/assets`；原始解析度約 362–447px，放大後的細節和每圈銜接仍需人工試看。
- 背景以短暫隱藏入選區塊後的畫面製作。擷取可能出現短暫閃動；動態影片、輪播、版面變動可能讓清空前後有差異。
- 完成後停止動畫，保留紋理供重播；恢復、離開或調整視窗大小時釋放 GPU 資源並移除覆蓋層。
- 終點畫面會依來源視窗縮放。真正網站載入後，時間、廣告、登入狀態或版面尺寸可能與快照不同。
- Chrome 157 以上且支援 WebGL 2。瀏覽器內部頁面、Chrome 商店等受限制頁面無法注入演出。
- 只使用 `activeTab`、`scripting`、`storage`，無常駐網站權限、後端、API key、遠端程式碼或內容上傳。
- 終點快照留在擴充功能本機儲存區；來源快照只用於當次演出。

## 開發與驗證

Node.js 24；瀏覽器驗證使用 Python 3.14、Playwright 1.64.1 及本機 Chrome 157。

```powershell
npm ci
npm run build
npm test
python scripts/acceptance.py
python scripts/capture_acceptance.py
python scripts/asset_acceptance.py
python scripts/extension_acceptance.py
# 額外檢查使用者指定的兩個公開網站
python scripts/extension_acceptance.py --live
```

建置會產生 `dist` 與獨立離線預覽。測試啟動自己的臨時 HTTP 服務與隔離 Chrome 設定檔，完成後關閉瀏覽器及服務；證據保存在忽略追蹤的 `output` 目錄。

## 技術與設計來源

- [Chrome HTML-in-Canvas](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts)：可繪子樹、paint 與 HTML 紋理。
- [Margin Dragon](https://html-in-canvas.dev/demos/margin-dragon/)：生物與網頁內容相互作用的參考。
- [Multi-Element Composition](https://html-in-canvas.dev/demos/multi-element-composition/)：獨立部件合成。
- [True Detective 片頭創作者訪談](https://c.cdnv2.artofthetitle.com/title/true-detective/)：人物明暗與內容疊合的雙重曝光語言。

著色器、圖示、範例文章與 SVG 山景為本專案撰寫。哥斯拉剪影、人物及踩踏特效為本次透過側欄 ChatGPT 生成的素材，見 `public/assets/SOURCES.md`。未從上述參考作品擷取角色圖像或動畫；共用瀏覽器相容層沿用本專案 Apache-2.0 授權。
