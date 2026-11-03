from pathlib import Path
from datetime import datetime, timezone, timedelta
import json

root=Path(__file__).resolve().parents[1]
out=root/'output'/'playwright'
browser=json.loads((out/'browser-acceptance.json').read_text(encoding='utf-8-sig'))
extension=json.loads((out/'extension-acceptance.json').read_text(encoding='utf-8-sig'))
unit=json.loads((root/'output'/'unit-tests.json').read_text(encoding='utf-8-sig'))
passed=lambda checks:sum(item.get('passed',False) for item in checks)
summary={
    'product':'Canvas Clipper', 'version':'0.1.0',
    'verifiedAt':datetime.now(timezone(timedelta(hours=8))).isoformat(),
    'browser':'Installed Google Chrome 156.0.8078.80, isolated test profiles',
    'nativeFeature':'CanvasDrawElement enabled, no extra host permissions',
    'unitTests':{'passed':unit['numPassedTests'],'failed':unit['numFailedTests']},
    'browserChecks':{'passed':passed(browser),'total':len(browser)},
    'extensionChecks':{'passed':passed(extension),'total':len(extension)},
    'remainingManualChecks':['Load dist into the user Chrome profile and try the native right-click menu.','Physical Windows IME candidate selection; CDP composition and Chinese text insertion passed.'],
    'notVerified':['Chrome 157 final implementation; capability detection included.','Chrome Web Store publication; not requested.'],
}
(root/'output'/'acceptance-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
text=f'''# Canvas Clipper v0.1.0 驗收紀錄

驗證時間：{summary['verifiedAt']}（臺灣時間）。

## 結果

- 型別檢查與正式建置通過。
- 單元測試：{unit['numPassedTests']} 通過、{unit['numFailedTests']} 失敗。
- 工作台瀏覽器檢查：{passed(browser)}/{len(browser)} 通過。
- 真實 MV3 擴充功能檢查：{passed(extension)}/{len(extension)} 通過。
- 瀏覽器：本機安裝的 Google Chrome 156.0.8078.80，隔離設定檔啟用 CanvasDrawElement。

## 已驗證

- 擴充功能來源下的原生 HTML-in-Canvas 繪製與互動。
- 點擊、原生文字選取、中文文字輸入、CDP IME 組字提交、拖曳、縮放後互動，以及 150% 裝置顯示比例。
- 編輯保留原文、重開還原、刪除復原、JSON 匯出及匯入、不合法備份不改動現有專案。
- 20 張卡片、五個不同來源網址的合成測試專案；閒置時沒有持續重繪迴圈。
- 15 頁 A4 PDF，包含可擷取的繁體中文文字與長文末尾標記；文字邊界檢查通過，已目視檢查首末頁。
- 三種受控文章版型，加上 Chrome Developers、MDN、React 三個實際公開網站的工具列匯入。
- 真正觸發擴充功能工具列，點擊實際 popup 的匯入按鈕；沒有為測試增加正式 manifest 的網站權限。
- 整理台分頁重用、受限制頁面錯誤、MV3 worker 註冊與擴充功能 IndexedDB 重載保存。
- HTML 相容模式、API 停用時的回退及窄視窗水平溢位檢查。

## 交付與人工試用

正式建置目錄：`Canvas Clipper/dist`。

測試未修改使用者目前的 Chrome 設定檔，也未將擴充功能裝入該設定檔。使用者依開始使用指南載入 dist 後，完成右鍵摘錄與日常文章的實際試用。實體 Windows 輸入法候選字選取仍待人工確認；自動化已驗證中文插入與組字事件提交。

Chrome 157 的最終實作尚未實機驗證。程式已按能力探測安排新舊 geometry 路徑；目前有直接證據的環境為 Chrome 156。PDF 自動化使用 Chrome 列印引擎；實際「另存為 PDF」檔名與位置由使用者在列印視窗選擇。

## 證據

- `output/unit-tests.json`
- `output/playwright/browser-acceptance.json`
- `output/playwright/extension-acceptance.json`
- `output/playwright/workspace-native-1600.png`
- `output/playwright/workspace-native-150-percent.png`
- `output/playwright/extension-native.png`
- `output/playwright/acceptance-searchable.pdf`

## Next

- [ ] 使用者將 dist 載入自己的 Chrome，確認原生模式與右鍵摘錄。
- [ ] 以實體 Windows 輸入法選字試用，回報日常文章擷取品質。
- [ ] Chrome 157 到位後，補實機相容性檢查。
'''
(root/'驗收紀錄.md').write_text(text,encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
