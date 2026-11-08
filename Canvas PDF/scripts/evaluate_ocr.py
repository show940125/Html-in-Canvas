"""Frozen synthetic 40-page evaluation. Does not claim real-document human gold."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,hashlib,re,unicodedata,time
R=Path(__file__).resolve().parents[1];O=R/'output/evaluation';O.mkdir(parents=True,exist_ok=True)
gold=json.loads((R/'output/fixtures/ocr-frozen-40.json').read_text(encoding='utf8'));rows=[]
def distance(a,b):
 prev=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  curr=[i]
  for j,y in enumerate(b,1):curr.append(min(curr[-1]+1,prev[j]+1,prev[j-1]+(x!=y)))
  prev=curr
 return prev[-1]
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFKC',s))
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'])
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000);page.locator('input[type=file]').first.set_input_files(str(R/'output/fixtures/ocr-frozen-40.pdf'));page.wait_for_function('()=>canvasPDF?.view?.count===40')
  start=time.time()
  for row in gold['pages']:
   result=page.evaluate('''async i=>{const image=await canvasPDF.client.call('render',{page:i,scale:2});const r=await canvasPDF.ocr.call({image,profile:'small',backend:'wasm',threads:'4'},()=>{});return{lines:r.items.map(x=>x.text),polygons:r.items.map(x=>x.poly),metrics:r.metrics,runtime:r.runtime,threads:r.threads};}''',row['page'])
   expected=row['text'];actual='\n'.join(result['lines']);a=norm(expected);b=norm(actual);item={**row,'actual':actual,'edits':distance(a,b),'characters':len(a),'cer':distance(a,b)/max(1,len(a)),'lineDifference':len(result['lines'])-len(expected.splitlines()),'missingNumbers':[n for n in re.findall(r'\d+',expected) if n not in actual],**result};rows.append(item);print('PAGE',row['page']+1,'CER',round(item['cer'],4),'ms',round(result['metrics']['totalMs']),flush=True)
   (O/'evaluation.json').write_text(json.dumps({'kind':'synthetic-known-text-not-human-gold','sha256':gold['sha256'],'browser':c.browser.version,'normalization':'NFKC then remove whitespace; original text and OCR lines retained','rows':rows,'cer':sum(x['edits'] for x in rows)/sum(x['characters'] for x in rows),'wallSeconds':time.time()-start},ensure_ascii=False,indent=2),encoding='utf8')
 finally:c.close()
