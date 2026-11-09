from browser_support import chrome_launch_options,software_args
"""Real browser acceptance for v0.3. All material is generated fixture content."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
import json,traceback,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v03';OUT.mkdir(parents=True,exist_ok=True);checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,passed,detail=None):
 checks.append(dict(name=name,passed=bool(passed),detail=detail));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
def saved(page):
 page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');page.locator('.save-state.saved').wait_for(state='attached',timeout=15000)

def panel(page,side,opened):
 if page.locator('.app-v3').get_attribute('data-'+side)==('open' if opened else 'closed'):return
 names={'left':'左側欄','right':'右側欄','top':'上方欄'}
 page.get_by_role('button',name=('展開' if opened else '收起')+names[side],exact=True).first.click()
 page.wait_for_function('([side,value])=>document.querySelector(".app-v3").dataset[side]===value',arg=[side,'open' if opened else 'closed'])
 # Panel width changes move the remaining toolbar controls. Wait for layout
 # and native Canvas hit geometry before targeting another control.
 page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
def data(page):return page.evaluate('''async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const rows=await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result)});db.close();return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];}''')
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement']+software_args())
  context=browser.new_context(viewport={'width':1680,'height':1100},accept_downloads=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.locator('input[accept^=".json"]').set_input_files(ROOT/'tests'/'fixtures'/'acceptance-fixture.json');page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===20');saved(page)
   check('v3 native desk loads',page.locator('.board-surface').get_attribute('data-mode')=='native')
   page.get_by_role('button',name='主題與介面',exact=True).click();settings=page.get_by_role('dialog',name='主題與介面');settings.get_by_role('button',name='海藍',exact=True).click();settings.get_by_label('明暗模式').select_option('dark');settings.get_by_role('button',name='完成',exact=True).click()
   check('palette and dark theme apply',page.locator('.app-v3').get_attribute('data-palette')=='ocean' and page.locator('.app-v3').get_attribute('data-theme')=='dark')
   for side in ['left','right','top']:panel(page,side,True)
   for side in ['left','right','top']:panel(page,side,False)
   check('all three panels collapse',all(page.locator('.app-v3').get_attribute('data-'+s)=='closed' for s in ['left','right','top']))
   page.reload();page.wait_for_load_state('networkidle');check('panel and appearance preferences survive reload',all(page.locator('.app-v3').get_attribute('data-'+side)=='closed' for side in ['left','right','top']) and page.locator('.app-v3').get_attribute('data-theme')=='dark')
   for side in ['left','right','top']:panel(page,side,True)
   page.locator('.card-list-select').first.click();page.get_by_role('button',name='建立主題框',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_label('主題名稱',exact=True).fill('磁吸驗收');modal.get_by_label('主題框型',exact=True).select_option('folder');modal.get_by_label('文章預設框型',exact=True).select_option('hexagon');modal.get_by_role('button',name='建立 ↗',exact=True).click();saved(page)
   check('group frame and card inheritance persist',data(page)['groups'][0]['frame']=='folder' and 'frame-hexagon' in page.locator('.clip-card').first.get_attribute('class'))
   before=data(page);box=page.locator('.board-surface').bounding_box();handle=page.locator('.card-handle').nth(1).bounding_box();page.mouse.move(handle['x']+60,handle['y']+12);page.mouse.down();page.mouse.move(box['x']+350+before['view']['x'],box['y']+150+before['view']['y'],steps=10);page.locator('.drop-hint').wait_for()
   check('drag preview precedes persistence',data(page)['groups'][0]['width']==before['groups'][0]['width'] and page.locator('.group-frame').first.evaluate('(e)=>e.offsetWidth')>before['groups'][0]['width'])
   page.mouse.up();saved(page);check('drop commits preview membership and expanded frame',data(page)['cards'][1].get('groupId')==data(page)['groups'][0]['id'] and data(page)['groups'][0]['width']>before['groups'][0]['width'])
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page);check('magnetic drop undo restores whole layout',not data(page)['cards'][1].get('groupId') and data(page)['groups'][0]['width']==before['groups'][0]['width'])
   page.get_by_role('button',name='重做操作',exact=True).click();saved(page)
   page.get_by_role('button',name='聚焦主題 磁吸驗收',exact=True).click();check('topic focus retains live selected HTML',page.locator('.focus-muted').count()==18)
   page.screenshot(path=str(OUT/'magnetic-desk.png'))
   page.locator('.card-list-select').first.click();page.locator('.card-list-select').nth(1).click(modifiers=['Control']);page.get_by_role('button',name='建立關係',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_label('關係說明').fill('素材之間的關係');modal.get_by_role('button',name='建立 ↗',exact=True).click();saved(page)
   page.get_by_role('button',name='輸出圖片',exact=True).click();export=page.get_by_role('dialog',name='圖文圖片輸出');export.locator('canvas[data-ready=true]').wait_for()
   with page.expect_download() as download:export.get_by_role('button',name='下載圖片',exact=True).click()
   download.value.save_as(OUT/'selection.png');check('composite PNG exports with relationship layer',(OUT/'selection.png').stat().st_size>8000 and export.locator('.export-relations path').count()>1)
   export.get_by_role('button',name='關閉圖片輸出',exact=True).click()
   page.get_by_role('button',name='雙篇比較',exact=False).click();reader=page.get_by_role('dialog',name='雙篇比較');reader.wait_for()
   page.wait_for_function('()=>document.querySelector(".reader-panel")?.dataset.transition==="idle"',timeout=15000)
   check('two-column reader retains native Canvas',reader.locator('.reading-column').count()==2 and reader.locator('.interactive-surface').get_attribute('data-surface-mode')=='native')
   note=reader.get_by_role('textbox',name='閱讀筆記 1');native_click_note=note.bounding_box();page.mouse.click(native_click_note['x']+20,native_click_note['y']+20)
   check('native comparison note receives pointer focus after transition',note.evaluate('e=>document.activeElement===e'))
   page.keyboard.press('Control+A');page.keyboard.insert_text('比較閱讀的中文筆記');saved(page);check('native comparison note persists under dark theme',note.input_value()=='比較閱讀的中文筆記');reader.get_by_role('button',name='關閉閱讀',exact=True).click();reader.wait_for(state='hidden')
   page.get_by_role('button',name='書本閱讀',exact=False).first.click();book=page.get_by_role('dialog',name='書本閱讀');book.get_by_role('button',name='下一頁',exact=True).wait_for();page.wait_for_function('()=>!document.querySelector(".book-loading")',timeout=60000)
   check('long articles paginate into multiple pages',not book.locator('[role=alert]').count() and int(book.get_by_label('閱讀頁碼',exact=True).inner_text().split('/')[-1])>20,book.locator('[role=alert]').all_text_contents())
   check('book uses real WebGL HTML textures',book.locator('canvas[data-renderer="webgl2-html-book"]').count()==1,book.locator('.book-renderer').inner_text())
   first=book.get_by_label('閱讀頁碼',exact=True).inner_text();book.get_by_role('button',name='下一頁',exact=True).click();page.wait_for_function('value=>document.querySelector("[aria-label=閱讀頁碼]").textContent!==value',arg=first,timeout=15000);check('functional GPU turn advances pages',book.get_by_label('閱讀頁碼',exact=True).inner_text()!=first)
   book.get_by_role('button',name='閱讀筆記',exact=True).click();page.wait_for_function('()=>!document.querySelector(".book-loading")',timeout=60000);book.get_by_role('textbox',name='書本閱讀筆記').fill('書本閱讀中文筆記');saved(page);check('book note uses native text input',book.get_by_role('textbox',name='書本閱讀筆記').input_value()=='書本閱讀中文筆記')
   page.screenshot(path=str(OUT/'live-html-book.png'));book.get_by_role('button',name='關閉書本閱讀',exact=True).click();saved(page);check('reading anchor persists',bool(data(page).get('readingProgress')))
   page.get_by_role('button',name='新增卡片',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_label('新卡片標題',exact=True).fill('復原後仍保留筆記');modal.get_by_label('新卡片內容',exact=True).fill('新建材料的文字。');modal.get_by_role('button',name='加入卡片板 ↗',exact=True).click();saved(page);page.get_by_role('textbox',name='我的筆記',exact=True).fill('建立後才新增的觀點，重做也要保留。');saved(page)
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page);check('undo creation removes the material',len(data(page)['cards'])==20);page.get_by_role('button',name='重做操作',exact=True).click();saved(page);check('redo creation retains later note edits',next(c for c in data(page)['cards'] if c['title']=='復原後仍保留筆記')['note']=='建立後才新增的觀點，重做也要保留。')
   page.set_viewport_size({'width':600,'height':900});page.screenshot(path=str(OUT/'narrow-desk.png'));check('narrow workspace avoids horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   check('no unhandled browser errors',not errors,errors)
  except Exception:
   page.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure-dom.html').write_text(page.content(),encoding='utf-8');print('ERRORS',errors,flush=True);print('ALERTS',page.locator('[role=alert]').all_text_contents(),flush=True);raise
  finally:context.close();browser.close()
except Exception:checks.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'acceptance.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
