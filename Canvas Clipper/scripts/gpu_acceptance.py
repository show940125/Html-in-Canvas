from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import json,traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v02';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
results=[]
def check(name,passed,detail=None):
 results.append({'name':name,'passed':bool(passed),'detail':detail});print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-features=CanvasDrawElement'])
  page=browser.new_page(viewport={'width':1600,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.get_by_role('tab',name='◇ 特效展示').click()
   page.wait_for_function('() => Number(document.querySelector(".webgl-canvas")?.dataset.frames)>0 || !!document.querySelector(".showcase-unavailable")')
   error=page.locator('.showcase-unavailable').inner_text() if page.locator('.showcase-unavailable').count() else ''
   check('real HTML texture renders in WebGL 2',not error,error)
   page.screenshot(path=str(OUT/'webgl-paper.png'))
   button=page.locator('.gpu-test-button');r=button.bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
   page.wait_for_function('() => document.querySelector(".gpu-test-button").textContent.includes("1 次")',timeout=5000)
   check('native button works on tilted GPU paper','1 次' in button.inner_text())
   note=page.get_by_role('textbox',name='WebGL 紙張筆記');r=note.bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2);page.keyboard.insert_text('傾斜紙張上的中文輸入')
   check('native textarea works on GPU paper',note.input_value()=='傾斜紙張上的中文輸入',note.input_value())
   cdp=page.context.new_cdp_session(page);cdp.send('Input.imeSetComposition',{'text':'組字成功','selectionStart':4,'selectionEnd':4});cdp.send('Input.insertText',{'text':'組字成功'})
   check('IME composition on GPU paper',note.input_value().endswith('組字成功'),note.input_value())
   page.get_by_role('slider',name='紙張角度').fill('-20');page.get_by_role('slider',name='紙張角度').dispatch_event('input')
   page.wait_for_timeout(150)
   r=button.bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
   page.wait_for_function('() => document.querySelector(".gpu-test-button").textContent.includes("2 次")',timeout=5000)
   check('interaction geometry follows changed perspective','2 次' in button.inner_text())
   page.screenshot(path=str(OUT/'webgl-paper-input.png'))
   check('no unhandled GPU errors',not errors,errors)
  except Exception:
   page.screenshot(path=str(OUT/'gpu-failure.png'));print(page.locator('.showcase').inner_text(),flush=True);raise
  finally:browser.close()
except Exception:results.append({'name':'unexpected failure','passed':False,'detail':traceback.format_exc()});raise
finally:
 server.shutdown();server.server_close();(OUT/'gpu-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
