"""Run the release gate serially; preserve logs and exact built-file hashes."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import hashlib,json,os,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'/'v03';LOG=OUT/'verification';LOG.mkdir(parents=True,exist_ok=True)
steps=[]
def run(name,args):
 print('\nVERIFY '+name,flush=True)
 with (LOG/(name+'.log')).open('w',encoding='utf-8') as log:
  process=subprocess.Popen(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
  for line in process.stdout:log.write(line);print(line,end='',flush=True)
  code=process.wait()
 steps.append(dict(name=name,passed=code==0,exitCode=code));write()
 if code:raise SystemExit(code)
def write():
 (OUT/'verification.json').write_text(json.dumps(dict(version='0.3.0',verifiedAt=datetime.now(timezone(timedelta(hours=8))).isoformat(),steps=steps),ensure_ascii=False,indent=2),encoding='utf-8')
npm=['cmd.exe','/c','npm'] if os.name=='nt' else ['npm']
run('unit',npm+['test','--','--reporter=json','--outputFile=output/v03/unit-tests.json'])
run('build',npm+['run','build'])
for name in ['v03_acceptance','v03_deep_acceptance','compatibility_acceptance','examples_acceptance','migration_acceptance','extension_acceptance','image_permission_acceptance','workload_acceptance']:
 run(name,[sys.executable,str(ROOT/'scripts'/(name+'.py'))])
hashes={p.relative_to(ROOT/'dist').as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'dist').rglob('*')) if p.is_file()}
(OUT/'build-hashes.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
print('\nALL RELEASE CHECKS PASSED',flush=True)
