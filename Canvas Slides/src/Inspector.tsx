import {Icon} from './icons';
import type {Deck} from './model';

export type Layer={id:string;tag:string;text:string;depth:number;locked:boolean};
export type Selection=Layer&{
 x:number;y:number;width:number;height:number;fontSize:number;fontFamily:string;color:string;opacity:number;rotate:number;
 free:boolean;group:boolean;fit:string;position:string;weight:number;italic:boolean;align:string;
};
export const colorHex=(value='')=>{
 const parts=value.match(/[\d.]+/g);
 return parts?.length&&value.startsWith('rgb')?'#'+parts.slice(0,3).map(n=>Math.round(Number(n)).toString(16).padStart(2,'0')).join(''):'#111111';
};
const textTags=/^(h[1-6]|p|span|li|blockquote|a|strong|em|figcaption)$/;
const styleFamilies=[['system-ui','系統無襯線'],['Georgia','Georgia / 襯線'],['monospace','等寬字體'],['Microsoft JhengHei','微軟正黑體']];
const magazineThemes=[['ink-classic','經典墨色','#111111'],['indigo-porcelain','靛藍瓷色','#315d93'],['forest-ink','森林墨','#2a543b'],['kraft-paper','牛皮紙','#a16c22'],['dune','沙丘','#a99572']];
const swissThemes=[['ikb','克萊因藍','#002fa7'],['lemon','檸檬黃','#f5e400'],['lemon-green','檸檬綠','#c1e800'],['safety-orange','亮橘','#ff5800']];

