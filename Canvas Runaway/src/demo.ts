import {collect,restoreCapture} from './capture';
import {prepareCanvas,supportsCanvas,type DrawableCanvas,type DrawableContext} from '../../shared/html-in-canvas/canvas';
import {Stage} from './stage';
import type {Capture} from './model';
let stage:Stage|undefined;
const launch=document.getElementById('launch') as HTMLButtonElement,status=document.getElementById('demo-status')!,panel=document.querySelector('.launch') as HTMLElement;
async function snapshot(clean:boolean):Promise<string>{
 const c=document.createElement('canvas') as DrawableCanvas;c.width=innerWidth;c.height=innerHeight;c.style.cssText=`position:fixed;left:0;top:0;width:${innerWidth}px;height:${innerHeight}px;z-index:-100;pointer-events:none`;
 const ctx=c.getContext('2d') as DrawableContext;
 if(supportsCanvas()){
  prepareCanvas(c);const copy=document.getElementById('page')!.cloneNode(true) as HTMLElement;copy.removeAttribute('id');copy.setAttribute('drawable','');copy.style.width=`${innerWidth}px`;copy.style.height=`${innerHeight}px`;copy.style.overflow='hidden';
  if(clean)copy.querySelectorAll<HTMLElement>('[data-runaway-capture]').forEach(e=>e.style.visibility='hidden');c.append(copy);document.documentElement.append(c);
  try{return await new Promise<string>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('預覽畫面繪製逾時')),2000);c.addEventListener('paint',()=>{try{ctx.drawElementImage(copy,0,0,innerWidth,innerHeight);const result=c.toDataURL();clearTimeout(timeout);resolve(result);}catch(e){clearTimeout(timeout);reject(e);}},{once:true});c.requestPaint();});}finally{c.remove();}
 }
 // Offline compatibility fixture, generated solely from the sample page's DOM.
 ctx.fillStyle='#eeeee5';ctx.fillRect(0,0,c.width,c.height);
 if(!clean)for(const el of document.querySelectorAll<HTMLElement>('#page h1,#page h2,#page p,#page svg')){const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(el.tagName.toLowerCase()==='svg'){ctx.fillStyle='#71876a';ctx.fillRect(r.x,r.y,r.width,r.height);continue;}ctx.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;ctx.fillStyle=s.color;let x=r.x,y=r.y+parseFloat(s.fontSize);for(const letter of el.textContent||''){const width=ctx.measureText(letter).width;if(x+width>r.right){x=r.x;y+=parseFloat(s.lineHeight)||24;}ctx.fillText(letter,x,y);x+=width;}}
 return c.toDataURL();
}
async function start(){
 stage?.close();launch.disabled=true;status.textContent='正在把網頁裝進身體…';panel.style.visibility='hidden';
 try{await document.fonts.ready;const metadata=collect();const source:Capture={...metadata,url:'https://example.com/ordinary',screenshot:await snapshot(false),clean:await snapshot(true)};restoreCapture();
  let target:Capture|undefined;
  if((document.getElementById('demo-ending') as HTMLSelectElement).value==='target'){
   const image=document.createElement('canvas');image.width=source.width;image.height=source.height;const cx=image.getContext('2d')!;cx.fillStyle='#19392e';cx.fillRect(0,0,image.width,image.height);cx.fillStyle='#d8e7ab';cx.font=`600 ${Math.min(84,innerWidth*.075)}px system-ui`;cx.fillText('它們，抵達了。',innerWidth*.10,innerHeight*.43);cx.font='17px system-ui';cx.fillText('每一次離開，都讓另一個頁面開始。',innerWidth*.10,innerHeight*.52);cx.strokeStyle='#aabf8044';cx.beginPath();cx.moveTo(innerWidth*.1,innerHeight*.62);cx.lineTo(innerWidth*.9,innerHeight*.62);cx.stroke();target={...source,title:'另一個頁面',url:'https://example.com/arrival',screenshot:image.toDataURL(),clean:image.toDataURL()};
  }
  stage=new Stage(source,{ending:target?'target':'empty',target},()=>{status.textContent='範例終點已抵達；正式插件會前往指定網址。';stage?.close();},()=>{panel.style.visibility='';launch.disabled=false;status.textContent='演出已恢復，隨時可以再失控一次。';});await stage.init();
 }catch(e){restoreCapture();stage?.close();panel.style.visibility='';launch.disabled=false;status.textContent=e instanceof Error?e.message:String(e);throw e;}
}
launch.addEventListener('click',()=>{void start().catch(console.error);});
document.getElementById('extension-help')!.addEventListener('click',e=>{if(location.protocol==='file:'){e.preventDefault();status.textContent='在 chrome://extensions 載入 Canvas Runaway/dist 資料夾。';}});
// Bounded local preview hooks support deterministic filmstrips and real pointer tests.
Object.assign(window,{runawayPreview:{start,get stage(){return stage;},seek:(t:number)=>stage?.seek(t),close:()=>stage?.close()}});
