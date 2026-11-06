"""Native/DOM regression evidence for panel, drag, stacking and glass refinement."""
from browser_support import chrome_launch_options,software_args
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json,traceback
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v04';OUT.mkdir(parents=True,exist_ok=True);checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,value,detail=None):
 checks.append(dict(name=name,passed=bool(value),detail=detail));print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError((name,detail))
def settle(page):
 page.wait_for_timeout(320);page.wait_for_function('()=>document.querySelector(".board-surface").dataset.layoutMotion==="idle"');page.locator('.save-state.saved').wait_for()
def data(page):
 return page.evaluate('''async()=>{const db=await new Promise(r=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result)});const rows=await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result)});db.close();return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]}''')
def point(page,loc,dx=20,dy=15):
 box=loc.bounding_box();page.mouse.move(box['x']+dx,box['y']+dy);return box
def sample_panel(page,selector,measure):
 page.evaluate('''([selector,measure])=>{window.panelSamples=[];const start=performance.now();function sample(){const e=document.querySelector(selector);window.panelSamples.push(measure==='column'?parseFloat(getComputedStyle(e).gridTemplateColumns):e.getBoundingClientRect().height);if(performance.now()-start<600)requestAnimationFrame(sample)}requestAnimationFrame(sample)}''',arg=[selector,measure])
fixture=json.loads((ROOT/'tests/fixtures/acceptance-fixture.json').read_text(encoding='utf-8'));project=fixture['project'];project['cards']=project['cards'][:3];project['view']={'x':0,'y':0,'zoom':1}
for i,c in enumerate(project['cards']):
 c['x']=[72,524,876][i];c['y']=[120,120,-24][i];c['title']=['主題 A 的閱讀材料','主題 B 的閱讀材料','頂端被遮住也能拖曳'][i];c['tagIds']=[]
 if i<2:c['groupId']=['a','b'][i]
