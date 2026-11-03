from browser_support import chrome_launch_options
"""20 materials / six rasters / 20 edges; native drag latency and 150% DPI."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
import json,zipfile,hashlib,struct,zlib,traceback,statistics
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v02';results=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def check(name,passed,detail=None):
 results.append(dict(name=name,passed=bool(passed),detail=detail));print(('PASS ' if passed else 'FAIL ')+name,flush=True)
 if not passed:raise AssertionError(str(detail))
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
def raster(seed):
 w,h=320,140;raw=b''.join(b'\0'+bytes((50+seed*20,110+y//3,80+seed*10,255))*w for y in range(h))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
fixture=json.loads((ROOT/'tests'/'fixtures'/'acceptance-fixture.json').read_text(encoding='utf-8'))['project'];fixture['title']='示例｜二十份研究材料';fixture['view']={'x':0,'y':20,'zoom':.5};fixture['groups']=[];fixture['tags']=[];fixture['outline']={'groupIds':[],'cardIds':[c['id'] for c in fixture['cards']]};fixture['relations']=[dict(id=f'edge-{i}',**{'from':fixture['cards'][i]['id'],'to':fixture['cards'][(i+1)%20]['id']},kind=['支持','質疑','補充','相關'][i%4],label='示例關係 '+str(i+1)) for i in range(20)]
assets=[];entries={}
for i,c in enumerate(fixture['cards']):
 c['tagIds']=[];c['title']=f'示例材料 {i+1:02}';c['originalDoc']={'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':c['originalText']}]}]};c['editedDoc']=json.loads(json.dumps(c['originalDoc']))
 if i<6:
  raw=raster(i);sha=hashlib.sha256(raw).hexdigest();entries['assets/'+sha]=raw;assets.append(dict(id=sha,mime='image/png',width=320,height=140,sourceUrl='',createdAt=c['capturedAt']));image={'type':'image','attrs':dict(assetId=sha,alt='示例圖片',caption='示例圖 '+str(i+1),width=320,status='ready')};c['editedDoc']['content'].insert(0,image)
target=OUT/'workload-fixture.zip'
with zipfile.ZipFile(target,'w') as z:
 for name,raw in entries.items():z.writestr(name,raw)
 z.writestr('manifest.json',json.dumps(dict(format='canvas-clipper-workspace',version=2,projects=[fixture],assets=assets)))
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement'])
  try:
   context=browser.new_context(viewport={'width':1920,'height':2000});page=context.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.locator('input[accept^=".json"]').set_input_files(target);page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===20');page.locator('.save-state.saved').wait_for();page.wait_for_timeout(400)
   check('full workload loads in native Canvas',page.locator('.board-surface').get_attribute('data-mode')=='native' and page.locator('.relation').count()==20 and page.locator('.card-thumbnail').count()==6)
   dims=page.locator('.clip-card').evaluate_all('(cards)=>cards.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,right:r.right}})')
   check('all twenty materials are inside viewport',all(0<=r['x'] and r['right']<=1920 and 0<=r['y'] and r['bottom']<=2000 for r in dims),dims[-1])
   page.evaluate('''()=>{window.dragSamples=[];let moved=0;document.querySelector('.board-surface').addEventListener('pointermove',()=>{moved=performance.now()},{capture:true});document.querySelector('.native-canvas').addEventListener('paint',()=>{if(moved){window.dragSamples.push(performance.now()-moved);moved=0;}});}''')
   r=page.locator('.card-handle').first.bounding_box();page.mouse.move(r['x']+35,r['y']+10);page.mouse.down()
   for i in range(40):page.mouse.move(r['x']+35+i*2,r['y']+10+i)
   page.mouse.up();page.locator('.save-state.saved').wait_for();samples=page.evaluate('window.dragSamples');ordered=sorted(samples);stats={'samples':len(samples),'medianMs':round(statistics.median(samples),2),'p95Ms':round(ordered[int((len(ordered)-1)*.95)],2),'maxMs':round(max(samples),2),'measurement':'pointermove handler to Canvas paint event; excludes compositor presentation'}
   check('native drag event-to-paint p95 under 100ms',len(samples)>=20 and stats['p95Ms']<100,stats)
   page.screenshot(path=str(OUT/'workload-native.png'));context.close()
   context=browser.new_context(viewport={'width':1680,'height':1100},device_scale_factor=1.5,reduced_motion='reduce');page=context.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_load_state('networkidle');page.locator('input[accept^=".json"]').set_input_files(target);page.wait_for_function('()=>document.querySelectorAll(".clip-card").length===20');page.locator('.save-state.saved').wait_for()
   size=page.locator('.native-canvas').evaluate('(c)=>({width:c.width,css:c.clientWidth,dpr:devicePixelRatio})')
   check('150-percent DPI native backing size is correct',abs(size['width']/size['css']-1.5)<.01,size)
   note=page.get_by_role('textbox',name='卡片筆記 1',exact=True);r=note.bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2);page.keyboard.press('Control+A');page.keyboard.insert_text('150% 原生命中與中文輸入');page.locator('.save-state.saved').wait_for()
   check('150-percent DPI geometry maps native note input',note.input_value()=='150% 原生命中與中文輸入')
   page.get_by_role('tab',name='◇ 特效展示').click();page.wait_for_function('()=>Number(document.querySelector(".webgl-canvas")?.dataset.frames)>0 || !!document.querySelector(".showcase-unavailable")');button=page.locator('.gpu-test-button');r=button.bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
   page.wait_for_function('()=>document.querySelector(".gpu-test-button").textContent.includes("1 次")')
   check('150-percent DPI GPU button follows perspective','1 次' in button.inner_text())
   page.screenshot(path=str(OUT/'gpu-150-percent.png'));context.close()
  finally:browser.close()
except Exception:results.append(dict(name='unexpected failure',passed=False,detail=traceback.format_exc()));raise
finally:server.shutdown();server.server_close();(OUT/'workload-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
