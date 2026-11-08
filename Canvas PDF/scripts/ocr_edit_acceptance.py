"""Exercise actual pointer editing after whole-page OCR, not just OCR inference."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,sys,traceback
import pymupdf
R=Path(__file__).resolve().parents[1];probe='--probe' in sys.argv;dom='--dom' in sys.argv
extension=Path(sys.argv[sys.argv.index('--extension')+1]) if '--extension' in sys.argv else R/'dist'
O=R/'output'/('ocr-edit-probe' if probe else 'ocr-edit-dom' if dom else 'ocr-edit');O.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,ok,detail=None):
 checks.append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,detail or '',flush=True)
 if not ok and not probe:raise AssertionError(name)
def idle(page):page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")')
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging']+(['--disable-blink-features=CanvasDrawElement'] if dom else []),viewport={'width':1550,'height':1080},accept_downloads=True)
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(extension)})['id'];page=c.new_page();c.set_offline(True);page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>window.canvasPDF?.ready',timeout=60000);page.evaluate('async()=>await canvasPDF.open(await canvasPDF.demoPdf(),"OCR edit.pdf")');page.wait_for_selector('[data-kind=text]')
  check('requested renderer active',page.locator('.page-surface').get_attribute('data-renderer')==('dom' if dom else 'native'))
  first=page.locator('[data-kind=text]').first;original=page.evaluate('()=>canvasPDF.view.objects.find(o=>o.kind==="text")');first_id=first.get_attribute('data-object')
  page.get_by_role('button',name='翻譯',exact=True).click();first.click();check('click reveals selected native text in right inspector',page.get_by_label('文字內容').input_value()==original['text'])
  first.dblclick();page.locator('.inline-editor').wait_for();check('native text double-click opens inline editor',page.locator('.inline-editor').count()==1)
  revision=page.evaluate('()=>canvasPDF.project.revision');page.locator('.inline-editor').fill('不應保存的取消內容');page.keyboard.press('Escape');check('Escape cancels without saving',page.evaluate('()=>canvasPDF.project.revision')==revision and page.get_by_label('文字內容').input_value()==original['text'])
  first.dblclick();page.locator('.inline-editor').fill('原生段落已修改');page.keyboard.press('Control+Enter');idle(page)
  check('native text edit retains selection and inspector',page.get_by_label('文字內容').input_value()=='原生段落已修改' and page.locator('[data-object="'+first_id+'"]').count()==1)
  page.get_by_role('button',name='下一頁 →',exact=True).click();idle(page);page.get_by_role('button',name='OCR',exact=True).click();page.get_by_role('button',name='辨識目前頁面',exact=True).click();page.wait_for_function('()=>canvasPDF.project.jobs.some(j=>j.kind==="ocr"&&j.status!=="submitted")',timeout=180000);idle(page)
  check('whole-page real OCR creates five editable candidates',page.locator('[data-kind=scan]').count()==5)
  check('whole-page OCR automatically fills right text inspector',bool(page.get_by_label('文字內容').input_value()))
  page.get_by_role('button',name='OCR',exact=True).click();page.get_by_label('校正原文',exact=True).fill('僅校正搜尋文字');page.get_by_role('button',name='套用校正',exact=True).click();idle(page)
  check('search-only correction preserves original image mode',page.evaluate('()=>canvasPDF.project.scans[0].mode')=='search' and page.locator('.scan-preview').count()==0)
  block=page.locator('[data-kind=scan]').first;block.click();check('click OCR box reveals right editable text',page.get_by_label('文字內容').input_value()=='僅校正搜尋文字')
  block.dblclick();page.locator('.inline-editor').wait_for();check('OCR double-click opens inline editor',page.locator('.inline-editor').count()==1)
  if page.locator('.inline-editor').count():
   page.locator('.inline-editor').fill('更正後的掃描文字');page.keyboard.press('Control+Enter');idle(page)
  else:
   block.click();page.get_by_role('button',name='編輯',exact=True).click();page.get_by_label('文字內容').fill('更正後的掃描文字');page.get_by_role('button',name='套用文字',exact=True).click();idle(page)
  state=page.evaluate('()=>({block:canvasPDF.project.scans[0],preview:document.querySelectorAll(".scan-preview").length,alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.innerText)})');check('editing scan text reconstructs visible PDF text',state['block']['mode']=='rebuild' and state['block']['source']=='更正後的掃描文字' and state['preview']>0,state)
  page.get_by_role('button',name='↶ 復原',exact=True).click();idle(page);check('one undo restores search correction before visible edit',page.evaluate('()=>canvasPDF.project.scans[0].mode==="search"&&canvasPDF.project.scans[0].source==="僅校正搜尋文字"'))
  page.get_by_role('button',name='↷ 重做',exact=True).click();idle(page);check('redo restores visible OCR edit',page.evaluate('()=>canvasPDF.project.scans[0].mode==="rebuild"&&canvasPDF.project.scans[0].source==="更正後的掃描文字"'))
  page.get_by_role('button',name='OCR',exact=True).click();revision=page.evaluate('()=>canvasPDF.project.revision');page.once('dialog',lambda d:d.dismiss());page.get_by_role('button',name='辨識目前頁面',exact=True).click();check('cancel rerun preserves corrected OCR without submitting',page.evaluate('()=>canvasPDF.project.revision')==revision and page.evaluate('()=>canvasPDF.project.scans[0].source')=='更正後的掃描文字')
  page.screenshot(path=str(O/'edited.png'))
  if not probe:
   page.get_by_role('button',name='輸出',exact=True).click()
   with page.expect_download(timeout=120000) as dl:page.get_by_role('button',name='下載編輯後 PDF',exact=True).click()
   dl.value.save_as(str(O/'edited.pdf'));pdf=pymupdf.open(O/'edited.pdf');check('independent reopen extracts changed scan text','更正後的掃描文字' in pdf[1].get_text());check('independent reopen native edit removes old paragraph','原生段落已修改' in pdf[0].get_text() and original['text'] not in pdf[0].get_text())
   page.get_by_role('button',name='← 上一頁',exact=True).click();idle(page)
   page.get_by_role('button',name='OCR',exact=True).click();page.get_by_role('button',name='整頁強制辨識（含既有文字）',exact=True).click();idle(page)
   check('forced whole-page OCR creates editable candidates over native text',page.locator('[data-kind=scan]').count()>0 and bool(page.get_by_label('文字內容').input_value()))
   page.get_by_role('button',name='輸出',exact=True).click()
   with page.expect_download(timeout=120000) as dl:page.get_by_role('button',name='原圖＋搜尋文字 PDF',exact=True).click()
   dl.value.save_as(str(O/'native-search.pdf'));d=pymupdf.open(O/'native-search.pdf');check('native search output avoids duplicate OCR text',d[0].get_text().count('把文件，變成可以編輯的畫布。')==1)
   page.locator('[data-kind=scan]').first.click();page.get_by_label('文字內容').fill('區域辨識修改');page.get_by_role('button',name='套用文字',exact=True).click();idle(page)
   page.get_by_role('button',name='輸出',exact=True).click();page.get_by_role('button',name='下載編輯後 PDF',exact=True).click();idle(page)
   check('native OCR replacement export explains required flattening','點陣化' in page.get_by_role('alert').inner_text())
   with page.expect_download(timeout=120000) as dl:page.get_by_role('button',name='整頁點陣化 PDF（文字變圖片）',exact=True).click()
   dl.value.save_as(str(O/'native-flattened.pdf'));d=pymupdf.open(O/'native-flattened.pdf');check('explicit raster fallback exports without old searchable native text',len(d)==2 and not d[0].get_text().strip() and len(d[0].get_images())>0)
 except Exception:checks.append({'name':'exception','passed':False,'detail':traceback.format_exc()});print(checks[-1]['detail'],flush=True);page.screenshot(path=str(O/'failure.png'));(O/'failure-state.json').write_text(json.dumps(page.evaluate('()=>({inspector:document.querySelector(".inspector")?.innerText,project:canvasPDF.project.scans,view:canvasPDF.view.objects.map(o=>({id:o.id,text:o.text}))})'),ensure_ascii=False,indent=2),encoding='utf8')
 finally:(O/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8');c.close()
sys.exit(0 if probe or all(x['passed'] for x in checks) else 1)
