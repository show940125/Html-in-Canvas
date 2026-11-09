"""Reproducible native/HTML UX regression checks, using synthetic project data."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
from browser_support import chrome_launch_options,software_args
import json,traceback
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/v05';OUT.mkdir(parents=True,exist_ok=True);checks=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,value,detail=None):
 checks.append(dict(name=name,passed=bool(value),detail=detail));print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(name)
def settle(page):
 page.locator('.save-state.saved').wait_for(state='attached');page.wait_for_timeout(450)
def data(page):
 return page.evaluate('''async()=>{const db=await new Promise(r=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result)});const v=await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result)});db.close();return v.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]}''')
s=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=s.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,**chrome_launch_options(),args=['--enable-features=CanvasDrawElement']+software_args())
  try:
   for mode in ['native','dom']:
    c=b.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1.5 if mode=='native' else 1,reduced_motion='reduce');page=c.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    if mode=='dom':page.add_init_script("Object.defineProperty(CanvasRenderingContext2D.prototype,'drawElementImage',{value:undefined})")
    try:
     page.goto(f'http://127.0.0.1:{s.server_port}');page.wait_for_load_state('networkidle');page.get_by_role('button',name='試用範例專案 ↗',exact=True).click();page.locator('.clip-card').first.wait_for();settle(page)
     if page.get_by_role('button',name='關閉提示').count():page.get_by_role('button',name='關閉提示').click()
     check(mode+' renderer preserved',page.locator('.board-surface').get_attribute('data-mode')==mode)
     check(mode+' compact material workspace',page.locator('.board-surface').bounding_box()['y']<=140)
     check(mode+' output-order meaning visible','與畫布位置分別保存' in page.locator('.sidebar-hint').inner_text())
     page.screenshot(path=str(OUT/(mode+'-desktop.png')))
     page.get_by_role('button',name='新增卡片',exact=True).click();d=page.get_by_role('dialog');check(mode+' form has accessible name',bool(d.get_attribute('aria-labelledby')))
     page.get_by_label('新卡片內容',exact=True).fill('保留這份合成輸入');page.get_by_label('新卡片來源網址',exact=True).fill('javascript:alert(1)');page.get_by_role('button',name='加入卡片板',exact=False).click();d.get_by_role('alert').wait_for();check(mode+' error visible inside modal','HTTP' in d.get_by_role('alert').inner_text());check(mode+' invalid input retained',page.get_by_label('新卡片內容',exact=True).input_value()=='保留這份合成輸入');page.keyboard.press('Escape')
     page.keyboard.press('Control+k');d=page.get_by_role('dialog',name='找一份材料');d.wait_for();d.get_by_role('combobox').fill('比較材料');check(mode+' Chinese search finds real material',d.get_by_role('option').count()>0);page.keyboard.press('Enter');page.locator('.material-search').wait_for(state='hidden');settle(page)
     chosen=data(page);title=page.locator('.clip-card.selected h2').last.inner_text();check(mode+' search selects requested card','比較材料' in title)
     page.get_by_role('button',name='展開右側欄',exact=True).click();settle(page)
     for name in ['內容','整理','外觀']:
      page.get_by_role('tab',name=name,exact=True).click();check(mode+' inspector tab '+name,page.get_by_role('tab',name=name,exact=True).get_attribute('aria-selected')=='true')
     check(mode+' appearance keeps shape control',page.get_by_label('文章框型',exact=True).is_visible());check(mode+' content hidden in appearance',not page.get_by_label('我的筆記',exact=True).is_visible());page.get_by_role('tab',name='內容',exact=True).click();page.get_by_label('我的筆記',exact=True).fill('正式版驗收中文筆記');settle(page);check(mode+' notes save in actual IndexedDB',any(v['note']=='正式版驗收中文筆記' for v in data(page)['cards']))
     page.get_by_role('button',name='收起右側欄',exact=True).click();settle(page)
     group=data(page)['groups'][0];before=data(page);page.get_by_role('button',name='編輯主題 '+group['title'],exact=True).click();d=page.get_by_role('dialog',name='編輯主題框');d.wait_for();page.get_by_label('主題框型',exact=True).select_option('folder');page.get_by_label('主題顏色',exact=True).fill('#c4decf');page.get_by_role('button',name='儲存修改',exact=False).click();settle(page);after=data(page);check(mode+' topic shape and color persist',after['groups'][0]['frame']=='folder' and after['groups'][0]['color']=='#c4decf');check(mode+' topic styling preserves article text',[x['workingText'] for x in after['cards']]==[x['workingText'] for x in before['cards']])
     page.get_by_role('button',name='符合全部材料',exact=True).click();settle(page);check(mode+' fit-all keeps all materials in viewport',page.locator('.clip-card').evaluate_all('els=>{const b=document.querySelector(".board-surface").getBoundingClientRect();return els.filter(e=>!e.hidden).every(e=>{const r=e.getBoundingClientRect();return r.left>=b.left-1&&r.top>=b.top-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1})}'))
     page.get_by_role('button',name='恢復 100%',exact=True).click();settle(page);check(mode+' explicit 100 percent zoom',data(page)['view']['zoom']==1)
     page.locator('.card-list-select').first.click();settle(page);check(mode+' navigation selects and locates',page.locator('.clip-card.selected').count()==1)
     page.get_by_role('button',name='閱讀全文',exact=True).click();page.locator('.reader-panel[data-transition="idle"]').wait_for();check(mode+' reader heading identifies actual material',page.locator('.reader-top h2').inner_text()==page.locator('.reading-scroll h1').inner_text());page.get_by_role('button',name='關閉閱讀',exact=True).click();settle(page)
     page.locator('.link-handle').first.press('Enter');page.get_by_role('dialog').wait_for();check(mode+' keyboard connection opens relation form',page.get_by_label('起點材料',exact=True).is_visible());page.keyboard.press('Escape')
     page.locator('.card-resize').first.press('Enter');d=page.get_by_role('dialog');d.wait_for();check(mode+' keyboard resize opens named dialog',bool(d.get_attribute('aria-label') or d.get_attribute('aria-labelledby')));page.keyboard.press('Escape')
     page.get_by_role('tab',name='文件檢視',exact=False).click();check(mode+' desktop PDF print action visible',page.get_by_role('button',name='列印 / PDF',exact=True).is_visible());page.get_by_role('tab',name='閱讀桌',exact=False).click();page.get_by_role('button',name='輸出與備份',exact=True).click();d=page.get_by_role('dialog');check(mode+' export distinguishes image PDF backup',all(t in d.inner_text() for t in ['材料組圖','閱讀文件','完整備份']));d.get_by_role('button',name='完整備份 / 匯入',exact=False).click();d=page.get_by_role('dialog');
     with page.expect_download() as download:page.get_by_role('button',name='下載目前專案 ZIP',exact=True).click()
     download.value.save_as(str(OUT/(mode+'-backup.zip')));d.get_by_role('status').wait_for();check(mode+' backup completion stays in dialog','備份' in d.get_by_role('status').inner_text());page.keyboard.press('Escape')
     page.get_by_role('button',name='專注畫布',exact=True).click();page.set_viewport_size({'width':600,'height':900});page.get_by_role('button',name='恢復面板',exact=True).click();settle(page);check(mode+' narrow restore remains exclusive',not(page.locator('.app-v3').get_attribute('data-left')=='open' and page.locator('.app-v3').get_attribute('data-right')=='open'));page.get_by_role('button',name='展開左側欄',exact=True).click();settle(page);page.get_by_role('button',name='展開右側欄',exact=True).click();settle(page);check(mode+' opposite drawer accessible over backdrop',page.locator('.app-v3').get_attribute('data-left')=='closed' and page.locator('.app-v3').get_attribute('data-right')=='open');check(mode+' narrow no horizontal page overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'));page.screenshot(path=str(OUT/(mode+'-narrow.png')));check(mode+' no runtime errors',not errors,errors)
    finally:c.close()
  finally:b.close()
except Exception:
 checks.append({'exception':traceback.format_exc()});raise
finally:
 s.shutdown();s.server_close();(OUT/'workbench-acceptance.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
