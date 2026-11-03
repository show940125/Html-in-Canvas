import DOMPurify from 'dompurify';
export interface PageSegment{nodePath:number[];start:number;end:number;}
export interface BookPage{cardId:string;title:string;html:string;text:string;segments:PageSegment[];}
export interface PageSource{cardId:string;title:string;element:HTMLElement;}
function textBoundary(element:Element,offset:number):[Node,number]{const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null,last:Node=element,total=0;while((node=walker.nextNode())){const length=node.textContent?.length||0;last=node;if(total+length>=offset)return[node,offset-total];total+=length;}return[last,last.nodeType===Node.TEXT_NODE?(last.textContent?.length||0):0];}
function fragment(element:HTMLElement,start:number,end:number):HTMLElement{
 const copy=element.cloneNode(false) as HTMLElement,range=document.createRange(),a=textBoundary(element,start),b=textBoundary(element,end);range.setStart(...a);range.setEnd(...b);copy.append(range.cloneContents());
 if(element.tagName==='OL'){let li:Element|null=a[0].parentElement;while(li&&li.parentElement!==element)li=li.parentElement;if(li)copy.setAttribute('start',String((Number(element.getAttribute('start'))||1)+Array.from(element.children).indexOf(li)));}
 return copy;
}
/** DOM is produced by RichContent. Measurement and final pages share typography. */
export async function paginate(sources:PageSource[],host:HTMLElement,width:number,height:number,signal:AbortSignal):Promise<BookPage[]>{
 const box=document.createElement('div');box.className='book-page-body book-typesetter';box.style.width=width+'px';host.append(box);const pages:BookPage[]=[];
 const fits=()=>box.getBoundingClientRect().height<=height-.5;
 let segments:PageSegment[]=[],current:PageSource|undefined,partIndex=0;
 const flush=()=>{if(!box.childNodes.length||!current)return;const html=DOMPurify.sanitize(box.innerHTML,{ADD_ATTR:['target','rel','data-node-index','data-text-start','data-text-end'],ALLOWED_URI_REGEXP:/^(?:(?:https?|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i});pages.push({cardId:current.cardId,title:current.title,html,text:box.textContent||'',segments});box.replaceChildren();segments=[];};
 const append=(node:HTMLElement,nodeIndex:number,start:number,end:number)=>{node.dataset.nodeIndex=String(nodeIndex);node.dataset.textStart=String(start);node.dataset.textEnd=String(end);box.append(node);segments.push({nodePath:[nodeIndex,partIndex],start,end});};
 try{for(const source of sources){if(signal.aborted)throw new DOMException('Pagination cancelled','AbortError');flush();current=source;partIndex=0;
  for(const[index,raw]of Array.from(source.element.children).entries()){
   const original=raw.cloneNode(true) as HTMLElement;
   for(const img of original.querySelectorAll('img')){img.style.maxHeight=Math.max(80,height-70)+'px';img.style.width='auto';img.style.maxWidth='100%';}
   const blocks:HTMLElement[]=[];
   if(original.tagName==='FIGURE'&&original.querySelector('figcaption')){const caption=original.querySelector('figcaption')!;const p=document.createElement('p');p.className='book-caption';p.replaceChildren(...Array.from(caption.childNodes));caption.remove();blocks.push(original,p);}else blocks.push(original);
   let blockOffset=0;
   for(const[part,element]of blocks.entries()){partIndex=part;const text=element.textContent||'',length=text.length;const whole=element.cloneNode(true) as HTMLElement;box.append(whole);
    if(fits()){segments.push({nodePath:[index,part],start:blockOffset,end:blockOffset+length});whole.dataset.nodeIndex=String(index);whole.dataset.textStart=String(blockOffset);whole.dataset.textEnd=String(blockOffset+length);blockOffset+=length;continue;}
    whole.remove();
    // Atomic images are moved intact to a fresh page after size containment.
    if(element.querySelector('img')||!length){flush();append(whole,index,blockOffset,blockOffset+length);if(!fits())throw new Error('這個圖文區塊無法排入閱讀頁，請縮小圖片或視窗放大後重試。');blockOffset+=length;continue;}
    const cuts=[0,...Array.from(new Intl.Segmenter('zh-Hant',{granularity:'grapheme'}).segment(text),s=>s.index+s.segment.length)];let start=0;
    while(start<length){if(signal.aborted)throw new DOMException('Pagination cancelled','AbortError');let lo=cuts.findIndex(n=>n>start),hi=cuts.length-1,best=start;
      while(lo<=hi){const middle=(lo+hi)>>1,end=cuts[middle],part=fragment(element,start,end);box.append(part);const fit=fits();part.remove();if(fit){best=end;lo=middle+1;}else hi=middle-1;}
      if(best===start){if(box.childNodes.length){flush();continue;}throw new Error('頁面高度不足，請放大閱讀視窗。');}
      append(fragment(element,start,best),index,blockOffset+start,blockOffset+best);start=best;if(start<length)flush();
      if(pages.length%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }blockOffset+=length;
   }
  }if(!source.element.children.length)append(document.createElement('p'),0,0,0);flush();}
  return pages;
 }finally{box.remove();}
}
export function findPage(pages:BookPage[],anchor:{cardId:string;nodePath:number[];offset:number}|undefined){if(!anchor)return 0;const index=pages.findIndex(p=>p.cardId===anchor.cardId&&p.segments.some(s=>s.nodePath[0]===anchor.nodePath[0]&&(anchor.nodePath.length<2||s.nodePath[1]===anchor.nodePath[1])&&s.start<=anchor.offset&&(s.end>anchor.offset||s.start===s.end)));return index>=0?index:Math.max(0,pages.findIndex(p=>p.cardId===anchor.cardId));}
