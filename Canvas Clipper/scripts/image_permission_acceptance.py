"""Headed isolated Chrome: native optional-origin consent is operated via CUA."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import json,traceback,uuid
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v02'/'images';OUT.mkdir(parents=True,exist_ok=True);results=[];requests=[]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  requests.append(self.path)
  if self.path=='/image.png':
   raw=(ROOT/'output'/'v02'/'local-material.png').read_bytes();self.send_response(200);self.send_header('Content-Type','image/png');self.end_headers();self.wfile.write(raw)
  elif self.path=='/bad.svg':
   self.send_response(200);self.send_header('Content-Type','image/svg+xml');self.end_headers();self.wfile.write(b'<svg xmlns="http://www.w3.org/2000/svg"/>')
  else:super().do_GET()
def check(name,passed,detail=None):
 results.append(dict(name=name,passed=bool(passed),detail=detail));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=False,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-features=CanvasDrawElement'],viewport={'width':1600,'height':1000})
  try:
   cdp=context.browser.new_browser_cdp_session();eid=cdp.send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id'];page=context.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_load_state('networkidle')
   data=json.loads((ROOT/'tests'/'fixtures'/'acceptance-fixture.json').read_text(encoding='utf-8'));data['project']['cards']=data['project']['cards'][:1];c=data['project']['cards'][0];c['title']='網頁圖片授權驗收';c['originalDoc']=c['editedDoc']={'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'按來源授權下載，保存在本機。'}]},{'type':'image','attrs':{'sourceUrl':base+'/image.png','alt':'授權圖片','caption':'保存後可離線','status':'pending','width':320}}]};fixture=OUT/'remote-image.json';fixture.write_text(json.dumps(data),encoding='utf-8');page.locator('input[accept^=".json"]').set_input_files(fixture);page.get_by_role('button',name='載入網頁圖片 (1)',exact=True).wait_for();page.locator('.save-state.saved').wait_for()
   response=page.evaluate('async url=>await chrome.runtime.sendMessage({type:"FETCH_IMAGE",url})',base+'/image.png')
   check('image fetch requires explicit source grant',not response['ok'] and '授權' in response['error'] and '/image.png' not in requests,response)
   page.get_by_role('button',name='載入網頁圖片 (1)',exact=True).click();print('AWAIT_NATIVE_PERMISSION_PROMPT',flush=True)
   page.wait_for_function('()=>!!document.querySelector(".card-thumbnail") || !!document.querySelector("[role=alert]")',timeout=180000)
   check('source permission grants real background image download',page.locator('.card-thumbnail').count()==1,page.locator('[role=alert]').all_text_contents())
   page.locator('.save-state.saved').wait_for();page.screenshot(path=str(OUT/'origin-image-saved.png'))
   asset=page.evaluate('''async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const all=await new Promise((r,j)=>{const q=db.transaction('assets').objectStore('assets').getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();return all.map(a=>({id:a.id,width:a.width,height:a.height,size:a.blob.size,mime:a.mime}));}''')
   check('download stores validated raster bytes in IndexedDB',len(asset)==1 and asset[0]['width']==320 and asset[0]['mime']=='image/png',asset)
   context.set_offline(True);page.reload();page.wait_for_load_state('networkidle');page.locator('.card-thumbnail').wait_for()
   check('remote image survives reload offline',page.locator('.card-thumbnail').evaluate('(img)=>img.complete&&img.naturalWidth===320'));context.set_offline(False)
   response=page.evaluate('async url=>await chrome.runtime.sendMessage({type:"FETCH_IMAGE",url})',base+'/bad.svg')
   check('remote SVG is rejected without storing an asset',not response['ok'] and 'PNG' in response['error'],response)
  finally:context.close()
except Exception:results.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'image-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
