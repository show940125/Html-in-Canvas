// Explicit development-time import. Runtime never reads the local skill folder.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {finishLayout} from './finish-layouts.mjs';
const root=process.argv[2];if(!root)throw new Error('Pass the verified guizang-html-ppt skill directory.');
await mkdir('src/vendor',{recursive:true});await mkdir('public/licenses',{recursive:true});
const templates={},sources=[];
for(const [key,name] of [['magazine','template.html'],['swiss','template-swiss.html'],['magazinePresenter','template-presenter.html'],['swissPresenter','template-presenter-swiss.html']]){
  const html=await readFile(resolve(root,'assets',name),'utf8');
  sources.push({path:`assets/${name}`,sha256:createHash('sha256').update(html).digest('hex')});
  const attrs={};for(const m of html.match(/<html\b([^>]*)>/i)[1].matchAll(/([\w-]+)="([^"]*)"/g))attrs[m[1]]=m[2];
  const body=html.match(/<body\b([^>]*)>([\s\S]*)<\/body>/i);
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')&&!m[2].includes('const SPEAKER_NOTES ='));
  const runtime=scripts.map(m=>{
    let code=m[2];if(m[1].includes('module')){
      const start=code.indexOf('if(!motion)');const second=code.indexOf('if (motion)');const third=code.indexOf('if(motion)');
      const end=start>=0?start:second>=0?second:third;if(end<0)throw new Error(`Unrecognized motion loader: ${name}`);
      code='const motion=window.__csMotion;\n'+code.slice(end);
    }return code;
  });
  const clean=body[2].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const deckAt=clean.indexOf('<div id="deck"');const deckOpen=clean.indexOf('>',deckAt)+1;
  const navAt=clean.indexOf('<div id="nav"');const endDeck=clean.lastIndexOf('</div>',navAt);
  templates[key]={css:[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n'),rootAttrs:attrs,bodyClass:body[1].match(/class="([^"]*)"/)?.[1]||'',before:clean.slice(0,deckAt),after:clean.slice(navAt),runtime,motion:''};
}
const layouts=[];
const magazine=await readFile(resolve(root,'references','layouts.md'),'utf8');
let heading='';let magazineNumber=0;
for(const part of magazine.split(/(?=^## )/m)){
  heading=part.split('\n')[0].replace(/^#+\s*/,'');
  for(const m of part.matchAll(/```html\s*([\s\S]*?)```/g)){
    if(!m[1].trim().startsWith('<section')||heading.startsWith('0.'))continue;
    layouts.push({id:`M${String(++magazineNumber).padStart(2,'0')}`,family:'magazine',title:heading,html:m[1].trim()});
  }
}
const swiss=await readFile(resolve(root,'references','layouts-swiss.md'),'utf8');
const registry=await readFile(resolve(root,'references','swiss-layout-lock.md'),'utf8');
const cards=(n,cls='sub-card')=>Array.from({length:n},(_,i)=>`<div class="${cls}"><div class="t-cat" data-anim>${String(i+1).padStart(2,'0')}</div><h3 data-anim>在此輸入標題</h3><p data-anim>補充這一項的說明與依據。</p></div>`).join('');
const skeletons={
 S12:'<h1 class="h-statement" data-anim>讓想法形成方向</h1><div class="ink-banner" data-anim>在這裡留下最重要的結論</div>',
 S13:`<div class="duo-compare"><div class="card-ink"><h1 class="h-xl" data-anim>三股力量</h1></div><div>${cards(3)}</div></div>`,
 S14:`<div class="duo-compare"><div>${cards(4)}</div><div style="position:relative;min-height:45vh"><svg viewBox="0 0 400 400" style="height:38vh;width:100%"><circle cx="200" cy="200" r="145" fill="none" stroke="currentColor" stroke-width="2"/></svg><p style="text-align:center" data-anim>循環與回饋</p></div></div>`,
 S15:`<div class="sub-grid-3-2" style="grid-template-columns:repeat(6,1fr)">${cards(12)}</div><div class="h-hero" data-anim>12<span style="font-size:2vw"> 個觀察</span></div>`,
 S16:`<div class="sub-grid-3-2">${cards(6)}</div>`,
 S17:`<div style="position:relative;height:40vh;text-align:center"><svg viewBox="0 0 600 300" style="width:100%;height:100%"><g fill="none" stroke="currentColor"><circle cx="300" cy="150" r="140"/><circle cx="300" cy="150" r="95"/><circle cx="300" cy="150" r="50"/></g></svg><p style="position:absolute;inset:42% 0 auto" data-anim>核心系統</p></div><div class="stack-row">${cards(3)}</div>`,
 S18:`<div class="stack-row">${cards(3)}</div><div class="h-hero" data-anim>2026</div>`,
 S19:`<div class="rule accent"></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2vw">${cards(4)}</div>`,
 S20:`<div>${[1,2,3].map(i=>`<div class="rowline" style="display:flex;justify-content:space-between;border-bottom:1px solid;padding:2vh 0"><span data-anim>指標 ${i}</span><strong style="font-size:7vw;font-weight:200" data-anim>${i*24}%</strong></div>`).join('')}</div>`,
 S21:`<div class="kpi-row-4" style="grid-template-columns:repeat(3,1fr)">${cards(3,'kpi-cell')}</div><div class="bars" style="display:flex;justify-content:end;gap:8px;margin-top:5vh">${Array.from({length:18},(_,i)=>`<div style="width:5px;height:${40+i*4}px;background:currentColor"></div>`).join('')}</div>`
};
for(const row of registry.matchAll(/^\| (S\d+) \| \d+ \| ([^|]+)\|/gm)){
 const id=row[1],n=Number(id.slice(1));const pn=n===9?10:n===10?9:n;
 const part=swiss.split(new RegExp(`^### P${pn} · `,'m'))[1]?.split(/^### P\d+ · /m)[0]||'';
 const block=[...part.matchAll(/```html\s*([\s\S]*?)```/g)][0]?.[1]?.trim();
 let html=block||skeletons[id]||`<div class="stack-row">${cards(3)}</div>`;
 if(!html.startsWith('<section'))html=`<section class="slide light" data-animate="grid-reveal"><div class="canvas-card"><div class="chrome-min"><span>YOUR PRESENTATION</span><span>${id}</span></div><h1 class="h-xl" style="font-size:min(5vw,9vh);margin-bottom:4vh" data-anim>${row[2].trim()}</h1>${html}</div></section>`;
 html=html.replace('<section ',`<section data-layout="${id}" `);
 layouts.push({id,family:'swiss',title:`${id} · ${row[2].trim()}`,html});
}
if(layouts.filter(x=>x.family==='swiss').length!==22||layouts.filter(x=>x.family==='magazine').length!==10)throw new Error('Unexpected layout registry size');
await writeFile('src/vendor/guizang.json',JSON.stringify({templates,layouts:layouts.map(finishLayout),sources,upstream:'93d21bf4a73a851907a6eb00acbf30618236667a'},null,2));
await copyFile(resolve(root,'assets','motion.min.js'),'src/vendor/motion.js');
await copyFile(resolve(root,'LICENSE'),'public/licenses/guizang.txt');
console.log(`Imported ${layouts.length} layouts and four pinned templates. Swiss missing full HTML skeletons use documented layout adapters; see SOURCES.md.`);
