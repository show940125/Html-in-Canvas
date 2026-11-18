"""Canvas Slides MV3 workshop flows in a disposable browser profile."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import zipfile
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "workbench"
OUT.mkdir(parents=True, exist_ok=True)
results = []
errors = []


def record(name):
    print("PASS " + name, flush=True)
    results.append({"name": name, "passed": True})


def stage(page):
    page.frame_locator("iframe").first.locator("#deck").wait_for(state="attached")
    return next(frame for frame in page.frames if "stage.html" in frame.url)


def edit_title(page, title):
    page.get_by_label("簡報名稱", exact=True).fill(title)
    expect(page.get_by_text("已存到此瀏覽器", exact=True)).to_be_visible()


def play(page, first=False):
    if first:
        page.get_by_role("button", name="播放選項").click()
    with page.expect_popup() as popup:
        page.get_by_role("button", name="從首頁播放" if first else "播放", exact=True).click()
    viewer = popup.value
    viewer.on("pageerror", lambda error: errors.append(str(error)))
    viewer.get_by_role("button", name="P 講者模式").wait_for()
    return viewer


def notes_input(page):
    toggle = page.get_by_role("button", name="講者備註", exact=False)
    if toggle.get_attribute("aria-expanded") == "false":
        toggle.click()
    return page.get_by_role("textbox", name="講者提詞")


with sync_playwright() as p, TemporaryDirectory(prefix="canvas-slides-ux-") as profile:
    chrome = Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
    options = {"executable_path": str(chrome)} if chrome.is_file() else {"channel": "chromium"}
    context = p.chromium.launch_persistent_context(
        profile, **options, headless=True, accept_downloads=True,
        ignore_default_args=["--disable-extensions"],
        args=["--enable-unsafe-extension-debugging", "--enable-blink-features=CanvasDrawElement"],
        viewport={"width": 1440, "height": 900}, reduced_motion="reduce", device_scale_factor=1.5,
    )
    try:
        eid = context.browser.new_browser_cdp_session().send("Extensions.loadUnpacked", {"path": str(ROOT / "dist")})["id"]
        editor_url = f"chrome-extension://{eid}/index.html"
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(editor_url)
        expect(page.get_by_role("heading", name="開始一份簡報")).to_be_visible()
        expect(page.get_by_role("button", name="匯入簡報", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="新建簡報", exact=True)).to_be_visible()
        page.screenshot(path=OUT / "welcome.png")
        page.get_by_role("button", name="開啟範例", exact=True).click()
        expect(page.locator(".slide-thumb")).to_have_count(5)
        canvas = stage(page)
        canvas.wait_for_selector('[data-slide-id="vitamin-c-cover"]', state="attached")
        expect(page.locator(".slide-thumb").first).to_be_focused()
        expect(page.get_by_text("已存到此瀏覽器", exact=True)).to_be_visible()
        expect(page.locator(".statusbar")).to_contain_text("原生畫布")
        record("first launch offers three paths and opens a five-slide editable local example")
        expect(page.locator(".slide-thumb img")).to_have_count(5)
        dock = page.get_by_role("navigation", name="編輯工具")
        stage_box = page.locator(".editor iframe").bounding_box()
        assert dock.bounding_box()["y"] >= stage_box["y"] + stage_box["height"]
        dock.get_by_role("button", name="文字", exact=True).focus()
        page.keyboard.press("ArrowRight")
        expect(dock.get_by_role("button", name="圖片", exact=True)).to_be_focused()
        shape = dock.get_by_role("button", name="形狀", exact=True)
        shape.press("ArrowUp")
        expect(page.get_by_role("button", name="新增矩形")).to_be_focused()
        page.keyboard.press("ArrowDown")
        expect(page.get_by_role("button", name="新增圓形")).to_be_focused()
        page.keyboard.press("Escape")
        expect(shape).to_be_focused()
        expect(shape).to_have_attribute("aria-expanded", "false")
        record("bottom dock reserves canvas space and its flyout supports keyboard navigation")

        page.locator(".slide-thumb").nth(1).click()
        canvas.wait_for_selector('[data-slide-id="collagen-and-repair"]', state="attached")
        content = canvas.locator(".feature-title")
        outer = page.locator(".editor iframe").bounding_box()
        inner = content.evaluate("(el)=>{const r=el.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}")
        ratio = outer["width"] / canvas.evaluate("innerWidth")
        page.mouse.click(outer["x"] + inner[0] * ratio, outer["y"] + inner[1] * ratio)
        expect(page.locator(".object-heading")).to_contain_text("修復的底氣")
        page.screenshot(path=OUT / "editor.png")

        for label, name in [("匯入", "匯入簡報"), ("匯出", "匯出簡報"), ("總覽", "投影片總覽"), ("新增投影片", "新增投影片"), ("操作說明", "操作與快捷鍵"), ("專案", "專案")]:
            button = page.get_by_role("button", name=label, exact=True)
            button.click()
            dialog = page.get_by_role("dialog", name=name)
            expect(dialog.get_by_role("heading", name=name, exact=True)).to_be_focused()
            for _ in range(8):
                page.keyboard.press("Tab")
                assert dialog.evaluate("(el)=>el.contains(document.activeElement)"), (label, page.evaluate("document.activeElement.outerHTML.slice(0,260)"))
            page.keyboard.press("Shift+Tab")
            assert dialog.evaluate("(el)=>el.contains(document.activeElement)"), (label, page.evaluate("document.activeElement.outerHTML.slice(0,260)"))
            page.keyboard.press("Escape")
            expect(dialog).to_have_count(0)
            expect(button).to_be_focused()
        record("six dialogs trap keyboard focus and restore it after Escape")

        example = ROOT / "examples" / "vitamin-c-style-a"
        page.get_by_role("button", name="匯入", exact=True).click()
        import_dialog = page.get_by_role("dialog", name="匯入簡報")
        page.locator('input[type=file]').first.set_input_files({
            "name": "index.html", "mimeType": "text/html",
            "buffer": b'<title>Supplement test</title><section class="slide"><h1>Photo</h1><img src="images/vitamin-c-fruits.png"></section>',
        })
        expect(import_dialog.get_by_text("素材未納入", exact=False)).to_be_visible()
        import_dialog.get_by_text("進階設定", exact=True).click()
        selector = import_dialog.get_by_label("頁面容器")
        selector.fill(".nothing-matches")
        import_dialog.get_by_role("button", name="重新檢查內容").click()
        expect(import_dialog.get_by_role("alert")).to_contain_text("找不到符合")
        assert "Photo" in import_dialog.get_by_label("匯入 HTML 原始碼").input_value()
        selector.fill(".slide")
        import_dialog.get_by_role("button", name="重新檢查內容").click()
        page.locator("input[webkitdirectory]").last.set_input_files(example / "images")
        expect(import_dialog.get_by_text("1 張已納入")).to_be_visible()
        expect(import_dialog.get_by_text("素材未納入", exact=False)).to_have_count(0)
        import_dialog.get_by_role("button", name="匯入並開始編輯").click()
        expect(page.locator(".slide-thumb").first).to_be_focused()
        photo = canvas.locator(".slide img")
        photo.wait_for(state="attached")
        assert photo.evaluate("(el)=>el.src.startsWith('data:image/png;base64,')&&el.naturalWidth>0")
        record("asset-only folder fills a missing image after an inline selector error")

        page.get_by_role("button", name="匯入", exact=True).click()
        import_dialog.get_by_role("button", name="試用維他命 C ZIP").click()
        expect(import_dialog.get_by_text("2 張已納入")).to_be_visible()
        assert not import_dialog.get_by_label("匯入 HTML 原始碼").is_visible()
        page.screenshot(path=OUT / "import.png")
        import_dialog.get_by_role("button", name="匯入並開始編輯").click()
        expect(page.locator(".slide-thumb")).to_have_count(5)
        page.locator(".slide-thumb").nth(2).click()
        canvas.wait_for_selector('[data-slide-id="four-benefits"]', state="attached")
        viewer = play(page)
        expect(viewer.locator("footer>span")).to_have_text("3 / 5")
        stage(viewer).wait_for_function("()=>window.__currentSlideIndex===2")
        record("playback opens at the current visible slide")
        viewer.get_by_role("button", name="P 講者模式").click()
        presenter_note = viewer.get_by_role("textbox", name="講者備註")
        expect(presenter_note).to_be_visible()
        edit_title(page, "保留編輯器的新標題")
        presenter_note.fill("講者分頁的新提詞")
        expect(viewer.get_by_text("提詞已保存")).to_be_visible()
        edit_title(page, "兩份修改都保留")
        expect(notes_input(page)).to_have_value("講者分頁的新提詞")
        viewer.close()
        record("both tabs keep independently saved titles and presenter notes")

        stale = play(page)
        stale.get_by_role("button", name="P 講者模式").click()
        stale_note = stale.get_by_role("textbox", name="講者備註")
        expect(stale_note).to_have_value("講者分頁的新提詞")
        notes_input(page).fill("編輯器的第二版提詞")
        expect(page.get_by_text("已存到此瀏覽器", exact=True)).to_be_visible()
        stale_note.fill("講者的第二版提詞")
        expect(stale.get_by_role("alert")).to_contain_text("另一個分頁")
        expect(stale_note).to_have_value("講者的第二版提詞")
        stale.get_by_text("查看已保存的提詞").click()
        expect(stale.get_by_text("編輯器的第二版提詞", exact=True)).to_be_visible()
        stale.get_by_role("button", name="保留這個分頁的提詞").click()
        expect(stale.get_by_text("提詞已保存")).to_be_visible()
        stale.close()
        record("competing edits retain both note versions until the explicit choice")

        # The selected slide is now hidden. Playback should start at the next visible slide.
        page.get_by_role("button", name="投影片動作", exact=False).click()
        page.get_by_role("button", name="播放及輸出時隱藏").click()
        expect(page.locator(".slide-thumb").nth(2)).to_have_class("slide-thumb active hidden-slide")
        viewer = play(page)
        stage(viewer).wait_for_function("()=>document.querySelectorAll('#deck>.slide')[window.__currentSlideIndex]?.dataset.slideId==='evidence-and-expectations'")
        viewer.close()
        viewer = play(page, first=True)
        expect(viewer.locator("footer>span")).to_have_text("1 / 4")
        viewer.close()
        record("hidden-page playback skips forward and offers an explicit start-from-first option")

        page.set_viewport_size({"width": 820, "height": 820})
        expect(page.get_by_role("button", name="投影片欄")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth===innerWidth")
        page.get_by_role("button", name="投影片欄").click()
        expect(page.locator("#slide-rail")).to_be_visible()
        page.get_by_role("button", name="屬性與圖層").click()
        expect(page.locator("#slide-rail")).to_be_hidden()
        expect(page.locator("#slide-inspector")).to_be_visible()
        page.screenshot(path=OUT / "compact.png")
        page.get_by_role("button", name="關閉屬性與圖層").click()
        expect(page.locator("#slide-inspector")).to_be_hidden()
        expect(page.get_by_role("button", name="屬性與圖層")).to_be_focused()
        page.get_by_role("button", name="投影片欄").click()
        page.keyboard.press("Escape")
        expect(page.get_by_role("button", name="投影片欄")).to_be_focused()
        zoom = page.locator(".statusbar .action-menu>button")
        assert "適合視窗" in zoom.inner_text()
        ratio = page.locator(".editor iframe").evaluate("el=>Math.round(el.getBoundingClientRect().width/el.offsetWidth*100)")
        assert f"{ratio}%" in zoom.inner_text()
        zoom.click()
        page.get_by_role("button", name="100%", exact=True).click()
        expect(zoom).to_have_text("100%")
        record("820px viewport has a single drawer and a truthful fit/100% zoom control")

        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth===innerWidth")
        for item in (dock, page.locator(".header-actions")):
            bounds = item.bounding_box()
            assert 0 <= bounds["x"] <= bounds["x"] + bounds["width"] <= 391
        assert dock.locator(".dock-plate").evaluate("el=>getComputedStyle(el).transitionDuration") == "0s"
        page.screenshot(path=OUT / "mobile.png")
        record("390px exposes editor tools; reduced motion disables the dock transition")

        page.set_viewport_size({"width": 1440, "height": 900})
        page.get_by_role("button", name="專注畫布", exact=True).click()
        expect(page.locator("#slide-rail")).to_be_hidden()
        page.get_by_role("button", name="恢復面板", exact=True).click()
        expect(page.locator("#slide-rail")).to_be_visible()
        record("focus canvas restores both pinned panels")
        page.get_by_role("button", name="講者備註", exact=False).click()
        page.locator(".slide-thumb").nth(1).click()
        canvas.wait_for_selector('[data-slide-id="collagen-and-repair"]', state="attached")
        page.locator(".slide-thumb").nth(1).press("Alt+ArrowDown")
        expect(page.locator(".slide-thumb").nth(2)).to_have_attribute("aria-current", "page")
        expect(page.locator(".slide-thumb").nth(2)).to_contain_text("修復的底氣")
        record("keyboard reordering preserves slide identity")

        page.get_by_role("button", name="匯出", exact=True).click()
        exporter = page.get_by_role("dialog", name="匯出簡報")
        expect(exporter.get_by_text("全部 5 頁，含隱藏頁", exact=False)).to_be_visible()
        with page.expect_download() as info:
            exporter.get_by_role("button", name="可再編輯專案 ZIP", exact=False).click()
        zip_path = OUT / "workbench-project.zip"
        info.value.save_as(zip_path)
        expect(exporter.get_by_role("status")).to_contain_text("檔案已交給瀏覽器下載")
        page.screenshot(path=OUT / "export.png")
        with zipfile.ZipFile(zip_path) as archive:
            backup = json.loads(archive.read("project.json"))
        assert backup["title"] == "兩份修改都保留"
        assert len(backup["slides"]) == 5
        assert next(item for item in backup["slides"] if item["id"] == "four-benefits")["note"]["talk"] == ["講者的第二版提詞"]
        record("export reports scope and downloads an editable backup with merged contents")

        page.get_by_role("button", name="關閉對話框").click()
        # Simulate an IndexedDB write failure in this disposable editor, then restore it.
        page.evaluate("""() => {
            window.originalPut = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = () => { throw new Error('工作台測試：儲存空間暫時不足'); };
        }""")
        page.set_viewport_size({"width": 390, "height": 844})
        page.get_by_label("簡報名稱").fill("保留未保存的修改")
        save_alert = page.locator(".studio-save[role=alert]")
        expect(save_alert).to_contain_text("儲存空間暫時不足")
        recovery = save_alert.locator(".studio-save-issue").bounding_box()
        assert 0 <= recovery["x"] <= recovery["x"] + recovery["width"] <= 390
        expect(page.get_by_label("簡報名稱")).to_have_value("保留未保存的修改")
        save_alert.get_by_role("button", name="匯出備份").click()
        with page.expect_download() as download:
            exporter.get_by_role("button", name="可再編輯專案 ZIP", exact=False).click()
        with zipfile.ZipFile(download.value.path()) as archive:
            assert json.loads(archive.read("project.json"))["title"] == "保留未保存的修改"
        page.get_by_role("button", name="關閉對話框").click()
        page.evaluate("()=>{IDBObjectStore.prototype.put = window.originalPut}")
        save_alert.get_by_role("button", name="重試", exact=True).click()
        expect(page.get_by_text("已存到此瀏覽器", exact=True)).to_be_visible()
        page.set_viewport_size({"width": 1440, "height": 900})
        record("compact storage recovery controls remain visible and preserve the draft")

        page.get_by_role("button", name="匯出", exact=True).click()
        page.evaluate("()=>{window.originalOpen=window.open; window.open=()=>null}")
        exporter.get_by_role("button", name="列印／另存 PDF", exact=False).click()
        alert = exporter.get_by_role("alert")
        expect(alert).to_contain_text("瀏覽器封鎖了新視窗")
        page.evaluate("()=>{window.open=window.originalOpen}")
        context.add_init_script("window.print=()=>{document.documentElement.dataset.printCalled='true'}")
        with page.expect_popup() as popup:
            alert.get_by_role("button", name="重試", exact=True).click()
        popup.value.wait_for_function("()=>document.documentElement.dataset.printCalled==='true'")
        expect(exporter.get_by_role("status")).to_contain_text("列印畫面已就緒")
        popup.value.close()
        record("blocked print is reported inline and retries from the same dialog")
        assert not errors, errors
        record("no uncaught browser errors")
    finally:
        (OUT / "results.json").write_text(json.dumps({"results": results, "errors": errors}, ensure_ascii=False, indent=2), encoding="utf-8")
        context.close()
