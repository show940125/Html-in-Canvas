from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid
R=Path(__file__).resolve().parents[1];O=R/'output';O.mkdir(exist_ok=True)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1000})
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page()
  page.on('pageerror',lambda e:print('PAGEERROR',str(e),flush=True));page.on('console',lambda m:print(m.type,m.text[:350],flush=True) if m.type=='error' else None)
  c.on('requestfailed',lambda r:print('REQUESTFAILED',r.url,r.failure,flush=True))
  page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>document.body.innerText.includes("已準備好")||document.body.innerText.includes("Error")',timeout=60000)
  print('BODY',page.locator('body').inner_text()[:2000],flush=True)
  result=page.evaluate('async()=>{await document.fonts.ready;const r=await canvasPDF.client.call("open",{bytes:await canvasPDF.demoPdf(),page:0});return {...r,image:null};}')
  (O/'probe.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=True)[:15000],flush=True)
 finally:c.close()
