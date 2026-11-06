import Moveable from 'moveable';
import * as motion from './vendor/motion.js';
import * as lucide from 'lucide';
import {prepareCanvas,supportsCanvas,syncGeometry,type DrawableCanvas,type DrawableContext} from '../../shared/html-in-canvas/canvas';
import {safeHtml,sanitizeDeck} from './importer';
import {template} from './vendor';
import type {Deck,Bridge} from './model';
import {presentationCss,installPlaybackControls} from './presentation';
const session=location.hash.slice(1);let deck:Deck,index=0,mode='edit',forceDOM=false;
let root:HTMLElement,canvas:DrawableCanvas|undefined,moveable:Moveable|undefined,selected:string[]=[],editing:HTMLElement|undefined;
let groupIds:string[]=[];let native=false;let dirty=false;let queued=false;let port:MessagePort|undefined;
let playbackTimer:ReturnType<typeof setInterval>|undefined;
let textTimer:ReturnType<typeof setTimeout>|undefined;let composing=false;
const send=(type:string,payload?:any,request?:string)=>port?.postMessage({protocol:'canvas-slides/1',session,type,payload,request} satisfies Bridge);
const el=(id:string)=>root.querySelector<HTMLElement>(`[data-cs-id="${CSS.escape(id)}"]`);
const targets=()=>selected.map(el).filter(Boolean) as HTMLElement[];
function cleanSlide(){
 const clone=root.querySelector('.slide')!.cloneNode(true) as HTMLElement;
 for(const e of [clone,...clone.querySelectorAll<HTMLElement>('*')]){e.removeAttribute('contenteditable');e.removeAttribute('spellcheck');e.removeAttribute('data-cs-editing');}
 return clone.outerHTML;
}
function persist(){if(mode!=='edit')return;dirty=false;send('commit',{html:cleanSlide(),slideId:deck.slides[index].id});describe();capturePreview();}
function requestPaint(){if(native)canvas?.requestPaint();}
function assignIds(){for(const e of root.querySelectorAll<HTMLElement>('section,div,h1,h2,h3,h4,p,span,img,figure,figcaption,li,ul,ol,svg,table,video,canvas,a,blockquote,strong,em'))if(!e.closest('svg')||e.tagName.toLowerCase()==='svg')e.dataset.csId||=crypto.randomUUID();}
function describe(){
 const layers=[...root.querySelectorAll<HTMLElement>('[data-cs-id]')].slice(0,1500).map(e=>({id:e.dataset.csId,tag:e.tagName.toLowerCase(),text:(e.textContent||e.getAttribute('alt')||e.tagName).trim().slice(0,60),depth:depth(e),locked:e.dataset.csLocked==='true',free:e.dataset.csFree==='true'}));
 const selection=targets().map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id:e.dataset.csId,tag:e.tagName.toLowerCase(),text:e.textContent?.slice(0,200),x:r.x,y:r.y,width:r.width,height:r.height,fontSize:parseFloat(s.fontSize),fontFamily:s.fontFamily,color:s.color,opacity:Number(s.opacity),rotate:parseFloat(e.style.rotate)||0,locked:e.dataset.csLocked==='true',free:e.dataset.csFree==='true',fit:s.objectFit};});
 send('selection',{layers,selection,pageBackground:getComputedStyle(root.querySelector('.slide')!).backgroundColor});
}
function depth(e:Element){let n=0;while(e.parentElement&&e.parentElement!==root){n++;e=e.parentElement;}return n;}
function updateGuides(){const selectedNodes=targets();moveable!.elementGuidelines=[...root.querySelectorAll<HTMLElement>('[data-cs-id]')].filter(e=>!selectedNodes.some(t=>t.contains(e)||e.contains(t))&&e.getBoundingClientRect().width>0).slice(0,300);}
function configureHandles(){const group=targets().length===1&&targets()[0].dataset.csGroup==='true';moveable!.resizable=!group;moveable!.scalable=group;}
function select(ids:string[]){finishText();selected=[...new Set(ids.filter(id=>el(id)).map(id=>el(id)!.closest<HTMLElement>('[data-cs-locked="true"]')?.dataset.csId||id))];moveable!.target=targets().filter(e=>!e.closest('[data-cs-locked="true"]'));configureHandles();updateGuides();moveable!.updateRect();describe();}
function finishText(){clearTimeout(textTimer);if(!editing)return;editing.removeAttribute('contenteditable');editing.removeAttribute('data-cs-editing');editing=undefined;moveable?.setState({hideDefaultLines:false});if(dirty)persist();}
function startText(target:HTMLElement){
 if(target.closest('svg,table,video')||target.tagName==='CANVAS'||target.closest('[data-cs-locked="true"]'))return;
 const candidate=target.closest<HTMLElement>('h1,h2,h3,h4,p,span,li,blockquote,strong,em')||target;
 if(candidate.querySelector('img,svg,video,table,canvas,div,h1,h2,p')){send('notice','請在文字行上雙擊；容器可從圖層面板選取。');return;}
 select([candidate.dataset.csId!]);editing=candidate;candidate.contentEditable='true';candidate.dataset.csEditing='true';candidate.focus();moveable!.target=[];
 const range=document.createRange();range.selectNodeContents(candidate);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
}
async function capturePreview(){
 if(queued||!native||!canvas)return;queued=true;
 const slideId=deck.slides[index].id,target=canvas;try{await readyCanvas();if(canvas!==target||deck.slides[index].id!==slideId)return;const small=document.createElement('canvas');small.width=320;small.height=Math.round(320*deck.height/deck.width);small.getContext('2d')!.drawImage(target,0,0,small.width,small.height);send('preview',{slideId,url:small.toDataURL('image/png')});}catch(e){send('notice',`預覽圖無法產生：${String(e)}`);}finally{queued=false;}
}
async function readyCanvas(){
 if(!native||!canvas)throw new Error('圖片輸出需要原生 HTML-in-Canvas；目前可匯出 HTML、專案及列印。');
 const target=canvas;await document.fonts.ready;await Promise.all([...root.querySelectorAll('img')].map(image=>image.decode()));
 await new Promise<void>((resolve,reject)=>{const painted=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{target.removeEventListener('paint',painted);reject(new Error('等待畫布更新逾時。'));},5000);target.addEventListener('paint',painted,{once:true});target.requestPaint();});return target;
}
function mount(next:Deck,at:number,nextMode:string,dom:boolean){
 if(playbackTimer)clearInterval(playbackTimer);
 clearTimeout(textTimer);composing=false;
 deck=sanitizeDeck(next);index=Math.max(0,Math.min(at,deck.slides.length-1));mode=nextMode;forceDOM=dom;dirty=false;editing=undefined;selected=[];moveable?.destroy();canvas=undefined;
 if(mode==='play'){present();return;}
 document.documentElement.getAttributeNames().filter(k=>k!=='lang').forEach(k=>document.documentElement.removeAttribute(k));
 for(const [key,value]of Object.entries(deck.rootAttrs))document.documentElement.setAttribute(key,value);document.documentElement.setAttribute('style',deck.rootStyle||'');
 document.querySelectorAll('style[data-cs]').forEach(x=>x.remove());
 const style=document.createElement('style');style.dataset.cs='';style.textContent=deck.css+`\nhtml,body{margin:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important}body{background:var(--paper,#fff)}#cs-draw-root{width:100vw;height:100vh;background:var(--paper,#fff)}#cs-canvas{position:absolute;inset:0;width:100vw;height:100vh}#deck{position:relative!important;inset:auto!important;width:100vw!important;height:100vh!important;display:block!important;transform:none!important;transition:none!important}#deck>.slide{width:100vw!important;height:100vh!important;min-height:0!important;box-sizing:border-box}#nav,#hint{display:none!important}.cs-edit [data-anim]{opacity:1!important;animation:none!important;transition:none!important}.cs-edit [data-cs-editing]{outline:2px solid #3567e8!important;cursor:text!important;min-width:1em}.cs-edit a{cursor:default}.moveable-control-box{z-index:2147483000!important}*{box-sizing:border-box}.cs-free-layer{position:absolute!important;inset:0;pointer-events:none;z-index:1000}.cs-free-layer>[data-cs-id]{pointer-events:auto}`;
 style.textContent+=presentationCss;
 document.head.append(style);document.body.className=deck.bodyClass+(mode==='edit'?' cs-edit':'');document.body.setAttribute('style',deck.bodyStyle);document.body.replaceChildren();
 root=document.createElement('div');root.id='cs-draw-root';const deckRoot=document.createElement('div');deckRoot.id='deck';deckRoot.innerHTML=safeHtml(deck.slides[index].html);root.append(deckRoot);assignIds();
 native=supportsCanvas()&&!forceDOM;
 if(native){
  canvas=document.createElement('canvas') as DrawableCanvas;canvas.id='cs-canvas';prepareCanvas(canvas);root.setAttribute('drawable','');canvas.append(root);document.body.append(canvas);const ctx=canvas.getContext('2d') as DrawableContext;
  const cv=canvas;const paint=()=>{try{ctx.reset();ctx.scale(cv.width/innerWidth,cv.height/innerHeight);ctx.fillStyle=getComputedStyle(document.body).backgroundColor||'#fff';ctx.fillRect(0,0,innerWidth,innerHeight);const m=ctx.drawElementImage(root,0,0,root.offsetWidth,root.offsetHeight);syncGeometry(cv,root,m);cv.dataset.paints=String(Number(cv.dataset.paints||0)+1);}catch(error){send('error',`原生畫布失敗，已切換 HTML：${String(error)}`);mount(deck,index,mode,true);}};
  cv.addEventListener('paint',paint);cv.width=Math.round(innerWidth*devicePixelRatio);cv.height=Math.round(innerHeight*devicePixelRatio);cv.requestPaint();
 }else document.body.append(root);
 lucide.createIcons({icons:lucide.icons});assignIds();
 moveable=new Moveable(document.body,{target:[],draggable:true,resizable:true,rotatable:true,snappable:true,snapThreshold:6,elementGuidelines:[],verticalGuidelines:[0,deck.width/2,deck.width],horizontalGuidelines:[0,deck.height/2,deck.height],origin:false,keepRatio:false});
 moveable.on('dragStart',(e:any)=>{const p=(e.target.style.translate||'0 0').split(' ').map((v:string)=>parseFloat(v)||0);e.set([p[0]||0,p[1]||0]);});
 moveable.on('drag',(e:any)=>{e.target.style.translate=`${e.beforeTranslate[0]}px ${e.beforeTranslate[1]}px`;requestPaint();});
 moveable.on('dragEnd',()=>persist());
 moveable.on('resize',(e:any)=>{e.target.style.width=`${e.width}px`;e.target.style.height=`${e.height}px`;e.target.style.flex='none';e.target.style.translate=`${e.drag.beforeTranslate[0]}px ${e.drag.beforeTranslate[1]}px`;requestPaint();});
 moveable.on('resizeEnd',()=>persist());
 moveable.on('scaleStart',(e:any)=>{const p=(getComputedStyle(e.target).scale||'1').split(' ').map(Number);e.set([p[0]||1,p[1]||p[0]||1]);const t=(e.target.style.translate||'0 0').split(' ').map((v:string)=>parseFloat(v)||0);e.dragStart?.set([t[0]||0,t[1]||0]);});
 moveable.on('scale',(e:any)=>{e.target.style.scale=`${e.scale[0]} ${e.scale[1]}`;e.target.style.translate=`${e.drag.beforeTranslate[0]}px ${e.drag.beforeTranslate[1]}px`;requestPaint();});moveable.on('scaleEnd',()=>persist());
 moveable.on('rotateStart',(e:any)=>{e.set(parseFloat(e.target.style.rotate)||0);});
 moveable.on('rotate',(e:any)=>{e.target.style.rotate=`${e.beforeRotate}deg`;requestPaint();});moveable.on('rotateEnd',()=>persist());
 moveable.on('rotateGroupStart',(e:any)=>e.events.forEach((v:any)=>v.set(parseFloat(v.target.style.rotate)||0)));
 moveable.on('rotateGroup',(e:any)=>{for(const v of e.events){v.target.style.rotate=`${v.beforeRotate}deg`;v.target.style.translate=`${v.drag.beforeTranslate[0]}px ${v.drag.beforeTranslate[1]}px`;}requestPaint();});moveable.on('rotateGroupEnd',()=>persist());
 moveable.on('dragGroupStart',(e:any)=>e.events.forEach((v:any)=>{const p=(v.target.style.translate||'0 0').split(' ').map((n:string)=>parseFloat(n)||0);v.set([p[0]||0,p[1]||0]);}));
 moveable.on('dragGroup',(e:any)=>{e.events.forEach((v:any)=>v.target.style.translate=`${v.beforeTranslate[0]}px ${v.beforeTranslate[1]}px`);requestPaint();});moveable.on('dragGroupEnd',()=>persist());
 moveable.on('resizeGroup',(e:any)=>{for(const v of e.events){v.target.style.width=`${v.width}px`;v.target.style.height=`${v.height}px`;v.target.style.translate=`${v.drag.beforeTranslate[0]}px ${v.drag.beforeTranslate[1]}px`;}requestPaint();});moveable.on('resizeGroupEnd',()=>persist());
 root.addEventListener('pointerdown',e=>{
  if(mode!=='edit'||editing||e.button!==0)return;
  const target=(e.target as Element).closest<HTMLElement>('[data-cs-locked="true"]')||(e.target as Element).closest<HTMLElement>('[data-cs-id]');if(!target)return;
  if(e.shiftKey){const id=target.dataset.csId!;select(selected.includes(id)?selected.filter(x=>x!==id):[...selected.filter(id=>!el(id)?.contains(target)&&!target.contains(el(id))),id]);return;}
  const id=target.dataset.csId!;if(!selected.includes(id))select([id]);
 });
 root.addEventListener('dblclick',e=>{e.preventDefault();if(mode==='edit')startText(e.target as HTMLElement);});
 const scheduleTextSave=()=>{clearTimeout(textTimer);textTimer=setTimeout(()=>{if(dirty&&!composing)persist();},450);};
 root.addEventListener('input',e=>{dirty=true;requestPaint();if(!(e as InputEvent).isComposing&&!composing)scheduleTextSave();});
 root.addEventListener('compositionstart',()=>{composing=true;clearTimeout(textTimer);});
 root.addEventListener('compositionend',()=>{composing=false;dirty=true;requestPaint();scheduleTextSave();});
 root.addEventListener('focusout',e=>{if(editing&&!editing.contains(e.relatedTarget as Node))finishText();});
 root.addEventListener('click',e=>{if((e.target as Element).closest('a'))e.preventDefault();});
 root.addEventListener('paste',e=>{if(!editing)return;e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';const selection=window.getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0);range.deleteContents();range.insertNode(document.createTextNode(text));selection.collapseToEnd();dirty=true;requestPaint();}});
 send('mounted',{native,slideId:deck.slides[index].id});describe();capturePreview();
}
function detach(target:HTMLElement){
 if(target.closest('[data-cs-locked="true"]'))throw new Error('請先解鎖這個物件。');
 if(target.dataset.csFree==='true')return target;
 const slide=root.querySelector<HTMLElement>('.slide')!;if(target===slide)throw new Error('整頁已是固定舞台，請選取頁內區塊。');
 const rect=target.getBoundingClientRect(),slideRect=slide.getBoundingClientRect();const copy=target.cloneNode(true) as HTMLElement;
 const originals=[target,...target.querySelectorAll<HTMLElement>('*')],copies=[copy,...copy.querySelectorAll<HTMLElement>('*')];
 originals.forEach((node,i)=>{const style=getComputedStyle(node);const dst=copies[i];for(const property of style)dst.style.setProperty(property,style.getPropertyValue(property));
  for(const pseudo of ['::before','::after']){const ps=getComputedStyle(node,pseudo);if(ps.content&&ps.content!=='none'&&ps.content!=='normal'){const decoration=document.createElement('span');for(const p of ps)decoration.style.setProperty(p,ps.getPropertyValue(p));decoration.textContent=ps.content.replace(/^['"]|['"]$/g,'');decoration.style.pointerEvents='none';pseudo==='::before'?dst.prepend(decoration):dst.append(decoration);}}
 });
 const holder=document.createElement('div');holder.dataset.csPlaceholder='';holder.style.cssText=`width:${target.offsetWidth}px;height:${target.offsetHeight}px;min-width:${target.offsetWidth}px;min-height:${target.offsetHeight}px;visibility:hidden;grid-area:${getComputedStyle(target).gridArea};flex:${getComputedStyle(target).flex};margin:${getComputedStyle(target).margin}`;
 target.replaceWith(holder);copy.dataset.csFree='true';Object.assign(copy.style,{position:'absolute',left:`${rect.x-slideRect.x}px`,top:`${rect.y-slideRect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',transform:'none',translate:'none',rotate:'none',insetInline:'auto',insetBlock:'auto'});copy.style.left=`${rect.x-slideRect.x}px`;copy.style.top=`${rect.y-slideRect.y}px`;
 let layer=slide.querySelector<HTMLElement>(':scope>.cs-free-layer');if(!layer){layer=document.createElement('div');layer.className='cs-free-layer';slide.append(layer);}layer.append(copy);return copy;
}
function localMatrix(node:HTMLElement){
 const s=getComputedStyle(node),origin=s.transformOrigin.split(' ').map(parseFloat),tr=s.translate==='none'?[0,0]:s.translate.split(' ').map(parseFloat),sc=s.scale==='none'?[1,1]:s.scale.split(' ').map(Number);
 return new DOMMatrix().translate(node.offsetLeft+(tr[0]||0),node.offsetTop+(tr[1]||0)).translate(origin[0]||0,origin[1]||0).rotate(parseFloat(s.rotate)||0).scale(sc[0]||1,sc[1]||sc[0]||1).multiply(s.transform==='none'?new DOMMatrix():new DOMMatrix(s.transform)).translate(-(origin[0]||0),-(origin[1]||0));
}
function command(type:string,payload:any){
 if(!root)throw new Error('舞台尚未載入。');
 if(type==='flush'){finishText();return{html:cleanSlide(),slideId:deck.slides[index].id};}
 if(type==='select'){select(payload);return;}
 if(type==='text'){startText(targets()[0]);return;}
 if(type==='png'){finishText();return readyCanvas().then(target=>({url:target.toDataURL('image/png')}));}
 finishText();
 if(type==='detach'){selected=targets().map(t=>detach(t).dataset.csId!);}
 if(type==='delete'){for(const t of targets())if(t!==root.querySelector('.slide')&&!t.closest('[data-cs-locked="true"]'))t.remove();selected=[];}
 if(type==='duplicate'){selected=targets().filter(t=>t!==root.querySelector('.slide')).map(t=>{const original=detach(t),c=original.cloneNode(true) as HTMLElement;for(const n of [c,...c.querySelectorAll<HTMLElement>('[data-cs-id]')])n.dataset.csId=crypto.randomUUID();c.style.translate='20px 20px';original.parentElement!.append(c);return c.dataset.csId!;});}
 if(type==='style')for(const t of targets()){if(t.closest('[data-cs-locked="true"]'))continue;for(const[k,v]of Object.entries(payload))if(['font-size','font-family','font-weight','font-style','color','background-color','text-align','opacity','rotate','width','height','object-fit','object-position','border-radius','translate'].includes(k))t.style.setProperty(k,String(v));}
 if(type==='background'){const slide=root.querySelector('.slide') as HTMLElement;slide.style.background=String(payload);slide.dataset.csBackground='solid';}
 if(type==='geometry')for(const target of targets()){
  const t=detach(target),r=t.getBoundingClientRect();for(const[k,value]of Object.entries(payload)){const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>8192)throw new Error('物件座標或尺寸超出範圍。');if(k==='x')t.style.left=`${(parseFloat(t.style.left)||0)+n-r.x}px`;if(k==='y')t.style.top=`${(parseFloat(t.style.top)||0)+n-r.y}px`;if(k==='width'||k==='height')t.style.setProperty(k,`${Math.max(1,n)}px`);}
 }
 if(type==='image')for(const t of targets()){if(t.tagName==='IMG'&&!t.closest('[data-cs-locked="true"]')){t.setAttribute('src',payload);t.removeAttribute('srcset');}}
 if(type==='lock')for(const t of targets())t.dataset.csLocked=t.dataset.csLocked==='true'?'false':'true';
 if(type==='order')for(const t of targets()){if(t.closest('[data-cs-locked="true"]'))continue;t.style.position=t.style.position||'relative';t.style.zIndex=String((Number(t.style.zIndex)||0)+(payload==='front'?1:-1));}
 if(type==='align'){
  const nodes=targets().map(detach),rects=nodes.map(n=>n.getBoundingClientRect());const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right)),top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
  nodes.forEach((n,i)=>{const r=rects[i];const x=payload==='left'?left:payload==='center'?(left+right-r.width)/2:payload==='right'?right-r.width:r.x;const y=payload==='top'?top:payload==='middle'?(top+bottom-r.height)/2:payload==='bottom'?bottom-r.height:r.y;n.style.left=`${parseFloat(n.style.left)+x-r.x}px`;n.style.top=`${parseFloat(n.style.top)+y-r.y}px`;});
 }
 if(type==='group'){
  const nodes=targets().filter(n=>n!==root.querySelector('.slide')).map(detach);if(nodes.length<2)throw new Error('請用 Shift 或圖層面板選取至少兩個物件。');const rects=nodes.map(n=>n.getBoundingClientRect());const layer=root.querySelector<HTMLElement>('.cs-free-layer')!,base=layer.getBoundingClientRect();const minX=Math.min(...rects.map(r=>r.x))-base.x,minY=Math.min(...rects.map(r=>r.y))-base.y;const group=document.createElement('div');group.dataset.csId=crypto.randomUUID();group.dataset.csFree='true';group.dataset.csGroup='true';group.style.cssText=`position:absolute;left:${minX}px;top:${minY}px;width:${Math.max(...rects.map(r=>r.right))-base.x-minX}px;height:${Math.max(...rects.map(r=>r.bottom))-base.y-minY}px`;layer.append(group);for(const n of nodes){n.style.left=`${n.offsetLeft-minX}px`;n.style.top=`${n.offsetTop-minY}px`;group.append(n);}selected=[group.dataset.csId];
 }
 if(type==='ungroup')for(const group of targets()){if(group.dataset.csGroup!=='true')continue;if(group.closest('[data-cs-locked="true"]'))throw new Error('請先解鎖群組。');const matrix=localMatrix(group),children=[...group.children] as HTMLElement[],transforms=children.map(n=>matrix.multiply(localMatrix(n)));children.forEach((n,i)=>{Object.assign(n.style,{left:'0px',top:'0px',translate:'none',rotate:'none',scale:'none',transformOrigin:'0 0',transform:transforms[i].toString()});group.parentElement!.append(n);});group.remove();selected=[];}
 if(type==='insert'){
  const n=document.createElement(payload.kind==='image'?'img':payload.kind==='text'?'p':'div');n.dataset.csId=crypto.randomUUID();n.dataset.csFree='true';n.style.cssText='position:absolute;left:100px;top:120px;width:320px;height:100px;margin:0;z-index:1001;';
  if(payload.kind==='text'){n.textContent='在此輸入你的想法';n.style.cssText+='font-size:36px;color:var(--ink,#111);font-family:system-ui;';}else if(payload.kind==='image'){(n as HTMLImageElement).src=payload.src;n.style.height='200px';n.style.objectFit='cover';}else{n.style.background='var(--accent,#315d93)';if(payload.kind==='circle')n.style.borderRadius='50%';if(payload.kind==='line')n.style.height='3px';}
  root.querySelector('.slide')!.append(n);selected=[n.dataset.csId];
 }
 assignIds();moveable!.target=targets().filter(t=>!t.closest('[data-cs-locked="true"]'));configureHandles();updateGuides();requestPaint();requestAnimationFrame(()=>moveable?.updateRect());persist();
}
function trustedScript(code:string){const s=document.createElement('script');s.textContent=code;document.body.append(s);}
document.addEventListener('dblclick',e=>{
 if(mode==='edit'&&(e.target as Element).closest('.moveable-control-box')&&targets().length===1){e.preventDefault();startText(targets()[0]);}
},true);
function present(){
 document.querySelectorAll('style[data-cs]').forEach(x=>x.remove());
 for(const[key,value]of Object.entries(deck.rootAttrs))document.documentElement.setAttribute(key,value);document.documentElement.setAttribute('style',deck.rootStyle||'');
 const style=document.createElement('style');style.dataset.cs='';style.textContent=deck.css+'\nhtml,body{margin:0;width:100vw;height:100vh;overflow:hidden}.cs-free-layer{position:absolute;inset:0;pointer-events:none;z-index:1000}.cs-free-layer>[data-cs-id]{pointer-events:auto}';document.head.append(style);
 style.textContent+=presentationCss;
 document.body.className=deck.bodyClass;document.body.setAttribute('style',deck.bodyStyle);document.body.replaceChildren();
 (window as any).__csMotion=motion;(window as any).lucide={...lucide,createIcons:(options:any={})=>lucide.createIcons({icons:lucide.icons,...options})};
 const storage=new Map<string,string>();try{Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,String(v));send('runtime-storage',{key:k,value:String(v)});},removeItem:(k:string)=>storage.delete(k)}});}catch{/* Host owns persistence. */}
 const visible=deck.slides.filter(s=>!s.hidden);if(!visible.length)throw new Error('沒有可播放的頁面。');
 const deckRoot=document.createElement('div');deckRoot.id='deck';deckRoot.innerHTML=visible.map(s=>safeHtml(s.html)).join('');root=deckRoot;
 if(deck.family!=='generic'){
  const t=template(deck.family);const before=document.createElement('div');before.innerHTML=safeHtml(t.before);document.body.append(...before.childNodes,deckRoot);const after=document.createElement('div');after.innerHTML=safeHtml(t.after);document.body.append(...after.childNodes);
  for(const code of t.runtime)trustedScript(code);
 }else{
  const css=document.createElement('style');css.dataset.cs='';css.textContent='#deck{position:relative!important;width:100vw!important;height:100vh!important;transform:none!important}#deck>.slide{display:none;width:100vw!important;height:100vh!important;position:relative;overflow:hidden}#deck>.slide.cs-current{display:block}';document.head.append(css);document.body.append(deckRoot);
  (window as any).go=(n:number)=>{const at=Math.max(0,Math.min(visible.length-1,n));(window as any).__currentSlideIndex=at;[...deckRoot.children].forEach((el,i)=>el.classList.toggle('cs-current',i===at));};
  addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();(window as any).go(((window as any).__currentSlideIndex||0)+1);}if(['ArrowLeft','PageUp'].includes(e.key))(window as any).go(((window as any).__currentSlideIndex||0)-1);});
 }
 installPlaybackControls();
 if(index>0)setTimeout(()=>{(window as any).go?.(Math.min(index,visible.length-1));},750);
 let last=-1;playbackTimer=setInterval(()=>{const at=Number((window as any).__currentSlideIndex)||0;if(at!==last){last=at;send('play-state',{index:at,slideId:visible[at]?.id});}},150);
 send('mounted',{native:false,playback:true,slideId:visible[0].id});
}
addEventListener('keydown',e=>{if(mode!=='play')return;if(e.key.toLowerCase()==='p'){e.preventDefault();e.stopImmediatePropagation();send('presenter-toggle');}},true);
addEventListener('keydown',e=>{
 if(mode!=='edit')return;
 if(e.key==='Escape'){finishText();select([]);return;}
 if(editing){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();finishText();}return;}
 if((e.ctrlKey||e.metaKey)&&['z','y','s'].includes(e.key.toLowerCase())){e.preventDefault();send('shortcut',{key:e.key.toLowerCase(),shift:e.shiftKey});return;}
 if(['Delete','Backspace'].includes(e.key)&&selected.length){e.preventDefault();command('delete',null);}
 if(e.key.startsWith('Arrow')&&selected.length){e.preventDefault();const d=e.shiftKey?10:1;for(const t of targets()){if(t.closest('[data-cs-locked="true"]'))continue;const [x=0,y=0]=(t.style.translate||'0 0').split(' ').map(parseFloat);t.style.translate=`${x+(e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0)}px ${y+(e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0)}px`;}requestPaint();persist();}
});
addEventListener('message',e=>{
 const m=e.data as Bridge;if(e.source!==parent||m?.protocol!=='canvas-slides/1'||m.session!==session||m.type!=='connect'||!e.ports[0]||port)return;
 port=e.ports[0];port.onmessage=async event=>{const message=event.data as Bridge;if(message.protocol!=='canvas-slides/1'||message.session!==session)return;try{let result;if(message.type==='load'){mount(message.payload.deck,message.payload.index,message.payload.mode,message.payload.forceDOM);result=true;}else if(message.type==='advance'){(window as any).__csAdvance?.();result=true;}else if(message.type==='goto'){(window as any).go?.(Number(message.payload));result=true;}else result=await command(message.type,message.payload);if(message.request)send('result',result,message.request);}catch(error){send('failure',String(error),message.request);}};port.start();send('ready');
});
parent.postMessage({protocol:'canvas-slides/1',session,type:'hello'},'*');
