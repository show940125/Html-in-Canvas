"""Losslessly decode generated GIF frames into GPU atlases; never draw characters.
Retains the original GIF and records frame timing, alpha, and provenance hashes.
"""
from pathlib import Path
from PIL import Image,ImageSequence
import argparse,hashlib,json,math,shutil
parser=argparse.ArgumentParser();parser.add_argument('name',choices=['godzilla-stomp','human-run','destruction']);parser.add_argument('source',type=Path);parser.add_argument('--provenance-url',default='',help='Optional private source URL; written only to ignored local output');args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];assets=ROOT/'public'/'assets';assets.mkdir(parents=True,exist_ok=True)
with Image.open(args.source) as animation:
 if animation.format!='GIF' or not 2<=animation.n_frames<=64:raise ValueError('Expected a real animated GIF with 2–64 frames')
 width,height=animation.size
 if width*height*animation.n_frames>64_000_000:raise ValueError('Animation exceeds texture budget')
 frames=[];durations=[];bounds=[]
 for frame in ImageSequence.Iterator(animation):
  rgba=frame.convert('RGBA');frames.append(rgba.copy());durations.append(max(20,frame.info.get('duration',100)))
  alpha=rgba.getchannel('A');bbox=alpha.getbbox()
  if bbox:bounds.append(bbox)
 if not bounds:raise ValueError('Animation is empty')
 if min(f.getchannel('A').getextrema()[0] for f in frames)!=0:raise ValueError('Opaque background: needs an explicitly generated transparent asset')
 columns=4;rows=math.ceil(len(frames)/columns);atlas=Image.new('RGBA',(width*columns,height*rows))
 for i,frame in enumerate(frames):atlas.paste(frame,((i%columns)*width,(i//columns)*height))
 atlas.save(assets/(args.name+'.png'),optimize=True)
 shutil.copyfile(args.source,assets/(args.name+'.gif'))
 metadata={'width':width,'height':height,'columns':columns,'rows':rows,'frameCount':len(frames),'durations':durations,'duration':sum(durations),'baseline':max(b[3] for b in bounds)/height,'bounds':[min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds)],'sha256':hashlib.sha256(args.source.read_bytes()).hexdigest()}
 (assets/(args.name+'.json')).write_text(json.dumps(metadata,indent=2),encoding='utf-8')
 out=ROOT/'output'/'assets';out.mkdir(parents=True,exist_ok=True)
 provenance=out/(args.name+'-provenance.json')
 if args.provenance_url or not provenance.exists():
  provenance.write_text(json.dumps({'route':'ChatGPT sidebar image generation','requestedModel':'Images 2.6','exactModelId':'not exposed by UI','conversation':args.provenance_url or None},indent=2),encoding='utf-8')
 strip=Image.new('RGBA',(width*4,height))
 for k,i in enumerate([0,len(frames)//3,2*len(frames)//3,len(frames)-1]):strip.paste(frames[i],(k*width,0))
 strip.save(out/(args.name+'-filmstrip.png'))
 print(json.dumps(metadata));print(assets/(args.name+'.png'))
