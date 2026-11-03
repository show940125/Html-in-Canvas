import DOMPurify from 'dompurify';
import { docText, safeUrl, validateDoc, type RichDoc, type RichNode } from './model';
const blockTypes=new Set(['paragraph','heading','bulletList','orderedList','listItem','blockquote','horizontalRule','codeBlock','image']);
function blocks(nodes:RichNode[]):RichNode[]{const out:RichNode[]=[],inline:RichNode[]=[];const flush=()=>{if(inline.some(n=>n.type!=='text'||n.text?.trim()))out.push({type:'paragraph',content:inline.splice(0)});else inline.length=0;};for(const n of nodes){if(blockTypes.has(n.type)){flush();out.push(n);}else inline.push(n);}flush();return out;}
export function htmlToDoc(html:string,baseUrl:string):RichDoc{
  const clean=DOMPurify.sanitize(html,{ALLOWED_TAGS:['p','div','section','article','main','span','br','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','b','em','i','u','s','a','blockquote','pre','code','hr','figure','figcaption','img'],ALLOWED_ATTR:['href','src','alt','title','start'],ALLOW_DATA_ATTR:false,RETURN_DOM_FRAGMENT:true});
  const resolve=(s:string|null)=>{try{return s?safeUrl(new URL(s,baseUrl).href):'';}catch{return '';}};
  function convert(n:Node,marks:NonNullable<RichNode['marks']>=[]):RichNode[]{
    if(n.nodeType===Node.TEXT_NODE){const text=(n.textContent||'').replace(/[\t\r\n ]+/g,' ');return text?[{type:'text',text,...(marks.length?{marks}: {})}]:[];}
    if(!(n instanceof HTMLElement))return Array.from(n.childNodes).flatMap(c=>convert(c,marks));
    const tag=n.tagName.toLowerCase();
    if(tag==='figcaption')return[];
    if(tag==='img'){const sourceUrl=resolve(n.getAttribute('src'));return sourceUrl?[{type:'image',attrs:{assetId:'',sourceUrl,alt:n.getAttribute('alt')||'',caption:n.closest('figure')?.querySelector('figcaption')?.textContent||'',width:600,status:'pending'}}]:[];}
    if(tag==='br')return[{type:'hardBreak'}];if(tag==='hr')return[{type:'horizontalRule'}];
    const markType=({b:'bold',strong:'bold',em:'italic',i:'italic',u:'underline',s:'strike',code:'code'} as Record<string,string>)[tag];
    const next=markType?[...marks,{type:markType}]:tag==='a'&&resolve(n.getAttribute('href'))?[...marks,{type:'link',attrs:{href:resolve(n.getAttribute('href')),target:'_blank',rel:'noreferrer'}}]:marks;
    const children=Array.from(n.childNodes).flatMap(c=>convert(c,next));
    if(/^h[1-6]$/.test(tag))return[{type:'heading',attrs:{level:Math.min(3,Number(tag[1]))},content:children.filter(c=>!blockTypes.has(c.type))}];
    if(tag==='p')return blocks(children).length?blocks(children):[{type:'paragraph',content:[]}];
    if(tag==='ul'||tag==='ol')return[{type:tag==='ul'?'bulletList':'orderedList',attrs:tag==='ol'?{start:Number(n.getAttribute('start'))||1}:undefined,content:children.filter(c=>c.type==='listItem')}];
    if(tag==='li'||tag==='blockquote')return[{type:tag==='li'?'listItem':'blockquote',content:blocks(children)}];
    if(tag==='pre')return[{type:'codeBlock',content:[{type:'text',text:n.textContent||''}]}];
    return children;
  }
  const content=blocks(Array.from(clean.childNodes).flatMap(n=>convert(n)));
  const doc=validateDoc({type:'doc',content:content.length?content:[{type:'paragraph',content:[]}]});
  if(docText(doc).length>500_000)throw new Error('文章超過文字上限。');return doc;
}
