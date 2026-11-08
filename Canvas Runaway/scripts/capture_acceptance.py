"""Regression for X-style div/span posts, replies, hidden text and open shadow DOM."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json,subprocess,sys,traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'capture';OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(ROOT/'scripts'/'build-probe.mjs')],cwd=ROOT,check=True)
CHROME=next((str(p) for p in [Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')] if p.exists()),None)
cards=''.join(f'<article data-testid="tweet"><div class="author"><span>作者{i}</span></div><div data-testid="tweetText" dir="auto" lang="zh"><span>貼文{i}：這是中文 PO 文。</span><a href="#">連結{i}</a></div><div class="reply"><span>留言{i}：</span><span>一般 div span 回覆。</span></div></article>' for i in range(24))
html=f'''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><style>body{{margin:15px;font:14px/1.3 system-ui}}main{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}}article{{border:1px solid #ddd;padding:6px}}.author{{font-size:11px}}.reply{{font-size:12px;margin-top:4px}}#offscreen{{position:absolute;top:3000px}}#invisible{{opacity:0}}#hidden{{display:none}}</style><main>{cards}</main><div role="button"><span>角色按鈕可見文字</span></div><div id="invisible">透明隱藏內容</div><div id="hidden">display隱藏內容</div><div id="offscreen">畫面外內容</div><div id="shadow"></div><input value="表單草稿"><div contenteditable="true">編輯器草稿</div></html>'''
(OUT/'social.html').write_text(html,encoding='utf-8')
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(OUT)));Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,value,detail=None):
 checks.append(dict(name=name,passed=bool(value),detail=detail));print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(name)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=CHROME,headless=True);page=browser.new_page(viewport={'width':1920,'height':1080});page.goto(f'http://127.0.0.1:{server.server_port}/social.html');page.wait_for_load_state('networkidle');page.evaluate('document.querySelector("#shadow").attachShadow({mode:"open"}).innerHTML="<div><span>Shadow留言也應擷取</span></div>"');page.add_script_tag(path=str(ROOT/'output'/'capture-probe.js'))
  shot=page.evaluate('window.captureProbe.collect()');texts=[b['text'] for b in shot['blocks']];joined='\n'.join(texts)
  check('all 24 X-style tweetText posts captured',all(f'貼文{i}：' in joined for i in range(24)),len(shot['blocks']))
  check('all 24 generic div/span comments captured',all(f'留言{i}：' in joined for i in range(24)))
  check('author inline text captured',all(f'作者{i}' in joined for i in range(24)))
  check('nested post links remain in same text group',any('貼文0：' in text and '連結0' in text for text in texts))
  check('role-based controls captured','角色按鈕可見文字' in joined)
  check('open shadow text captured','Shadow留言也應擷取' in joined)
  check('hidden offscreen and editable text excluded',all(x not in joined for x in ['透明隱藏內容','display隱藏內容','畫面外內容','表單草稿','編輯器草稿']))
  check('coverage exceeds former sixteen-block limit',len(shot['blocks'])>16)
  page.evaluate('window.captureProbe.hideForCleanPlate()');check('clean plate actually hides selected posts',page.locator('[data-testid="tweetText"]').first.evaluate('e=>getComputedStyle(e).visibility')=='hidden');check('clean plate also hides open shadow contents',page.evaluate('getComputedStyle(document.querySelector("#shadow").shadowRoot.querySelector("span")).visibility')=='hidden')
  page.evaluate('window.captureProbe.restoreCapture()');check('restoration preserves all source text and draft',page.locator('[data-runaway-capture]').count()==0 and page.locator('input').input_value()=='表單草稿')
  page.screenshot(path=str(OUT/'social-restored.png'));browser.close()
except Exception:
 traceback.print_exc();sys.exitcode=1
finally:
 server.shutdown();(OUT/'results.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
if getattr(sys,'exitcode',0):sys.exit(1)