export function Inspector({deck,layers,selection,tab,setTab,background,resize,setTheme,replaceImage,perform}:{
 deck:Deck;layers:Layer[];selection:Selection[];tab:'properties'|'layers';setTab:(tab:'properties'|'layers')=>void;
 background:string;resize:(width:number,height:number)=>void;setTheme:(name:string)=>void;
 replaceImage:()=>void;perform:(command:string,payload?:unknown)=>void;
}){
 const selected=selection[0],multi=selection.length>1;
 const locked=selection.some(item=>item.locked);
 const page=selected?.tag==='section'&&layers[0]?.id===selected.id;
 const text=selected&&textTags.test(selected.tag);
 const image=selected?.tag==='img';
 const style=(key:string,value:string)=>perform('style',{[key]:value});
 const font=selected?.fontFamily||'';
 const family=font.includes('monospace')?'monospace':font.includes('JhengHei')?'Microsoft JhengHei':font.includes('serif')&&!font.includes('sans-serif')?'Georgia':'system-ui';
 const number=(value:string,min:number,max:number,apply:(n:number)=>void)=>{
  if(value.trim()&&Number.isFinite(Number(value)))apply(Math.min(max,Math.max(min,Number(value))));
 };
 return <>
  <div className="inspector-tabs" role="tablist" aria-label="編輯面板" onKeyDown={event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   const target=event.key==='Home'?'properties':event.key==='End'?'layers':tab==='properties'?'layers':'properties';
   setTab(target);
   event.currentTarget.querySelector<HTMLElement>(`#tab-${target}`)?.focus();
  }}>
   <button role="tab" id="tab-properties" aria-controls="inspector-panel" aria-selected={tab==='properties'} tabIndex={tab==='properties'?0:-1} className={tab==='properties'?'active':''} onClick={()=>setTab('properties')}>屬性</button>
   <button role="tab" id="tab-layers" aria-controls="inspector-panel" aria-selected={tab==='layers'} tabIndex={tab==='layers'?0:-1} className={tab==='layers'?'active':''} onClick={()=>setTab('layers')}>圖層</button>
  </div>
  <div role="tabpanel" id="inspector-panel" aria-labelledby={`tab-${tab}`}>
  {tab==='layers'?<div className="layer-list">{layers.map(layer=><button key={layer.id} data-layer-id={layer.id}
   aria-pressed={selection.some(s=>s.id===layer.id)} className={selection.some(s=>s.id===layer.id)?'selected':''}
   style={{paddingLeft:12+Math.min(layer.depth,5)*8}} title={layer.text}
   onClick={event=>perform('select',event.shiftKey?(selection.some(s=>s.id===layer.id)?selection.filter(s=>s.id!==layer.id).map(s=>s.id):[...selection.map(s=>s.id),layer.id]):[layer.id])}>
   <Icon name={layer.tag==='img'?'image':textTags.test(layer.tag)?'text':'layers'} size={15}/><span>{layer.text||layer.tag}</span>{layer.locked&&<Icon name="lock" size={12}/>}
  </button>)}</div>:(!selected||page)?<>
   <section className="property-section">
    <h2>投影片設定</h2>
    <label className="field-label">投影片比例<select aria-label="投影片比例" value={`${deck.width}x${deck.height}`} onChange={event=>{
     const [w,h]=event.target.value.split('x').map(Number);resize(w,h);
    }}>
     <option value="1280x720">16:9 寬螢幕</option><option value="960x720">4:3 標準</option>
     {!['1280x720','960x720'].includes(`${deck.width}x${deck.height}`)&&<option value={`${deck.width}x${deck.height}`}>{deck.width} × {deck.height}</option>}
    </select></label>
    <label className="field-label">頁面背景<input aria-label="頁面背景" type="color" value={background} onChange={e=>perform('background',e.target.value)}/></label>
   </section>
   {deck.family!=='generic'&&<section className="property-section"><h2>投影片主題</h2><div className="theme-swatches">
    {(deck.family==='magazine'?magazineThemes:swissThemes).map(([name,label,color])=><button key={name} title={label} aria-label={label} aria-pressed={deck.rootAttrs['data-theme']===name} style={{background:color}} onClick={()=>setTheme(name)}/>)}
   </div></section>}
  </>:<>
   <section className="property-section">
    <h2 className="object-heading">{multi?`已選取 ${selection.length} 個物件`:image?'圖片':selected.group?'群組':text?`文字 · ${selected.text||'文字物件'}`:'區塊'}</h2>
    {!multi&&<p className="quiet">{selected.locked?'已鎖定':selected.free?'自由物件':'原始排版'}</p>}
    {!multi&&text&&<fieldset disabled={locked}>
     <label className="field-label">字體<select value={family} onChange={e=>style('font-family',e.target.value)}>{styleFamilies.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <div className="property-row">
      <label>字級<input aria-label="字級" type="number" min="8" max="400" value={Math.round(selected.fontSize)} onChange={e=>number(e.target.value,8,400,n=>style('font-size',n+'px'))}/></label>
      <label>文字色<input aria-label="文字顏色" type="color" value={colorHex(selected.color)} onChange={e=>style('color',e.target.value)}/></label>
     </div>
     <div className="segmented">
      <button aria-pressed={selected.weight>=600} onClick={()=>style('font-weight',selected.weight>=600?'400':'700')}>粗體</button>
      <button aria-pressed={selected.italic} onClick={()=>style('font-style',selected.italic?'normal':'italic')}>斜體</button>
      <select aria-label="文字對齊" value={selected.align==='center'?'center':['right','end'].includes(selected.align)?'right':'left'} onChange={e=>style('text-align',e.target.value)}>
       <option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option>
      </select>
     </div>
    </fieldset>}
    {!multi&&image&&<fieldset disabled={locked}>
     <button onClick={replaceImage}>替換圖片</button>
     <label className="field-label">圖片填滿<select value={selected.fit} onChange={e=>style('object-fit',e.target.value)}>
      <option value="cover">裁切填滿</option><option value="contain">完整顯示</option><option value="fill">拉伸</option><option value="none">原始尺寸</option><option value="scale-down">縮小至可容納</option>
     </select></label>
     <label className="field-label">裁切焦點<select value={({'50% 50%':'center','50% 0%':'top','50% 100%':'bottom','0% 50%':'left','100% 50%':'right'} as Record<string,string>)[selected.position]??'custom'} onChange={e=>style('object-position',e.target.value)}>
      <option value="custom" disabled>自訂位置</option><option value="center">中央</option><option value="top">頂部</option><option value="bottom">底部</option><option value="left">左側</option><option value="right">右側</option>
     </select></label>
    </fieldset>}
   </section>
   <section className="property-section"><h2>排列</h2>
    {!multi&&(!selected.free?<><p className="quiet">此物件隨原版型排列。</p><button disabled={locked} onClick={()=>perform('detach')}>轉成自由物件</button></>:<fieldset disabled={locked}>
     <div className="position-grid">{([['X','x'],['Y','y'],['W','width'],['H','height']] as const).map(([label,key])=><label key={key}>{label}<input aria-label={`物件 ${label}`} type="number" value={Math.round(selected[key])}
      onChange={e=>number(e.target.value,['width','height'].includes(key)?1:-8192,8192,n=>perform('geometry',{[key]:n}))}/></label>)}</div>
     <div className="property-row">
      <label>旋轉<input aria-label="旋轉角度" type="number" value={Math.round(selected.rotate)} onChange={e=>number(e.target.value,-360,360,n=>style('rotate',n+'deg'))}/></label>
      <label>不透明度<input aria-label="不透明度" type="number" min="0" max="100" value={Math.round(selected.opacity*100)} onChange={e=>number(e.target.value,0,100,n=>style('opacity',String(n/100)))}/></label>
     </div>
    </fieldset>)}
    {multi&&<div className="arrange-grid">{[['left','左對齊'],['center','水平置中'],['right','右對齊'],['top','頂部對齊'],['middle','垂直置中'],['bottom','底部對齊']].map(([value,label])=><button key={value} disabled={locked} onClick={()=>perform('align',value)}>{label}</button>)}</div>}
    <div className="property-row"><button disabled={locked} onClick={()=>perform('order','front')}>往前一層</button><button disabled={locked} onClick={()=>perform('order','back')}>往後一層</button></div>
    {multi&&<button disabled={locked} onClick={()=>perform('group')}>群組</button>}
    {!multi&&selected.group&&<button disabled={locked} onClick={()=>perform('ungroup')}>解散群組</button>}
   </section>
   <section className="property-section inspector-actions">
    <button aria-label="複製物件" disabled={locked} onClick={()=>perform('duplicate')}>複製</button>
    <button aria-label="鎖定或解鎖物件" onClick={()=>perform('lock',!locked)}>{locked?'解鎖':'鎖定'}</button>
    <button aria-label="刪除物件" disabled={locked} onClick={()=>perform('delete')}>刪除</button>
   </section>
  </>}
  </div>
 </>;
}
