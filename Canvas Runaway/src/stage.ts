import {Renderer,type Actor} from './renderer';
import {clamp,phaseAt,smooth,type Capture,type RunOptions} from './model';
export class Stage {
 readonly root:HTMLDivElement;readonly shadow:ShadowRoot;readonly canvas:HTMLCanvasElement;
 private renderer?:Renderer;private raf=0;private started=0;private last=0;private elapsed=0;
 private status:HTMLElement;private meter:HTMLElement;private monster?:Actor;
 private pointer?:{x:number;y:number};private oldFocus:Element|null=document.activeElement;
 private disposed=false;private paused=false;private hiddenAt=0;private done=false;private simulating=false;
 private frameTimes:number[]=[];private endingTimer=0;private replay:HTMLButtonElement;private ready=false;private loading:HTMLImageElement;
 constructor(readonly source:Capture,readonly options:RunOptions,readonly onNavigate:(url:string)=>void,readonly onClose?:()=>void){
  this.root=document.createElement('div');this.root.setAttribute('data-runaway-root','');
  this.root.style.cssText='position:fixed!important;inset:0!important;z-index:2147483647!important;isolation:isolate!important;';
  this.shadow=this.root.attachShadow({mode:'open'});
  this.shadow.innerHTML=`<style>
   :host{all:initial;color-scheme:dark}*{box-sizing:border-box}canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#ecebe2}
   .vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 55% 38%,transparent 38%,#121a1928 100%)}
   .bar{position:absolute;left:28px;right:28px;bottom:24px;display:flex;gap:18px;align-items:center;padding:13px 18px;color:#edf1dc;background:#141d1dee;border:1px solid #ffffff24;border-radius:12px;box-shadow:0 8px 40px #0003;font:12px/1.5 system-ui,sans-serif;backdrop-filter:blur(16px)}
   .brand{font-weight:800;font-size:16px;letter-spacing:.07em}.sub{color:#acb8a9}.status{margin-left:auto}.meter{height:2px;position:absolute;bottom:0;left:0;background:#d9eea0;width:0;transition:none;border-radius:4px}
   button{font:inherit;background:#e1eead;color:#1d2824;border:0;padding:8px 13px;border-radius:6px;cursor:pointer;white-space:nowrap}button.secondary{background:#ffffff12;color:#edf1dc}button:focus-visible{outline:2px solid #d7f795;outline-offset:3px}button:disabled{opacity:.4;cursor:default}.details{position:absolute;top:22px;left:28px;color:#34433d;background:#f4f5e6d9;border:1px solid #323f3020;border-radius:20px;padding:7px 13px;font:11px/1.4 system-ui;backdrop-filter:blur(10px)}
   @media(max-width:650px){.bar{left:12px;right:12px;bottom:12px;gap:8px;padding:10px;flex-wrap:wrap}.sub{display:none}.brand{font-size:14px}.status{font-size:11px}.details{left:12px;top:12px}}
   </style><canvas aria-label="網頁正在聚成雙重曝光的人群，逃離怪獸"></canvas><div class="vignette"></div><div class="details">這一頁，即將失控。</div><div class="bar" role="region" aria-label="失控演出控制"><span class="brand">失控</span><span class="sub">移動滑鼠，引導怪獸</span><span class="status" role="status" aria-live="polite">準備中</span><button class="secondary pause" disabled>暫停</button><button class="replay" disabled>重播</button><button class="secondary close">恢復網頁 · Esc</button><div class="meter"></div></div>`;
  this.canvas=this.shadow.querySelector('canvas')!;this.status=this.shadow.querySelector('.status')!;this.meter=this.shadow.querySelector('.meter')!;this.replay=this.shadow.querySelector('.replay')!;
  this.loading=document.createElement('img');this.loading.alt='';this.loading.src=source.screenshot;this.loading.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';this.canvas.after(this.loading);
  this.shadow.querySelector('.close')!.addEventListener('click',()=>this.close());this.replay.addEventListener('click',()=>this.start());
  this.shadow.querySelector('.pause')!.addEventListener('click',()=>this.pause());
  this.canvas.addEventListener('pointermove',e=>{this.pointer={x:e.clientX*this.source.width/innerWidth,y:e.clientY*this.source.height/innerHeight};});
  this.canvas.addEventListener('pointerleave',()=>{this.pointer=undefined;});
  this.canvas.addEventListener('webglcontextlost',this.contextLost);
  this.root.addEventListener('wheel',e=>e.preventDefault(),{passive:false});this.root.style.touchAction='none';
  document.addEventListener('keydown',this.key,true);document.addEventListener('visibilitychange',this.visibility);window.addEventListener('resize',this.resize);window.addEventListener('pagehide',this.pagehide);
  document.documentElement.append(this.root);this.root.tabIndex=-1;this.root.focus();
 }
 private key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.close();}else if(e.code==='Space'&&e.target===this.root&&!(e.composedPath()[0] instanceof HTMLButtonElement)){e.preventDefault();this.pause();}else if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)){e.preventDefault();}};
 private resize=()=>this.close(); // Snapshot coordinates are fixed; resizing restores immediately instead of distorting the source.
 private pagehide=()=>this.close();
 private contextLost=(e:Event)=>{e.preventDefault();if(!this.disposed){this.status.textContent='圖形連線中斷，請恢復網頁後重試';this.done=true;cancelAnimationFrame(this.raf);this.replay.disabled=true;}};
 private visibility=()=>{if(document.hidden){this.hiddenAt=performance.now();cancelAnimationFrame(this.raf);}else if(!this.done&&!this.paused&&this.ready){this.started+=performance.now()-this.hiddenAt;this.last=performance.now();this.raf=requestAnimationFrame(this.tick);}};
 async init(){
  try{this.renderer=new Renderer(this.canvas,this.source,this.shadow);await this.renderer.init(this.options.ending==='target'?this.options.target:undefined);if(this.disposed){this.renderer.dispose();return;}
   const r=this.renderer;this.shadow.querySelector('.details')!.textContent=`DOUBLE EXPOSURE  /  ${this.source.blocks.length} 個區塊，${r.actors.length} 個逃難者`;
   this.root.dataset.nativeCount=String(r.nativeCount);this.root.dataset.snapshotCount=String(r.snapshotCount);this.root.dataset.regionCount=String(this.source.blocks.length);this.root.dataset.renderer='gif-atlas';this.ready=true;this.replay.disabled=false;(this.shadow.querySelector('.pause') as HTMLButtonElement).disabled=false;this.start();
  }catch(e){this.renderer?.dispose();if(this.disposed)return;this.status.textContent=e instanceof Error?e.message:String(e);throw e;}
 }
 start(){
  if(!this.ready||this.disposed||!this.renderer)return;clearTimeout(this.endingTimer);cancelAnimationFrame(this.raf);this.done=false;this.paused=false;this.elapsed=0;this.pointer=undefined;this.frameTimes=[];
  for(const a of this.renderer.actors){a.x=a.block.x+a.block.w/2;a.y=a.block.y+a.block.h/2;a.vx=a.vy=0;a.walkTime=0;a.direction=a.x>this.source.width*.3?1:-1;}
  const first=[...this.renderer.actors].filter(a=>a.block.kind==='text').sort((a,b)=>b.block.text.length-a.block.text.length)[0]||this.renderer.actors[0];this.monster={...first,size:this.source.height*.70,x:-this.source.height*.38,y:this.source.height*.43,vx:0,vy:0,delay:0,direction:1,walkTime:0};
  this.started=this.last=performance.now();this.root.dataset.phase='察覺異常';this.status.textContent='察覺異常';this.root.dataset.state='running';this.shadow.querySelector('.pause')!.textContent='暫停';this.raf=requestAnimationFrame(this.tick);
 }
 pause(){if(!this.ready||this.done||this.disposed)return;this.paused=!this.paused;if(this.paused){cancelAnimationFrame(this.raf);this.elapsed=(performance.now()-this.started)/1000;}else{this.started=performance.now()-this.elapsed*1000;this.last=performance.now();this.raf=requestAnimationFrame(this.tick);}this.root.dataset.state=this.paused?'paused':'running';this.shadow.querySelector('.pause')!.textContent=this.paused?'繼續':'暫停';}
 private tick=(now:number)=>{
  if(this.disposed||!this.renderer||!this.monster||this.paused||document.hidden||this.done)return;
  const t=(now-this.started)/1000,frameMs=now-this.last,dt=clamp(frameMs/1000,.001,.05),duration=this.options.duration||15,w=this.source.width,h=this.source.height;
  this.last=now;this.elapsed=t;if(t>1&&t<duration-1)this.frameTimes.push(frameMs);
  const mx=this.pointer?.x??w*(.22+.42*clamp(t/duration)),my=clamp(this.pointer?.y??h*.43,h*.34,h*.52),m=this.monster;
  const arrival=smooth(.6,2.8,t),desiredX=-m.size*.5+(mx+m.size*.5)*arrival;
  m.vx+=(desiredX-m.x)*dt*5;m.vy+=(my-m.y)*dt*5;m.vx*=Math.exp(-dt*5);m.vy*=Math.exp(-dt*5);m.x+=clamp(m.vx,-w*.45,w*.45)*dt*5;m.y+=clamp(m.vy,-h*.35,h*.35)*dt*5;m.direction=m.vx<0?-1:1;
  for(let i=0;i<this.renderer.actors.length;i++){
   const a=this.renderer.actors[i],run=smooth(4.1+a.delay,5.6+a.delay,t);if(run<=0)continue;
   const dx=a.x-m.x,dy=a.y-m.y;const danger=Math.hypot(dx,dy)<m.size*.55;
   if(danger&&Math.abs(dx)>20&&t<duration*.7)a.direction=dx>0?1:-1;
   const targetV=a.direction*(48+(i%4)*16+(danger?42:0));a.vx+=(targetV-a.vx)*dt*3;
   const floor=h*(.34+(i%3)*.22);
   a.x+=a.vx*dt*run;a.y+=(floor-a.y)*dt*2*run;a.walkTime+=dt*clamp(Math.abs(a.vx)/(a.size*.5),.35,1.5)*run;
   if(t>duration*.77){a.vx+=a.direction*dt*160;a.x+=a.direction*dt*80;}
  }
  // Separate silhouettes in the same depth lane, preventing multiple people
  // from merging into the ghost-like overlap of the first prototype.
  const crowd=this.renderer.actors;
  for(let i=0;i<crowd.length;i++)for(let j=i+1;j<crowd.length;j++){
   const a=crowd[i],b=crowd[j];if(t<5.5+Math.max(a.delay,b.delay)||Math.abs(a.y-b.y)>h*.08)continue;
   const gap=(a.size+b.size)*.35,dx=b.x-a.x;
   if(Math.abs(dx)<gap){const push=(gap-Math.abs(dx))*.5*Math.min(1,dt*8),sign=dx<0?-1:1;a.x-=push*sign;b.x+=push*sign;}
  }
  if(!this.simulating){this.renderer.frame(t,duration,m);this.loading.remove();}
  const phase=phaseAt(t,duration);if(this.root.dataset.phase!==phase){this.root.dataset.phase=phase;this.status.textContent=phase;}
  this.meter.style.width=`${clamp(t/duration)*100}%`;
  if(t>=duration){this.done=true;this.root.dataset.state='finished';this.status.textContent=this.options.ending==='target'?'終點已成形，即將前往':'全員離場';this.root.dataset.frames=String(this.frameTimes.length);this.root.dataset.fps=String(Math.round(1000/(this.frameTimes.reduce((s,x)=>s+x,0)/Math.max(1,this.frameTimes.length))));
   if(this.options.ending==='target'&&this.options.target)this.endingTimer=window.setTimeout(()=>{if(!this.disposed)this.onNavigate(this.options.target!.url);},900);
   return;
  }
  if(!this.simulating)this.raf=requestAnimationFrame(this.tick);
 };
 /** Used by the local preview's timeline; resets simulation before deterministic stepping. */
 seek(seconds:number){if(!this.ready||!this.renderer)return;this.start();cancelAnimationFrame(this.raf);const target=clamp(seconds,0,this.options.duration||15);this.simulating=true;let current=0;while(current<target&&!this.done){current=Math.min(target,current+1/30);this.started=0;this.last=(current-1/30)*1000;this.tick(current*1000);}this.simulating=false;if(this.monster)this.renderer.frame(target,this.options.duration||15,this.monster);this.paused=true;this.elapsed=target;this.root.dataset.state=this.done?'finished':'paused';this.shadow.querySelector('.pause')!.textContent='繼續';}
 close(){if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);clearTimeout(this.endingTimer);document.removeEventListener('keydown',this.key,true);document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('resize',this.resize);window.removeEventListener('pagehide',this.pagehide);this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.renderer?.dispose();this.root.remove();if(this.oldFocus instanceof HTMLElement&&this.oldFocus.isConnected)this.oldFocus.focus({preventScroll:true});this.onClose?.();}
}
