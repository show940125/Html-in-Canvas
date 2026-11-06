"""Real MV3 acceptance. Uses installed Chrome in a disposable profile; no user profile changes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, traceback, uuid, sys, zipfile
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'acceptance'
OUT.mkdir(parents=True,exist_ok=True)
results=[];errors=[]
dom='--dom' in sys.argv
def check(name,condition,details=None):
    results.append({'name':name,'passed':bool(condition),'details':details})
    print(('PASS ' if condition else 'FAIL ')+name,flush=True)
    if not condition:raise AssertionError(details or name)
def coords(page,frame,locator):
    outer=page.locator('iframe[title="投影片編輯舞台"]').first.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width}}')
    inner=locator.evaluate('(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}')
    width=frame.evaluate('innerWidth');scale=outer['w']/width
    return outer['x']+(inner['x']+inner['w']/2)*scale,outer['y']+(inner['y']+inner['h']/2)*scale
with sync_playwright() as p:
    context=None
    try:
        chrome=Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')
        options={'executable_path':str(chrome)} if chrome.is_file() else {'channel':'chromium'}
        args=['--enable-unsafe-extension-debugging']
        if not dom:args+=['--enable-blink-features=CanvasDrawElement']
        else:args+=['--disable-blink-features=CanvasDrawElement']
        context=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),**options,headless=True,ignore_default_args=['--disable-extensions'],args=args,viewport={'width':1600,'height':1000},device_scale_factor=1.5,accept_downloads=True)
        cdp=context.browser.new_browser_cdp_session();eid=cdp.send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id']
        print('EXTENSION '+eid,flush=True)
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('console',lambda message:print('CONSOLE '+message.text[:350],flush=True) if message.type=='error' else None)
        page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_load_state('networkidle')
        page.get_by_role('button',name='新增投影片',exact=True).wait_for()
        frame=next(f for f in page.frames if 'stage.html' in f.url)
        frame.wait_for_selector('#cs-draw-root',state='attached',timeout=15000)
        check('MV3 sandbox stage loads',True)
        native=frame.locator('#cs-canvas').count()>0
        check('renderer mode matches requested capability',native!=dom,{'native':native,'domRun':dom})
        if native:frame.wait_for_function('() => Number(document.querySelector("#cs-canvas").dataset.paints)>0')
        check('initial slide has real HTML',frame.locator('.slide').count()==1)
        page.screenshot(path=str(OUT/('editor-dom.png' if dom else 'editor-native.png')))
        page.get_by_role('button',name='文字',exact=True).click()
        text=frame.locator('p[data-cs-free="true"]').last;text.wait_for(state='attached')
        frame.wait_for_function('() => Number(document.querySelector("#cs-canvas")?.dataset.paints||1)>0')
        x,y=coords(page,frame,text);page.mouse.dblclick(x,y)
        frame.wait_for_selector('[contenteditable="true"]',state='attached',timeout=5000)
        page.keyboard.press('Control+A');page.keyboard.insert_text('繁體中文簡報 · 已編輯')
        page.locator('.canvas-heading').click()
        check('native pointer and Chinese text editing',text.inner_text()=='繁體中文簡報 · 已編輯')
        page.get_by_role('button',name='復原 Ctrl+Z').click()
        frame.wait_for_function('() => !document.body.textContent.includes("繁體中文簡報 · 已編輯")')
        page.get_by_role('button',name='重做 Ctrl+Shift+Z').click()
        frame.wait_for_function('() => document.body.textContent.includes("繁體中文簡報 · 已編輯")')
        check('undo and redo preserve text',True)
        page.get_by_role('button',name='新增投影片',exact=True).click()
        page.get_by_role('button',name='S08 · Duo Compare',exact=False).click()
        page.wait_for_function('() => document.querySelectorAll(".slide-thumb").length===2')
        frame.wait_for_selector('[data-layout="S08"]',state='attached')
        check('registered Guizang layout inserts',True)
        page.get_by_role('button',name='講者備註',exact=False).click()
        page.get_by_role('textbox',name='講者提詞').fill('第一點\n第二點')
        page.locator('.canvas-heading').click()
        page.get_by_role('button',name='匯出',exact=True).click()
        with page.expect_download() as info:page.get_by_role('button',name='可再編輯專案',exact=False).click()
        download=info.value;path=OUT/('roundtrip-dom.zip' if dom else 'roundtrip-native.zip');download.save_as(path)
        with zipfile.ZipFile(path) as z:project=json.loads(z.read('project.json'));html=z.read('presentation.html').decode()
        check('ZIP retains edits, stable notes and source',len(project['slides'])==2 and project['slides'][1]['note']['talk']==['第一點','第二點'] and '繁體中文簡報 · 已編輯' in project['slides'][0]['html'])
        check('export has offline motion and no module/CDN runtime fetch', 'cdn.jsdelivr.net' not in html and 'unpkg.com/lucide' not in html and 'window.__SPEAKER_NOTES__' in html)
        exported=OUT/('presentation-dom.html' if dom else 'presentation-native.html');exported.write_text(html,encoding='utf-8')
        standalone=context.new_page();standalone.on('pageerror',lambda e:errors.append('standalone: '+str(e)));standalone.goto(exported.as_uri());standalone.wait_for_load_state('networkidle')
        standalone.wait_for_function('() => typeof window.__playSlide==="function"',timeout=15000)
        check('exported HTML boots standalone animation runtime',standalone.locator('#deck>.slide').count()==2)
        standalone.screenshot(path=str(OUT/('standalone-dom.png' if dom else 'standalone-native.png')))
        pdfpath=OUT/('searchable-dom.pdf' if dom else 'searchable-native.pdf');standalone.pdf(path=str(pdfpath),print_background=True,prefer_css_page_size=True)
        with pymupdf.open(pdfpath) as pdf:check('PDF has real searchable text and two pages',len(pdf)==2 and '繁體中文簡報' in ''.join(page.get_text() for page in pdf),{'pages':len(pdf)})
        standalone.close()
        page.get_by_role('button',name='關閉對話框').click()
        with page.expect_popup() as popup:page.get_by_role('button',name='播放',exact=True).click()
        viewer=popup.value;viewer.wait_for_load_state('networkidle');viewer.get_by_role('button',name='P 講者模式').click();viewer.get_by_role('textbox',name='講者備註').wait_for()
        check('presentation and presenter notes open in real extension',True)
        viewer.screenshot(path=str(OUT/('presenter-dom.png' if dom else 'presenter-native.png')));viewer.close()
        page.reload();page.wait_for_load_state('networkidle');page.wait_for_function('() => document.querySelectorAll(".slide-thumb").length===2')
        check('saved project reopens from IndexedDB',page.locator('.slide-thumb').count()==2)
        check('no uncaught JavaScript errors',not errors,errors)
    except Exception:
        traceback.print_exc()
        if context:
            for i,page in enumerate(context.pages):
                try:page.screenshot(path=str(OUT/f'failure-{i}.png'))
                except Exception:pass
        raise
    finally:
        (OUT/('results-dom.json' if dom else 'results-native.json')).write_text(json.dumps({'results':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        if context:context.close()
