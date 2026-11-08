"""Disposable-profile Chrome MV3 acceptance; original synthetic documents only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,traceback,sys,time
import pymupdf
R=Path(__file__).resolve().parents[1];O=R/('output/acceptance-dom' if '--dom' in sys.argv else 'output/acceptance');O.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];requests=[]
def check(name,value,detail=None):
 checks.append({'name':name,'passed':bool(value),'detail':detail});print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(detail or name)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging']+(['--disable-blink-features=CanvasDrawElement'] if '--dom' in sys.argv else []),viewport={'width':1550,'height':1080},accept_downloads=True)
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('CONSOLE',m.text[:350],flush=True) if m.type=='error' else None);c.on('request',lambda r:requests.append(r.url));c.on('requestfailed',lambda r:print('FETCHFAIL',r.url,r.failure,flush=True))
  page.goto(f'chrome-extension://{eid}/index.html');page.get_by_role('button',name='試用範例文件',exact=True).wait_for();page.get_by_role('button',name='試用範例文件',exact=True).click();page.wait_for_selector('.page-surface',timeout=60000)
  page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.includes("建立")');check('real MV3 document opens',page.locator('.thumb').count()==2)
  print('OBJECTS',page.evaluate('()=>canvasPDF.view.objects.map(o=>({id:o.id,kind:o.kind,x:o.x,y:o.y,w:o.width,h:o.height,text:o.text}))'),flush=True)
  check('native / DOM renderer matches requested mode',page.locator('.page-surface').get_attribute('data-renderer')==('dom' if '--dom' in sys.argv else 'native'))
  page.screenshot(path=str(O/'editor.png'));check('page has real parsed text and image',page.locator('[data-kind=text]').count()>=3 and page.locator('[data-kind=image]').count()==1)
  text=page.locator('[data-kind=text]').first;text.click();page.get_by_label('文字內容').fill('Edited Canvas PDF');page.get_by_role('button',name='套用文字',exact=True).click();page.wait_for_function('()=>canvasPDF.view.objects.some(o=>o.text?.includes("Edited Canvas PDF"))');check('existing PDF text rewritten',True)
  page.get_by_role('button',name='↶ 復原',exact=True).click();page.wait_for_function('()=>!canvasPDF.view.objects.some(o=>o.text?.includes("Edited Canvas PDF"))');page.get_by_role('button',name='↷ 重做',exact=True).click();page.wait_for_function('()=>canvasPDF.view.objects.some(o=>o.text?.includes("Edited Canvas PDF"))');check('undo and redo across PDF snapshots',True)
  page.get_by_role('button',name='T 文字',exact=True).wait_for();page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")');image=page.locator('[data-kind=image]').first;image.click();page.wait_for_selector('[data-kind=image].selected');box=image.bounding_box();before=page.evaluate('()=>canvasPDF.view.objects.find(o=>o.kind==="image").x');page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(box['x']+80,box['y']+50,steps=10);page.mouse.up();page.wait_for_function('(x)=>canvasPDF.view.objects.find(o=>o.kind==="image").x>x+40',arg=before);check('native pointer moves source image',True)
  page.get_by_role('button',name='輸出',exact=True).click()
  with page.expect_download(timeout=60000) as d:page.get_by_role('button',name='下載編輯後 PDF',exact=True).click()
  d.value.save_as(str(O/'edited.pdf'));doc=pymupdf.open(O/'edited.pdf');txt=doc[0].get_text();check('independent renderer extracts replacement text','Edited Canvas PDF' in txt,txt[:500]);check('old text removed from extraction','Canvas PDF\n' not in txt.replace('Edited Canvas PDF',''))
  page.get_by_role('button',name='下一頁 →',exact=True).click();page.wait_for_function('()=>canvasPDF.view.page===1');page.get_by_role('button',name='OCR',exact=True).click();page.get_by_role('button',name='辨識目前頁面',exact=True).click();page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.includes("準備 OCR")&&!document.querySelector(".statusbar").innerText.includes("偵測文字")&&!document.querySelector(".statusbar").innerText.includes("載入本機")',timeout=180000)
  print('OCR STATUS',page.locator('.statusbar').inner_text(),page.locator('[role=alert]').all_text_contents(),flush=True);page.wait_for_function('()=>canvasPDF.project.scans.length>0',timeout=300000);check('real bundled PP-OCRv6 small OCR',True)
  page.get_by_role('button',name='OCR',exact=True).click();page.screenshot(path=str(O/'ocr.png'));check('effective CPU threads recorded',bool(page.locator('.runtime').inner_text()),page.locator('.runtime').inner_text());check('no remote OCR or code requests',not any(u.startswith('http') for u in requests),[u for u in requests if u.startswith('http')])
  page.get_by_role('button',name='輸出',exact=True).click()
  with page.expect_download(timeout=60000) as d:page.get_by_role('button',name='原圖＋搜尋文字 PDF',exact=True).click()
  d.value.save_as(str(O/'searchable.pdf'));doc=pymupdf.open(O/'searchable.pdf');check('OCR searchable PDF has text on image page',len(doc[1].get_text().strip())>15,doc[1].get_text()[:700]);check('no uncaught UI errors',not errors,errors)
 except Exception as e:
  errors.append(traceback.format_exc());print(errors[-1],flush=True);page.screenshot(path=str(O/'failure.png'))
 finally:
  (O/'acceptance.json').write_text(json.dumps({'checks':checks,'errors':errors,'browser':c.browser.version,'requests':requests},ensure_ascii=False,indent=2),encoding='utf8');c.close()
sys.exit(1 if errors or any(not x['passed'] for x in checks) else 0)
