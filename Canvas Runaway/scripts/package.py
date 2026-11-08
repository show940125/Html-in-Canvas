"""Package only the extension build, never captures, profiles or source secrets."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
dist=ROOT/'dist';release=ROOT/'release';release.mkdir(exist_ok=True)
manifest=json.loads((dist/'manifest.json').read_text(encoding='utf-8'));version=manifest['version']
output=release/f'CanvasRunaway-v{version}.zip';files=sorted(p for p in dist.rglob('*') if p.is_file())
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for file in files:
  name=file.relative_to(dist).as_posix();info=zipfile.ZipInfo(name,date_time=(2026,11,7,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,file.read_bytes())
with zipfile.ZipFile(output) as archive:
 assert archive.testzip() is None
 assert 'manifest.json' in archive.namelist() and all(not name.startswith('/') and '..' not in name.split('/') for name in archive.namelist())
 assert all(archive.read(p.relative_to(dist).as_posix())==p.read_bytes() for p in files)
summary={'version':version,'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
(release/'package-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary));print(output)
