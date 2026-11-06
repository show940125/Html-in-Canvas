from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,zipfile,traceback,base64
HERE=Path(__file__).resolve().parent;APP=HERE.parents[1];OUT=HERE/'output';OUT.mkdir(exist_ok=True)
results=[];errors=[];requests=[]
def check(name,value,detail=None):
 results.append({'name':name,'passed':bool(value),'details':detail});print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(detail or name)
def point(page,frame,node):
 outer=page.locator('iframe').first.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width}}');inner=node.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}');scale=outer['w']/frame.evaluate('innerWidth');return outer['x']+(inner['x']+inner['w']/2)*scale,outer['y']+(inner['y']+inner['h']/2)*scale
with sync_playwright() as p:
 chrome=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
 browser=p.chromium.launch(executable_path=chrome,headless=True)
 try:
  page=browser.new_page(viewport={'width':1280,'height':720});page.on('pageerror',lambda e:errors.append(str(e)))
  def deny(route):requests.append(route.request.url);route.abort()
  page.route('http://**/*',deny);page.route('https://**/*',deny)
  page.goto((HERE/'維他命C的好處_風格A_五頁.html').as_uri());page.wait_for_load_state('networkidle');page.wait_for_function('()=>typeof window.__playSlide==="function"');page.evaluate('async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))}')
  check('five distinct layouts and five notes',page.locator('#deck>.slide').count()==5 and page.evaluate('new Set([...document.querySelectorAll("#deck>.slide")].map(s=>s.dataset.layout)).size===5&&window.__SPEAKER_NOTES__.length===5'))
  for i in range(5):
   page.wait_for_function('()=>!lock');page.evaluate('(i)=>go(i)',i);page.wait_for_function('(i)=>window.__currentSlideIndex===i',arg=i);page.evaluate('(i)=>window.__playSlide(i)',i)
   if i==4:page.evaluate('()=>{for(let n=0;n<10;n++)if(!window.__pipeAdvance())break}')
   page.wait_for_function('()=>document.getAnimations().every(a=>a.playState!=="running")')
   issues=page.evaluate('''i=>{const s=document.querySelectorAll('#deck>.slide')[i],base=s.getBoundingClientRect();return[...s.querySelectorAll('h1,h2,h3,p,li,.kicker,.stat-label,.img-cap,.foot')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left<base.left-1||r.right>base.right+1||r.top< -1||r.bottom>721)}).map(e=>e.textContent.slice(0,70))}''',i)
   check(f'page {i+1} text stays within slide',not issues,issues);opacity=page.evaluate('''i=>{const s=document.querySelectorAll('#deck>.slide')[i];return [...s.querySelectorAll('h1,h2,h3,p,img')].filter(e=>{let o=1,n=e;while(n&&n!==s){o*=Number(getComputedStyle(n).opacity);n=n.parentElement}return o<.3}).map(e=>e.textContent.slice(0,30)||e.tagName)}''',i);check(f'page {i+1} content is readable after animation',not opacity,opacity);page.screenshot(path=str(OUT/f'slide-{i+1}.png'))
  check('standalone has no runtime errors or external requests',not errors and not requests,{'errors':errors,'requests':requests})
 finally:browser.close()
 context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),executable_path=chrome,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-blink-features=CanvasDrawElement'],viewport={'width':1600,'height':1000},device_scale_factor=1.5,accept_downloads=True)
 try:
  eid=context.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(APP/'dist')})['id'];page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_load_state('networkidle');frame=next(f for f in page.frames if 'stage.html' in f.url);frame.wait_for_selector('#cs-draw-root',state='attached')
  page.locator('input[type=file]').first.set_input_files(str(HERE/'維他命C_風格A_在線編輯測試.zip'));page.get_by_role('button',name='匯入並開始編輯').click();frame.wait_for_selector('[data-slide-id="vitamin-c-cover"]',state='attached')
  check('real plugin imports all five pages',page.locator('.slide-thumb').count()==5);check('Style A is recognized as magazine',page.locator('.canvas-heading').inner_text().find('雜誌風')>=0)
  title=frame.locator('h1');x,y=point(page,frame,title);page.mouse.dblclick(x,y);frame.wait_for_selector('[contenteditable=true]',state='attached');page.keyboard.press('Control+A');page.keyboard.insert_text('我的維他命Ｃ');page.locator('.canvas-heading').click();check('cover title edits with actual pointer and Chinese input',title.inner_text()=='我的維他命Ｃ')
  page.get_by_role('button',name='復原 Ctrl+Z').click();frame.wait_for_function('()=>document.querySelector("h1").textContent==="維他命Ｃ"');check('cover edit can undo',True)
  for i in range(5):
   page.locator('.slide-thumb').nth(i).click();ids=['vitamin-c-cover','collagen-and-repair','four-benefits','evidence-and-expectations','everyday-food-routine'];frame.wait_for_selector(f'[data-slide-id="{ids[i]}"]',state='attached');frame.wait_for_function('()=>Number(document.querySelector("#cs-canvas")?.dataset.paints)>0');page.screenshot(path=str(OUT/f'plugin-page-{i+1}.png'))
  page.locator('.slide-thumb').nth(1).click();frame.wait_for_selector('[data-slide-id="collagen-and-repair"]',state='attached');photo=frame.locator('img');check('relative photograph embeds and decodes',photo.evaluate('(e)=>e.src.startsWith("data:image/png")&&e.complete&&e.naturalWidth>1000'))
  x,y=point(page,frame,photo);page.mouse.click(x,y);page.get_by_role('button',name='替換圖片',exact=True).click();page.locator('input[type=file]').nth(2).set_input_files(str(HERE/'images'/'everyday-plate.png'));expected=base64.b64encode((HERE/'images'/'everyday-plate.png').read_bytes()).decode()[128:256];frame.wait_for_function('(token)=>document.querySelector("img").src.includes(token)&&document.querySelector("img").complete',arg=expected);check('photo replacement retains editable text',frame.locator('.feature-title').inner_text()=='修復的底氣')
  page.locator('.slide-thumb').nth(2).click();frame.wait_for_selector('[data-slide-id="four-benefits"]',state='attached');card=frame.locator('.stat-card').first;cid=card.get_attribute('data-cs-id');page.get_by_role('button',name='圖層',exact=True).click();page.locator(f'[data-layer-id="{cid}"]').click();page.get_by_role('button',name='設計',exact=True).click();page.get_by_role('button',name='轉成自由物件',exact=True).click();frame.wait_for_selector('.stat-card[data-cs-free=true]',state='attached');check('information card detaches as an HTML group',frame.locator('.stat-card[data-cs-free=true] .stat-note').count()==1)
  page.get_by_role('button',name='匯出',exact=True).click()
  with page.expect_download() as info:page.get_by_role('button',name='可再編輯專案',exact=False).click()
  info.value.save_as(OUT/'edited-test-project.zip')
  with zipfile.ZipFile(OUT/'edited-test-project.zip') as archive:deck=json.loads(archive.read('project.json'))
  check('edited deck exports five pages and stable notes',deck['family']=='magazine' and len(deck['slides'])==5 and all(s['id']==s['note']['id'] for s in deck['slides']))
  check('plugin test has no uncaught errors',not errors,errors)
 except Exception:
  traceback.print_exc();page.screenshot(path=str(OUT/'plugin-failure.png'));raise
 finally:
  (OUT/'verification.json').write_text(json.dumps({'results':results,'errors':errors,'externalRequests':requests},ensure_ascii=False,indent=2),encoding='utf-8');context.close()
