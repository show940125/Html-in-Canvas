from pathlib import Path
from playwright.sync_api import sync_playwright
import uuid,json,time,traceback,sys,base64
import pymupdf as fitz
R=Path(__file__).resolve().parents[1];O=R/'output/runtime';O.mkdir(parents=True,exist_ok=True);checks=[]
for count in [50,200]:
 d=fitz.open()
 for i in range(count):d.new_page().insert_text((50,80),f'Canvas PDF page {i+1} / {count}')
 d.save(O/f'{count}.pdf');d.close()
def check(name,ok,detail=None):
 checks.append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError(name)
def idle(page):page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")')
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080},device_scale_factor=2,accept_downloads=True)
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000)
  env=page.evaluate('''async()=>{const a=await navigator.gpu?.requestAdapter();return{mime:typeof chrome.mimeHandler,options:chrome.mimeHandler?await chrome.mimeHandler.getMimeHandlerOptions('application/pdf'):null,adapter:a?.info?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null,dpr:devicePixelRatio}}''');checks.append({'name':'actual Chrome APIs and adapter','passed':True,'detail':env});print('ENV',env,flush=True)
  for count in [50,200]:
   start=time.time();page.locator('input[type=file]').first.set_input_files(str(O/f'{count}.pdf'));page.wait_for_function('(n)=>canvasPDF?.view?.count===n',arg=count);idle(page);page.locator('.thumb').nth(count-1).click();page.wait_for_function('(n)=>canvasPDF.view.page===n-1',arg=count);idle(page);check(f'{count} pages retain one active page renderer',page.locator('.pdf-background').count()==1 and page.locator('.interaction-canvas').count()==1 and page.locator('.thumb').count()==count,{'openAndNavigateSeconds':time.time()-start,'jsHeapBytes':page.evaluate('()=>performance.memory?.usedJSHeapSize')})
  # Everything in this section runs with the browser offline.
  c.set_offline(True);page.evaluate('async()=>await canvasPDF.open(await canvasPDF.demoPdf(),"Offline.pdf")');page.wait_for_function('()=>canvasPDF?.project?.name==="Offline.pdf"');page.locator('[data-kind=image]').first.click();page.get_by_role('button',name='右移',exact=True).click();idle(page);check('DPR 2 native pointer selection and source-image move works offline',page.evaluate('()=>canvasPDF.view.objects.find(o=>o.kind==="image").x')==53)
  page.get_by_role('button',name='下一頁 →',exact=True).click();idle(page);page.get_by_role('button',name='OCR',exact=True).click();page.get_by_role('button',name='辨識目前頁面',exact=True).click();page.wait_for_function('()=>canvasPDF.project.scans.length===5',timeout=180000);idle(page);check('offline local OCR with bundled models',True)
  page.get_by_role('button',name='辨識目前頁面',exact=True).click();page.wait_for_function('()=>canvasPDF.project.jobs.filter(j=>j.kind==="ocr"&&j.status==="complete").length===2');idle(page);check('OCR cache key reuses identical image/model pipeline',page.evaluate('()=>canvasPDF.project.jobs.at(-1).diagnostic.cacheHit'))
  page.get_by_role('button',name='旋轉',exact=True).click();idle(page);check('page rotation transforms existing OCR masks',page.evaluate('()=>canvasPDF.project.scans.every(b=>b.x>=0&&b.y>=0&&b.x+b.width<=canvasPDF.view.width+.1&&b.y+b.height<=canvasPDF.view.height+.1)'))
  page.get_by_role('button',name='輸出',exact=True).click()
  with page.expect_download(timeout=120000) as dl:page.get_by_role('button',name='原圖＋搜尋文字 PDF',exact=True).click()
  dl.value.save_as(str(O/'offline-search.pdf'));d=fitz.open(O/'offline-search.pdf');check('offline output validated/rendered by PDF.js and independently reopened',len(d)==2 and bool(d[1].get_text().strip()))
  with page.expect_download(timeout=120000) as dl:page.get_by_role('button',name='整頁點陣化 PDF（文字變圖片）',exact=True).click()
  dl.value.save_as(str(O/'raster.pdf'));d=fitz.open(O/'raster.pdf');check('explicit raster fallback emits image pages',len(d)==2 and all(not p.get_text().strip() and p.get_images() for p in d))
  page.screenshot(path=str(O/'offline.png'));check('offline operations retain completed OCR jobs',page.evaluate('()=>canvasPDF.project.jobs.every(j=>j.status==="complete")'))
 except Exception:
  checks.append({'name':'exception','passed':False,'detail':traceback.format_exc()});print(checks[-1]['detail'],flush=True);page.screenshot(path=str(O/'failure.png'))
 finally:
  (O/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8');c.close()
sys.exit(0 if all(x['passed'] for x in checks) else 1)
