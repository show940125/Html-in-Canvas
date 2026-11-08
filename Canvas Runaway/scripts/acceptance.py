"""Self-contained foreground server + real Chrome visual/interaction checks."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json,traceback,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'acceptance';OUT.mkdir(parents=True,exist_ok=True)
CHROME=next((str(p) for p in [Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')] if p.exists()),None)
checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,condition,detail=None):
 checks.append(dict(name=name,passed=bool(condition),detail=detail));print(('PASS ' if condition else 'FAIL ')+name,flush=True)
 if not condition:raise AssertionError((name,detail))
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--enable-unsafe-swiftshader'])
  print('Browser '+browser.version,flush=True)
  for mode in ['native','snapshot']:
   context=browser.new_context(viewport={'width':1440,'height':960},reduced_motion='no-preference');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('CONSOLE '+m.text,flush=True) if 'Runaway uses' in m.text else None)
   if mode=='snapshot':page.add_init_script("Object.defineProperty(CanvasRenderingContext2D.prototype,'drawElementImage',{value:undefined});")
   page.goto(base+'/demo.html');page.wait_for_load_state('networkidle');page.screenshot(path=str(OUT/(mode+'-before.png')))
   page.get_by_role('button',name='開始失控').click();page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.state==='running'",timeout=30000)
   root=page.locator('div[data-runaway-root]');native=int(root.get_attribute('data-native-count'));snap=int(root.get_attribute('data-snapshot-count'))
   check(mode+' correct texture route',native>0 if mode=='native' else native==0,{'native':native,'snapshot':snap})
   check(mode+' multiple characters',native+snap>=6)
   for t in [1.25,1.55,3.3,4.65,5.0,7.0,11.6,12.0,14.8]:
    page.evaluate('(t)=>window.runawayPreview.seek(t)',t);page.screenshot(path=str(OUT/(mode+f'-{t:.2f}.png')))
   check(mode+' timeline reaches running crowd',page.evaluate('window.runawayPreview.stage.root.dataset.phase')=='最後離場')
   page.evaluate('window.runawayPreview.seek(6)');page.get_by_role('button',name='繼續',exact=True).click();page.mouse.move(1100,320);page.wait_for_timeout(600);check(mode+' pointer guides monster',page.evaluate('window.runawayPreview.stage.pointer.x')>1000)
   page.get_by_role('button',name='暫停',exact=True).click();check(mode+' pause freezes session',root.get_attribute('data-state')=='paused')
   page.keyboard.press('Escape');check(mode+' Escape restores source',root.count()==0 and page.get_by_role('button',name='開始失控').is_visible());check(mode+' temporary capture attributes restored',page.locator('[data-runaway-capture]').count()==0)
   page.get_by_role('button',name='開始失控').click();page.wait_for_function("()=>window.runawayPreview.stage?.root.dataset.state==='running'");page.evaluate('window.runawayPreview.seek(15)');check(mode+' explicit completion',root.get_attribute('data-state')=='finished');page.get_by_role('button',name='重播',exact=True).click();check(mode+' replay restarts',root.get_attribute('data-state')=='running')
   page.keyboard.press('Escape');page.locator('#demo-ending').select_option('target');page.get_by_role('button',name='開始失控').click();page.wait_for_function("()=>window.runawayPreview.stage?.root.dataset.state==='running'");page.evaluate('window.runawayPreview.seek(14.8)');page.screenshot(path=str(OUT/(mode+'-arrival.png')));page.evaluate('window.runawayPreview.seek(15)');page.wait_for_function("()=>!document.querySelector('div[data-runaway-root]')");check(mode+' target transition completes',page.get_by_role('button',name='開始失控').is_visible())
   page.locator('#demo-ending').select_option('empty');page.get_by_role('button',name='開始失控').click();page.wait_for_function("()=>window.runawayPreview.stage?.root.dataset.state==='running'");page.set_viewport_size({'width':1200,'height':800});check(mode+' resize restores safely',root.count()==0)
   check(mode+' no uncaught runtime errors',not errors,errors);context.close()
  # Narrow viewport still permits starting, restoring and seeing the sample.
  context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();page.goto(base+'/demo.html');page.wait_for_load_state('networkidle');check('mobile launch visible',page.get_by_role('button',name='開始失控').is_visible());page.screenshot(path=str(OUT/'mobile.png'));context.close()
  context=browser.new_context();page=context.new_page();page.add_init_script("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:original.call(this,kind,...args)}");page.goto(base+'/demo.html');page.wait_for_load_state('networkidle');page.get_by_role('button',name='開始失控').click();page.wait_for_function("()=>document.querySelector('#demo-status').textContent.includes('WebGL 2')");check('GPU unavailable leaves usable original page',page.locator('div[data-runaway-root]').count()==0 and page.get_by_role('button',name='開始失控').is_enabled());context.close();browser.close()
except Exception:
 traceback.print_exc();sys.exitcode=1
finally:
 server.shutdown();(OUT/'results.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
if getattr(sys,'exitcode',0):sys.exit(1)
