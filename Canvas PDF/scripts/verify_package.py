"""Verify exact release ZIPs and load the extracted extension in real offline Chrome."""
from pathlib import Path,PurePosixPath
import json,hashlib,zipfile,uuid,sys
R=Path(__file__).resolve().parents[1];D=R.parent/'dist';O=R/'output/package';O.mkdir(parents=True,exist_ok=True);checks=[]
V=json.loads((R/'package.json').read_text())['version']
def sha(data):return hashlib.sha256(data).hexdigest()
def check(name,ok,detail=None):
 checks.append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError(name)
for line in (D/f'canvas-pdf-{V}-SHA256.txt').read_text().splitlines():
 expected,name=line.split();check(name+' SHA-256',sha((D/name).read_bytes())==expected)
runtime=D/f'canvas-pdf-{V}-offline.zip';source=D/f'canvas-pdf-{V}-source.zip'
with zipfile.ZipFile(runtime) as z:
 inventory=json.loads(z.read('bundle-inventory.json'));check('inventory exactly covers runtime ZIP',set(z.namelist())=={x['path'] for x in inventory}|{'bundle-inventory.json'})
 for row in inventory:check_name=row['path'];data=z.read(check_name);assert len(data)==row['bytes'] and sha(data)==row['sha256'],check_name
 check('every distributed file matches inventory SHA-256',True,{'files':len(inventory)})
 manifest=json.loads(z.read('manifest.json'));check('MV3 / Chrome 157 / strict CSP / MIME opt-in',manifest['manifest_version']==3 and manifest['minimum_chrome_version']=='157' and 'wasm-unsafe-eval' in manifest['content_security_policy']['extension_pages'] and "'unsafe-eval'" not in manifest['content_security_policy']['extension_pages'] and not manifest['mime_types_handler']['application/pdf']['enabled'])
 lock=json.loads(z.read('assets.lock.json'))
 for row in lock['files']:
  if row['path'].startswith(('public/models/','public/fonts/','public/editcore/')):assert sha(z.read(row['path'][7:]))==row['sha256']
 check('all four official models, CJK font and EditCore match pinned assets',True)
 check('AGPL and dependency notices shipped','licenses/AGPL-3.0.txt' in z.namelist() and 'licenses/npm-inventory.json' in z.namelist() and 'licenses/editcore-LICENSE.pdfium' in z.namelist())
 extracted=O/('extension-'+uuid.uuid4().hex[:8]);extracted.mkdir()
 for name in z.namelist():
  p=PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts
 if '--hash-only' not in sys.argv:z.extractall(extracted)
with zipfile.ZipFile(source) as z:
 check('source ZIP CRC integrity',z.testzip() is None)
 check('source includes app, shared layer, build and frozen reference',all(n in z.namelist() for n in ['Canvas PDF/src/main.tsx','Canvas PDF/src/vendor/editcore/core.js','shared/html-in-canvas/canvas.ts','Canvas PDF/scripts/stage-runtime.mjs','Canvas PDF/benchmarks/ocr-frozen-40.pdf']))
 engine=next(r for r in lock['files'] if r['path'].endswith('editcore-corresponding-source.zip'));check('native corresponding source archive matches pinned hash',sha(z.read('Canvas PDF/output/upstream/editcore-corresponding-source.zip'))==engine['sha256'])
if '--hash-only' not in sys.argv:
 from playwright.sync_api import sync_playwright
 import pymupdf as fitz
 with sync_playwright() as p:
  c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080},accept_downloads=True)
  try:
   eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(extracted)})['id'];page=c.new_page();c.set_offline(True);page.goto(f'chrome-extension://{eid}/index.html');page.get_by_role('button',name='試用範例文件',exact=True).click();page.wait_for_function('()=>canvasPDF?.view?.count===2',timeout=60000);page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")');check('exact ZIP opens real CJK document offline',page.evaluate('()=>canvasPDF.view.objects.some(o=>o.text?.includes("文件"))'))
   page.get_by_role('button',name='下一頁 →',exact=True).click();page.wait_for_function('()=>canvasPDF.view.page===1');page.get_by_role('button',name='OCR',exact=True).click();page.get_by_role('button',name='辨識目前頁面',exact=True).click();page.wait_for_function('()=>canvasPDF.project.scans.length===5',timeout=180000);page.wait_for_function('()=>!document.querySelector(".statusbar").innerText.startsWith("◌")');check('exact ZIP runs local OCR and separate confidence scores',page.evaluate('()=>canvasPDF.project.scans.every(b=>Number.isFinite(b.detScore)&&Number.isFinite(b.score))'))
   gpu=page.evaluate('''async()=>{const image=await canvasPDF.client.call('render',{page:1,scale:2});const r=await canvasPDF.ocr.call({image,profile:'small',backend:'webgpu',threads:'4'},()=>{});return{runtime:r.runtime,threads:r.threads,lines:r.items.length,fallback:r.fallbackReason}}''');check('exact ZIP performs actual WebGPU inference',gpu['runtime']['detProvider']=='webgpu' and gpu['runtime']['recProvider']=='webgpu',gpu)
   page.get_by_role('button',name='輸出',exact=True).click()
   with page.expect_download(timeout=120000) as dl:page.get_by_role('button',name='原圖＋搜尋文字 PDF',exact=True).click()
   dl.value.save_as(str(O/'searchable.pdf'));d=fitz.open(O/'searchable.pdf');check('exact ZIP exports verified searchable PDF offline',len(d)==2 and len(d[1].get_text().strip())>30);page.screenshot(path=str(O/'packaged-editor.png'))
  finally:c.close()
 import subprocess
 for args in [[],['--dom']]:
  subprocess.run([sys.executable,str(R/'scripts/ocr_edit_acceptance.py'),'--extension',str(extracted),*args],check=True)
 check('exact ZIP pointer editing regression passes in native and DOM modes',True)
(O/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8')
