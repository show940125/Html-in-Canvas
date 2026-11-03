from browser_support import chrome_launch_options
"""Load the real MV3 build into an isolated installed Chrome 156 profile.

CDP's official Extensions.triggerAction invokes the browser action, granting
activeTab just as a toolbar click does. No extra host permissions are added.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json, traceback, uuid, time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'v03'/'extension'
OUT.mkdir(parents=True,exist_ok=True)
results=[]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*_args): pass
    def do_GET(self):
        if self.path.startswith('/fixture/'):
            kind=self.path.rsplit('/',1)[-1]
            paragraphs=''.join(f'<p>這是第 {i+1} 段的擷取測試。文章內容提供足夠文字，讓正文擷取器能區別導覽與主要材料。保留段落換行，並確認來源網址與標題。'+('這段內容用來驗證文章收集與整理功能。'*5)+'</p>' for i in range(8))
            body=('<article><h1>新聞式文章測試</h1>'+paragraphs+'</article>' if kind=='news' else '<main><div class="article-content"><h1>技術文件測試</h1>'+paragraphs+'</div></main>' if kind=='docs' else '<div id="content"><h1>研究資料測試</h1>'+paragraphs+'</div>')
            raw=('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>'+kind+' 來源文章</title><style>body{font:18px/1.8 sans-serif;max-width:800px;margin:40px auto}nav,footer{color:#777}</style><nav>導覽 首頁 關於我們</nav>'+body+'<footer>頁尾導覽與廣告</footer><script>window.fixtureLoaded=true</script></html>').encode()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(raw)
        else: super().do_GET()
def check(name,condition,details=None):
    results.append({'name':name,'passed':bool(condition),'details':details})
    print(('PASS ' if condition else 'FAIL ')+name,flush=True)
    if not condition: raise AssertionError(str(details))
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        context=p.chromium.launch_persistent_context(str(OUT/('extension-profile-'+uuid.uuid4().hex[:8])),**chrome_launch_options(),headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-features=CanvasDrawElement'],viewport={'width':1600,'height':1000})
        browser=context.browser
        cdp=browser.new_browser_cdp_session()
        extension_id=cdp.send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id']
        print('Extension',extension_id,flush=True)
        check('real MV3 extension loads with stable identity',extension_id=='mfpdaiaepnhdnbcahabiafigihfcapjk',extension_id)
        workspace=context.new_page();workspace.goto(f'chrome-extension://{extension_id}/index.html');workspace.wait_for_load_state('networkidle')
        workspace.get_by_role('button',name='新增卡片',exact=True).wait_for()
        check('extension origin supports native Canvas',workspace.locator('.board-surface').get_attribute('data-mode')=='native')
        source=context.new_page()
        def trigger(page):
            page.bring_to_front()
            targets=cdp.send('Target.getTargets',{'filter':[{'type':'tab','exclude':False}]})['targetInfos']
            target=next(t['targetId'] for t in targets if t.get('url')==page.url)
            cdp.send('Extensions.triggerAction',{'id':extension_id,'targetId':target})
        def click_popup(target_id):
            # Toolbar popup targets are not ordinary tabs in headless Chrome.
            # Attach to the real popup and use its rendered DOM coordinates.
            session_id=cdp.send('Target.attachToTarget',{'targetId':target_id,'flatten':False})['sessionId']
            replies={}
            def incoming(event):
                if event.get('sessionId')==session_id:
                    payload=json.loads(event['message'])
                    if 'id' in payload: replies[payload['id']]=payload
            cdp.on('Target.receivedMessageFromTarget',incoming)
            sequence=0
            def command(method,params):
                nonlocal sequence
                sequence+=1;request=sequence
                cdp.send('Target.sendMessageToTarget',{'sessionId':session_id,'message':json.dumps({'id':request,'method':method,'params':params})})
                deadline=time.monotonic()+10
                while request not in replies and time.monotonic()<deadline: source.wait_for_timeout(20)
                response=replies[request]
                if 'error' in response: raise RuntimeError(response['error'])
                return response.get('result',{})
            try:
                dom=None;deadline=time.monotonic()+5
                while dom is None and time.monotonic()<deadline:
                    dom=command('Runtime.evaluate',{'expression':"(()=>{const b=document.querySelector('.button-primary');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,text:b.textContent}})()",'returnByValue':True}).get('result',{}).get('value')
                    if dom is None: source.wait_for_timeout(50)
                assert dom,'Toolbar popup UI did not render'
                check('actual toolbar popup button visible','匯入目前文章' in dom['text'])
                command('Input.dispatchMouseEvent',{'type':'mousePressed','x':dom['x'],'y':dom['y'],'button':'left','clickCount':1})
                # The popup closes on success; the release may detach its target.
                try: command('Input.dispatchMouseEvent',{'type':'mouseReleased','x':dom['x'],'y':dom['y'],'button':'left','clickCount':1})
                except Exception:
                    if any(t['targetId']==target_id for t in cdp.send('Target.getTargets')['targetInfos']): raise
            finally: cdp.remove_listener('Target.receivedMessageFromTarget',incoming)
        for index,kind in enumerate(['news','docs','research']):
            source.goto(base+'/fixture/'+kind);source.wait_for_load_state('networkidle')
            trigger(source)
            deadline=time.monotonic()+5
            targets=cdp.send('Target.getTargets')['targetInfos']
            while not any(t.get('url')==f'chrome-extension://{extension_id}/popup.html' for t in targets) and time.monotonic()<deadline:
                source.wait_for_timeout(50)
                targets=cdp.send('Target.getTargets')['targetInfos']
            popups=[page for page in context.pages if page.url==f'chrome-extension://{extension_id}/popup.html']
            if popups:
                popup=popups[-1]
                popup.get_by_role('button',name='匯入目前文章').click()
            else:
                popup_target=next(t['targetId'] for t in targets if t.get('url')==f'chrome-extension://{extension_id}/popup.html')
                click_popup(popup_target)
            workspace.wait_for_function(f'() => document.querySelectorAll("canvas .clip-card").length==={index+1}',timeout=15000)
            check('article captured '+kind,workspace.locator('.clip-card').count()==index+1)
            workspace.locator('.card-list-select').last.click()
            text=workspace.get_by_role('textbox',name='整理圖文',exact=True).inner_text()
            check('article paragraphs preserved '+kind,'\n\n' in text and '擷取測試' in text and '頁尾導覽與廣告' not in text)
        check('workspace tab reused',len([page for page in context.pages if page.url.startswith(f'chrome-extension://{extension_id}/index.html')])==1)
        workspace.screenshot(path=str(OUT/'extension-native.png'))
        # Three actual public documentation sites, in addition to controlled
        # fixtures. No login, content upload, or background host permission.
        for index,(live_url,phrase) in enumerate([
            ('https://developer.chrome.com/blog/html-in-canvas','HTML-in-Canvas'),
            ('https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API','canvas'),
            ('https://react.dev/learn','React'),
        ]):
            source.goto(live_url,wait_until='domcontentloaded',timeout=45000)
            trigger(source)
            deadline=time.monotonic()+5
            targets=cdp.send('Target.getTargets')['targetInfos']
            while not any(t.get('url')==f'chrome-extension://{extension_id}/popup.html' for t in targets) and time.monotonic()<deadline:
                source.wait_for_timeout(50);targets=cdp.send('Target.getTargets')['targetInfos']
            popup_target=next(t['targetId'] for t in targets if t.get('url')==f'chrome-extension://{extension_id}/popup.html')
            click_popup(popup_target)
            workspace.wait_for_function(f'() => document.querySelectorAll("canvas .clip-card").length==={index+4}',timeout=15000)
            workspace.locator('.card-list-select').last.click()
            text=workspace.get_by_role('textbox',name='整理圖文',exact=True).inner_text()
            check('live-site import '+live_url,len(text)>300 and phrase.lower() in text.lower(),{'characters':len(text),'paragraphs':text.count('\n\n')+1})
        # Restricted pages produce a clear failure without inserting a card.
        restricted=context.new_page();restricted.goto('chrome://version/')
        restricted_id=workspace.evaluate('''async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id''')
        response=workspace.evaluate('''async tabId => await chrome.runtime.sendMessage({type:'CAPTURE_ARTICLE',tabId})''',restricted_id)
        check('restricted-page error is explicit',not response.get('ok') and '一般 HTTP' in response.get('error',''),response)
        # Persistence across worker retirement does not rely on global variables.
        workers=[t for t in cdp.send('Target.getTargets')['targetInfos'] if t['type']=='service_worker' and extension_id in t.get('url','')]
        check('MV3 background worker registered',bool(workers))
        workspace.reload();workspace.wait_for_load_state('networkidle')
        check('extension IndexedDB persists across workspace reload',workspace.locator('.clip-card').count()==6)
        context.close()
except Exception:
    results.append({'name':'unexpected_failure','passed':False,'details':traceback.format_exc()})
    raise
finally:
    server.shutdown();server.server_close()
    (OUT/'extension-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
