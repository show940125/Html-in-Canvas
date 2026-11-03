# 開發與貢獻

Node.js 24、Python 3.14。從 repo 根目錄執行：

```sh
npm --prefix "Canvas Clipper" ci
npm --prefix "Canvas Clipper" test
npm --prefix "Canvas Clipper" run build
```

瀏覽器驗收使用 Python Playwright。Windows 專案可建立自己的 `.venv`，安裝 `Canvas Clipper/requirements-test.txt`。瀏覽器選擇順序為 `CHROME_BIN`、已安裝 Chrome、Playwright 的完整 Chromium。後者先執行 `python -m playwright install chromium`。

```sh
cd "Canvas Clipper"
python scripts/v03_acceptance.py
python scripts/v03_deep_acceptance.py
python scripts/compatibility_acceptance.py
python scripts/workload_acceptance.py
python scripts/migration_acceptance.py
python scripts/extension_acceptance.py
```

圖片來源權限是需要原生授權的 headed 測試：

```sh
python scripts/image_permission_acceptance.py
```

測試會開啟隔離 Chrome，僅使用合成材料及本機圖片。若瀏覽器顯示來源授權提示，確認來源為該次測試的本機來源後再允許。後續自動驗證實際下載、離線重開及 SVG 拒絕。

遷移測試預設自行建立 v1 資料庫與唯讀匯出頁。若要驗證自己保留的舊安裝，可設定 `CLIPPER_LEGACY_DIR`；測試仍使用隔離設定檔。測試輸出全部放在 git 忽略的 output。

## 系列邊界

每個插件擁有自己的 package、資料模型、測試和版本。共用程式只收納實際重用的 Canvas API 能力。新增插件前先建立自己的目錄和文件，避免提前擴張共同框架。

新增繪製效果須同時驗證原生命中、文字選取、DPI、無障礙狀態、閒置重繪及備援。視覺呈現不能代替資料保存或實際功能驗收。

## 公開與發布

使用 Apache-2.0，保留第三方授權。提交前確認沒有設定檔、摘錄、備份、私鑰或個人路徑。發布 ZIP 只包含 dist；保留固定 manifest 公開 key。每個 release 附 SHA-256、版本與驗收摘要。
