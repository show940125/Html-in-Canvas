"""Real MV3 inference on original synthetic input; records actual providers and pthreads."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import uuid,json,time
R=Path(__file__).resolve().parents[1];O=R/'output/ocr-matrix';O.mkdir(parents=True,exist_ok=True)
results=[];requests=[]
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1550,'height':1080})
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(R/'dist')})['id'];page=c.new_page();c.on('request',lambda r:requests.append(r.url));page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000)
  page.evaluate('async()=>{await canvasPDF.open(await canvasPDF.demoPdf(),"OCR matrix.pdf");window.ocrImage=await canvasPDF.client.call("render",{page:1,scale:2});}')
  for profile,backend,threads in [('small','wasm','1'),('small','wasm','2'),('small','wasm','4'),('medium','wasm','4'),('small','webgpu','4')]:
   row={'profile':profile,'requestedBackend':backend,'requestedThreads':threads};start=time.time()
   for run in range(2):
    result=page.evaluate('''async args=>{try{const r=await canvasPDF.ocr.call({...args,image:ocrImage},()=>{});return{runtime:r.runtime,threads:r.threads,pthreads:r.spawnedPthreads,isolated:r.isolated,metrics:r.metrics,fallbackReason:r.fallbackReason,threadFallbackReason:r.threadFallbackReason,lines:r.items.map(i=>i.text),polygons:r.items.map(i=>i.poly)};}catch(e){return{error:String(e)}}}''',{'profile':profile,'backend':backend,'threads':threads})
    row['cold' if run==0 else 'warm']=result;print(profile,backend,threads,run,json.dumps(result,ensure_ascii=False)[:1000],flush=True)
    if 'error' in result:break
   row['wallSeconds']=time.time()-start;results.append(row);(O/'matrix.json').write_text(json.dumps({'browser':c.browser.version,'results':results,'remoteRequests':[u for u in requests if u.startswith('http')]},ensure_ascii=False,indent=2),encoding='utf8')
  result=page.evaluate('''async()=>{canvasPDF.ocr.cancel();const task=canvasPDF.ocr.call({image:ocrImage,profile:'medium',backend:'wasm',threads:'4'},()=>{}).then(()=>({cancelled:false})).catch(e=>({cancelled:String(e).includes('取消')}));canvasPDF.ocr.cancel();return task;}''');print('CANCEL',result,flush=True);(O/'cancel.json').write_text(json.dumps(result),encoding='utf8')
 finally:c.close()
