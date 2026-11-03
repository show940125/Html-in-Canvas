from browser_support import chrome_launch_options,synthetic_png,software_args
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import json,zipfile,hashlib,traceback
from playwright.sync_api import sync_playwright
import pymupdf
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v03'/'deep';OUT.mkdir(parents=True,exist_ok=True);checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/source-link':self.send_response(200);self.end_headers();self.wfile.write(b'<title>Link fixture</title>Native HTML link works')
  else:super().do_GET()
def check(name,passed,detail=None):
 checks.append(dict(name=name,passed=bool(passed),detail=detail));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
def saved(page):
 page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');page.locator('.save-state.saved').wait_for(state='attached',timeout=15000)
def rows(page):return page.evaluate('''async()=>{const db=await new Promise(r=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result)});const rows=await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result)});db.close();return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}''')
def current(page):return rows(page)[0]
def native_click(page,loc):
 r=loc.bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
def wait_book(page):page.wait_for_function('()=>!document.querySelector(".book-loading")',timeout=60000)
def center(page):return page.locator('.board-surface').evaluate('e=>{const c=document.querySelector(".native-canvas");return {w:e.clientWidth,h:e.clientHeight};}')
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement']+software_args())
  context=browser.new_context(viewport={'width':1680,'height':1100},device_scale_factor=1.5,reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(base+'/index.html');page.wait_for_load_state('networkidle')
   p0=json.loads((ROOT/'tests'/'fixtures'/'acceptance-fixture.json').read_text(encoding='utf-8'))['project'];p0['title']='示例｜深度驗收';p0['cards']=p0['cards'][:3]
   raw=synthetic_png();sha=hashlib.sha256(raw).hexdigest();doc={'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'測試來源連結','marks':[{'type':'link','attrs':{'href':base+'/source-link'}}]}]},{'type':'paragraph','content':[{'type':'text','text':'完整保留長段落與繁體中文 🧑‍💻。'*300,'marks':[{'type':'bold'}]}]},{'type':'orderedList','content':[{'type':'listItem','content':[{'type':'paragraph','content':[{'type':'text','text':f'第 {i} 個清單項目，內容完整保留。'}]}]} for i in range(12)]},{'type':'image','attrs':dict(assetId=sha,sourceUrl='',alt='測試圖片',caption='這是需要完整保留的圖片說明。',width=320,status='ready')},{'type':'codeBlock','content':[{'type':'text','text':'\n'.join(f'const value{i} = "程式碼內容";' for i in range(50))}]}]}
   for i,c in enumerate(p0['cards']):c['title']=['長文與圖文','待移入文章','鄰近主題文章'][i];c['tagIds']=[]
   p0['cards'][0].update(originalDoc=doc,editedDoc=doc,groupId='a',x=48,y=104);p0['cards'][1].update(x=460,y=104);p0['cards'][2].update(groupId='b',x=674,y=104)
   p0['groups']=[dict(id='a',title='主要題目',color='#dde8cb',x=24,y=24,width=356,height=478,collapsed=False,frame='folder',cardFrame='rounded'),dict(id='b',title='鄰近題目',color='#d9e8ed',x=650,y=24,width=356,height=478,collapsed=False)];p0['relations']=[];p0['tags']=[];p0['outline']={'groupIds':['a','b'],'cardIds':[c['id'] for c in p0['cards']]}
   fixture=OUT/'fixture.zip'
   with zipfile.ZipFile(fixture,'w') as z:z.writestr('assets/'+sha,raw);z.writestr('manifest.json',json.dumps(dict(format='canvas-clipper-workspace',version=3,projects=[p0],assets=[dict(id=sha,mime='image/png',width=320,height=140,sourceUrl='',createdAt='2026-11-03T00:00:00Z')])))
   page.locator('input[accept^=".json"]').set_input_files(fixture);page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===3');saved(page)
   check('v3 ZIP with image imports at 150 percent',page.locator('.card-thumbnail').count()==1 and page.locator('.native-canvas').evaluate('c=>Math.abs(c.width/c.clientWidth-1.5)<.01'))
   before=current(page);dims=center(page);world=((dims['w']/2-before['view']['x'])/before['view']['zoom'],(dims['h']/2-before['view']['y'])/before['view']['zoom']);page.get_by_role('button',name='收起右側欄',exact=True).click();saved(page);after=current(page);dims2=center(page);new_world=((dims2['w']/2-after['view']['x'])/after['view']['zoom'],(dims2['h']/2-after['view']['y'])/after['view']['zoom']);check('panel changes preserve canvas center',max(abs(a-b) for a,b in zip(world,new_world))<1,dict(world=world,new_world=new_world,beforeView=before['view'],afterView=after['view'],beforeSize=dims,afterSize=dims2));page.get_by_role('button',name='展開右側欄',exact=True).first.click();saved(page)
   page.locator('.card-list-select').first.click()
   paths=[]
   for shape in ['rounded','cut','note','folder','bubble','hexagon']:
    page.get_by_label('文章框型',exact=True).select_option(shape);saved(page);paths.append(page.locator('.clip-card').first.locator('.frame-art path').get_attribute('d'))
   check('all six article frames render distinct geometry',len(set(paths))==6)
   note=page.get_by_role('textbox',name='卡片筆記 1',exact=True);native_click(page,note);page.keyboard.press('Control+A');page.keyboard.insert_text('150% 六角框中文輸入');saved(page);check('nonrectangular card has correct native input geometry',note.input_value()=='150% 六角框中文輸入')
   old=current(page);page.evaluate('()=>{window.testEvents=[];for(const type of ["pointerdown","pointermove"])document.addEventListener(type,e=>window.testEvents.push({type,clientX:e.clientX,clientY:e.clientY,tag:e.target.tagName,cls:e.target.className}),true)}');resize=page.get_by_role('button',name='調整卡片 1 尺寸',exact=True).bounding_box();page.mouse.move(resize['x']+resize['width']/2,resize['y']+resize['height']/2);page.mouse.down();page.mouse.move(resize['x']+100,resize['y']+100,steps=8);page.mouse.up();saved(page);check('shape-safe native resize updates dimensions',current(page)['cards'][0]['width']>old['cards'][0].get('width',308)+50,dict(old=old['cards'][0].get('width'),new=current(page)['cards'][0].get('width'),resizeBox=resize,events=page.evaluate('window.testEvents')))
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page)
   before=current(page);board=page.locator('.board-surface').bounding_box();handle=page.locator('.card-handle').nth(1).bounding_box();page.mouse.move(handle['x']+60,handle['y']+12);page.mouse.down();page.mouse.move(board['x']+before['view']['x']+350,board['y']+before['view']['y']+180,steps=8);page.locator('.drop-hint').wait_for();page.keyboard.press('Escape');page.mouse.up();saved(page);check('Escape rolls back preview and all neighbors',current(page)==before)
   handle=page.locator('.card-handle').nth(1).bounding_box();page.mouse.move(handle['x']+60,handle['y']+12);page.mouse.down();page.mouse.move(board['x']+before['view']['x']+350,board['y']+before['view']['y']+180,steps=8);check('neighbors yield before drop without writing',current(page)==before);page.mouse.up();saved(page);moved=current(page);neighbor=next(g for g in moved['groups'] if g['title']=='鄰近題目');old_neighbor=next(g for g in before['groups'] if g['title']=='鄰近題目');check('neighbor frame moves with its articles',neighbor['x']>old_neighbor['x'] and moved['cards'][2]['x']-neighbor['x']==24)
   page.get_by_role('button',name='收合主題 主要題目',exact=True).click();saved(page);before=current(page);g=before['groups'][0];handle=page.locator('.card-handle').nth(2).bounding_box();board=page.locator('.board-surface').bounding_box();page.mouse.move(handle['x']+50,handle['y']+12);page.mouse.down();page.mouse.move(board['x']+g['x']+80+before['view']['x'],board['y']+g['y']+25+before['view']['y'],steps=8);page.wait_for_timeout(500);check('collapsed topic expands transiently after hover',current(page)['groups'][0]['collapsed'] and page.locator('.group-frame').first.evaluate('e=>e.offsetHeight')>100);page.keyboard.press('Escape');page.mouse.up();check('cancel restores collapsed topic',page.locator('.group-frame.collapsed').count()==1);page.get_by_role('button',name='展開主題 主要題目',exact=True).click();saved(page)
   page.get_by_role('button',name='書本閱讀',exact=False).first.click();wait_book(page);book=page.get_by_role('dialog',name='書本閱讀');page.wait_for_function('()=>!!document.querySelector(".book-canvas[data-renderer]")')
   expected=book.locator('[data-source-card]').evaluate_all('els=>Object.fromEntries(els.map(e=>[e.dataset.sourceCard,e.querySelector(".rich-content").textContent]))');actual={k:'' for k in expected};images=0
   for step in range(150):
    parts=book.locator('.book-drawable .book-html-page').evaluate_all('els=>els.map(e=>({card:e.dataset.bookCard,text:e.querySelector(".book-page-body").textContent,images:e.querySelectorAll("img").length}))')
    for part in parts:actual[part['card']]+=part['text'];images+=part['images']
    next_button=book.get_by_role('button',name='下一頁',exact=True)
    if next_button.is_disabled():break
    previous=book.get_by_label('閱讀頁碼',exact=True).inner_text();next_button.click();page.wait_for_function('(previous)=>document.querySelector("[aria-label=閱讀頁碼]").textContent!==previous',arg=previous)
   check('paginated rich text has no lost or duplicated characters',actual==expected,{k:{'expected':len(expected[k]),'actual':len(actual[k])} for k in expected});check('pagination preserves raster and caption',images==1)
   # Return to the first spread to test actual GPU text and link hit regions.
   for step in range(150):
    previous=book.get_by_role('button',name='上一頁',exact=True)
    if previous.is_disabled():break
    previous.click()
   paragraph=book.locator('.book-drawable .book-page-body p').nth(1);r=paragraph.bounding_box();page.mouse.move(r['x']+2,r['y']+14);page.mouse.down();page.mouse.move(r['x']+160,r['y']+14,steps=8);page.mouse.up();selected=page.evaluate('getSelection().toString()');check('native text selection works on GPU pages',len(selected)>3,selected[:50])
   with page.expect_popup() as popup:native_click(page,book.locator('.book-drawable a').first)
   popup.value.wait_for_load_state('domcontentloaded');check('native link on GPU page opens its real target',popup.value.url==base+'/source-link');popup.value.close()
   page.screenshot(path=str(OUT/'book-150-selection.png'));book.get_by_role('button',name='關閉書本閱讀',exact=True).click();saved(page)
   page.get_by_label('HTML 模式',exact=True).check();check('DOM fallback preserves variable shapes and topic membership',page.locator('.board-surface').get_attribute('data-mode')=='dom' and 'frame-hexagon' in page.locator('.clip-card').first.get_attribute('class'))
   page.get_by_role('button',name='書本閱讀',exact=False).first.click();wait_book(page);book=page.get_by_role('dialog',name='書本閱讀');check('book has a working flat HTML fallback',book.locator('.book-flat-spread').count()==1);book.get_by_role('button',name='關閉書本閱讀',exact=True).click()
   page.get_by_role('tab',name='▤ 文件檢視',exact=True).click();page.locator('.document-viewport img').first.evaluate('img=>img.decode()');pdf_path=OUT/'illustrated.pdf';page.pdf(path=str(pdf_path),prefer_css_page_size=True,print_background=True);pdf=pymupdf.open(pdf_path);text=''.join(p.get_text() for p in pdf);check('PDF preserves Chinese text and image after v3 styles','主要題目' in text and '程式碼內容' in text and sum(len(p.get_images()) for p in pdf)>0);pdf.close()
   page.get_by_role('tab',name='▦ 閱讀桌',exact=True).click()
   page.get_by_role('button',name='輸出主題圖片 主要題目',exact=True).click();export=page.get_by_role('dialog',name='圖文圖片輸出');export.get_by_label('圖片格式').select_option('image/jpeg');export.get_by_label('圖片倍率').select_option('2');export.locator('canvas[data-ready=true]').wait_for()
   with page.expect_download() as download:export.get_by_role('button',name='下載圖片',exact=True).click()
   image_path=OUT/'illustrated-group.jpg';download.value.save_as(image_path);pix=pymupdf.Pixmap(image_path);check('2x JPEG composite preserves the image and frame',pix.width==int(export.locator('canvas').get_attribute('width')) and pix.height==int(export.locator('canvas').get_attribute('height')) and image_path.stat().st_size>10000);export.get_by_role('button',name='關閉圖片輸出',exact=True).click()
   page.get_by_role('button',name='備份 / 匯入',exact=True).click()
   with page.expect_download() as download:page.get_by_role('button',name='下載目前專案 ZIP',exact=True).click()
   backup=OUT/'v3-roundtrip.zip';download.value.save_as(backup)
   with zipfile.ZipFile(backup) as z:backup_manifest=json.loads(z.read('manifest.json'))
   check('v3 backup includes frames and reading progress',backup_manifest['version']==3 and backup_manifest['projects'][0]['cards'][0]['frame']=='hexagon' and bool(backup_manifest['projects'][0]['readingProgress']))
   page.get_by_role('button',name='關閉對話框',exact=True).click();page.locator('input[accept^=".json"]').set_input_files(backup);page.wait_for_function('()=>document.querySelectorAll(".project-list button").length===3');saved(page);restored=current(page)
   check('v3 restore remaps saved reading references',restored['readingProgress']['cardId'] in [c['id'] for c in restored['cards']] and restored['cards'][0]['frame']=='hexagon' and page.locator('.card-thumbnail').count()==1)
   page.set_viewport_size({'width':600,'height':900});page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');check('narrow transition closes simultaneous drawers',page.locator('.app-v3').get_attribute('data-left')=='closed' and page.locator('.app-v3').get_attribute('data-right')=='closed')
   page.get_by_role('button',name='展開左側欄',exact=True).first.click();page.get_by_role('button',name='展開右側欄',exact=True).first.click();check('narrow drawers open one side at a time',page.locator('.app-v3').get_attribute('data-left')=='closed' and page.locator('.app-v3').get_attribute('data-right')=='open')
   fallback=browser.new_context(viewport={'width':1000,'height':850});fallback_page=fallback.new_page();fallback_page.add_init_script("Object.defineProperty(CanvasRenderingContext2D.prototype,'drawElementImage',{value:undefined})");fallback_page.goto(base+'/index.html');fallback_page.wait_for_load_state('networkidle');fallback_page.locator('input[accept^=".json"]').set_input_files(fixture);fallback_page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===3');saved(fallback_page)
   check('API absence automatically selects HTML mode',fallback_page.locator('.board-surface').get_attribute('data-mode')=='dom');fallback_page.get_by_role('button',name='書本閱讀',exact=False).first.click();wait_book(fallback_page);check('API absence retains paginated reading',fallback_page.locator('.book-flat-spread').count()==1 and 'HTML 平面' in fallback_page.locator('.book-renderer').inner_text());fallback.close()
   check('no unhandled deep-flow browser errors',not errors,errors)
  except Exception:
   page.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.html').write_text(page.content(),encoding='utf-8');print('ERRORS',errors,flush=True);print('ALERTS',page.locator('[role=alert]').all_text_contents(),flush=True);raise
  finally:context.close();browser.close()
except Exception:checks.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'acceptance.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
