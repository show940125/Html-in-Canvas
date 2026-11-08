"""Check generated animation files and lossless GPU frame packing."""
from pathlib import Path
from PIL import Image,ImageSequence
import json
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'public'/'assets';checks=[]
def check(name,value,detail=None):
 checks.append(dict(name=name,passed=bool(value),detail=detail));print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(name)
for name in ['godzilla-stomp','human-run','destruction']:
 data=json.loads((ASSETS/(name+'.json')).read_text(encoding='utf-8'))
 with Image.open(ASSETS/(name+'.gif')) as gif,Image.open(ASSETS/(name+'.png')) as atlas:
  frames=[f.convert('RGBA').copy() for f in ImageSequence.Iterator(gif)]
  check(name+' is real multi-frame GIF',gif.format=='GIF' and len(frames)==data['frameCount'] and len(frames)>1,{'frames':len(frames),'duration':data['duration']})
  check(name+' has actual motion and transparency',len({f.tobytes() for f in frames})>2 and all(f.getchannel('A').getextrema()[0]==0 for f in frames))
  check(name+' atlas preserves every original pixel',all(atlas.crop(((i%data['columns'])*data['width'],(i//data['columns'])*data['height'],(i%data['columns']+1)*data['width'],(i//data['columns']+1)*data['height'])).tobytes()==frame.tobytes() for i,frame in enumerate(frames)))
out=ROOT/'output'/'assets';out.mkdir(exist_ok=True,parents=True);(out/'results.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
