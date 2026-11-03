from browser_support import chrome_launch_options
"""Probe the installed Chrome engine in an isolated, disposable test profile."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'playwright'
OUT.mkdir(parents=True, exist_ok=True)
HTML = """<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<style>body{margin:0;background:#eee;font-family:'Microsoft JhengHei'}canvas{width:800px;height:500px}.card{width:300px;padding:24px;background:#fff;color:#123;font-size:20px}button,textarea{font:inherit}textarea{display:block;width:250px}</style>
<canvas id="board" width="800" height="500"><div id="card" class="card"><h2>原生 Canvas 測試</h2><p>這段文字可以選取</p><button id="hit">測試點擊</button><textarea aria-label="中文筆記"></textarea></div></canvas>
<script>
const cv=document.querySelector('canvas'),card=document.querySelector('#card'),ctx=cv.getContext('2d');
window.diagnostic={draw:typeof ctx.drawElementImage,requestPaint:typeof cv.requestPaint,modern:'content' in cv,legacy:'layoutSubtree' in cv,update:typeof cv.updateElementGeometry,setTransform:typeof card.setCanvasTransform,paints:0,clicks:0};
if('content' in cv){cv.setAttribute('content','drawable');card.setAttribute('drawable','');}else{cv.setAttribute('layoutsubtree','');}
cv.addEventListener('paint',()=>{try{ctx.reset();const result=ctx.drawElementImage(card,80,60);window.diagnostic.result=String(result);if(result && typeof result.a==='number'){const transform=result.toString();if(card.style.transform!==transform)card.style.transform=transform;if(cv.updateElementGeometry)cv.updateElementGeometry(card);}window.diagnostic.paints++;window.diagnostic.bounds=card.getBoundingClientRect().toJSON();}catch(e){window.diagnostic.error=String(e)}});
document.querySelector('#hit').onclick=()=>{window.diagnostic.clicks++};
if(cv.requestPaint)cv.requestPaint();
</script></html>"""
with sync_playwright() as p:
    browser=p.chromium.launch(**chrome_launch_options(),headless=True,args=['--enable-features=CanvasDrawElement'])
    page=browser.new_page(viewport={'width':900,'height':600})
    page.set_content(HTML)
    page.wait_for_function('window.diagnostic.paints > 0 || window.diagnostic.error',timeout=10000)
    print('INITIAL', page.evaluate('window.diagnostic'), flush=True)
    page.screenshot(path=str(OUT/'canvas-native-before-click.png'))
    # Playwright's DOM hit-test sees the canvas; native coordinate input tests
    # the browser's actual drawable-element event routing instead.
    page.wait_for_timeout(200)
    box=page.locator('#hit').bounding_box()
    print('BUTTON',box,flush=True)
    page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
    note=page.locator('textarea').bounding_box()
    page.mouse.click(note['x']+30,note['y']+20)
    page.keyboard.insert_text('繁體中文輸入測試')
    page.wait_for_function('window.diagnostic.clicks === 1',timeout=5000)
    result=page.evaluate('({...window.diagnostic,note:document.querySelector("textarea").value,userAgent:navigator.userAgent})')
    page.screenshot(path=str(OUT/'canvas-native-probe.png'))
    (OUT/'canvas-native-probe.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
    browser.close()
