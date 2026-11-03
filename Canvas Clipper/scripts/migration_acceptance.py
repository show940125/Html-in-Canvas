"""Isolated old/new extension migration, atomic restore failures and folder writer."""
from pathlib import Path
import json,traceback,uuid,zipfile,struct
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v02'/'migration';OUT.mkdir(parents=True,exist_ok=True)
results=[]
def check(name,passed,detail=None):
 results.append(dict(name=name,passed=bool(passed),detail=detail));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
def rows(page):
 return page.evaluate('''async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const all=await new Promise((r,j)=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();return all;}''')
def wait_saved(page):page.locator('.save-state.saved').wait_for(timeout=15000)
try:
 with sync_playwright() as p:
  context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-features=CanvasDrawElement'],viewport={'width':1600,'height':1000})
  cdp=context.browser.new_browser_cdp_session()
  try:
   legacy_id=cdp.send('Extensions.loadUnpacked',{'path':str(ROOT.parent/'dist')})['id']
   check('legacy installed path retains original identity',len(legacy_id)==32,legacy_id)
   old=context.new_page();old.goto(f'chrome-extension://{legacy_id}/index.html');old.wait_for_load_state('networkidle')
   fixture=json.loads((ROOT/'tests'/'fixtures'/'acceptance-fixture.json').read_text(encoding='utf-8'))['project']
   other=json.loads(json.dumps(fixture));other['id']='second-legacy-project';other['title']='舊版第二個專案';other['cards']=other['cards'][:1];other['cards'][0]['id']='second-card';other['cards'][0]['note']='兩個專案都必須保留。'
   seeded=[fixture,other]
   old.evaluate('''async projects=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('canvas-clipper');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});await new Promise((r,j)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').clear();for(const p of projects)tx.objectStore('projects').put(p);tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close();}''',seeded)
   before=rows(old)
   old.goto(f'chrome-extension://{legacy_id}/migration.html');old.locator('#export').wait_for(state='visible');old.wait_for_function('()=>!document.querySelector("#export").disabled')
   with old.expect_download() as download:old.locator('#export').click()
   exported=OUT/'legacy-all-projects.json';download.value.save_as(exported)
   payload=json.loads(exported.read_text(encoding='utf-8'))
   check('bridge exports every legacy project and card',len(payload['projects'])==2 and sum(len(p['cards']) for p in payload['projects'])==21)
   check('bridge leaves original database byte-equivalent as JSON',before==rows(old))
   new_id=cdp.send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id']
   page=context.new_page();page.goto(f'chrome-extension://{new_id}/index.html');page.wait_for_load_state('networkidle')
   page.locator('input[accept^=".json"]').set_input_files(exported)
   page.wait_for_function('()=>document.querySelectorAll(".project-list button").length===3');wait_saved(page)
   imported=[r for r in rows(page) if r['cards']]
   check('new extension restores all legacy projects',len(imported)==2 and sum(len(p['cards']) for p in imported)==21)
   check('migration preserves notes and coordinates',any(c['note']=='兩個專案都必須保留。' for r in imported for c in r['cards']) and all(r['cards'][0]['x']==48 for r in imported))
   check('new imports preserve old source database',before==rows(old))
   page.get_by_role('button',name='備份 / 匯入',exact=True).click()
   with page.expect_download() as download:page.get_by_role('button',name='下載全部專案 ZIP',exact=True).click()
   all_zip=OUT/'all-projects.zip';download.value.save_as(all_zip)
   with zipfile.ZipFile(all_zip) as z:manifest=json.loads(z.read('manifest.json'))
   check('all-project ZIP contains complete workspace',len(manifest['projects'])==3 and sum(len(p['cards']) for p in manifest['projects'])==21)
   # Use a real FileSystemDirectoryHandle and native writer. Only the chooser is
   # substituted; native Windows directory picking remains a manual check.
   page.evaluate('''()=>{window.showDirectoryPicker=async()=>await (await navigator.storage.getDirectory()).getDirectoryHandle('acceptance-backups',{create:true});}''')
   page.get_by_role('button',name='選擇／重新授權資料夾',exact=True).click()
   page.get_by_role('button',name='將全部專案備份到資料夾',exact=True).click()
   page.wait_for_function('()=>document.querySelector(".backup-folder").textContent.includes("上次成功")')
   files=page.evaluate('''async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('acceptance-backups');const files=[];for await(const [name,handle] of dir.entries()){const file=await handle.getFile();files.push({name,size:file.size,signature:Array.from(new Uint8Array(await file.slice(0,2).arrayBuffer()))});}return files;}''')
   check('native filesystem writer completes a valid ZIP backup',len(files)==1 and files[0]['signature']==[80,75] and files[0]['size']>1000,files)
   page.get_by_role('button',name='關閉對話框',exact=True).click()
   count=len(rows(page));bad=OUT/'invalid-restore.zip'
   # Validate every project before writing any of them.
   broken=json.loads(json.dumps(manifest));broken['projects'][1]['cards'][0]['x']='broken'
   with zipfile.ZipFile(bad,'w') as z:z.writestr('manifest.json',json.dumps(broken))
   page.locator('input[accept^=".json"]').set_input_files(bad);page.get_by_role('alert').wait_for()
   check('invalid workspace restore writes no partial projects',len(rows(page))==count,page.get_by_role('alert').inner_text())
   page.get_by_role('button',name='關閉提示').click()
   with zipfile.ZipFile(ROOT/'output'/'v02'/'v02-project.zip') as z:image_manifest=z.read('manifest.json')
   with zipfile.ZipFile(bad,'w') as z:z.writestr('manifest.json',image_manifest)
   page.locator('input[accept^=".json"]').set_input_files(bad);page.get_by_role('alert').wait_for()
   check('missing-image backup fails without partial writes',len(rows(page))==count and '圖片' in page.get_by_role('alert').inner_text())
   page.get_by_role('button',name='關閉提示').click()
   with zipfile.ZipFile(bad,'w') as z:z.writestr('../outside.txt','forbidden')
   page.locator('input[accept^=".json"]').set_input_files(bad);page.get_by_role('alert').wait_for()
   check('unexpected ZIP paths are rejected',len(rows(page))==count and '路徑' in page.get_by_role('alert').inner_text())
   page.get_by_role('button',name='關閉提示').click()
   huge=OUT/'huge.png';huge.write_bytes(b'\x89PNG\r\n\x1a\n'+struct.pack('!I',13)+b'IHDR'+struct.pack('!II',12000,10000))
   with page.expect_file_chooser() as chooser:page.get_by_role('button',name='▧ 圖片',exact=True).click()
   chooser.value.set_files(huge);page.get_by_role('alert').wait_for()
   check('oversized raster rejected before decode','2400 萬' in page.get_by_role('alert').inner_text())
  finally:context.close()
except Exception:results.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:(OUT/'migration-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
