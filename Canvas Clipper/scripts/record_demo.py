"""Record actual UI interactions with synthetic onboarding material only."""
from browser_support import chrome_launch_options
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v03'/'film';OUT.mkdir(parents=True,exist_ok=True);MEDIA=ROOT.parent/'docs'/'media';MEDIA.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
def caption(page,text):page.evaluate('''text=>{let el=document.querySelector('#film-caption');if(!el){el=document.createElement('div');el.id='film-caption';el.style='position:fixed;bottom:55px;left:50%;transform:translateX(-50%);padding:12px 23px;border-radius:8px;background:#183a2bec;color:white;font:15px/1.6 Microsoft JhengHei,sans-serif;z-index:99999;pointer-events:none;box-shadow:0 4px 25px #0003';document.body.append(el);}el.textContent=text;}''',text)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement']);context=browser.new_context(viewport={'width':1440,'height':960},record_video_dir=str(OUT),record_video_size={'width':1440,'height':960});page=context.new_page();video=page.video
  page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.get_by_role('button',name='試用範例專案',exact=False).click();page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===3');page.locator('.save-state.saved').wait_for();page.wait_for_timeout(500);assert page.locator('.zoom-controls output').inner_text()=='75%', 'Demo zoom was overwritten during project switch';page.screenshot(path=str(MEDIA/'cover.png'))
  caption(page,'Canvas Clipper 0.3 · 以下全部為合成範例材料');page.wait_for_timeout(1700)
  caption(page,'放下之前，就看見主題伸縮與磁吸位置');handle=page.locator('.card-handle').nth(2).bounding_box();board=page.locator('.board-surface').bounding_box();page.mouse.move(handle['x']+50,handle['y']+12);page.mouse.down();page.mouse.move(board['x']+16+700*.75,board['y']+16+160*.75,steps=35);page.wait_for_timeout(1300);page.mouse.up();page.wait_for_timeout(700)
  caption(page,'一次復原整次排版，再聚焦目前的主題');page.get_by_role('button',name='復原操作',exact=True).click();page.wait_for_timeout(450);page.get_by_role('button',name='聚焦主題 證據與觀點',exact=True).click();page.wait_for_timeout(1500)
  caption(page,'主題、文章與關係，一起輸出成圖片');page.get_by_role('button',name='輸出主題圖片 證據與觀點',exact=True).click();page.get_by_role('dialog',name='圖文圖片輸出').wait_for();page.wait_for_timeout(1800);page.get_by_role('button',name='關閉圖片輸出',exact=True).click()
  caption(page,'長文真正分頁，HTML 直接成為可操作的 GPU 紋理');page.get_by_role('button',name='書本閱讀',exact=False).first.click();page.wait_for_function('()=>!document.querySelector(".book-loading")');page.wait_for_function('()=>!!document.querySelector(".book-canvas[data-renderer]")');page.wait_for_timeout(800)
  if not page.get_by_role('button',name='下一頁',exact=True).is_disabled():page.get_by_role('button',name='下一頁',exact=True).click();page.wait_for_timeout(900)
  page.get_by_role('button',name='閱讀筆記',exact=True).click();page.wait_for_function('()=>!document.querySelector(".book-loading")');page.get_by_role('textbox',name='書本閱讀筆記').fill('保留材料的來源，也寫下自己的判斷。');page.wait_for_timeout(1500);page.get_by_role('button',name='關閉書本閱讀',exact=True).click()
  caption(page,'三區收合，把整個空間留給思考');page.get_by_role('button',name='專注畫布',exact=True).click();page.wait_for_timeout(1300);page.get_by_role('button',name='恢復面板',exact=True).click();page.get_by_role('button',name='主題與介面',exact=True).click();page.get_by_role('button',name='海藍',exact=True).click();page.get_by_label('明暗模式',exact=True).select_option('dark');page.get_by_role('button',name='完成',exact=True).click();caption(page,'可選配色、框型與技術檢視 · Html in Canvas');page.wait_for_timeout(1900)
  context.close();path=video.path();shutil.copyfile(path,OUT/'demo.webm');browser.close();print(str(OUT/'demo.webm'))
finally:server.shutdown();server.server_close()
