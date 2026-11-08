"""Anonymous RPC live probe with original synthetic text and a pregranted test manifest.
No user PDF, account cookies, or automatic retries. Production optional-permission UI is separate.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import uuid,json,os,shutil
R=Path(__file__).resolve().parents[1];O=R/'output/gemini';O.mkdir(parents=True,exist_ok=True);extension=O/'extension';extension.mkdir(exist_ok=True)
for source in (R/'dist').rglob('*'):
 target=extension/source.relative_to(R/'dist')
 if source.is_dir():target.mkdir(exist_ok=True)
 elif source.name=='manifest.json':
  m=json.loads(source.read_text(encoding='utf8'));m['host_permissions']=['https://gemini.google.com/*'];target.write_text(json.dumps(m,ensure_ascii=False),encoding='utf8')
 elif not target.exists():os.link(source,target)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(O/('profile-'+uuid.uuid4().hex[:8])),executable_path=r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'])
 try:
  eid=c.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(extension)})['id'];page=c.new_page();page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_function('()=>canvasPDF?.ready',timeout=60000)
  result=page.evaluate('''async()=>{const jobs=[];try{const result=await canvasPDF.translateBlocks([{id:'probe-1',source:'Original editable paragraph. Amount: 123.'}],{provider:'gemini',from:'en',to:'zh-Hant',glossary:''},new AbortController().signal,[],async j=>{const i=jobs.findIndex(x=>x.id===j.id);if(i<0)jobs.push(j);else jobs[i]=j;},()=>{});return{state:'complete',result:Object.fromEntries(result),jobs};}catch(e){return{state:'unavailable',error:String(e),jobs};}}''');(O/'result.json').write_text(json.dumps({'testHostPermissionPregranted':True,**result},ensure_ascii=False,indent=2),encoding='utf8');print(result,flush=True)
 finally:c.close()
