from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,traceback
R=Path(__file__).resolve().parents[1];O=R/'output/ocr';O.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080})
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.on('console',lambda m:print(m.type,m.text[:600],flush=True));page.on('pageerror',lambda e:print('ERROR',e.stack,flush=True));c.on('requestfailed',lambda r:print('FETCHFAIL',r.url,r.failure,flush=True));c.on('request',lambda r:print('LOAD',r.url,flush=True) if r.url.endswith(('.mjs','.js','.wasm','.tar')) else None);page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>window.canvasPDF?.ready',timeout=60000)
  page.evaluate('async()=>{await canvasPDF.open(await canvasPDF.demoPdf(),"OCR fixture.pdf");}');page.get_by_role('button',name='下一頁 →',exact=True).click();page.wait_for_function('()=>canvasPDF.view.page===1');page.get_by_role('button',name='OCR',exact=True).click()
  page.get_by_role('button',name='辨識目前頁面',exact=True).click();page.wait_for_function('()=>canvasPDF.project.jobs.some(j=>j.kind==="ocr"&&j.status!=="submitted")',timeout=300000);print('RESULT',page.evaluate('()=>({jobs:canvasPDF.project.jobs,scans:canvasPDF.project.scans})'),flush=True);page.screenshot(path=str(O/'ocr.png'));(O/'result.json').write_text(json.dumps(page.evaluate('()=>({jobs:canvasPDF.project.jobs,scans:canvasPDF.project.scans})'),ensure_ascii=False,indent=2),encoding='utf8')
 finally:c.close()
