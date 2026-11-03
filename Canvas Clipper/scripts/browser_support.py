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
