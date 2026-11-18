"""Exercise the approved recovery, backup, search and onboarding in the shipped UI."""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

from browser_support import chrome_launch_options, open_backup_dialog, restore_project, software_args, synthetic_png, wait_for_book

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'v06'
RESULTS = []


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def serve():
    handler = partial(Quiet, directory=str(ROOT / 'dist'))
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()


def check(mode, name, value, detail=None):
    RESULTS.append(dict(mode=mode, name=name, passed=bool(value), detail=detail))
    print(('PASS' if value else 'FAIL'), mode, name, flush=True)
    if not value:
        raise AssertionError(f'{mode}: {name} ({detail})')


def projects(page):
    return page.evaluate("""async () => {
      const db = await new Promise((resolve,reject) => {
        const req=indexedDB.open('canvas-clipper');
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
      const rows = await new Promise(resolve => {
        const req=db.transaction('projects').objectStore('projects').getAll();
        req.onsuccess=()=>resolve(req.result);
      });
      db.close();
      return rows;
    }""")


def exercise(page, base, mode):
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    if mode == 'html':
        page.add_init_script("Object.defineProperty(CanvasRenderingContext2D.prototype,'drawElementImage',{value:undefined})")
    page.goto(base, wait_until='networkidle')
    expect = partial(check, mode)
    button = lambda label: page.get_by_role('button', name=label, exact=True)
    dialog = page.locator('dialog[open]').last
    board_mode = page.locator('.board-surface').get_attribute('data-mode')
    expect('renderer', board_mode == ('native' if mode == 'native' else 'dom'), board_mode)
    for action, heading in [('收集整篇 保留文章、來源與圖文', '收集整篇文章'),
                            ('摘錄一段 留下網頁上選取的文字', '摘錄一段文字')]:
        button(action).click()
        dialog.get_by_role('heading', name=heading, exact=True).wait_for()
        button('使用合成示例').click()
        text = dialog.get_by_label('新卡片內容').input_value()
        expect(heading + ' starts a first material', bool(text))
        page.keyboard.press('Escape')
    button('新增筆記 從自己的觀點開始').click()
    dialog.get_by_label('新卡片內容').fill('可以找回的第一份筆記')
    dialog.get_by_role('button', name='加入卡片板', exact=False).click()
    page.locator('.clip-card').first.wait_for()
    page.locator('.save-state.saved').wait_for()
    expect('manual note really saved', any(c['workingText']=='可以找回的第一份筆記' for p in projects(page) for c in p['cards']))

    fixture = json.loads((ROOT/'tests'/'fixtures'/'acceptance-fixture.json').read_text(encoding='utf-8'))
    project = fixture['project']
    project['cards'] = project['cards'][:2]
    first, second = project['cards']
    first['title'] = second['title'] = '同名的研究材料'
    group = {'id':'fixture-topic','title':'查證材料','color':'#c4decf','x':24,'y':24,'width':440,'height':450}
    project['groups'] = [group]
    first['groupId'], second['groupId'] = group['id'], None
    second['note'] = '請核對研究樣本的來源。'
    first['workingText'] = ('材料保留來源與筆記以便交叉核對。' * 32 + '\n\n') * 7 + '回到原來這段，核對研究樣本。' * 45
    first['editedDoc'] = first['originalDoc'] = {'type':'doc','content':[
        {'type':'paragraph','content':[{'type':'text','text':value}]} for value in first['workingText'].split('\n\n')
    ]}
    project['readingProgress'] = {'cardId':first['id'],'nodePath':[7,0],'offset':36}
    restore_project(page, {'name':'研究示例.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
    page.locator('.clip-card').last.wait_for()
    current_id = page.url.split('#project=')[1]
    current = lambda: next(row for row in projects(page) if row['id']==current_id)
    saved = current()['readingProgress']
    expect('import retains reading position and text', saved['nodePath']==[7,0] and saved['offset']==36
           and current()['cards'][0]['workingText']==first['workingText'])

    page.locator('.card-resize').first.press('Enter')
    page.keyboard.press('Control+k')
    expect('size dialog blocks a second dialog', page.locator('dialog[open]').count()==1
           and '調整卡片尺寸' in dialog.inner_text())
    page.keyboard.press('Escape')
    trigger = page.locator('.search-launch')
    trigger.click()
    field = dialog.get_by_role('combobox')
    field.fill('核對研究樣本')
    options = dialog.get_by_role('option')
    items = options.all_text_contents()
    expect('same title results include the topic and matching snippet',
           len(items)==2 and any(group['title'] in item for item in items)
           and any('未分組' in item and '請核對研究樣本的來源' in item for item in items), items)
    page.keyboard.press('ArrowDown')
    expect('arrow navigation moves a single active option', options.nth(1).get_attribute('aria-selected')=='true')
    field.evaluate("""field=>{field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));}""")
    expect('IME composition Enter leaves dialog open', dialog.count()==1)
    field.evaluate("field=>field.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))")
    field.fill('沒有相符結果的句子')
    expect('empty search announces no results', options.count()==0 and '沒有符合' in dialog.get_by_role('status').inner_text())
    field.fill('核對研究樣本')
    page.keyboard.press('Tab')
    expect('Tab skips results as a group', not page.evaluate("!!document.activeElement.closest('[role=option]')"))
    page.keyboard.press('Escape')
    page.wait_for_function("document.activeElement?.matches('.search-launch')")
    expect('Escape restores search trigger focus', trigger.evaluate('el=>el===document.activeElement'))
    trigger.click()
    field.fill('核對研究樣本')
    page.keyboard.press('Enter')
    page.locator('.material-search').wait_for(state='hidden')
    expect('Enter locates a card', page.locator('.clip-card.selected').count()==1)

    open_backup_dialog(page)
    before = len(projects(page))
    picker = dialog.locator('.backup-import input[type=file]')
    for filename, data in [('壞檔.json', b'not json'), ('壞檔.json', b'not json'), ('壞檔.zip', b'PK\x03\x04invalid')]:
        picker.set_input_files({'name':filename,'mimeType':'application/octet-stream','buffer':data})
        dialog.locator('.import-result.error').wait_for()
        expect('invalid import stays open and writes no project: '+filename,
               '無法' in dialog.get_by_role('alert').inner_text() and len(projects(page))==before)
    with page.expect_download() as event:
        button('下載目前專案 ZIP').click()
    payload = event.value.path().read_bytes()
    expect('backup download produces a ZIP', payload.startswith(b'PK'))
    dialog.locator('.backup-drop').evaluate("""(el, bytes) => {
      const transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)],'合成備份.zip',{type:'application/zip'}));
      for (const type of ['dragover','drop','drop']) el.dispatchEvent(new DragEvent(type,{dataTransfer:transfer,bubbles:true,cancelable:true}));
    }""", list(payload))
    button('開啟匯入專案').wait_for()
    expect('duplicate drop imports once and preserves active project',
           len(projects(page))==before+1 and page.url.endswith(current_id))
    button('開啟匯入專案').click()
    dialog.wait_for(state='hidden')
    expect('explicitly open imported project', not page.url.endswith(current_id))
    page.goto(base + '/#project=' + current_id, wait_until='networkidle')

    page.locator('input[accept^="image/png"]').set_input_files({
        'name':'解碼測試.png','mimeType':'image/png','buffer':synthetic_png()
    })
    page.locator('.clip-card').filter(has_text='解碼測試.png').wait_for(state='attached')
    page.locator('.save-state.saved').wait_for()
    page.evaluate("""() => {
      const decode = HTMLImageElement.prototype.decode;
      window.restoreBookDecode = () => {HTMLImageElement.prototype.decode = decode;};
      HTMLImageElement.prototype.decode = function () {
        return this.closest('.book-measure') ? Promise.reject(new Error('Fixture decode interruption')) : decode.call(this);
      };
    }""")
    page.get_by_role('button',name='書本閱讀',exact=False).first.click()
    dialog.get_by_role('heading',name='排頁遇到問題').wait_for()
    expect('real decode rejection has an in-place recovery', '有圖片無法解碼' in dialog.get_by_role('alert').inner_text())
    page.screenshot(path=str(OUT / (mode+'-book-recovery.png')))
    button('重試排頁').click()
    dialog.get_by_role('heading',name='排頁遇到問題').wait_for()
    expect('repeat failure preserves last saved anchor', current()['readingProgress']==saved)
    button('改用一般閱讀').click()
    scroll = page.locator('.reading-scroll[data-resumed=true]')
    scroll.wait_for()
    expect('flat reader makes the original segment visible and focuses it', scroll.evaluate("""el=>{
      const rect=el.querySelector('.rich-content').children[7].getBoundingClientRect(),view=el.getBoundingClientRect();
      return el.scrollTop>0 && rect.bottom>view.top && rect.top<view.bottom && document.activeElement===el;
    }"""))
    button('關閉閱讀').click()
    page.get_by_role('button',name='書本閱讀',exact=False).first.click()
    dialog.get_by_role('heading',name='排頁遇到問題').wait_for()
    page.evaluate('() => { window.restoreBookDecode(); }')
    button('重試排頁').click()
    wait_for_book(page)
    expect('successful retry uses the same saved anchor', current()['readingProgress']==saved)
    page.wait_for_function("!document.querySelector('.book-renderer').textContent.includes('準備')")
    renderer = page.locator('.book-renderer').inner_text()
    output = page.get_by_label('閱讀頁碼')
    before_turn = output.inner_text()
    button('下一頁').click()
    page.wait_for_function("before=>document.querySelector('[aria-label=閱讀頁碼]').textContent!==before", arg=before_turn)
    expect('flip works after retry', 'WebGL' in renderer if mode=='native' else 'HTML 平面' in renderer,
           {'renderer':renderer,'before':before_turn,'after':output.inner_text()})
    button('關閉書本閱讀').click()

    page.set_viewport_size({'width':390,'height':700})
    button('展開左側欄').click()
    button('展開右側欄').click()
    expect('390px drawers remain exclusive without overflow', page.evaluate("""() =>
      document.documentElement.scrollWidth<=innerWidth &&
      document.querySelector('.app-v3').dataset.left==='closed' &&
      document.querySelector('.app-v3').dataset.right==='open'
    """))
    expect('no unhandled browser exceptions', not errors, errors)


OUT.mkdir(parents=True, exist_ok=True)
with serve() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True,**chrome_launch_options(),
                                        args=['--enable-features=CanvasDrawElement']+software_args())
    try:
        for mode in ('native','html'):
            with browser.new_context(viewport={'width':1280,'height':670},device_scale_factor=1.5 if mode=='native' else 1,
                                     reduced_motion='reduce' if mode=='html' else 'no-preference') as context:
                exercise(context.new_page(),base,mode)
    finally:
        (OUT/'workflow-acceptance.json').write_text(json.dumps({'chrome':browser.version,'checks':RESULTS},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
