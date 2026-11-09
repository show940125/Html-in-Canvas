from browser_support import chrome_launch_options
"""Load the real MV3 build into an isolated installed Chrome profile.

CDP's official Extensions.triggerAction invokes the browser action, granting
activeTab just as a toolbar click does. No extra host permissions are added.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json, traceback, uuid, time
from urllib.parse import urlparse, parse_qs
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
        workspace=context.new_page();workspace_urls=[]
        workspace.on('framenavigated',lambda frame:workspace_urls.append(frame.url) if frame==workspace.main_frame else None)
        workspace.goto(f'chrome-extension://{extension_id}/index.html');workspace.wait_for_load_state('networkidle')
        workspace.get_by_role('button',name='新增卡片',exact=True).wait_for()
        check('extension origin supports native Canvas',workspace.locator('.board-surface').get_attribute('data-mode')=='native')
        source=context.new_page()
        def trigger(page):
            page.bring_to_front()
            targets=cdp.send('Target.getTargets',{'filter':[{'type':'tab','exclude':False}]})['targetInfos']
            target=next(t['targetId'] for t in targets if t.get('url')==page.url)
            cdp.send('Extensions.triggerAction',{'id':extension_id,'targetId':target})
        def click_popup(target_id,destination_id=None):
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
                if request not in replies: raise TimeoutError('Popup command did not complete: '+method)
                response=replies[request]
                if 'error' in response: raise RuntimeError(response['error'])
                return response.get('result',{})
            def evaluate(expression):
                return command('Runtime.evaluate',{'expression':expression,'returnByValue':True}).get('result',{}).get('value')
            def wait_value(expression):
                deadline=time.monotonic()+15
                while time.monotonic()<deadline:
                    value=evaluate(expression)
                    if value:return value
                    source.wait_for_timeout(30)
                raise TimeoutError('Popup state did not become ready: '+expression)
            def click_at(dom,may_close=False):
                command('Input.dispatchMouseEvent',{'type':'mousePressed','x':dom['x'],'y':dom['y'],'button':'left','clickCount':1})
                try: command('Input.dispatchMouseEvent',{'type':'mouseReleased','x':dom['x'],'y':dom['y'],'button':'left','clickCount':1})
                except Exception:
                    if not may_close or any(t['targetId']==target_id for t in cdp.send('Target.getTargets')['targetInfos']):raise
            def key(name,code):
                for phase in ['keyDown','keyUp']:
                    command('Input.dispatchKeyEvent',{'type':phase,'key':name,'code':name,'windowsVirtualKeyCode':code})
            try:
                wait_value("(()=>{const s=document.querySelector('[aria-label=\"收集目的專案\"]');return s&&!s.disabled&&s.options.length?s.value:null})()")
                if destination_id:
                    select=evaluate("(()=>{const s=document.querySelector('select'),r=s.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,ids:[...s.options].map(o=>o.value)}})()")
                    assert destination_id in select['ids'],'Destination missing from popup'
                    click_at(select);key('Home',36)
                    for _ in range(select['ids'].index(destination_id)):key('ArrowDown',40)
                    key('Enter',13)
                    check('popup destination changes by keyboard',evaluate("document.querySelector('select').value")==destination_id)
                destination=evaluate("document.querySelector('select').selectedOptions[0].textContent")
                dom=wait_value("(()=>{const b=document.querySelector('.button-primary:not(:disabled)');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,text:b.textContent}})()")
                check('actual toolbar popup button visible','匯入目前文章' in dom['text'])
                click_at(dom)
                success=wait_value("document.querySelector('.popup-success [role=status]')?.textContent")
                check('popup confirms saved destination',destination in success,success)
                view=wait_value("(()=>{const b=document.querySelector('.popup-success button:not(:disabled)');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,text:b.textContent}})()")
                check('popup offers explicit view action','查看剛加入的材料' in view['text'])
                click_at(view,may_close=True)
            finally: cdp.remove_listener('Target.receivedMessageFromTarget',incoming)
        def selected_text():
            reopen=workspace.get_by_role('button',name='展開右側欄',exact=True)
            if reopen.count():reopen.click()
            workspace.get_by_role('tab',name='內容',exact=True).click()
            workspace.get_by_role('button',name='整理稿',exact=True).click()
            return workspace.get_by_role('textbox',name='整理圖文',exact=True).inner_text()
        for index,kind in enumerate(['news','docs','research']):
            source.goto(base+'/fixture/'+kind);source.wait_for_load_state('networkidle')
            trigger(source)
            deadline=time.monotonic()+5
            targets=cdp.send('Target.getTargets')['targetInfos']
            while not any(t.get('url')==f'chrome-extension://{extension_id}/popup.html' for t in targets) and time.monotonic()<deadline:
                source.wait_for_timeout(50)
                targets=cdp.send('Target.getTargets')['targetInfos']
            popup_target=next(t['targetId'] for t in targets if t.get('url')==f'chrome-extension://{extension_id}/popup.html')
            click_popup(popup_target)
            workspace.wait_for_function(f'() => document.querySelectorAll("canvas .clip-card").length==={index+1}',timeout=15000)
            check('article captured '+kind,workspace.locator('.clip-card').count()==index+1)
            workspace.locator('.card-list-select').last.click()
            text=selected_text()
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
            text=selected_text()
            check('live-site import '+live_url,len(text)>300 and phrase.lower() in text.lower(),{'characters':len(text),'paragraphs':text.count('\n\n')+1})
        def project_rows():
            return workspace.evaluate('''async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});const rows=await new Promise((resolve,reject)=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});db.close();return rows.map(p=>({id:p.id,title:p.title,ids:p.cards.map(c=>c.id)}))}''')
        original=project_rows()[0]
        workspace.get_by_role('button',name='新增專案',exact=True).click()
        workspace.get_by_role('textbox',name='新專案名稱',exact=True).fill('第二專案｜收集目的地驗收')
        workspace.locator('dialog form button[type=submit]').click()
        workspace.wait_for_function('()=>document.querySelectorAll(".clip-card").length===0')
        rows=project_rows();other=next(row for row in rows if row['id']!=original['id'])
        check('second destination project created',len(rows)==2 and len(other['ids'])==0,rows)
        source.goto(base+'/fixture/destination');source.wait_for_load_state('networkidle');trigger(source)
        deadline=time.monotonic()+5
        targets=cdp.send('Target.getTargets')['targetInfos']
        while not any(t.get('url')==f'chrome-extension://{extension_id}/popup.html' for t in targets) and time.monotonic()<deadline:
            source.wait_for_timeout(50);targets=cdp.send('Target.getTargets')['targetInfos']
        popup_target=next(t['targetId'] for t in targets if t.get('url')==f'chrome-extension://{extension_id}/popup.html')
        click_popup(popup_target,original['id'])
        workspace.wait_for_function('()=>document.querySelectorAll(".clip-card").length===7')
        rows=project_rows();chosen=next(row for row in rows if row['id']==original['id']);untouched=next(row for row in rows if row['id']==other['id'])
        check('capture writes only selected destination',len(chosen['ids'])==7 and not untouched['ids'],rows)
        new_id=next(value for value in chosen['ids'] if value not in original['ids'])
        check('view navigation identifies newly captured material',any(parse_qs(urlparse(url).query).get('clip')==[new_id] for url in workspace_urls),workspace_urls[-4:])
        workspace.wait_for_function('(id)=>document.querySelector(`[data-card-id="${id}"]`)?.classList.contains("selected")',arg=new_id)
        workspace.wait_for_function('()=>!new URLSearchParams(location.search).has("clip")&&document.querySelector(".board-surface").dataset.layoutMotion==="idle"')
        check('captured material selected after explicit view',workspace.locator(f'[data-card-id="{new_id}"].selected').count()==1)
        card_box=workspace.locator(f'[data-card-id="{new_id}"]').bounding_box();board_box=workspace.locator('.board-surface').bounding_box()
        check('captured material located inside viewport',card_box['x']>=board_box['x']-2 and card_box['y']>=board_box['y']-2 and card_box['x']+card_box['width']<=board_box['x']+board_box['width']+2 and card_box['y']+card_box['height']<=board_box['y']+board_box['height']+2,{'card':card_box,'board':board_box})
        tab_id=workspace.evaluate('''async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url)?.id''',source.url)
        response=workspace.evaluate('''async tabId=>await chrome.runtime.sendMessage({type:'CAPTURE_ARTICLE',tabId,projectId:'missing-project-id',openAfterCapture:false})''',tab_id)
        check('invalid destination rejected without write',not response.get('ok') and '目的專案' in response.get('error','') and project_rows()==rows,response)
        # Restricted pages produce a clear failure without inserting a card.
        restricted=context.new_page();restricted.goto('chrome://version/')
        restricted_id=workspace.evaluate('''async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id''')
        response=workspace.evaluate('''async tabId => await chrome.runtime.sendMessage({type:'CAPTURE_ARTICLE',tabId})''',restricted_id)
        check('restricted-page error is explicit',not response.get('ok') and '一般 HTTP' in response.get('error',''),response)
        # Persistence across worker retirement does not rely on global variables.
        workers=[t for t in cdp.send('Target.getTargets')['targetInfos'] if t['type']=='service_worker' and extension_id in t.get('url','')]
        check('MV3 background worker registered',bool(workers))
        workspace.reload();workspace.wait_for_load_state('networkidle')
        check('extension IndexedDB persists across workspace reload',workspace.locator('.clip-card').count()==7)
        context.close()
except Exception:
    results.append({'name':'unexpected_failure','passed':False,'details':traceback.format_exc()})
    raise
finally:
    server.shutdown();server.server_close()
    (OUT/'extension-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
