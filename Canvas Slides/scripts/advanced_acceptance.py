from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,traceback,struct,zlib,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'advanced';OUT.mkdir(parents=True,exist_ok=True)
results=[];errors=[]
def check(name,value,detail=None):
 results.append({'name':name,'passed':bool(value),'details':detail});print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(detail or name)
def png():
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',80,40,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes([25,150,100,255])*80)*40))+chunk(b'IEND',b'')
html='''<!doctype html><html lang="zh-Hant"><title>AI 匯入測試</title><style>body{font-family:system-ui;background:white}.slide{padding:70px;background:#faf8f1;color:#253a34;display:grid;grid-template-columns:1fr 1fr;gap:35px}.slide h1{font-size:52px;line-height:1.3;margin:0}.slide p{font-size:24px}.slide img{width:300px;height:150px}.slide .card{border-top:2px solid #39936e;padding-top:20px}</style><div id="deck"><section class="slide" data-slide-id="one"><div><h1>可編輯的 HTML</h1><p>保留 Grid 排版與繁體中文。</p></div><div class="card"><img src="photo.png"><p>圖片與文字一起保存。</p></div></section><section class="slide" data-slide-id="two"><h1>第二頁</h1><p>獨立的頁面。</p></section></div><script>window.importedScriptMustNotRun=1</script></html>'''
def point(page,frame,node,offset=None):
 outer=page.locator('iframe').first.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width}}');inner=node.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}');scale=outer['w']/frame.evaluate('innerWidth');return outer['x']+(inner['x']+(offset[0] if offset else inner['w']/2))*scale,outer['y']+(inner['y']+(offset[1] if offset else inner['h']/2))*scale,scale
