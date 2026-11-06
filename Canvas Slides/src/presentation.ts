// Shared by the sandbox player and the portable HTML player.
export const presentationCss = `
#deck>.slide.dark{background-color:var(--ink)}
#deck>.slide.light{background-color:var(--paper)}
#deck>.slide[data-cs-background]::before,#deck>.slide[data-cs-background]::after{display:none!important}
.cs-free-layer{position:absolute;inset:0;pointer-events:none;z-index:1000}
.cs-free-layer>[data-cs-id]{pointer-events:auto}
`;

export function installPlaybackControls(){
 const w=window as any;
 if(w.__csControlsInstalled)return;
 w.__csControlsInstalled=true;
 const pages=[...document.querySelectorAll<HTMLElement>('#deck>.slide')];
 const originalPlay=w.__playSlide;
 let current=-1,step=0,printing=false;
 const steps=()=>pages[current]?.querySelectorAll<HTMLElement>('[data-anim="step"]')||[];
 function enter(i:number){
  if(printing)return;
  if(current===i&&pages[i]?.dataset.animate==='pipeline')return;
  current=i;step=0;
  const page=pages[i];
  if(page?.dataset.animate!=='pipeline'){originalPlay?.(i);return;}
  // Reduced motion changes the tween, while the click sequence stays intact.
  for(const node of page.querySelectorAll<HTMLElement>('[data-anim]')){
   node.getAnimations().forEach(a=>a.cancel());
   node.style.transform='none';
   node.style.setProperty('opacity',['step','arrow'].includes(node.dataset.anim||'')?'0':'1','important');
  }
  page.dataset.csStep='0';
 }
 w.__playSlide=enter;
 w.__pipeAdvance=()=>{
  const nodes=steps();
  if(pages[current]?.dataset.animate!=='pipeline'||step>=nodes.length)return false;
  const node=nodes[step++];node.style.setProperty('opacity','1','important');
  if(!w.__lowPowerMode&&!matchMedia('(prefers-reduced-motion: reduce)').matches)
   node.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:350,easing:'ease-out'});
  const arrow=pages[current].querySelectorAll<HTMLElement>('[data-anim="arrow"]')[step-2];
  if(arrow)arrow.style.setProperty('opacity','.7','important');
  pages[current].dataset.csStep=String(step);
  return true;
 };
 w.__csAdvance=()=>{const at=Number(w.__currentSlideIndex)||0;if(current!==at)enter(at);if(!w.__pipeAdvance())w.go?.(at+1);};
 const interactive=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('a,button,input,textarea,select,[contenteditable="true"],#ppt-presenter,#overview');
 addEventListener('click',e=>{if(!interactive(e.target)&&(e.target as Element)?.closest('#deck'))w.__csAdvance();});
 addEventListener('keydown',e=>{
  if(interactive(e.target)||e.ctrlKey||e.altKey||e.metaKey)return;
  if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){
   e.preventDefault();e.stopImmediatePropagation();w.__csAdvance();
  }
 },true);
 const saved=new Map<HTMLElement,string|null>();
 addEventListener('beforeprint',()=>{
  printing=true;
  for(const node of document.querySelectorAll<HTMLElement>('[data-anim]')){
   saved.set(node,node.getAttribute('style'));
   node.getAnimations().forEach(a=>a.cancel());
   node.style.setProperty('opacity','1','important');
   node.style.setProperty('transform','none','important');
   node.style.setProperty('translate','none','important');
  }
 });
 addEventListener('afterprint',()=>{
  for(const[node,value]of saved)value===null?node.removeAttribute('style'):node.setAttribute('style',value);
  saved.clear();printing=false;
 });
 enter(Number(w.__currentSlideIndex)||0);
}
