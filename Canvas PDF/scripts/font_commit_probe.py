"""Bounded original-document probe for PDFium CJK round-trip corruption."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, uuid, base64
import pymupdf
R=Path(__file__).resolve().parents[1];O=R/'output/font-commit';O.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'])
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000)
  for text in ['原生段落已修改','繁體中文測試','重建校正文字','本機文件','生死']:
   row=page.evaluate('''async text=>{await canvasPDF.open(await canvasPDF.demoPdf(),'probe.pdf');const o=canvasPDF.view.objects.find(o=>o.kind==='text');await canvasPDF.command('text',{id:o.engineId,runs:[{...o.runs[0],text,family:'Canvas PDF TC',sourceIndex:-1}],format:o.format});const data=await canvasPDF.exportPdf(canvasPDF.project,canvasPDF.client,'edited');return{requested:text,model:canvasPDF.view.objects.filter(o=>o.kind==='text').map(o=>o.text),base64:await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(new Blob([data]))})}}''',text)
   data=base64.b64decode(row.pop('base64'));d=pymupdf.open(stream=data,filetype='pdf');row['extracted']=d[0].get_text();row['passed']=text in row['model'] and text in row['extracted'];results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 finally:c.close();(O/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
assert len(results)==5 and all(r['passed'] for r in results)
