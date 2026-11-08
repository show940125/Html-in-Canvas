"""Original reproducible fixtures; known synthetic text is not human real-document gold."""
from pathlib import Path
import json,hashlib,shutil
import pymupdf as fitz
R=Path(__file__).resolve().parents[1];O=R/'output/fixtures';O.mkdir(parents=True,exist_ok=True)
font=str(R/'public/fonts/NotoSansCJKtc-Regular.otf')
for name in ['ocr-frozen-40.pdf','ocr-frozen-40.json']:shutil.copyfile(R/'benchmarks'/name,O/name)
manifest=json.loads((O/'ocr-frozen-40.json').read_text(encoding='utf8'));gold=manifest['pages']
assert hashlib.sha256((O/'ocr-frozen-40.pdf').read_bytes()).hexdigest()==manifest['sha256']
for name in ['native','crop-rotate','encrypted']:
 d=fitz.open();p=d.new_page(width=595,height=842);p.insert_font(fontname='noto',fontfile=font);p.insert_text((60,120),'繁體中文 PDF 測試。金額：100000 元。',fontname='noto',fontsize=16);p.insert_text((60,180),'Original editable paragraph.',fontsize=14)
 if name=='crop-rotate':p.set_cropbox(fitz.Rect(20,30,570,810));p.set_rotation(90)
 if name=='encrypted':d.save(O/(name+'.pdf'),encryption=fitz.PDF_ENCRYPT_AES_256,owner_pw='owner-fixture',user_pw='user-fixture',permissions=fitz.PDF_PERM_MODIFY|fitz.PDF_PERM_COPY|fitz.PDF_PERM_PRINT)
 else:d.save(O/(name+'.pdf'))
 d.close()
print('frozen',len(gold),'pages',manifest['sha256'])
