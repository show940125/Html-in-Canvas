"""Fetch immutable upstream editing sources and the two official OCR profiles.
Assets remain local; assets.lock.json records exact identities for redistribution.
"""
from pathlib import Path
import urllib.request, hashlib, tarfile, io, json, re
ROOT=Path(__file__).resolve().parents[1]
BENTO='ed197274e906a2d378d7c566b0de88e403321b50'
ENGINE='3f6b6114b166760de18923d9e737932a5c0adbcb'
records=[]
LOCK=ROOT/'assets.lock.json'
previous=json.loads(LOCK.read_text(encoding='utf8')) if LOCK.exists() else {'files':[]}
expected={f.get('url'):f['sha256'] for f in previous['files'] if f.get('url')}
def get(url,path):
    path=ROOT/path;path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        print('download',url,flush=True)
        data=urllib.request.urlopen(url,timeout=120).read();path.write_bytes(data)
    data=path.read_bytes()
    digest=hashlib.sha256(data).hexdigest()
    if url in expected and expected[url]!=digest:raise RuntimeError('Asset SHA-256 mismatch: '+str(path))
    records.append({'path':path.relative_to(ROOT).as_posix(),'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    return data
for name in ['core.js','streamsplice.js','shadingsurgery.js','tagsurgery.js','type3surgery.js']:
    data=get(f'https://raw.githubusercontent.com/alam00000/bentopdf/{BENTO}/src/js/editcore/{name}',f'output/upstream/editcore/{name}')
    target=ROOT/'src/vendor/editcore'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
get(f'https://raw.githubusercontent.com/alam00000/bentopdf/{BENTO}/src/js/utils/freetext-script.ts','src/vendor/utils/freetext-script.ts')
get(f'https://raw.githubusercontent.com/alam00000/bentopdf/{BENTO}/LICENSE','LICENSE')
data=get(f'https://raw.githubusercontent.com/alam00000/bentopdf/{BENTO}/vendor/bentopdf-pdfium/bentopdf-pdfium-{ENGINE[:12]}.tgz','output/upstream/editcore.tgz')
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as t:
    for n in ['editcore.js','editcore.wasm']:
        b=t.extractfile('package/'+n).read();p=ROOT/'public/editcore'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
        records.append({'path':p.relative_to(ROOT).as_posix(),'archive':hashlib.sha256(data).hexdigest(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
get('https://raw.githubusercontent.com/notofonts/noto-cjk/Serif2.003/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf','public/fonts/NotoSansCJKtc-Regular.otf')
get('https://raw.githubusercontent.com/notofonts/noto-cjk/Serif2.003/Sans/LICENSE','public/licenses/noto.txt')
# Official PP-OCRv6 tar archives carry both ONNX weights and inference.yml dictionary.
for tier in ['small','medium']:
    for role in ['det','rec']:
        name=f'PP-OCRv6_{tier}_{role}'
        get(f'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/{name}_onnx_infer.tar',f'public/models/{name}.tar')
get(f'https://codeload.github.com/alam00000/bentopdf-pdfium-viewer/zip/{ENGINE}','output/upstream/editcore-corresponding-source.zip')
get('https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/e5046169b225bcdfbe25d45b4e809ff0f1a69c2c/LICENSE','public/licenses/PaddleOCR-Apache-2.0.txt')
import zipfile
with zipfile.ZipFile(ROOT/'output/upstream/editcore-corresponding-source.zip') as z:
    for n in z.namelist():
        if n.endswith(('/NOTICE','/licenses/LICENSE.embedpdf-mit','/licenses/LICENSE.harfbuzz','/packages/pdfium/LICENSE.pdfium')):
            p=ROOT/'public/licenses'/('editcore-'+n.split('/')[-1]);p.write_bytes(z.read(n))
get('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/LICENSE','public/licenses/onnxruntime-MIT.txt')
get('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/ThirdPartyNotices.txt','public/licenses/onnxruntime-ThirdPartyNotices.txt')
get('https://www.boost.org/LICENSE_1_0.txt','public/licenses/Boost-1.0.txt')
(ROOT/'assets.lock.json').write_text(json.dumps({'schema':1,'bento':BENTO,'engine':ENGINE,'files':records},ensure_ascii=False,indent=2),encoding='utf8')
core=ROOT/'src/vendor/editcore/core.js'
core.write_text(core.read_text(encoding='utf8').replace("from './engine-loader.js'", "from '../../pdf-engine-loader.js'"),encoding='utf8')
print('asset manifest',len(records),flush=True)