with sync_playwright() as p:
 context=None
 try:
  chrome=Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe');options={'executable_path':str(chrome)} if chrome.is_file() else {'channel':'chromium'}
  context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),**options,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-blink-features=CanvasDrawElement'],viewport={'width':1600,'height':1000},device_scale_factor=1.5,accept_downloads=True)
  eid=context.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id'];page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_load_state('networkidle');frame=next(f for f in page.frames if 'stage.html' in f.url);frame.wait_for_selector('#cs-draw-root',state='attached')
  page.locator('input[type=file]').first.set_input_files([{'name':'index.html','mimeType':'text/html','buffer':html.encode()},{'name':'photo.png','mimeType':'image/png','buffer':png()}]);page.get_by_role('button',name='匯入並開始編輯').click();frame.wait_for_selector('[data-slide-id="one"]',state='attached')
  check('AI HTML import preserves both slides',page.locator('.slide-thumb').count()==2)
  check('unknown imported script never executes',frame.evaluate('window.importedScriptMustNotRun') is None)
  check('local image is embedded and decoded',frame.locator('img').evaluate('(e)=>e.src.startsWith("data:image/png")&&e.complete&&e.naturalWidth===80'))
  title=frame.locator('h1');paragraph=frame.locator('p').first;before=paragraph.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y}}');title_id=title.get_attribute('data-cs-id');x,y,scale=point(page,frame,title);page.mouse.click(x,y);page.get_by_role('button',name='轉成自由物件').click();frame.wait_for_selector('h1[data-cs-free="true"]',state='attached')
  after=paragraph.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y}}');check('detaching preserves neighboring Grid layout',abs(before['x']-after['x'])<1 and abs(before['y']-after['y'])<1,{'before':before,'after':after})
  x,y,scale=point(page,frame,title,(50,30));page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+60*scale,y+35*scale,steps=8);page.mouse.up();check('native pointer drags the detached object',title.evaluate('(e)=>e.style.translate') not in ['','none','0px 0px'],title.evaluate('(e)=>e.style.translate'))
  handle=frame.locator('.moveable-se').first;w=title.evaluate('(e)=>e.getBoundingClientRect().width');x,y,scale=point(page,frame,handle);page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+35*scale,y+20*scale,steps=8);page.mouse.up();check('resize control changes actual HTML geometry',title.evaluate('(e)=>e.getBoundingClientRect().width')>w+10)
  page.get_by_role('spinbutton',name='旋轉角度').fill('15');check('rotation writes a real style',title.evaluate('(e)=>e.style.rotate')=='15deg')
  page.get_by_role('button',name='新增圓形').click();circle=frame.locator('[data-cs-free="true"]').last;circle_id=circle.get_attribute('data-cs-id')
  rect=lambda node:node.evaluate('(e)=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height]}')
  before_group=rect(title)
  page.get_by_role('button',name='圖層',exact=True).click();page.locator(f'[data-layer-id="{title_id}"]').click(modifiers=['Shift']);page.get_by_role('button',name='設計',exact=True).click();page.get_by_role('button',name='群組',exact=True).click();frame.wait_for_selector('[data-cs-group="true"]',state='attached');check('group creates one movable HTML object',frame.locator('[data-cs-group="true"]>[data-cs-id]').count()==2)
  check('grouping preserves rotated child geometry',all(abs(a-b)<1 for a,b in zip(before_group,rect(title))),{'before':before_group,'after':rect(title)})
  group=frame.locator('[data-cs-group="true"]');handle=frame.locator('.moveable-se').first;x,y,scale=point(page,frame,handle);page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+45*scale,y+25*scale,steps=8);page.mouse.up();check('group resize scales its actual content',group.evaluate('(e)=>e.style.scale') not in ['','none','1 1'])
  page.get_by_role('spinbutton',name='旋轉角度').fill('12');before_ungroup=rect(title)
  page.get_by_role('button',name='解散群組',exact=True).click();check('ungroup restores individual objects',frame.locator('[data-cs-group="true"]').count()==0)
  check('ungroup preserves scaled and rotated child geometry',all(abs(a-b)<1.2 for a,b in zip(before_ungroup,rect(title))),{'before':before_ungroup,'after':rect(title)})
  page.get_by_role('button',name='圖層',exact=True).click();page.locator(f'[data-layer-id="{circle_id}"]').click();page.get_by_role('button',name='設計',exact=True).click();page.get_by_role('button',name='鎖定或解鎖物件').click();check('lock is persisted on the object',frame.locator(f'[data-cs-id="{circle_id}"]').get_attribute('data-cs-locked')=='true')
  page.get_by_role('button',name='刪除物件').click();check('locked object cannot be deleted',frame.locator(f'[data-cs-id="{circle_id}"]').count()==1)
  page.get_by_role('button',name='匯出',exact=True).click()
  with page.expect_download() as info:page.get_by_role('button',name='目前投影片 PNG',exact=False).click()
  info.value.save_as(OUT/'generic-export.png');check('native full-page PNG exports actual pixels',(OUT/'generic-export.png').stat().st_size>2000)
  with page.expect_download() as info:page.get_by_role('button',name='可再編輯專案',exact=False).click()
  info.value.save_as(OUT/'generic-project.zip');page.get_by_role('button',name='關閉對話框').click();page.locator('input[type=file]').first.set_input_files(str(OUT/'generic-project.zip'));page.wait_for_function('() => document.querySelector("input[aria-label=簡報名稱]").value.includes("匯入副本")');frame.wait_for_selector('[data-slide-id="one"]',state='attached');check('project ZIP reimports geometry and embedded image',frame.locator('h1[data-cs-free]').count()==1 and frame.locator('img').evaluate('(e)=>e.src.startsWith("data:")'))
  page.screenshot(path=str(OUT/'generic-editor.png'))
  check('no uncaught errors during free editing and roundtrip',not errors,errors)
 except Exception:
  traceback.print_exc()
  if context:
   for i,page in enumerate(context.pages):
    try:page.screenshot(path=str(OUT/f'failure-{i}.png'))
    except Exception:pass
  raise
 finally:
  (OUT/'results.json').write_text(json.dumps({'results':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
  if context:context.close()
