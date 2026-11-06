# 內容查證與素材

查證日期：2026-11-04。下列來源支持營養敘述；不把營養素的正常生理功能擴張為補充劑的治療效果。

1. [NIH Office of Dietary Supplements — Vitamin C: Consumer](https://ods.od.nih.gov/factsheets/VitaminC-Consumer/)
   - 支持抗氧化、膠原蛋白、植物性非血基質鐵吸收與免疫系統正常功能。
   - 提供常見食物來源，以及儲存／烹煮可能降低維他命 C 的資訊。
   - 用於第 1、3、5 頁。
2. [MedlinePlus — Vitamin C](https://medlineplus.gov/ency/article/002404.htm)
   - 支持膠原蛋白、結締組織、傷口癒合與鐵吸收等描述。
   - 用於第 2 頁及相關講者提詞。
3. [NIH Office of Dietary Supplements — Dietary Supplements for Immune Function and Infectious Diseases: Consumer](https://ods.od.nih.gov/factsheets/Immunefunction-Consumer/)
   - 區分一般生理功能與感冒相關研究。
   - 規律補充可能稍微縮短病程；感冒後才開始服用，效益不明確。
   - 用於第 4 頁。
4. [MedlinePlus — Vitamin C and colds](https://medlineplus.gov/ency/article/002145.htm)
   - 作為感冒相關敘述的交叉查核。

本簡報未提供個人化劑量，也未宣稱預防癌症、保證抗老、美白或治療感冒。食品份量與實際含量會依品種、保存及料理方式變動。

## 圖片

- `images/vitamin-c-fruits.png`：AI 生成蔬果靜物攝影，16:10，1586 × 992。
- `images/everyday-plate.png`：AI 生成日常餐盤攝影，16:10，1586 × 992。
- 照片無文字；全部簡報標題、內文、數字、圖說及流程為 HTML。
- 原始生成圖留在本機生成資料夾，專案內保存獨立副本。

## 設計與 runtime

- 使用風格 A 雜誌版型：M01、M04、M03、M09、M06。
- 主題 `forest-ink`；保留固定模板的 CSS token，新增少量此簡報專用樣式。
- Motion 與 Lucide 使用 Canvas Slides 已打包的離線版本；講者 runtime 使用本機 presenter 模板快照。
- 講者備註依 `data-slide-id` 保存，沒有設定自動翻頁或虛構現場時長。
