from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import uuid,json,traceback,sys
R=Path(__file__).resolve().parents[1];O=R/('output/mime-public' if '--public-only' in sys.argv else 'output/mime-local' if '--local-only' in sys.argv else 'output/mime');O.mkdir(parents=True,exist_ok=True);checks=[];counts={}
pdf=(R/'output/fixtures/native.pdf').read_bytes()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  counts[self.path]=counts.get(self.path,0)+1
  if self.path=='/embedded':body=b'<iframe src="/embedded.pdf" width="1000" height="800"></iframe>';kind='text/html'
  elif self.path=='/form':body=b'<form action="/posted.pdf" method="post"><button>Open PDF</button></form>';kind='text/html'
  else:body=pdf;kind='application/pdf'
  if self.path=='/once.pdf' and counts[self.path]>1:self.send_response(410);self.end_headers();return
  self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_POST(self):
  self.rfile.read(int(self.headers.get('Content-Length',0)));self.do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=Thread(target=server.serve_forever,daemon=True);thread.start()
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--no-proxy-server','--disable-features=HttpsUpgrades'],viewport={'width':1550,'height':1080})
 try:
  c.grant_permissions(['local-network-access'])
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000);page.evaluate('async()=>await chrome.mimeHandler.setMimeHandlerOptions("application/pdf",{enabled:true,canEmbed:true})')
  root=f'http://127.0.0.1:{server.server_address[1]}';print('HTTP',c.request.get(root+'/health').status,flush=True);tab=c.new_page();tab.on('requestfailed',lambda r:print('NETFAIL',r.url,r.failure,flush=True));tab.on('console',lambda m:print('CONSOLE',m.type,m.text[:300],flush=True))
  for path in (['public-https'] if '--public-only' in sys.argv else ['local-file'] if '--local-only' in sys.argv else ['/once.pdf','/form','/embedded','local-file']):
   tab=c.new_page();tab.goto('data:text/html,<html><body>Ready</body></html>');tab.bring_to_front()
   destination='https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' if path=='public-https' else (R/'output/fixtures/native.pdf').as_uri() if path=='local-file' else root+path
   try:tab.goto(destination,wait_until='commit',timeout=5000)
   except Exception:pass
   if path=='/form':tab.get_by_role('button',name='Open PDF').click(no_wait_after=True)
   found=None
   # Chrome hosts MIME handlers in extension frames while retaining the source URL.
   for attempt in range(150):
    for f in tab.frames:
     if f.url.startswith(f'chrome-extension://{eid}/'):
      found=f;break
    if found:break
    tab.wait_for_timeout(100)
   print('MIME STATE',path,tab.url,[f.url for f in tab.frames],counts,flush=True)
   if not found:raise AssertionError('Canvas PDF MIME frame absent: '+path+' '+str([f.url for f in tab.frames]))
   found.wait_for_function('()=>window.canvasPDF?.project?.bytes?.length>0',timeout=60000);checks.append({'name':path,'passed':True,'loopbackPermissionPregranted':True,'detail':found.evaluate('()=>({name:canvasPDF.project.name,pages:canvasPDF.view.count})')});print('PASS MIME',path,flush=True)
   if '--local-only' in sys.argv or '--public-only' in sys.argv:
    identity=found.evaluate('()=>canvasPDF.project.id')
    with c.expect_page() as popup:found.get_by_role('button',name='獨立分頁編輯',exact=True).click()
    standalone=popup.value;standalone.wait_for_function('(id)=>window.canvasPDF?.project?.id===id',arg=identity,timeout=60000);checks.append({'name':'standalone project handoff','passed':True});print('PASS standalone project handoff',flush=True)

  if '--local-only' not in sys.argv and '--public-only' not in sys.argv:checks.append({'name':'one-time URL consumed once','passed':counts.get('/once.pdf')==1,'detail':counts})
 except Exception:checks.append({'name':'exception','passed':False,'detail':traceback.format_exc()});print(checks[-1]['detail'],flush=True)
 finally:c.close();server.shutdown();server.server_close();(O/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8')
sys.exit(0 if all(x['passed'] for x in checks) else 1)
