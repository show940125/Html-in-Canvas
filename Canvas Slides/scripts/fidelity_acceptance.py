"""Real MV3 regression for theme fidelity, sequential builds and print readiness."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, uuid, zipfile
import pymupdf

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'examples'/'vitamin-c-style-a'
OUT=ROOT/'output'/'fidelity';OUT.mkdir(parents=True,exist_ok=True)
results=[];errors=[]
def check(name,ok,details=None):
    results.append({'name':name,'passed':bool(ok),'details':details})
    print(('PASS ' if ok else 'FAIL ')+name,flush=True)
    assert ok, details or name
def pixel(path,x=10,y=10):
    return pymupdf.Pixmap(str(path)).pixel(x,y)[:3]
def green(rgb):return all(abs(a-b)<=3 for a,b in zip(rgb,(26,46,31)))
def frame(page):return next(f for f in page.frames if 'stage.html' in f.url)
def settled(f):
    f.wait_for_function('()=>Number(document.querySelector("#cs-canvas")?.dataset.paints)>0')
    f.evaluate('async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}')
def steps(f,n):
    f.wait_for_function('(n)=>document.querySelectorAll(".slide")[4].dataset.csStep===String(n)',arg=n)
    f.wait_for_function('()=>document.getAnimations().every(a=>a.playState!=="running")')
    values=f.locator('[data-anim="step"]').evaluate_all('(nodes)=>nodes.map(n=>Number(getComputedStyle(n).opacity))')
    check(f'pipeline reveals exactly {n} steps',sum(v>.95 for v in values)==n,values)

with sync_playwright() as p:
    chrome=Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')
    options={'executable_path':str(chrome)} if chrome.is_file() else {'channel':'chromium'}
    ctx=p.chromium.launch_persistent_context(str(OUT/('profile-'+uuid.uuid4().hex[:8])),**options,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--enable-blink-features=CanvasDrawElement'],viewport={'width':1920,'height':1080},accept_downloads=True)
    try:
        # Observe the actual print() invocation, without opening a system dialog in CI.
        ctx.add_init_script('window.print=()=>{document.documentElement.dataset.printCalled="true";document.documentElement.dataset.readyAtPrint=document.documentElement.dataset.csPrintReady||"false"}')
        eid=ctx.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(ROOT/'dist')})['id']
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'chrome-extension://{eid}/index.html');page.wait_for_load_state('networkidle');f=frame(page);f.wait_for_selector('#cs-draw-root',state='attached')
        for attempt in range(2):
            page.locator('input[type=file]').first.set_input_files(str(SAMPLE/'維他命C_風格A_在線編輯測試.zip'))
            page.get_by_role('button',name='匯入並開始編輯').click();f.wait_for_selector('[data-slide-id="vitamin-c-cover"]',state='attached');settled(f)
            f.locator('#cs-canvas').screenshot(path=str(OUT/f'editor-{attempt}.png'))
            check(f'repeated ZIP import keeps forest pixels {attempt+1}',green(pixel(OUT/f'editor-{attempt}.png')),pixel(OUT/f'editor-{attempt}.png'))
        page.get_by_role('button',name='匯出',exact=True).click()
        with page.expect_download() as d:page.get_by_role('button',name='目前投影片 PNG',exact=False).click()
        d.value.save_as(OUT/'cover.png');check('PNG preserves forest background',green(pixel(OUT/'cover.png')),pixel(OUT/'cover.png'))
        with page.expect_download() as d:page.get_by_role('button',name='獨立 HTML 簡報',exact=False).click()
        d.value.save_as(OUT/'presentation.html')
        portable=ctx.new_page();portable.on('pageerror',lambda e:errors.append(str(e)));portable.goto((OUT/'presentation.html').as_uri());portable.wait_for_load_state('networkidle');portable.wait_for_function('()=>typeof window.__csAdvance==="function"');portable.screenshot(path=str(OUT/'portable.png'))
        check('portable HTML preserves forest pixels',green(pixel(OUT/'portable.png')),pixel(OUT/'portable.png'))
        portable.wait_for_function('()=>!lock');portable.keyboard.press('End');steps(portable,0)
        portable.locator('#deck>.slide').nth(4).click(position={'x':25,'y':200});steps(portable,1)
        portable.keyboard.press('Space');steps(portable,2)
        portable.keyboard.press('ArrowRight');steps(portable,3)
        portable.keyboard.press('ArrowRight');steps(portable,4)
        portable.emulate_media(reduced_motion='reduce');portable.reload();portable.wait_for_function('()=>typeof window.__csAdvance==="function"&&!lock');portable.keyboard.press('End');steps(portable,0);portable.keyboard.press('Space');steps(portable,1)
        portable.pdf(path=str(OUT/'portable.pdf'),print_background=True,prefer_css_page_size=True)
        with pymupdf.open(OUT/'portable.pdf') as pdf:
            check('portable Ctrl+P also prints complete five pages',len(pdf)==5 and all(t in pdf[4].get_text() for t in ['選蔬果','配一餐','留新鮮','做日常']))
        portable.close()
        # Exercise the editor's actual PDF button, including its readiness barrier.
        with page.expect_popup() as popup:page.get_by_role('button',name='列印／另存 PDF',exact=False).click()
        printer=popup.value;printer.wait_for_function('()=>document.documentElement.dataset.printCalled==="true"',timeout=30000)
        check('print waits for complete frames/fonts/images',printer.locator('html').get_attribute('data-ready-at-print')=='true')
        check('print includes five isolated pages',printer.locator('.cs-print-page').count()==5)
        pdf=OUT/'presentation.pdf';printer.pdf(path=str(pdf),print_background=True,prefer_css_page_size=True)
        with pymupdf.open(pdf) as doc:
            check('PDF has five searchable pages',len(doc)==5 and all(len(p.get_text().strip())>100 for p in doc))
            for i,pdfpage in enumerate(doc):
                pix=pdfpage.get_pixmap();pix.save(OUT/f'pdf-{i+1}.png')
                if i in (0,2):check(f'PDF page {i+1} keeps forest pixels',green(pix.pixel(10,10)[:3]),pix.pixel(10,10))
                printer.locator('iframe').nth(i).screenshot(path=str(OUT/f'print-reference-{i+1}.png'))
                reference=pymupdf.Pixmap(str(OUT/f'print-reference-{i+1}.png'));rendered=pdfpage.get_pixmap(matrix=pymupdf.Matrix(4/3,4/3))
                mae=sum(abs(a-b) for a,b in zip(reference.samples,rendered.samples))/len(rendered.samples)
                check(f'PDF page {i+1} visually matches complete static render',reference.width==rendered.width and reference.height==rendered.height and mae<5,round(mae,3))
            check('PDF includes every last-page step',all(t in doc[4].get_text() for t in ['選蔬果','配一餐','留新鮮','做日常']))
        # Waiting does not change the printed output: playback never runs here.
        check('print document has no playback scripts',all(not f.locator('script').count() for f in printer.frames))
        printer.close();page.get_by_role('button',name='關閉對話框').click()
        with page.expect_popup() as popup:page.get_by_role('button',name='播放',exact=True).click()
        viewer=popup.value;viewer.on('pageerror',lambda e:errors.append(str(e)));viewer.wait_for_load_state('networkidle');vf=frame(viewer);vf.wait_for_function('()=>typeof window.__csAdvance==="function"');vf.wait_for_function('()=>!lock')
        size=viewer.locator('.current-slide iframe').evaluate('(e)=>{const r=e.getBoundingClientRect(),p=e.closest(".current-slide").getBoundingClientRect();return {w:r.width,h:r.height,availableW:p.width,availableH:p.height}}')
        expected=min(size['availableW']/1280,size['availableH']/720)
        check('player fills maximum aspect-correct area and enlarges above 100%',abs(size['w']-1280*expected)<2 and size['w']>1280,size)
        vf.locator('#deck').screenshot(path=str(OUT/'player.png'));check('player keeps forest pixels',green(pixel(OUT/'player.png')),pixel(OUT/'player.png'))
        viewer.get_by_role('button',name='尾頁',exact=True).click();steps(vf,0)
        viewer.get_by_role('button',name='下一步',exact=True).click();steps(vf,1)
        # Pointer inside sandbox; keyboard after sandbox focus; no auto completion.
        vf.locator('#deck>.slide').nth(4).click(position={'x':25,'y':200});steps(vf,2)
        viewer.keyboard.press('Space');steps(vf,3)
        viewer.keyboard.press('ArrowRight');steps(vf,4)
        viewer.get_by_role('button',name='P 講者模式').click();check('presenter view remains available',viewer.get_by_role('textbox',name='講者備註').is_visible());viewer.close()
        # Explicit background edits must survive the dark slide's pseudo-element veil.
        page.get_by_role('button',name='ink-classic',exact=True).click();f.wait_for_function('()=>document.documentElement.dataset.theme==="ink-classic"');settled(f)
        page.get_by_label('頁面背景',exact=True).fill('#2a543b');settled(f)
        f.locator('#cs-canvas').screenshot(path=str(OUT/'custom-background.png'));check('explicit page background bypasses dark veil',all(abs(a-b)<=3 for a,b in zip(pixel(OUT/'custom-background.png'),(42,84,59))),pixel(OUT/'custom-background.png'))
        with page.expect_popup() as popup:page.get_by_role('button',name='播放',exact=True).click()
        custom=popup.value;custom.wait_for_load_state('networkidle');cf=frame(custom);cf.wait_for_function('()=>typeof window.__csAdvance==="function"');cf.locator('#deck').screenshot(path=str(OUT/'custom-player.png'));check('explicit background survives playback',all(abs(a-b)<=3 for a,b in zip(pixel(OUT/'custom-player.png'),(42,84,59))),pixel(OUT/'custom-player.png'));custom.close()
        check('no uncaught errors',not errors,errors)
    finally:
        (OUT/'results.json').write_text(json.dumps({'results':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8');ctx.close()
