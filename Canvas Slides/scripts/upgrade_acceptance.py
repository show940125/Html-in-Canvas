"""Verify an unpacked upgrade in a disposable Chrome profile and install path."""
import argparse
import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright


def run(baseline: Path, candidate: Path):
    before = json.loads((baseline / "manifest.json").read_text(encoding="utf-8"))
    after = json.loads((candidate / "manifest.json").read_text(encoding="utf-8"))
    assert before["key"] == after["key"], "An extension key change would fork storage."
    assert before["version"] != after["version"], "Use two different builds."

    chrome = Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
    launch = {"executable_path": str(chrome)} if chrome.is_file() else {"channel": "chromium"}
    title = "升級驗收 · 維他命 C"
    note = "升級前已儲存的中文提詞"
    extension_id = "ehmlgpnbnkmfggnamoknkaadeojokeki"

    with TemporaryDirectory(prefix="canvas-slides-upgrade-") as folder, sync_playwright() as p:
        root = Path(folder)
        install = root / "extension"
        profile = root / "profile"

        def open_editor(context):
            cdp = context.browser.new_browser_cdp_session()
            loaded = cdp.send("Extensions.loadUnpacked", {"path": str(install)})["id"]
            assert loaded == extension_id, f"Unexpected extension ID {loaded}"
            page = context.new_page()
            page.goto(f"chrome-extension://{loaded}/index.html")
            return page

        def start():
            return p.chromium.launch_persistent_context(
                profile, **launch, headless=True,
                ignore_default_args=["--disable-extensions"],
                args=["--enable-unsafe-extension-debugging"],
            )

        shutil.copytree(baseline, install)
        context = start()
        try:
            page = open_editor(context)
            expect(page.get_by_label("簡報名稱", exact=True)).to_be_visible()
            page.get_by_label("簡報名稱", exact=True).fill(title)
            page.get_by_role("button", name="講者備註", exact=False).click()
            page.get_by_role("textbox", name="講者提詞").fill(note)
            page.get_by_label("簡報名稱", exact=True).click()
            expect(page.get_by_text("已存到此瀏覽器", exact=True)).to_be_visible()
            project_id = page.evaluate("localStorage.getItem('canvas-slides-last')")
            assert project_id
        finally:
            context.close()

        install.rename(root / "baseline")
        shutil.copytree(candidate, install)
        context = start()
        try:
            page = open_editor(context)
            expect(page.get_by_label("簡報名稱", exact=True)).to_have_value(title)
            assert page.evaluate("localStorage.getItem('canvas-slides-last')") == project_id
            page.get_by_role("button", name="講者備註", exact=False).click()
            expect(page.get_by_role("textbox", name="講者提詞")).to_have_value(note)
            page.get_by_role("button", name="操作說明").click()
            expect(page.get_by_role("dialog").get_by_text(f"Canvas Slides v{after['version']}", exact=True)).to_be_visible()
            assert page.evaluate("chrome.runtime.getManifest().version") == after["version"]
        finally:
            context.close()
    print(f"PASS {before['version']} → {after['version']}: extension ID, project, title, notes and UI version")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    options = parser.parse_args()
    run(options.baseline, options.candidate)
