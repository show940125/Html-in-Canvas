from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'playback';results=[];errors=[];requests=[]
with sync_playwright() as p:
 chrome=Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe');options={'executable_path':str(chrome)} if chrome.is_file() else {'channel':'chromium'}
 browser=p.chromium.launch(**options,headless=True)
 try:
  context=browser.new_context(viewport={'width':1280,'height':720})
  def deny(route):requests.append(route.request.url);route.abort()
  context.route('http://**/*',deny);context.route('https://**/*',deny)
  for family,count in [('swiss',22),('magazine',10)]:
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto((OUT/(family+'.html')).as_uri());page.wait_for_load_state('networkidle');page.wait_for_function('()=>typeof window.__playSlide==="function"')
   for i in range(count):
    page.wait_for_function('()=>typeof lock==="undefined"||!lock');page.evaluate('(i)=>go(i)',i);page.wait_for_function('(i)=>window.__currentSlideIndex===i',arg=i)
    page.evaluate('(i)=>window.__playSlide(i)',i)
    page.evaluate('()=>{for(let n=0;n<40;n++)if(!window.__pipeAdvance?.())break}')
    # Every semantic recipe executes; visibility is recorded after finite animations.
    page.wait_for_function('()=>document.getAnimations().every(a=>a.playState!=="running")',timeout=10000)
    info=page.evaluate('''(i)=>{const s=document.querySelectorAll('#deck>.slide')[i];const nodes=[...s.querySelectorAll('[data-anim]')];return{recipe:s.dataset.animate||'cascade',elements:nodes.length,hidden:nodes.filter(n=>Number(getComputedStyle(n).opacity)<.01).length}}''',i)
    info.update({'family':family,'page':i+1,'passed':info['hidden']==0});results.append(info);print(('PASS ' if info['passed'] else 'FAIL ')+family+' '+str(i+1)+' '+str(info),flush=True);assert info['passed'],info
   page.get_by_text('P 演讲模式',exact=False).count()
   page.keyboard.press('p');page.wait_for_selector('#ppt-presenter',state='visible',timeout=10000);page.screenshot(path=str(OUT/(family+'-presenter.png')))
   results.append({'family':family,'test':'native presenter runtime opens','passed':True});page.close()
  assert not errors,errors
  assert not requests,requests
 finally:
  (OUT/'results.json').write_text(json.dumps({'results':results,'errors':errors,'networkRequests':requests},ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