project['groups']=[dict(id=id,title='主題 '+id.upper(),color=color,x=x,y=40,width=360,height=500,collapsed=False,frame='folder') for id,color,x in [('a','#dde8cb',48),('b','#d9e8ed',500)]];project['tags']=[];project['relations']=[]
path=OUT/'fixture.json';path.write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf-8')
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement']+software_args())
  try:
   for mode in ['native','dom']:
    context=browser.new_context(viewport={'width':1680,'height':1100},device_scale_factor=1.5 if mode=='native' else 1,reduced_motion='no-preference');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:
     if mode=='dom':page.add_init_script("Object.defineProperty(CanvasRenderingContext2D.prototype,'drawElementImage',{value:undefined})")
     page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.locator('input[accept^=".json"]').set_input_files(path);page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===3');settle(page)
     page.get_by_role('button',name='關閉提示',exact=True).click();settle(page);groupA,groupB=[g['id'] for g in data(page)['groups']]
     check(mode+' correct renderer',page.locator('.board-surface').get_attribute('data-mode')==mode)
     check(mode+' compact upper workspace',page.locator('.board-surface').bounding_box()['y']<195,page.locator('.board-surface').bounding_box())
     check(mode+' collapse controls belong to their own panels',page.locator('.sidebar').get_by_role('button',name='收起左側欄').count()==1 and page.locator('.editor-panel').get_by_role('button',name='收起右側欄').count()==1 and page.locator('.workspace-heading').get_by_role('button',name='收起上方欄').count()==1)
     check(mode+' default card type is larger',page.locator('.card-content h2').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=18)
     page.screenshot(path=str(OUT/(mode+'-desktop.png')))
     original=page.locator('.sidebar').bounding_box()['width'];sample_panel(page,'.app-v3','column');page.get_by_role('button',name='收起左側欄',exact=True).click();page.wait_for_timeout(650);samples=page.evaluate('window.panelSamples');check(mode+' panel moves through intermediate layout',any(44<w<original for w in samples),samples);settle(page);page.get_by_role('button',name='展開左側欄',exact=True).click();settle(page)
     height=page.locator('.workspace-fold').bounding_box()['height'];sample_panel(page,'.workspace-fold','height');page.get_by_role('button',name='收起上方欄',exact=True).click();page.wait_for_timeout(650);samples=page.evaluate('window.panelSamples');check(mode+' upper panel folds gradually',any(0<h<height for h in samples),samples);settle(page);page.get_by_role('button',name='展開上方欄',exact=True).click();settle(page)
     cards=page.locator('.clip-card');before=data(page);box=point(page,cards.nth(2).locator('h2'));page.mouse.down();page.mouse.move(box['x']-90,box['y']+570,steps=10);page.mouse.up();settle(page);after=data(page)
     check(mode+' body drag works with cropped card header',after['cards'][2]['x']<before['cards'][2]['x']-60 and after['cards'][2]['y']>before['cards'][2]['y']+400,dict(before=[before['cards'][2]['x'],before['cards'][2]['y']],after=[after['cards'][2]['x'],after['cards'][2]['y']]))
     page.get_by_role('button',name='復原操作',exact=True).click();settle(page)
     cards.nth(2).locator('h2').dblclick();reader=page.get_by_role('dialog',name='全文閱讀');reader.wait_for();check(mode+' body double click still opens the reader',reader.count()==1);reader.get_by_role('button',name='關閉閱讀',exact=True).click();settle(page)
     before=data(page);board=page.locator('.board-surface').bounding_box();frame=page.locator(f'[data-group-id="{groupA}"]');box=point(page,cards.nth(2).locator('h2'));page.mouse.down()
     page.evaluate('''()=>{window.previewWidths=[];const start=performance.now();function sample(){window.previewWidths.push(parseFloat(document.querySelector('.group-frame').style.width));if(performance.now()-start<380)requestAnimationFrame(sample)}requestAnimationFrame(sample)}''')
     page.mouse.move(board['x']+before['view']['x']+388*before['view']['zoom'],board['y']+before['view']['y']+200*before['view']['zoom']);page.locator('.drop-hint').wait_for();page.wait_for_timeout(400);widths=page.evaluate('window.previewWidths')
     check(mode+' adaptive preview has real intermediate geometry',len(set(round(w,1) for w in widths))>=4 and any(365<w<680 for w in widths),widths)
     check(mode+' animated preview does not persist before release',data(page)['groups']==before['groups'])
     page.screenshot(path=str(OUT/(mode+'-magnetic-preview.png')));page.mouse.up();settle(page);check(mode+' animated drop commits target geometry',data(page)['groups'][0]['width']>600);page.get_by_role('button',name='復原操作',exact=True).click();settle(page)
     page.emulate_media(reduced_motion='reduce');settle(page);before=data(page);board=page.locator('.board-surface').bounding_box();box=point(page,cards.nth(2).locator('h2'));page.mouse.down();page.mouse.move(board['x']+before['view']['x']+388*before['view']['zoom'],board['y']+before['view']['y']+200*before['view']['zoom']);page.locator('.drop-hint').wait_for();page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');check(mode+' reduced motion applies target without animation',page.locator('.board-surface').get_attribute('data-layout-motion')=='idle');page.keyboard.press('Escape');page.mouse.up();settle(page);check(mode+' cancel restores layout without persistence',data(page)['groups']==before['groups']);page.emulate_media(reduced_motion='no-preference')
     header=page.locator(f'[data-scene-id="{groupA}-header"]');frame=page.locator(f'[data-group-id="{groupA}"]').bounding_box();buttons=header.locator('button').all();check(mode+' folder controls have safe insets',all(b.bounding_box()['y']>frame['y']+23 and b.bounding_box()['x']+b.bounding_box()['width']<frame['x']+frame['width']-15 for b in buttons))
     before=data(page);frame=page.locator(f'[data-group-id="{groupB}"]').bounding_box();page.mouse.move(frame['x']+12,frame['y']+170);page.mouse.down();page.mouse.move(frame['x']-360,frame['y']+140,steps=12);page.mouse.up();settle(page);after=data(page)
     check(mode+' topic body drag carries members',after['groups'][1]['x']<before['groups'][1]['x']-300 and after['cards'][1]['x']-before['cards'][1]['x']==after['groups'][1]['x']-before['groups'][1]['x'])
     order=page.locator('[data-scene-id]').evaluate_all('els=>Object.fromEntries(els.map(e=>[e.dataset.sceneId,Number(e.style.zIndex)]))');ids=after['cards'];check(mode+' topic stacks as one complete unit',order[groupA+'-header']<order[groupB]<order[ids[1]['id']]<order[groupB+'-header'],order)
     card=cards.nth(1);note=card.locator('textarea');box=note.bounding_box();page.mouse.click(box['x']+25,box['y']+15);page.keyboard.press('Control+A');page.keyboard.insert_text('毛玻璃上仍可編輯中文筆記');settle(page);check(mode+' native note stays editable on raised topic',data(page)['cards'][1]['note']=='毛玻璃上仍可編輯中文筆記')
     page.screenshot(path=str(OUT/(mode+'-overlap.png')));page.get_by_role('button',name='復原操作',exact=True).click();settle(page)
     page.mouse.move(1100,950);settle(page)
     if mode=='native':
      paints=page.locator('.native-canvas').get_attribute('data-paints');page.wait_for_timeout(220);check('native idle scene stops repainting',page.locator('.native-canvas').get_attribute('data-paints')==paints)
     page.get_by_role('button',name='主題與介面',exact=True).click();settings=page.get_by_role('dialog',name='主題與介面');slider=settings.get_by_role('slider',name='閱讀字級');slider.focus();slider.press('End');settings.get_by_role('button',name='完成',exact=True).click();page.reload();page.wait_for_load_state('networkidle');settle(page);check(mode+' font size persists after reload',cards.first.locator('h2').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==23)
     page.get_by_role('button',name='定位材料',exact=False).count() # aria name is used below
     page.get_by_role('button',name='找回選取材料',exact=True).click();settle(page);b=cards.first.bounding_box();board=page.locator('.board-surface').bounding_box();check(mode+' recover control locates a visible material',b['y']>=board['y'] and b['y']+b['height']<=board['y']+board['height']+1)
     page.set_viewport_size({'width':600,'height':900});settle(page);check(mode+' narrow workspace has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'));page.get_by_role('button',name='展開左側欄',exact=True).click();settle(page);page.get_by_role('button',name='展開右側欄',exact=True).click();settle(page);check(mode+' edge controls retain one drawer at a time',page.locator('.app-v3').get_attribute('data-left')=='closed' and page.locator('.app-v3').get_attribute('data-right')=='open');page.screenshot(path=str(OUT/(mode+'-narrow.png')))
     check(mode+' no unhandled runtime errors',not errors,errors)
    except Exception:page.screenshot(path=str(OUT/(mode+'-failure.png')),full_page=True);(OUT/(mode+'-failure.html')).write_text(page.content(),encoding='utf-8');raise
    finally:context.close()
  finally:browser.close()
except Exception:checks.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'acceptance.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
