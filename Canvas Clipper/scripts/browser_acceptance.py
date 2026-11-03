"""Real Chrome 156 UI, storage, native-canvas and PDF acceptance checks.

Each run owns a fresh isolated browser profile and an in-process HTTP fixture
server. It never attaches to, closes, or changes the user's running Chrome.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json, time, traceback
from playwright.sync_api import sync_playwright
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'playwright'
OUT.mkdir(parents=True, exist_ok=True)
CHROME = r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
results = []

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

def check(name, condition, details=None):
    results.append({'name': name, 'passed': bool(condition), 'details': details})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    if not condition: raise AssertionError(name + ': ' + str(details))

def settle(page):
    page.get_by_role('status').filter(has_text='已儲存').wait_for(timeout=15000)

def native_click(page, locator):
    box=locator.bounding_box()
    assert box, 'Element has no rendered geometry'
    page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)

def fixture_backup():
    cards=[]
    titles=['讀完之後，留下自己的問題','把摘錄變成能回看的筆記','從卡片整理到一份清楚的文件','互動位置與視覺位置一致','原文與個人觀點分開保存']
    paragraphs=[
        '收集資料只是開始。讀到值得思考的段落，先保留來源，再記下自己的疑問。整理時把相關文字放在一起，就能看見原本容易忽略的關係。',
        '一張卡片可以承載一個想法。標題讓重點容易辨認，原文提供查核依據，筆記則記錄我們當時怎麼理解這份材料。',
        '畫布上的位置服務思考，文件中的順序服務閱讀。兩者使用相同的文字內容，讓整理與輸出之間保持連續。',
        '文字選取、輸入和點擊都需要準確的座標。視窗縮放與卡片移動之後，使用者仍應能在看到的位置完成操作。',
        '原文保留擷取時的內容，編輯稿記錄後續整理；個人筆記另行呈現，方便日後回看自己的判斷。',
    ]
    for i in range(20):
        text=paragraphs[i%5]+'\n\n'+paragraphs[(i+1)%5]
        if i == 19: text='\n\n'.join(f'第 {n+1} 段。'+paragraphs[n%5]*4 for n in range(40))+'\n\n長文結尾驗收標記。'
        cards.append({'id':f'fixture-{i}', 'kind':'article' if i%2 else 'selection', 'title':titles[i%5]+(f' · {i+1}' if i>=5 else ''), 'originalText':text, 'workingText':text, 'note':['回頭確認來源中的細節。','把這段與第二份資料並排比較。',''][i%3], 'url':f'https://example.com/source-{i%5+1}', 'capturedAt':'2026-11-01T02:30:00.000Z', 'x':48+(i%3)*344, 'y':48+(i//3)*416})
    return {'format':'canvas-clipper','version':1,'project':{'id':'fixture-project','title':'閱讀材料與想法','updatedAt':'2026-11-01T02:30:00.000Z','cards':cards,'view':{'x':0,'y':0,'zoom':1},'print':{'fontSize':12,'lineHeight':1.6}}}

server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/index.html'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--enable-features=CanvasDrawElement'])
        context=browser.new_context(viewport={'width':1600,'height':1000},device_scale_factor=1)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(url);page.wait_for_load_state('networkidle')
        page.get_by_role('button',name='新增卡片',exact=True).wait_for()
        check('native Canvas mode enabled',page.locator('.board-surface').get_attribute('data-mode')=='native')
        page.get_by_role('button',name='新增卡片',exact=True).click()
        page.get_by_role('textbox',name='新卡片標題').fill('我的第一張摘錄')
        page.get_by_role('textbox',name='新卡片內容').fill('原文第一段。\n\n原文第二段，保留來源。')
        page.get_by_role('textbox',name='新卡片來源網址').fill('https://example.com/research')
        page.get_by_role('button',name='加入卡片板').click()
        settle(page)
        page.wait_for_function('Number(document.querySelector("canvas").dataset.paints)>0')
        check('manual clip rendered inside canvas',page.locator('canvas .clip-card').count()==1)
        # Native mouse/keyboard input, with DOM coordinates checked against pixels.
        inline=page.get_by_role('textbox',name='卡片筆記 1',exact=True)
        native_click(page,inline)
        page.keyboard.press('Control+A');page.keyboard.insert_text('繁體中文筆記，原生互動成功。')
        settle(page)
        page.screenshot(path=str(OUT/'first-card-input-debug.png'))
        detail=page.evaluate('''() => {const cv=document.querySelector('canvas'),card=cv.querySelector('.clip-card'),note=cv.querySelector('textarea');let getter;try{getter=String(cv.getElementTransform(card))}catch(e){getter=String(e)}return {note:note.value,active:document.activeElement?.tagName,transform:card.style.transform,length:cv.getElementTransform.length,getter,paints:cv.dataset.paints,bounds:note.getBoundingClientRect().toJSON()}}''')
        check('native inline textarea receives keyboard input',inline.input_value()=='繁體中文筆記，原生互動成功。',detail)
        # Browser selection works on a live DOM subtree rendered into the canvas.
        excerpt=page.locator('canvas .card-excerpt')
        bounds=excerpt.bounding_box()
        page.mouse.move(bounds['x']+4,bounds['y']+10);page.mouse.down();page.mouse.move(bounds['x']+180,bounds['y']+10,steps=10);page.mouse.up()
        check('native canvas text selection',bool(page.evaluate('getSelection().toString()')))
        # IME composition events should preserve the value throughout rerenders;
        # physical OS IME conversion is a separate manual acceptance item.
        native_click(page,inline);page.keyboard.press('End')
        cdp=context.new_cdp_session(page)
        cdp.send('Input.imeSetComposition',{'text':'組字測試','selectionStart':4,'selectionEnd':4})
        cdp.send('Input.insertText',{'text':'組字測試'})
        settle(page)
        check('Chinese IME composition commits without losing note',inline.input_value().endswith('組字測試'),inline.input_value())
        # Move a card using only its header.
        handle=page.locator('canvas .card-handle');old=handle.bounding_box()
        page.mouse.move(old['x']+130,old['y']+15);page.mouse.down();page.mouse.move(old['x']+230,old['y']+65,steps=12);page.mouse.up();settle(page)
        moved=handle.bounding_box()
        check('drag updates native geometry',abs(moved['x']-old['x']-100)<3 and abs(moved['y']-old['y']-50)<3,{'old':old,'new':moved})
        page.get_by_role('button',name='放大',exact=True).click();settle(page)
        native_click(page,inline);page.keyboard.press('End');page.keyboard.insert_text('縮放後仍可輸入。');settle(page)
        check('native input remains aligned after zoom',inline.input_value().endswith('縮放後仍可輸入。'))
        # Full-text editor and immutable original.
        page.get_by_role('textbox',name='整理文字',exact=True).fill('這是整理後的新段落。\n\n第二段，中文可搜尋。');settle(page)
        page.get_by_role('button',name='擷取原文',exact=True).click()
        check('editing preserves original',page.locator('.original-text').inner_text()=='原文第一段。\n\n原文第二段，保留來源。')
        page.get_by_role('button',name='編輯稿',exact=True).click()
        page.reload();page.wait_for_load_state('networkidle');settle(page)
        check('reload preserves edited text and notes',page.get_by_role('textbox',name='整理文字',exact=True).input_value().startswith('這是整理後') and '縮放後仍可輸入' in page.get_by_role('textbox',name='我的筆記',exact=True).input_value())
        page.get_by_role('button',name='刪除這張卡片',exact=True).click();settle(page)
        check('delete removes card',page.locator('canvas .clip-card').count()==0)
        page.get_by_role('button',name='復原刪除',exact=True).click();settle(page)
        check('undo restores deleted card',page.locator('canvas .clip-card').count()==1)
        with page.expect_download() as dl:
            page.get_by_role('button',name='匯出備份',exact=True).click()
        saved=OUT/'ui-backup.json';dl.value.save_as(saved)
        backup=json.loads(saved.read_text(encoding='utf-8'))
        check('backup includes original and edited versions',backup['project']['cards'][0]['originalText'].startswith('原文第一段') and backup['project']['cards'][0]['workingText'].startswith('這是整理後'))
        # Real UI import, 20 cards and a 10k+ Chinese character article.
        fixture=OUT/'acceptance-fixture.json';fixture.write_text(json.dumps(fixture_backup(),ensure_ascii=False),encoding='utf-8')
        page.locator('input[type=file]').set_input_files(fixture);settle(page)
        page.wait_for_function('document.querySelectorAll("canvas .clip-card").length===20')
        page.locator('.card-list-select').first.click()
        check('20 cards from five sources loaded',page.locator('canvas .clip-card').count()==20)
        page.screenshot(path=str(OUT/'workspace-native-1600.png'))
        # Idle should not continuously redraw after animations settle.
        page.wait_for_timeout(500);before=int(page.locator('canvas').get_attribute('data-paints'))
        page.wait_for_timeout(700);after=int(page.locator('canvas').get_attribute('data-paints'))
        check('idle canvas does not run a perpetual render loop',after-before<3,{'before':before,'after':after})
        # Test deliberately overlapping cards and selecting the front card.
        page.get_by_role('button',name='下移卡片 1',exact=True).click();settle(page)
        check('document order can be changed',page.locator('.card-list-select').first.inner_text().find('把摘錄')>=0)
        page.get_by_role('tab',name='文件檢視').click()
        check('document uses reordered data',page.locator('.document-section h2').first.inner_text().startswith('把摘錄'))
        page.screenshot(path=str(OUT/'document-preview.png'))
        page.pdf(path=str(OUT/'acceptance-searchable.pdf'),prefer_css_page_size=True,print_background=True)
        pdf=pymupdf.open(OUT/'acceptance-searchable.pdf')
        pdf_text=''.join(p.get_text() for p in pdf)
        check('PDF has searchable Chinese text and final long-article marker','長文結尾驗收標記' in pdf_text and '收集資料只是開始' in pdf_text,{'pages':len(pdf),'textLength':len(pdf_text)})
        check('PDF uses A4 pages',all(abs(p.rect.width-595.28)<2 and abs(p.rect.height-841.89)<2 for p in pdf))
        clipped=[]
        for n,pdf_page in enumerate(pdf):
            for block in pdf_page.get_text('blocks'):
                if block[0]<40 or block[2]>pdf_page.rect.width-40 or block[1]<40 or block[3]>pdf_page.rect.height-40: clipped.append([n+1,list(block[:4])])
        check('PDF text remains inside print margins',not clipped,clipped[:5])
        pdf.close()
        page.get_by_role('tab',name='卡片板').click();page.get_by_label('HTML 模式',exact=True).check()
        check('DOM compatibility mode selectable',page.locator('.board-surface').get_attribute('data-mode')=='dom')
        page.screenshot(path=str(OUT/'workspace-dom.png'))
        # Malformed file must leave the current project untouched.
        bad=OUT/'invalid-backup.json';bad.write_text('{"format":"canvas-clipper","version":99}',encoding='utf-8')
        page.locator('input[type=file]').set_input_files(bad)
        page.get_by_role('alert').wait_for()
        check('invalid import preserves current project',page.locator('.clip-card').count()==20)
        page.get_by_role('button',name='關閉提示').click()
        page.get_by_label('HTML 模式',exact=True).uncheck()
        # Screenshot at Windows 150% display scale in another fresh context.
        high=browser.new_context(viewport={'width':1440,'height':960},device_scale_factor=1.5)
        high_page=high.new_page();high_page.goto(url);high_page.wait_for_load_state('networkidle')
        high_page.locator('input[type=file]').set_input_files(fixture)
        high_page.wait_for_function('document.querySelectorAll("canvas .clip-card").length===20')
        high_note=high_page.get_by_role('textbox',name='卡片筆記 1',exact=True)
        native_click(high_page,high_note);high_page.keyboard.press('Control+A');high_page.keyboard.insert_text('150% 縮放驗收');settle(high_page)
        check('native input at 150 percent device scale',high_note.input_value()=='150% 縮放驗收')
        high_page.screenshot(path=str(OUT/'workspace-native-150-percent.png'))
        high.close()
        page.set_viewport_size({'width':600,'height':900});page.screenshot(path=str(OUT/'workspace-narrow.png'),full_page=True)
        check('narrow viewport does not overflow horizontally',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check('no unhandled browser errors',not errors,errors)
        context.close();browser.close()
        # API disabled: fresh Chrome has to present a usable DOM workspace.
        fallback=p.chromium.launch(executable_path=CHROME,headless=True,args=['--disable-features=CanvasDrawElement'])
        fallback_page=fallback.new_page();fallback_page.goto(url);fallback_page.wait_for_load_state('networkidle')
        check('browser without API falls back to DOM',fallback_page.locator('.board-surface').get_attribute('data-mode')=='dom')
        fallback.close()
except Exception:
    results.append({'name':'unexpected_failure','passed':False,'details':traceback.format_exc()})
    raise
finally:
    server.shutdown();server.server_close()
    (OUT/'browser-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
