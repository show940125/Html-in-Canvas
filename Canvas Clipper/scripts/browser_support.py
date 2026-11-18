"""Portable browser selection and deterministic raster fixtures."""
from pathlib import Path
import os,shutil,struct,zlib
def chrome_launch_options():
 candidates=[os.environ.get('CHROME_BIN',''),r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',r'C:\Program Files\Google\Chrome\Application\chrome.exe']
 candidates.extend(shutil.which(n) or '' for n in ['google-chrome','google-chrome-stable','chromium','chromium-browser'])
 for candidate in candidates:
  if candidate and Path(candidate).is_file():return {'executable_path':candidate}
 return {'channel':'chromium'} # Playwright's full Chromium, with the new headless pipeline.
def synthetic_png(seed=0,width=320,height=140):
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 raw=b''.join(b'\0'+bytes((40+seed*20,90+y//4,80+seed*10,255))*width for y in range(height))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')

def software_args():
 return ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] if os.environ.get('CI') else []

def open_backup_dialog(page):
 if page.locator('dialog[open] .backup-import').count():
  return
 export = page.get_by_role('button',name='輸出與備份',exact=True)
 if export.is_visible():
  export.click()
  page.get_by_role('button',name='完整備份 / 匯入',exact=False).click()
 else:
  page.locator('.compact-actions summary').click()
  page.get_by_role('button',name='備份 / 匯入',exact=True).click()

def choose_backup_file(page, file):
 open_backup_dialog(page)
 page.locator('dialog[open] .backup-import input[type=file]').set_input_files(file)

def restore_project(page, file):
 choose_backup_file(page,file)
 page.get_by_role('button',name='開啟匯入專案',exact=True).click()
 page.locator('dialog[open] .backup-import').wait_for(state='hidden')

def wait_for_book(page, timeout=60000):
 page.locator('.book-shell[data-book-state="ready"]').wait_for(timeout=timeout)
