from browser_support import chrome_launch_options,software_args
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import json,traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'Canvas Clipper'/'output'/'v03'/'examples';OUT.mkdir(parents=True,exist_ok=True);checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,passed,detail=None):
 checks.append(dict(name=name,passed=bool(passed),detail=detail));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
def click(page,loc):
 box=loc.bounding_box();page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'examples')));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement']+software_args());page=browser.new_page(viewport={'width':1280,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(base+'/interactive-dom.html');page.wait_for_load_state('networkidle');page.wait_for_function('()=>document.querySelector("#status").textContent.includes("原生")');click(page,page.get_by_label('題目',exact=True));page.keyboard.press('Control+A');page.keyboard.insert_text('範例中的中文輸入');click(page,page.get_by_role('button',name='留下想法',exact=False));check('standalone DOM example has live input and submit',page.get_by_label('題目',exact=True).input_value()=='範例中的中文輸入' and page.locator('#count').inner_text()=='1');page.screenshot(path=str(OUT/'interactive-dom.png'))
   page.goto(base+'/composition-export.html');page.wait_for_load_state('networkidle');page.wait_for_function('()=>document.querySelector("#status").textContent.includes("SVG")')
   with page.expect_download() as download:page.get_by_role('button',name='下載 PNG',exact=True).click()
   target=OUT/'composition.png';download.value.save_as(target);check('standalone composition exports real PNG',target.stat().st_size>5000)
   page.goto(base+'/book-turn.html');page.wait_for_load_state('networkidle');page.wait_for_function('()=>document.querySelector("#status").textContent.includes("WebGL HTML")');click(page,page.get_by_label('第一頁筆記'));page.keyboard.insert_text('第一頁的原生筆記');check('standalone GPU page has a live HTML textarea',page.get_by_label('第一頁筆記').input_value()=='第一頁的原生筆記');page.get_by_role('button',name='翻到另一頁',exact=True).click();page.wait_for_function('()=>document.querySelector("#status").textContent.includes("第 2 頁")');click(page,page.get_by_label('第二頁筆記'));page.keyboard.insert_text('第二頁的原生筆記');check('standalone turn restores second-page hit geometry',page.get_by_label('第二頁筆記').input_value()=='第二頁的原生筆記');page.screenshot(path=str(OUT/'book-turn.png'));check('no unhandled example errors',not errors,errors)
  finally:browser.close()
except Exception:checks.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'acceptance.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
