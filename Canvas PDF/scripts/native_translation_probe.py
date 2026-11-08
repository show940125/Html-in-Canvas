"""One real Chrome language-pack translation, using original synthetic public text."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import uuid,json,traceback,sys
R=Path(__file__).resolve().parents[1];O=R/'output/native-translation';O.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions','--disable-component-update','--disable-background-networking'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080})
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000);page.locator('input[type=file]').first.set_input_files(str(R/'output/fixtures/native.pdf'));page.wait_for_function('()=>canvasPDF?.project?.name==="native.pdf"');page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")');page.evaluate('()=>canvasPDF.setSelection([canvasPDF.view.objects.find(o=>o.text?.startsWith("Original")).id])');page.get_by_role('button',name='翻譯',exact=True).click();page.get_by_label('術語與固定譯名').fill('Original＝原始') if '--glossary' in sys.argv else None;page.get_by_role('button',name='開始翻譯',exact=True).click()
  try:page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")',timeout=180000)
  except Exception:pass
  result=page.evaluate('()=>({translations:canvasPDF.project.translations,jobs:canvasPDF.project.jobs,status:document.querySelector(".statusbar").innerText,errors:[...document.querySelectorAll("[role=alert]")].map(e=>e.innerText)})');(O/('glossary.json' if '--glossary' in sys.argv else 'result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(result,flush=True)
 finally:c.close()
