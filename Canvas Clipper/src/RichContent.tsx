import { Fragment, useEffect, useRef } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import { useAssetUrl } from './assets';
import { safeUrl, type RichDoc, type RichNode } from './model';
function DocImage({node}:{node:RichNode}){const a=node.attrs||{},url=useAssetUrl(a.assetId);return <figure className="rich-figure" data-asset-id={a.assetId||undefined} style={{maxWidth:Number(a.width)||600}}>{url?<img src={url} alt={String(a.alt||'文章圖片')} />:<div className="image-placeholder"><span aria-hidden="true">▧</span><p>{a.assetId?'圖片資源遺失':a.status==='failed'?'圖片載入失敗，可重新載入':'圖片尚未下載到本機'}</p><small>{String(a.alt||a.sourceUrl||'')}</small></div>}{!!a.caption&&<figcaption>{String(a.caption)}</figcaption>}</figure>;}
function renderNode(node:RichNode,key:number|string):React.ReactNode{
  let text:React.ReactNode=node.text;
  if(node.type==='text'){for(const m of node.marks||[]){text=m.type==='bold'?<strong>{text}</strong>:m.type==='italic'?<em>{text}</em>:m.type==='code'?<code>{text}</code>:m.type==='highlight'?<mark>{text}</mark>:m.type==='strike'?<s>{text}</s>:m.type==='underline'?<u>{text}</u>:m.type==='link'?<a href={safeUrl(String(m.attrs?.href||''))} target="_blank" rel="noreferrer">{text}</a>:text;}return <Fragment key={key}>{text}</Fragment>;}
  const children=node.content?.map((n,i)=>renderNode(n,i));
  if(node.type==='image')return <DocImage key={key} node={node}/>;
  if(node.type==='heading'){const level=Number(node.attrs?.level)||2;return level===1?<h1 key={key}>{children}</h1>:level===3?<h3 key={key}>{children}</h3>:<h2 key={key}>{children}</h2>;}
  if(node.type==='bulletList')return <ul key={key}>{children}</ul>;
  if(node.type==='orderedList')return <ol key={key} start={Number(node.attrs?.start)||1}>{children}</ol>;
  if(node.type==='listItem')return <li key={key}>{children}</li>;
  if(node.type==='blockquote')return <blockquote key={key}>{children}</blockquote>;
  if(node.type==='codeBlock')return <pre key={key}><code>{children}</code></pre>;
  if(node.type==='hardBreak')return <br key={key}/>;
  if(node.type==='horizontalRule')return <hr key={key}/>;
  return <p key={key}>{children}</p>;
}
export function RichContent({doc,className=''}:{doc:RichDoc;className?:string}){return <div className={'rich-content '+className}>{doc.content.map((n,i)=>renderNode(n,i))}</div>;}
function AssetImageView({node,updateAttributes,selected}:NodeViewProps){const url=useAssetUrl(node.attrs.assetId);return <NodeViewWrapper as="figure" className={'editor-image '+(selected?'selected':'')} contentEditable={false} style={{maxWidth:Number(node.attrs.width)||600}}>{url?<img src={url} alt={node.attrs.alt||'文章圖片'}/>:<div className="image-placeholder">▧ 圖片尚未保存到本機</div>}<input aria-label="圖片圖說" value={node.attrs.caption||''} placeholder="圖片圖說…" onChange={e=>updateAttributes({caption:e.target.value})}/>{selected&&<label className="image-width">圖片寬度<input aria-label="圖片寬度" type="range" min="80" max="1000" value={Number(node.attrs.width)||600} onChange={e=>updateAttributes({width:Number(e.target.value)})}/></label>}</NodeViewWrapper>;}
const AssetImage=Image.extend({
  addAttributes(){return {...this.parent?.(),assetId:{default:''},sourceUrl:{default:'',parseHTML:el=>safeUrl(el.getAttribute('src')||'')},caption:{default:''},width:{default:600},status:{default:'pending'}};},
  addNodeView(){return ReactNodeViewRenderer(AssetImageView);},
});
interface EditorProps{doc:RichDoc;onChange:(doc:RichDoc)=>void;label?:string;compact?:boolean;}
export function RichEditor({doc,onChange,label='整理圖文',compact=false}:EditorProps){
  const callback=useRef(onChange);callback.current=onChange;
  const last=useRef('');
  const editor=useEditor({extensions:[StarterKit.configure({heading:{levels:[1,2,3]},link:{openOnClick:false,isAllowedUri:url=>!!safeUrl(url)}}),AssetImage.configure({allowBase64:false}),Highlight],content:doc,immediatelyRender:true,shouldRerenderOnTransaction:true,editorProps:{attributes:{'aria-label':label,role:'textbox','aria-multiline':'true',class:'rich-editor-content'}},onUpdate:({editor})=>{const next=editor.getJSON() as RichDoc;last.current=JSON.stringify(next);callback.current(next);}},[]);
  useEffect(()=>{if(editor){const value=JSON.stringify(doc);if(value!==last.current&&value!==JSON.stringify(editor.getJSON()))editor.commands.setContent(doc,{emitUpdate:false});}},[doc,editor]);
  if(!editor)return null;
  return <div className={'rich-editor '+(compact?'compact':'')}><div className="rich-toolbar" aria-label="文字格式" onMouseDown={e=>e.preventDefault()}>
    <button aria-label="粗體" aria-pressed={editor.isActive('bold')} onClick={()=>editor.chain().focus().toggleBold().run()}><b>B</b></button>
    <button aria-label="斜體" aria-pressed={editor.isActive('italic')} onClick={()=>editor.chain().focus().toggleItalic().run()}><i>I</i></button>
    <button aria-label="標題" aria-pressed={editor.isActive('heading')} onClick={()=>editor.chain().focus().toggleHeading({level:2}).run()}>H</button>
    <button aria-label="清單" aria-pressed={editor.isActive('bulletList')} onClick={()=>editor.chain().focus().toggleBulletList().run()}>☷</button>
    <button aria-label="標記重點" aria-pressed={editor.isActive('highlight')} onClick={()=>editor.chain().focus().toggleHighlight().run()}>重點</button>
    <button aria-label="編輯連結" onClick={()=>{const href=window.prompt('連結網址（留空移除）',editor.getAttributes('link').href||'');if(href===null)return;if(!href)editor.chain().focus().unsetLink().run();else if(safeUrl(href))editor.chain().focus().extendMarkRange('link').setLink({href:safeUrl(href)}).run();}}>↗</button>
    <button aria-label="復原文字" onClick={()=>editor.chain().focus().undo().run()}>↶</button><button aria-label="重做文字" onClick={()=>editor.chain().focus().redo().run()}>↷</button>
  </div><EditorContent editor={editor}/></div>;
}
