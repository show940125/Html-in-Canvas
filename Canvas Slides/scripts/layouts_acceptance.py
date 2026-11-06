"""Exercise all 32 choices through the real sandbox bridge and save native captures."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,uuid,traceback,base64,sys
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'layouts';OUT.mkdir(parents=True,exist_ok=True)
vendor=json.loads((ROOT/'src'/'vendor'/'guizang.json').read_text(encoding='utf-8'));results=[]
with sync_playwright() as p:
 chrome=Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe');options={'executable_path':str(chrome)} if chrome.is_file() else {'channel':'chromium'}
 context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),**options,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-blink-features=CanvasDrawElement'],viewport={'width':1280,'height':720})
 try:
  eid=context.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id'];page=context.new_page();page.goto(f'chrome-extension://{eid}/stage.html#layout-test');page.wait_for_load_state('networkidle')
  page.evaluate('''()=>{const channel=new MessageChannel();window.responses=new Map();window.stagePort=channel.port1;channel.port1.onmessage=e=>{if(e.data.request)window.responses.set(e.data.request,e.data)};window.stagePort.start();window.postMessage({protocol:'canvas-slides/1',session:'layout-test',type:'connect'},'*',[channel.port2]);window.request=async(type,payload)=>{const request=crypto.randomUUID();window.stagePort.postMessage({protocol:'canvas-slides/1',session:'layout-test',type,payload,request});return await new Promise((resolve,reject)=>{const deadline=performance.now()+10000;const check=()=>{if(window.responses.has(request)){const m=window.responses.get(request);window.responses.delete(request);m.type==='failure'?reject(Error(m.payload)):resolve(m.payload)}else if(performance.now()>deadline)reject(Error('Stage timeout'));else requestAnimationFrame(check)};check()})}}''')
  for layout in vendor['layouts']:
   t=vendor['templates'][layout['family']];deck={'schema':1,'id':'layout-'+layout['id'],'title':layout['title'],'family':layout['family'],'width':1280,'height':720,'css':t['css'],'rootAttrs':t['rootAttrs'],'bodyClass':t['bodyClass'],'bodyStyle':'','slides':[{'id':layout['id'],'html':layout['html'],'hidden':False,'note':{'title':layout['title'],'purpose':'','talk':[],'transition':''}}],'original':'','warnings':[],'updated':0}
   page.evaluate('(deck)=>window.request("load",{deck,index:0,mode:"edit",forceDOM:true})',deck)
   overflow=page.evaluate('''()=>[...document.querySelectorAll('#deck *')].filter(e=>e.children.length===0&&e.textContent.trim()&&getComputedStyle(e).visibility!=='hidden').filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.right>1281||r.bottom>721||r.x< -1||r.y< -1)}).map(e=>e.textContent.trim().slice(0,65))''')
   page.evaluate('(deck)=>window.request("load",{deck,index:0,mode:"edit",forceDOM:false})',deck)
   page.wait_for_function('()=>Number(document.querySelector("#cs-canvas")?.dataset.paints)>0')
   info=page.evaluate('''()=>{const nodes=[...document.querySelectorAll('#deck h1,#deck h2,#deck h3,#deck p,#deck .t-meta,#deck .t-cat')];return{native:!!document.querySelector('#cs-canvas'),text:document.querySelector('#deck').innerText.length,visible:nodes.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.x<1280&&r.y<720}).length,overflow:nodes.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.right>1281||r.bottom>721||r.x< -1||r.y< -1)}).map(e=>e.textContent.trim().slice(0,65))}}''')
   result=page.evaluate('()=>window.request("png")');(OUT/(layout['id']+'.png')).write_bytes(base64.b64decode(result['url'].split(',')[1]));info.update({'id':layout['id'],'domOverflow':overflow,'passed':info['native'] and info['visible']>0 and not overflow});results.append(info);print(('PASS ' if info['passed'] else 'FAIL ')+layout['id']+' '+str(info),flush=True)
   if '--write-previews' in sys.argv:
    preview=page.evaluate('''async(url)=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(image,0,0,320,180);return c.toDataURL('image/png')}''',result['url']);directory=ROOT/'public'/'previews';directory.mkdir(exist_ok=True);(directory/(layout['id']+'.png')).write_bytes(base64.b64decode(preview.split(',')[1]))
  assert all(x['passed'] for x in results)
 finally:
  (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');context.close()
