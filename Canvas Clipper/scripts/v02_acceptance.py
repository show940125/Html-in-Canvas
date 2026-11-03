from browser_support import chrome_launch_options
"""End-to-end acceptance of the v0.2 reading desk in isolated Chrome 156."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import json,traceback,struct,zlib,time,zipfile,re
from playwright.sync_api import sync_playwright
import pymupdf
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v02';OUT.mkdir(parents=True,exist_ok=True)
results=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,passed,detail=None):
 results.append({'name':name,'passed':bool(passed),'detail':detail});print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(name+': '+str(detail))
def image_file():
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 w,h=320,140;raw=b''.join(b'\0'+b''.join(bytes((50+x//3,95+y//2,65+(x+y)//7,255)) for x in range(w)) for y in range(h))
 target=OUT/'local-material.png';target.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''));return target
def saved(page):page.locator('.save-state.saved').wait_for(timeout=15000)
def click_native(page,locator):
 locator.scroll_into_view_if_needed();box=locator.bounding_box();assert box;page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
def project_data(page):
 return page.evaluate('''async () => {const db=await new Promise((r,j)=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const all=await new Promise((r,j)=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();return all.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];}''')
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement'])
  context=browser.new_context(viewport={'width':1680,'height':1100},device_scale_factor=1)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle')
   check('v0.2 native board loads',page.locator('.board-surface').get_attribute('data-mode')=='native')
   fixture=ROOT/'tests'/'fixtures'/'acceptance-fixture.json'
   page.locator('input[accept^=".json"]').set_input_files(fixture)
   page.wait_for_function('() => document.querySelectorAll(".clip-card").length===20')
   saved(page)
   check('v0.1 JSON imports all twenty cards',page.locator('.clip-card').count()==20)
   page.locator('.card-list-select').first.click()
   # The formerly ineffective button now opens a real native reading surface.
   click_native(page,page.get_by_role('button',name='閱讀卡片 1',exact=True))
   dialog=page.get_by_role('dialog',name='全文閱讀');dialog.wait_for()
   page.wait_for_timeout(350)
   check('reading button opens focus view',dialog.locator('.interactive-surface').get_attribute('data-surface-mode')=='native')
   note=dialog.get_by_role('textbox',name='閱讀筆記 1')
   click_native(page,note);page.keyboard.press('Control+A');page.keyboard.insert_text('聚焦閱讀：這是自己的觀點。');saved(page)
   check('native focus-note input persists',note.input_value()=='聚焦閱讀：這是自己的觀點。')
   dialog.get_by_role('button',name='編輯圖文',exact=True).click()
   editor=dialog.get_by_role('textbox',name='全文編輯 1')
   click_native(page,editor);page.keyboard.press('Control+A');page.keyboard.insert_text('重新整理的第一段。');saved(page)
   dialog.get_by_role('button',name='查看原文',exact=True).click()
   check('original rich content remains separate','收集資料只是開始' in dialog.locator('.reading-scroll').inner_text())
   dialog.get_by_role('button',name='關閉閱讀',exact=True).click();dialog.wait_for(state='hidden')
   check('focus close restores board view',page.locator('.board-surface').is_visible())
   before=project_data(page)['view'];click_native(page,page.get_by_role('button',name='閱讀卡片 1',exact=True));page.get_by_role('dialog',name='全文閱讀').wait_for();page.keyboard.press('Escape');page.get_by_role('dialog',name='全文閱讀').wait_for(state='hidden')
   check('repeat selected-card expand and Escape return work',project_data(page)['view']==before)
   # Attach a raster image to the selected material using the actual picker.
   with page.expect_file_chooser() as chooser:page.get_by_role('button',name='加入本機圖片',exact=True).click()
   chooser.value.set_files(image_file());page.locator('.card-thumbnail').first.wait_for();saved(page)
   check('local image stored and displayed',len(project_data(page)['cards'][0]['editedDoc']['content'])>=2)
   # Compare two original materials without losing focus-note edits.
   page.locator('.card-list-select').nth(1).click(modifiers=['Control'])
   page.get_by_role('button',name=re.compile('^雙篇比較')).click();compare=page.get_by_role('dialog',name='雙篇比較');compare.wait_for();page.wait_for_timeout(350)
   check('two-column native comparison opens',compare.locator('.reading-column').count()==2 and compare.locator('.interactive-surface').get_attribute('data-surface-mode')=='native')
   note2=compare.get_by_role('textbox',name='閱讀筆記 2');click_native(page,note2);page.keyboard.press('Control+A');page.keyboard.insert_text('比較觀點：需要查證假設。');saved(page)
   check('comparison note input works',note2.input_value()=='比較觀點：需要查證假設。')
   compare.get_by_role('button',name='關閉閱讀').click();compare.wait_for(state='hidden')
   # Group the two selected cards and move the entire group.
   page.get_by_role('button',name='建立主題框',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_role('textbox',name='主題名稱').fill('不同的假設');modal.get_by_role('button',name='建立 ↗',exact=True).click();saved(page)
   check('topic group contains both selected cards',len([c for c in project_data(page)['cards'] if c.get('groupId')])==2)
   handle=page.locator('.group-handle').first;old=handle.bounding_box();page.mouse.move(old['x']+80,old['y']+20);page.mouse.down();page.mouse.move(old['x']+130,old['y']+70,steps=8);page.mouse.up();saved(page)
   data=project_data(page);check('moving a topic moves its materials',data['cards'][0]['x']==98 and data['cards'][1]['x']==442,data['cards'][:2])
   page.get_by_role('button',name='收合主題 不同的假設',exact=True).click();saved(page)
   check('collapse hides grouped cards',not page.locator('.clip-card').first.is_visible() and not page.locator('.clip-card').nth(1).is_visible())
   page.get_by_role('button',name='展開主題 不同的假設',exact=True).click();saved(page)
   check('expand restores grouped materials',page.locator('.clip-card').first.is_visible())
   # Multi-label classification and filter.
   page.get_by_role('button',name='新增標籤',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_role('textbox',name='標籤名稱').fill('待查證');modal.get_by_role('button',name='建立 ↗',exact=True).click();saved(page)
   page.get_by_role('button',name='新增標籤',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_role('textbox',name='標籤名稱').fill('市場觀點');modal.get_by_role('button',name='建立 ↗',exact=True).click();saved(page)
   check('cards support one group and multiple tags',len(project_data(page)['cards'][0]['tagIds'])==2 and bool(project_data(page)['cards'][0]['groupId']))
   page.get_by_role('button',name='篩選標籤 待查證',exact=True).click()
   check('cross-topic tag filtering shows two cards',page.locator('.clip-card:visible').count()==2)
   page.get_by_role('button',name='清除篩選 ×',exact=True).click()
   # Create and edit a directional relation through the accessible form.
   page.get_by_role('button',name='建立關係',exact=True).click();modal=page.get_by_role('dialog');modal.get_by_label('關係類型').select_option('質疑');modal.get_by_role('textbox',name='關係說明').fill('假設不同');modal.get_by_role('button',name='建立 ↗',exact=True).click();saved(page)
   check('directional relationship renders',page.locator('.relation').count()==1 and project_data(page)['relations'][0]['kind']=='質疑')
   relation=project_data(page)['relations'][0]
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page)
   page.wait_for_function('() => document.querySelectorAll(".relation").length===0')
   check('structural undo removes relationship',not project_data(page)['relations'])
   page.get_by_role('button',name='重做操作',exact=True).click();saved(page)
   page.wait_for_function('() => document.querySelectorAll(".relation").length===1')
   check('redo restores relationship',project_data(page)['relations'][0]['id']==relation['id'])
   # Native hit geometry and pointer capture also support the drag link path.
   start=page.get_by_role('button',name='從卡片 1 建立關係',exact=True).bounding_box();target=page.locator('.clip-card').nth(1).bounding_box()
   page.mouse.move(start['x']+start['width']/2,start['y']+start['height']/2);page.mouse.down();page.mouse.move(target['x']+100,target['y']+100,steps=10);page.mouse.up();saved(page)
   check('drag handles create native directional links',len(project_data(page)['relations'])==2 and project_data(page)['relations'][1]['kind']=='相關')
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page)
   check('drag-link undo retains preexisting relation',len(project_data(page)['relations'])==1)
   page.get_by_role('button',name='編輯主題 不同的假設',exact=True).click();page.get_by_role('button',name='刪除主題框，保留材料',exact=True).click();saved(page)
   check('deleting a topic preserves materials and relationships',len(project_data(page)['cards'])==20 and not project_data(page)['groups'] and len(project_data(page)['relations'])==1)
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page)
   check('topic delete undo restores membership',len(project_data(page)['groups'])==1 and sum(bool(c.get('groupId')) for c in project_data(page)['cards'])==2)
   data=project_data(page);first=data['cards'][0];second=data['cards'][1]
   page.get_by_role('button',name='下移材料 '+first['title'],exact=True).click();saved(page)
   check('output outline reorders materials independently of position',project_data(page)['outline']['cardIds'][0]==second['id'] and project_data(page)['cards'][0]['x']==first['x'])
   page.get_by_role('button',name='復原操作',exact=True).click();saved(page)
   page.screenshot(path=str(OUT/'reading-desk.png'))
   # Verify grouped data, original content and image all survive a ZIP roundtrip.
   page.get_by_role('button',name='備份 / 匯入',exact=True).click()
   with page.expect_download() as download:page.get_by_role('button',name='下載目前專案 ZIP',exact=True).click()
   backup=OUT/'v02-project.zip';download.value.save_as(backup)
   with zipfile.ZipFile(backup) as z:
    manifest=json.loads(z.read('manifest.json'))
    check('ZIP includes image bytes and complete graph data',len([n for n in z.namelist() if n.startswith('assets/')])==1 and len(manifest['projects'][0]['groups'])==1 and len(manifest['projects'][0]['tags'])==2 and len(manifest['projects'][0]['relations'])==1)
   page.get_by_role('button',name='關閉對話框',exact=True).click()
   page.locator('input[accept^=".json"]').set_input_files(backup)
   page.wait_for_function('() => document.querySelectorAll(".project-list button").length===3')
   saved(page)
   restored=project_data(page)
   check('ZIP restore remaps graph references correctly',restored['relations'][0]['from'] in [c['id'] for c in restored['cards']] and restored['cards'][0]['groupId']==restored['groups'][0]['id'])
   page.locator('.card-list-select').first.click();page.reload();page.wait_for_load_state('networkidle');saved(page)
   check('rich project persists across reload',len(project_data(page)['groups'])==1 and len(project_data(page)['relations'])==1)
   page.context.set_offline(True);page.locator('.card-thumbnail').first.wait_for()
   check('saved image works offline',page.locator('.card-thumbnail').first.evaluate('(img)=>img.complete && img.naturalWidth===320'))
   page.context.set_offline(False)
   page.get_by_role('tab',name='▤ 文件檢視',exact=True).click();page.locator('.document-viewport img').first.wait_for();page.locator('.document-viewport img').first.evaluate('(img)=>img.decode()')
   check('output includes topic chapter and relation appendix',page.locator('.chapter-heading').first.inner_text()=='不同的假設' and page.locator('.report-graph').count()>0)
   page.screenshot(path=str(OUT/'document-with-graph.png'))
   pdf_path=OUT/'v02-research-notes.pdf';page.pdf(path=str(pdf_path),prefer_css_page_size=True,print_background=True)
   pdf=pymupdf.open(pdf_path);text=''.join(p.get_text() for p in pdf)
   check('PDF preserves Chinese text, notes and relations','不同的假設' in text and '聚焦閱讀' in text and '假設不同' in text and '長文結尾驗收標記' in text,{'pages':len(pdf),'textLength':len(text)})
   check('PDF contains embedded image',sum(len(p.get_images()) for p in pdf)>0)
   outside=[]
   for number,pdf_page in enumerate(pdf):
    for block in pdf_page.get_text('blocks'):
     if block[0]<45 or block[2]>pdf_page.rect.width-45 or block[1]<45 or block[3]>pdf_page.rect.height-45:outside.append([number+1,list(block[:4])])
   check('PDF text stays inside print bounds',not outside,outside[:8]);pdf[0].get_pixmap().save(str(OUT/'pdf-first-page.png'));pdf[-1].get_pixmap().save(str(OUT/'pdf-last-page.png'));pdf.close()
   page.get_by_role('tab',name='▦ 閱讀桌',exact=True).click();page.get_by_label('HTML 模式',exact=True).check()
   check('DOM fallback preserves groups and relationships',page.locator('.board-surface').get_attribute('data-mode')=='dom' and page.locator('.group-frame').count()==1 and page.locator('.relation').count()==1)
   page.get_by_label('HTML 模式',exact=True).uncheck();page.wait_for_timeout(400)
   cv=page.locator('.native-canvas');before_frames=int(cv.get_attribute('data-paints'));page.wait_for_timeout(600);after_frames=int(cv.get_attribute('data-paints'))
   check('idle desk stops redrawing',after_frames-before_frames<3)
   page.set_viewport_size({'width':600,'height':900});page.screenshot(path=str(OUT/'reading-desk-narrow.png'),full_page=True)
   check('narrow layout has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   check('no unhandled app errors',not errors,errors)
  except Exception:
   page.screenshot(path=str(OUT/'acceptance-failure.png'),full_page=True)
   (OUT/'failure-dom.txt').write_text(page.content(),encoding='utf-8');print('BROWSER_ERRORS',errors,flush=True);print('ALERT',page.locator('[role=alert]').all_text_contents(),flush=True);raise
  finally:context.close();browser.close()
except Exception:results.append({'name':'unexpected failure','passed':False,'detail':traceback.format_exc()});raise
finally:
 server.shutdown();server.server_close();(OUT/'desk-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
