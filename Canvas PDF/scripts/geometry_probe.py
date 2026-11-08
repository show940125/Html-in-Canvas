from pathlib import Path
from playwright.sync_api import sync_playwright
import uuid,json
R=Path(__file__).resolve().parents[1];O=R/'output/geometry';O.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080})
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>window.canvasPDF?.ready',timeout=60000);page.evaluate('async()=>await canvasPDF.open(await canvasPDF.demoPdf(),"Geometry.pdf")');page.wait_for_selector('[data-kind=image]')
  page.evaluate('()=>{window.pointerEvents=[];for(const name of ["pointerdown","pointerup"])document.addEventListener(name,e=>pointerEvents.push({name,target:e.target.outerHTML.slice(0,150),x:e.clientX,y:e.clientY}));}')
  page.locator('[data-kind=image]').first.click();print('CLICK',page.evaluate('()=>({events:pointerEvents,last:document.querySelector(".page-surface").dataset,sel:document.querySelectorAll(".selected").length})'),flush=True)
  box=page.locator('[data-kind=image]').bounding_box();print('BOX',box,'SURFACE',page.locator('.page-surface').bounding_box(),flush=True)
  page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(box['x']+80,box['y']+50,steps=10);page.mouse.up()
  print('DRAG',page.evaluate('()=>({events:pointerEvents,last:document.querySelector(".page-surface").dataset,sel:document.querySelectorAll(".selected").length,objects:canvasPDF.view.objects.filter(o=>o.kind==="image"),status:document.querySelector(".statusbar").innerText})'),flush=True);page.screenshot(path=str(O/'drag.png'))
 finally:c.close()
