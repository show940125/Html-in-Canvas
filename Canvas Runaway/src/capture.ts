import type {Block, Capture} from './model';
interface Mark { node: HTMLElement | SVGElement; had: string | null; visibility?:{value:string;priority:string}; }
let marks: Mark[] = [];
const SKIP='[data-runaway-root],script,style,noscript,template,textarea,input,select,[contenteditable="true"],[hidden]';
const TEXT_ROOT='[data-testid="tweetText"],[data-ad-preview="message"],p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,[role="paragraph"],[role="heading"],[role="button"],button';
function visible(el:Element):boolean {
  if(el.closest(SKIP))return false;
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);
  if(r.width<2||r.height<6||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth||s.visibility==='hidden'||s.display==='none')return false;
  return typeof el.checkVisibility!=='function'||el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
}
/** Social sites commonly use nested div/span nodes instead of paragraphs. */
function textRoot(parent:HTMLElement):HTMLElement {
  const semantic=parent.closest<HTMLElement>(TEXT_ROOT);
  if(semantic&&semantic!==document.body)return semantic;
  let node=parent;
  for(let i=0;i<6&&node.parentElement&&node.parentElement!==document.body;i++){
    const display=getComputedStyle(node).display;
    if(!['inline','contents','inline-block'].includes(display))return node;
    node=node.parentElement;
  }
  return parent;
}
export function restoreCapture() {
  for (const {node, had,visibility} of marks) {
    if(visibility){if(visibility.value)node.style.setProperty('visibility',visibility.value,visibility.priority);else node.style.removeProperty('visibility');}
    if (had === null) node.removeAttribute('data-runaway-capture'); else node.setAttribute('data-runaway-capture', had);
  }
  marks = [];
}
export function collect(): Omit<Capture, 'screenshot' | 'clean'> {
  restoreCapture();
  if (innerWidth > 10000 || innerHeight > 10000) throw new Error('目前視窗太大，請縮小後再試。');
  const nodes=new Set<HTMLElement>();
  const roots:(HTMLElement|ShadowRoot)[]=[document.body];
  // Open shadow roots can be read; cross-origin frame contents remain image material.
  for(const el of document.body.querySelectorAll<HTMLElement>('*'))if(el.shadowRoot&&!el.closest('[data-runaway-root]'))roots.push(el.shadowRoot);
  let visited=0;
  for(const root of roots){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let text:Node|null;
    while((text=walker.nextNode())&&visited++<30000){
      if(!text.textContent?.trim())continue;
      const parent=text.parentElement;
      if(!parent||parent.namespaceURI!=='http://www.w3.org/1999/xhtml'||!visible(parent))continue;
      const range=document.createRange();range.selectNodeContents(text);const r=range.getBoundingClientRect();
      if(r.width<1||r.height<1||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue;
      const el=textRoot(parent);if(el!==document.body&&el!==document.documentElement&&visible(el))nodes.add(el);
    }
    for(const el of root.querySelectorAll<HTMLElement>('img,svg,canvas,video,iframe'))if(visible(el))nodes.add(el);
  }
  const candidates=[...nodes].sort((a,b)=>{
    const priority=(e:Element)=>e.matches('[data-testid="tweetText"],[data-ad-preview="message"]')?1:0;
    return priority(b)-priority(a)||a.getBoundingClientRect().top-b.getBoundingClientRect().top;
  });
  const chosen: HTMLElement[] = [];
  for (const el of candidates) {
    if (chosen.some(x => x.contains(el) || el.contains(x))) continue;
    chosen.push(el); if (chosen.length >= 160) break;
  }
  chosen.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
  const blocks: Block[] = chosen.map((el,i) => {
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    marks.push({node:el,had:el.getAttribute('data-runaway-capture')}); el.setAttribute('data-runaway-capture',String(i));
    const x=Math.max(0,r.left),y=Math.max(0,r.top);
    return {x,y,w:Math.max(1,Math.min(innerWidth,r.right)-x),h:Math.max(1,Math.min(innerHeight,r.bottom)-y),text:(el.innerText||el.textContent||'').trim().slice(0,5000),color:s.color,font:s.fontFamily,size:Math.min(500,Math.max(1,parseFloat(s.fontSize)||18)),kind:['IMG','CANVAS','SVG','VIDEO','IFRAME'].includes(el.tagName.toUpperCase())?'image':'text'};
  });
  if (!blocks.length) throw new Error('眼前沒有可成形的網頁內容，請捲到有文字或圖片的區域。');
  let background=getComputedStyle(document.body).backgroundColor;
  if(background==='rgba(0, 0, 0, 0)')background=getComputedStyle(document.documentElement).backgroundColor;
  if(background==='rgba(0, 0, 0, 0)')background='#f4f1e8';
  return {version:1,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,url:location.href,title:document.title.slice(0,1000),background,blocks,capturedAt:new Date().toISOString()};
}
export function hideForCleanPlate() {
  for(const mark of marks){
    mark.visibility??={value:mark.node.style.getPropertyValue('visibility'),priority:mark.node.style.getPropertyPriority('visibility')};
    mark.node.style.setProperty('visibility','hidden','important');
  }
}
