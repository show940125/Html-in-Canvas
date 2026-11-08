"""Real MV3 toolbar action, activeTab, capture, storage, and URL handoff.
Uses CDP's browser Extensions domain, without granting extra host permissions.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json,time,traceback,uuid,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'extension';OUT.mkdir(parents=True,exist_ok=True)
CHROME=next(str(p) for p in [Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')] if p.exists())
results=[]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/fixture/'):
   kind=self.path.split('/')[-1];dark=kind=='target';background='#1d302b' if dark else '#f1eee2';color='#dbe9b6' if dark else '#293e34'
   if kind=='social':
    cards=''.join(f'<article><div>作者{i}</div><div data-testid="tweetText" dir="auto"><span>貼文{i}：這是社群文字。</span></div><div class="reply"><span>留言{i}：</span><span>一般 div span 回覆。</span></div></article>' for i in range(24))
    body=f'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>社群貼文與留言</title><style>body{{margin:20px;font:15px/1.5 system-ui;background:#f4f2e8}}main{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}article{{border:1px solid #9994;padding:8px}}</style><main>{cards}</main></html>';raw=body.encode();self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(raw);return
   paragraphs=''.join(f'<p>第{i+1}段。網頁文字會在原地聚成人形，保留字型和顏色，再隨著骨架奔跑。這是來源擷取、遮罩、雙重曝光與恢復操作的實際瀏覽器驗證。</p>' for i in range(9))
   body=f'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>{kind} 測試頁</title><style>body{{background:{background};color:{color};font:18px/1.9 system-ui;margin:40px 8%;}}h1{{font-size:48px}}main{{max-width:960px;columns:2;column-gap:50px}}p{{break-inside:avoid}}button{{padding:12px}}svg{{width:270px;height:130px}}input{{padding:10px}}</style></head><body><h1>{"抵達另一個頁面" if dark else "讓文字帶著身體離開"}</h1><main>{paragraphs}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 130"><rect width="270" height="130" fill="#78936a"/><circle cx="180" cy="45" r="28" fill="#ece3ab"/></svg></main><button id="original">來源按鈕</button><input id="draft" value="尚未送出的文字"><script>document.querySelector("#original").onclick=()=>window.clicked=true;</script></body></html>'
   raw=body.encode();self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
def check(name,ok,detail=None):
 results.append(dict(name=name,passed=bool(ok),detail=detail));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError((name,detail))
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),executable_path=CHROME,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-unsafe-swiftshader'],viewport={'width':1920,'height':1080},reduced_motion='no-preference')
  cdp=context.browser.new_browser_cdp_session();extension=cdp.send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id'];print('Chrome '+context.browser.version+' / extension '+extension,flush=True)
  manifest=json.loads((ROOT/'dist'/'manifest.json').read_text(encoding='utf-8'));check('MV3 loads with activeTab and no host permissions',manifest['manifest_version']==3 and 'host_permissions' not in manifest)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/fixture/source');page.wait_for_load_state('networkidle');page.locator('#draft').fill('這段未送出的內容需要保留')
  def popup():
   page.bring_to_front();targets=cdp.send('Target.getTargets',{'filter':[{'type':'tab','exclude':False}]})['targetInfos'];target=next(t['targetId'] for t in targets if t.get('url')==page.url);cdp.send('Extensions.triggerAction',{'id':extension,'targetId':target})
   deadline=time.monotonic()+8;found=None
   while time.monotonic()<deadline:
    found=next((t for t in cdp.send('Target.getTargets')['targetInfos'] if t.get('url')==f'chrome-extension://{extension}/popup.html'),None)
    if found:break
    page.wait_for_timeout(30)
   if not found:raise AssertionError('Actual toolbar popup did not appear')
   session=cdp.send('Target.attachToTarget',{'targetId':found['targetId'],'flatten':False})['sessionId'];replies={}
   def incoming(e):
    if e.get('sessionId')==session:
     payload=json.loads(e['message'])
     if 'id' in payload:replies[payload['id']]=payload
   cdp.on('Target.receivedMessageFromTarget',incoming)
   def command(method,params):
    request=len(replies)+100
    while request in replies:request+=1
    cdp.send('Target.sendMessageToTarget',{'sessionId':session,'message':json.dumps({'id':request,'method':method,'params':params})});end=time.monotonic()+12
    while request not in replies and time.monotonic()<end:page.wait_for_timeout(20)
    if request not in replies:raise TimeoutError(method)
    reply=replies[request]
    if 'error' in reply:raise RuntimeError(reply['error'])
    return reply.get('result',{})
   def evaluate(expression):return command('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True}).get('result',{}).get('value')
   deadline=time.monotonic()+6
   while not evaluate('!!document.querySelector("#start")') and time.monotonic()<deadline:page.wait_for_timeout(30)
   def click(selector):
    rect=evaluate(f'(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()')
    command('Input.dispatchMouseEvent',{'type':'mousePressed',**rect,'button':'left','clickCount':1});command('Input.dispatchMouseEvent',{'type':'mouseReleased',**rect,'button':'left','clickCount':1})
   return evaluate,click,incoming
  evaluate,click,listener=popup();check('toolbar popup renders actual start control',evaluate('document.querySelector("#start").textContent.includes("開始失控")'))
  click('#start');page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.state==='running'",timeout=30000);cdp.remove_listener('Target.receivedMessageFromTarget',listener)
  root=page.locator('div[data-runaway-root]');check('real source uses native HTML textures',int(root.get_attribute('data-native-count'))>0);check('SVG uses captured image material',int(root.get_attribute('data-snapshot-count'))>=1)
  page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.phase==='全員逃難'");page.screenshot(path=str(OUT/'real-extension-crowd.png'))
  page.get_by_role('button',name='暫停',exact=True).click();check('real stage pause',root.get_attribute('data-state')=='paused');page.get_by_role('button',name='繼續',exact=True).click()
  page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.state==='finished'",timeout=25000);fps=float(root.get_attribute('data-fps'));check('natural completion records real performance',fps>0,{'fps':fps,'frames':root.get_attribute('data-frames'),'actors':int(root.get_attribute('data-native-count'))+int(root.get_attribute('data-snapshot-count')),'regions':int(root.get_attribute('data-region-count')),'renderer':root.get_attribute('data-renderer')});page.screenshot(path=str(OUT/'real-extension-empty.png'))
  page.keyboard.press('Escape');check('source draft survives restoration',page.locator('#draft').input_value()=='這段未送出的內容需要保留');check('capture markers and styles restored',page.locator('[data-runaway-capture]').count()==0);page.locator('#original').click();check('source event listeners survive',page.evaluate('window.clicked===true'))
  page.goto(base+'/fixture/target');page.wait_for_load_state('networkidle');evaluate,click,listener=popup();click('#remember');deadline=time.monotonic()+12
  while time.monotonic()<deadline:
   text=evaluate('document.querySelector("#status").textContent')
   if text and ('已記住終點' in text or '無效' in text or '失敗' in text):break
   page.wait_for_timeout(60)
  check('target snapshot saved through actual popup','已記住終點' in (text or ''),text)
  stored=evaluate('(async()=>{const s=await chrome.storage.local.get("target");return {url:s.target?.url,blocks:s.target?.blocks.length}})()');check('target snapshot contains captured layout',stored['url']==base+'/fixture/target' and stored['blocks']>=6,stored)
  cdp.remove_listener('Target.receivedMessageFromTarget',listener);page.goto(base+'/fixture/source');page.wait_for_load_state('networkidle');evaluate,click,listener=popup();evaluate('document.querySelector("#ending").value="target"');click('#start');page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.state==='running'",timeout=30000);cdp.remove_listener('Target.receivedMessageFromTarget',listener)
  page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.phase==='最後離場'",timeout=25000);page.screenshot(path=str(OUT/'real-extension-target-forming.png'));page.wait_for_url(base+'/fixture/target',timeout=15000);check('target ending hands off to actual destination',page.url==base+'/fixture/target');check('no leftover overlay after navigation',page.locator('div[data-runaway-root]').count()==0)
  page.goto(base+'/fixture/social');page.wait_for_load_state('networkidle');evaluate,click,listener=popup();click('#remember');deadline=time.monotonic()+12
  while time.monotonic()<deadline:
   social=evaluate('(async()=>{const s=await chrome.storage.local.get("target");if(!s.target?.url.endsWith("/social"))return null;return {count:s.target.blocks.length,text:s.target.blocks.map(b=>b.text).join("\\n")}})()')
   if social:break
   page.wait_for_timeout(60)
  check('real MV3 captures all 24 social posts and 24 replies',social and all(f'貼文{i}：' in social['text'] and f'留言{i}：' in social['text'] for i in range(24)),social['count'] if social else None)
  deadline=time.monotonic()+5
  while evaluate('document.querySelector("#start").disabled') and time.monotonic()<deadline:page.wait_for_timeout(25)
  evaluate('document.querySelector("#ending").value="empty"');click('#start')
  try:page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.state==='running'",timeout=30000)
  except Exception:
   print('Popup state: '+str(evaluate('document.querySelector("#status").textContent')),flush=True);page.screenshot(path=str(OUT/'social-failed.png'));raise
  cdp.remove_listener('Target.receivedMessageFromTarget',listener);root=page.locator('div[data-runaway-root]');check('real MV3 keeps social coverage beyond sixteen actor limit',int(root.get_attribute('data-region-count'))>16 and int(root.get_attribute('data-native-count'))+int(root.get_attribute('data-snapshot-count'))<=16);check('real MV3 renders generated GIF atlases',root.get_attribute('data-renderer')=='gif-atlas');page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.phase==='全員逃難'");page.screenshot(path=str(OUT/'real-social-crowd.png'));page.keyboard.press('Escape')
  if '--live' in sys.argv:
   for label,url in [('chrome','https://developer.chrome.com/blog/html-in-canvas?hl=zh-tw'),('demos','https://html-in-canvas.dev/demos/')]:
    page.goto(url,wait_until='networkidle',timeout=60000);evaluate,click,listener=popup();click('#start');page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.state==='running'",timeout=30000);cdp.remove_listener('Target.receivedMessageFromTarget',listener);check('live '+label+' native rendering',int(page.locator('div[data-runaway-root]').get_attribute('data-native-count'))>0);page.wait_for_function("()=>document.querySelector('div[data-runaway-root]')?.dataset.phase==='全員逃難'");page.screenshot(path=str(OUT/('live-'+label+'.png')));page.keyboard.press('Escape');check('live '+label+' restores',page.locator('div[data-runaway-root]').count()==0)
  check('no uncaught runtime errors',not errors,errors);context.close()
except Exception:
 traceback.print_exc();sys.exitcode=1
finally:
 server.shutdown();(OUT/'results.json').write_text(json.dumps({'checks':results},ensure_ascii=False,indent=2),encoding='utf-8')
if getattr(sys,'exitcode',0):sys.exit(1)
