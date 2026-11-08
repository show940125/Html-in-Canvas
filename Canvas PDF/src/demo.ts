import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
export async function demoPdf() {
  const d = await PDFDocument.create();
  d.registerFontkit(fontkit);
  const f = await d.embedFont(
    await (
      await fetch(new URL("fonts/NotoSansCJKtc-Regular.otf", location.href))
    ).arrayBuffer(),
    { subset: false },
  );
  const latin = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([595, 842]);
  p.drawText("Canvas PDF", {
    x: 48,
    y: 770,
    size: 30,
    font: latin,
    color: rgb(0.12, 0.28, 0.26),
  });
  p.drawText("把文件，變成可以編輯的畫布。", {
    x: 48,
    y: 720,
    size: 20,
    font: f,
  });
  p.drawText(
    "這是一份本機範例。你可以修改這段文字，移動圖片，\n重新安排內容，再輸出可搜尋的 PDF。",
    { x: 48, y: 660, size: 14, font: f, lineHeight: 24 },
  );
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 180;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#dce9dd";
  cx.fillRect(0, 0, 360, 180);
  for (let i = 0; i < 5; i++) {
    cx.fillStyle = ["#aac4af", "#6c9580", "#335e4b"][i % 3];
    cx.fillRect(28 + i * 60, 150 - i * 22, 38, 30 + i * 22);
  }
  const img = await d.embedPng(c.toDataURL());
  p.drawImage(img, { x: 48, y: 360, width: 300, height: 150 });
  p.drawText("選取圖片後，試著拖到右邊。", {
    x: 48,
    y: 325,
    size: 12,
    font: f,
  });
  const s = document.createElement("canvas");
  s.width = 1190;
  s.height = 1684;
  const sc = s.getContext("2d")!;
  sc.fillStyle = "#fff";
  sc.fillRect(0, 0, s.width, s.height);
  sc.fillStyle = "#203b31";
  sc.font = '48px "Canvas TC"';
  sc.fillText("掃描頁辨識與編輯", 100, 150);
  sc.font = '32px "Canvas TC"';
  [
    "這一頁的文字是圖片，需要先執行 OCR。",
    "請校正原文，選擇區域重建或保留原圖。",
    "The appeal shall be dismissed.",
    "日期：2026年11月7日　金額：新臺幣十萬元",
  ].forEach((t, i) => sc.fillText(t, 100, 260 + i * 70));
  const si = await d.embedPng(s.toDataURL());
  d.addPage([595, 842]).drawImage(si, { x: 0, y: 0, width: 595, height: 842 });
  return d.save();
}
