"""Package only the built extension, with stable ZIP ordering and timestamps."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'dist';OUT=ROOT/'release';OUT.mkdir(exist_ok=True)
manifest=json.loads((DIST/'manifest.json').read_text(encoding='utf-8'))
for required in ['index.html','background.js','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md']:
 if not (DIST/required).is_file():raise SystemExit('Missing build artifact: '+required)
target=OUT/f"canvas-clipper-v{manifest['version']}.zip"
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for file in sorted(DIST.rglob('*')):
  if not file.is_file():continue
  if file.is_symlink() or not file.resolve().is_relative_to(DIST.resolve()):raise SystemExit('Invalid build path')
  info=zipfile.ZipInfo(file.relative_to(DIST).as_posix(),date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  archive.writestr(info,file.read_bytes(),compresslevel=9)
sha=hashlib.sha256(target.read_bytes()).hexdigest();(OUT/(target.name+'.sha256')).write_text(f'{sha}  {target.name}\n',encoding='utf-8')
print(json.dumps(dict(file=str(target),sha256=sha,size=target.stat().st_size),indent=2))
