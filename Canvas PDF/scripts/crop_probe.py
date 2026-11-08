from pathlib import Path
from playwright.sync_api import sync_playwright
import uuid,json
R=Path(__file__).resolve().parents[1];O=R/'output/geometry';O.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080})
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>window.canvasPDF?.ready',timeout=60000);page.locator('input[type=file]').first.set_input_files(str(R/'output/fixtures/crop-rotate.pdf'));page.wait_for_function('()=>canvasPDF?.project?.name==="crop-rotate.pdf"');print('VIEW',page.evaluate('()=>({objects:canvasPDF.view.objects,transform:canvasPDF.view.transform,w:canvasPDF.view.width,h:canvasPDF.view.height})'),flush=True)
  print('RAW',page.evaluate('async()=>{const r=await canvasPDF.client.call("view",{page:0});return{paragraphs:r.paragraphs,transform:r.transform}}'),flush=True)

 finally:c.close()
