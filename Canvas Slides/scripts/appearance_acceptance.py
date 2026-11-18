"""Verify appearance settings in the actual Chrome MV3 extension."""
import re
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "appearance"
OUT.mkdir(parents=True, exist_ok=True)
CHROME = Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
errors = []


def contrast(fg, bg):
    def luminance(value):
        channels = [int(channel) / 255 for channel in re.findall(r"\d+", value)[:3]]
        linear = [channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4
                  for channel in channels]
        return sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))

    light, dark = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (light + .05) / (dark + .05)


with sync_playwright() as p, TemporaryDirectory(prefix="canvas-slides-appearance-") as profile:
    browser = {"executable_path": str(CHROME)} if CHROME.is_file() else {"channel": "chromium"}
    context = p.chromium.launch_persistent_context(
        profile, **browser, headless=True, viewport={"width": 1440, "height": 900},
        accept_downloads=True, ignore_default_args=["--disable-extensions"],
        args=["--enable-unsafe-extension-debugging", "--enable-blink-features=CanvasDrawElement"],
    )
    try:
        context.on("page", lambda tab: tab.on("pageerror", lambda error: errors.append(str(error))))
        eid = context.browser.new_browser_cdp_session().send("Extensions.loadUnpacked", {"path": str(ROOT / "dist")})["id"]
        page = context.new_page()
        page.goto(f"chrome-extension://{eid}/index.html")
        trigger = page.get_by_role("button", name="介面外觀", exact=True)
        panel = page.get_by_role("group", name="介面外觀", exact=True)

        trigger.press("Enter")
        expect(panel.get_by_role("radio", name="夜間", exact=True)).to_be_checked()
        expect(panel.get_by_role("radio", name="夜間", exact=True)).to_be_focused()
        expect(panel.get_by_role("radio", name="琥珀", exact=True)).to_be_checked()
        page.keyboard.press("ArrowLeft")
        expect(panel.get_by_role("radio", name="日間", exact=True)).to_be_checked()
        expect(page.locator("html")).to_have_attribute("data-studio-mode", "day")
        page.keyboard.press("Escape")
        expect(panel).to_be_hidden()
        expect(trigger).to_be_focused()
        print("PASS default appearance, keyboard selection and Escape focus return", flush=True)

        page.get_by_role("button", name="開啟範例", exact=True).click()
        frame_locator = page.frame_locator("iframe[title='投影片編輯舞台']")
        frame_locator.locator('[data-slide-id="vitamin-c-cover"]').wait_for(state="attached")
        stage = next(frame for frame in page.frames if "stage.html" in frame.url)
        stage.wait_for_function("()=>Number(document.querySelector('#cs-canvas')?.dataset.paints)>0")
        paint = "()=>Array.from(document.querySelector('#cs-canvas').getContext('2d').getImageData(16,16,1,1).data)"
        pixels = stage.evaluate(paint)
        assert pixels[1] > pixels[0] + 6 and pixels[1] > pixels[2] + 4

        trigger.click()
        for mode in ("日間", "夜間"):
            panel.get_by_text(mode, exact=True).click()
            expect(page.locator("html")).to_have_attribute("data-studio-mode", "day" if mode == "日間" else "night")
            accents = []
            export = page.get_by_role("button", name="匯出", exact=True)
            for accent, value, day, night in (
                ("琥珀", "amber", "rgb(145, 80, 13)", "rgb(242, 189, 115)"),
                ("靛藍", "indigo", "rgb(65, 86, 166)", "rgb(164, 185, 255)"),
                ("森林", "forest", "rgb(39, 102, 73)", "rgb(138, 216, 175)"),
                ("莓紫", "berry", "rgb(139, 66, 122)", "rgb(228, 169, 212)"),
            ):
                panel.get_by_text(accent, exact=True).click()
                expect(page.locator("html")).to_have_attribute("data-studio-accent", value)
                expect(export).to_have_css("background-color", day if mode == "日間" else night)
                colors = export.evaluate(
                    "el=>{const css=getComputedStyle(el);return [css.color,css.backgroundColor]}"
                )
                assert contrast(*colors) >= 4.5, (mode, accent, colors)
                accents.append(colors[1])
            assert len(set(accents)) == 4, (mode, accents)
        panel.get_by_text("日間", exact=True).click()
        panel.get_by_text("靛藍", exact=True).click()
        assert stage.evaluate(paint) == pixels
        expect(page.get_by_role("heading", name="投影片主題")).to_be_visible()
        page.screenshot(path=OUT / "day.png", animations="disabled")
        panel.get_by_role("button", name="關閉外觀").click()
        expect(panel).to_be_hidden()
        expect(trigger).to_be_focused()
        print("PASS all eight palettes render, primary text contrast is at least 4.5:1, slide pixels stay intact", flush=True)
        page.get_by_role("button", name="匯出", exact=True).click()
        with page.expect_download() as info:
            page.get_by_role("button", name="獨立 HTML 簡報", exact=False).click()
        html = info.value.path().read_text(encoding="utf-8")
        assert 'data-theme="forest-ink"' in html and "canvas-slides-appearance" not in html
        page.keyboard.press("Escape")
        print("PASS standalone HTML retains the deck theme, independent of editor appearance", flush=True)

        expect(page.get_by_role("dialog", name="匯出簡報")).to_be_hidden()
        page.reload()
        expect(page.locator("html")).to_have_attribute("data-studio-accent", "indigo")
        expect(page.locator("html")).to_have_attribute("data-studio-mode", "day")
        with page.expect_popup() as popup:
            page.get_by_role("button", name="播放", exact=True).click()
        viewer = popup.value
        expect(viewer.locator("html")).to_have_attribute("data-studio-accent", "indigo")
        expect(viewer.locator("html")).to_have_attribute("data-studio-mode", "day")
        viewer.get_by_role("button", name="P 講者模式").click()
        expect(viewer.get_by_role("textbox", name="講者備註")).to_be_visible()
        viewer.get_by_role("button", name="介面外觀").click()
        viewer.get_by_role("radio", name="日間").press("ArrowRight")
        expect(page.locator("html")).to_have_attribute("data-studio-mode", "night")
        viewer.close()
        print("PASS reload persistence, presenter styling and live updates across tabs", flush=True)

        page.set_viewport_size({"width": 390, "height": 844})
        page.emulate_media(reduced_motion="reduce")
        trigger.click()
        box = panel.bounding_box()
        assert 0 <= box["x"] <= box["x"] + box["width"] <= 390
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
        assert panel.evaluate("el=>getComputedStyle(el).animationName") == "none"
        page.screenshot(path=OUT / "compact.png")
        page.get_by_label("簡報名稱", exact=True).click()
        expect(panel).to_be_hidden()
        print("PASS compact popover, light dismiss and reduced motion", flush=True)

        page.set_viewport_size({"width": 1440, "height": 900})
        trigger.click()
        panel.get_by_text("琥珀", exact=True).click()
        page.keyboard.press("Escape")
        page.locator(".slide-thumb").nth(1).click()
        expect(frame_locator.locator(".feature-title")).to_be_attached()
        stage = next(frame for frame in page.frames if "stage.html" in frame.url)
        stage.wait_for_function("()=>Number(document.querySelector('#cs-canvas')?.dataset.paints)>0")
        page.screenshot(path=OUT / "night.png")
        assert not errors, errors
    finally:
        context.close()
