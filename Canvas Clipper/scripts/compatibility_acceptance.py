"""Run HTML-only acceptance separately from native Canvas CI evidence."""
from browser_support import chrome_launch_options
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json,traceback
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v03'/'compatibility';OUT.mkdir(parents=True,exist_ok=True);checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,passed):
 checks.append(dict(name=name,passed=bool(passed)));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(name)
def content_editor(page):
 reopen=page.get_by_role('button',name='展開右側欄',exact=True)
 if reopen.count():reopen.click()
 page.get_by_role('tab',name='內容',exact=True).click()
 page.get_by_role('button',name='整理稿',exact=True).click()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True)
  try:
   page=browser.new_page(viewport={'width':1680,'height':1100});page.add_init_script("Object.defineProperty(CanvasRenderingContext2D.prototype,'drawElementImage',{value:undefined});const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args)}")
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.locator('input[accept^=".json"]').set_input_files(ROOT/'tests'/'fixtures'/'acceptance-fixture.json');page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===20')
   check('HTML fallback selected with Canvas and GPU unavailable',page.locator('.board-surface').get_attribute('data-mode')=='dom')
   page.get_by_role('button',name='主題與介面',exact=True).click();settings=page.get_by_role('dialog',name='主題與介面')
   for label,value in [('紙白','paper'),('森林','forest'),('海藍','ocean'),('暖杏','apricot'),('莓紫','berry'),('石墨','graphite')]:
    settings.get_by_role('button',name=label,exact=True).click();check('palette '+value,page.locator('.app-v3').get_attribute('data-palette')==value)
   settings.get_by_role('button',name='完成',exact=True).click();page.locator('.card-list-select').first.click();content_editor(page);page.get_by_role('textbox',name='我的筆記',exact=True).fill('相容模式的中文筆記');page.locator('.save-state.saved').wait_for();page.reload();page.wait_for_load_state('networkidle');page.locator('.card-list-select').first.click();content_editor(page)
   check('HTML note survives reload',page.get_by_role('textbox',name='我的筆記',exact=True).input_value()=='相容模式的中文筆記')
   page.get_by_role('button',name='書本閱讀',exact=False).first.click();page.wait_for_function('()=>!document.querySelector(".book-loading")',timeout=60000);book=page.get_by_role('dialog',name='書本閱讀')
   check('GPU-free book retains measured pagination',book.locator('.book-flat-spread').count()==1 and int(book.get_by_label('閱讀頁碼',exact=True).inner_text().split('/')[-1])>20)
   before=book.get_by_label('閱讀頁碼',exact=True).inner_text();book.get_by_role('button',name='下一頁',exact=True).click();check('GPU-free book changes pages directly',book.get_by_label('閱讀頁碼',exact=True).inner_text()!=before)
   page.screenshot(path=str(OUT/'html-book.png'));book.get_by_role('button',name='關閉書本閱讀',exact=True).click();page.get_by_role('tab',name='文件檢視',exact=False).click();check('HTML document remains available for print',page.locator('.document-viewport').count()==1)
  finally:browser.close()
except Exception:checks.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'acceptance.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
