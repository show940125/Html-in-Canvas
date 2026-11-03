export interface RichNode { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: RichNode[] }
export interface RichDoc { type: 'doc'; content: RichNode[] }
export interface Clip {
  id: string; kind: 'selection' | 'article' | 'manual'; title: string;
  originalText: string; workingText: string; originalDoc: RichDoc; editedDoc: RichDoc;
  note: string; url: string; capturedAt: string; x: number; y: number;
  groupId?: string; tagIds: string[];
}
export interface Group { id: string; title: string; color: string; x: number; y: number; width: number; height: number; collapsed: boolean }
export interface Tag { id: string; title: string; color: string }
export const RELATION_KINDS = ['支持', '質疑', '補充', '相關'] as const;
export interface Relation { id: string; from: string; to: string; kind: typeof RELATION_KINDS[number]; label: string }
export interface Project {
  id: string; title: string; updatedAt: string; cards: Clip[];
  groups: Group[]; tags: Tag[]; relations: Relation[];
  outline: { groupIds: string[]; cardIds: string[] };
  view: { x: number; y: number; zoom: number };
  print: { fontSize: number; lineHeight: number; includeGraph: boolean };
}
export interface Capture { kind: Clip['kind']; title: string; text: string; url: string; capturedAt: string; doc?: RichDoc }
export const MAX_TEXT = 500_000;
export const GROUP_COLORS = ['#dde8cb', '#d9e8ed', '#ede1cf', '#e5dcef', '#eadce0'];
export function textDoc(text: string): RichDoc { return { type: 'doc', content: text.split(/\n\s*\n/).map(p => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] })) }; }
export function docText(doc: RichDoc): string {
  const walk = (node: RichNode): string => node.type === 'text' ? node.text || '' : node.type === 'hardBreak' ? '\n' : (node.content || []).map(walk).join('') + (['paragraph','heading','listItem','blockquote','codeBlock'].includes(node.type) ? '\n\n' : '');
  return walk(doc).replace(/\n{3,}/g, '\n\n').trim();
}
export function walkImages(doc: RichDoc): RichNode[] { const found: RichNode[]=[]; const walk=(n:RichNode)=>{if(n.type==='image')found.push(n);n.content?.forEach(walk);}; walk(doc);return found; }
export function mapImages(doc: RichDoc, edit: (attrs: Record<string,unknown>) => Record<string,unknown>): RichDoc {
  const walk=(n:RichNode):RichNode=>({...n,...(n.type==='image'?{attrs:edit(n.attrs||{})}:{}),...(n.content?{content:n.content.map(walk)}:{})});
  return walk(doc) as RichDoc;
}
export function newProject(title = '我的摘錄'): Project {
  return { id: crypto.randomUUID(), title, updatedAt: new Date().toISOString(), cards: [], groups: [], tags: [], relations: [], outline: { groupIds: [], cardIds: [] }, view: { x: 0, y: 0, zoom: 1 }, print: { fontSize: 12, lineHeight: 1.6, includeGraph: true } };
}
export function safeUrl(value: string): string {
  if (!value) return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function validateDoc(value: unknown): RichDoc {
  let count=0;
  const allowed = new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','blockquote','hardBreak','horizontalRule','codeBlock','image']);
  function node(value: unknown, depth=0): RichNode {
    if (!value || typeof value !== 'object' || depth>30 || ++count>100_000) throw new Error('圖文內容過大或格式不正確。');
    const n=value as RichNode;
    if(!allowed.has(n.type))throw new Error('圖文內容含不支援的區塊。');
    const out:RichNode={type:n.type};
    if(n.type==='text'){if(typeof n.text!=='string'||n.text.length>MAX_TEXT)throw new Error('文字區塊無效。');out.text=n.text;}
    if(n.content){if(!Array.isArray(n.content))throw new Error('區塊內容格式不正確。');out.content=n.content.map(c=>node(c,depth+1));}
    if(n.type==='heading')out.attrs={level:[1,2,3].includes(Number(n.attrs?.level))?Number(n.attrs?.level):2};
    if(n.type==='orderedList')out.attrs={start:Math.max(1,Math.min(10000,Number(n.attrs?.start)||1))};
    if(n.type==='image'){
      const a=n.attrs||{}, assetId=typeof a.assetId==='string'?a.assetId:'';
      if(assetId&&!/^[a-f0-9]{64}$/.test(assetId))throw new Error('圖片資源 ID 無效。');
      const sourceUrl=typeof a.sourceUrl==='string'?safeUrl(a.sourceUrl):'';
      const width=Number(a.width);
      out.attrs={assetId,sourceUrl,alt:String(a.alt||'').slice(0,1000),caption:String(a.caption||'').slice(0,2000),width:Number.isFinite(width)?Math.max(80,Math.min(1200,width)):600,status:assetId?'ready':String(a.status||'pending').slice(0,20)};
    }
    if(n.marks){if(!Array.isArray(n.marks))throw new Error('文字標記格式不正確。');out.marks=n.marks.filter(m=>['bold','italic','strike','code','highlight','link','underline'].includes(m.type)).map(m=>m.type==='link'?{type:'link',attrs:{href:safeUrl(String(m.attrs?.href||'')),target:'_blank',rel:'noreferrer'}}:{type:m.type});}
    return out;
  }
  const doc=node(value);
  if(doc.type!=='doc'||!Array.isArray(doc.content)||docText(doc as RichDoc).length>MAX_TEXT)throw new Error('文件格式不正確或超過 50 萬字元。');
  return doc as RichDoc;
}
export function validateCapture(value: unknown): Capture {
  if (!value || typeof value !== 'object') throw new Error('摘錄資料格式不正確。');
  const v = value as Record<string, unknown>;
  if (!['selection', 'article', 'manual'].includes(String(v.kind)) || typeof v.text !== 'string' || (!v.text.trim() && !v.doc) || v.text.length > MAX_TEXT || typeof v.title !== 'string' || v.title.length > 1000 || typeof v.url !== 'string' || typeof v.capturedAt !== 'string' || !Number.isFinite(Date.parse(v.capturedAt))) throw new Error('摘錄必須含有效文字或圖片、標題與時間，每張最多 50 萬字元。');
  if (v.url && !safeUrl(v.url)) throw new Error('來源網址須為 HTTP 或 HTTPS。');
  return { kind: v.kind as Capture['kind'], title: v.title.trim() || '未命名摘錄', text: v.text.replace(/\r\n?/g, '\n').trim(), url: safeUrl(v.url), capturedAt: v.capturedAt, ...(v.doc?{doc:validateDoc(v.doc)}:{}) };
}
export function createClip(capture: Capture, index: number): Clip {
  const doc=capture.doc||textDoc(capture.text);
  return { id: crypto.randomUUID(), kind: capture.kind, title: capture.title, originalText: capture.text, workingText: capture.text, originalDoc: structuredClone(doc), editedDoc: structuredClone(doc), note: '', url: capture.url, capturedAt: capture.capturedAt, x: 48 + index % 3 * 344, y: 48 + Math.floor(index / 3) * 416, tagIds: [] };
}
export function normalizeProject(p: Project): Project {
  return { ...p, groups:p.groups||[],tags:p.tags||[],relations:p.relations||[],outline:p.outline||{groupIds:[],cardIds:p.cards.map(c=>c.id)},print:{...p.print,includeGraph:p.print.includeGraph??true},cards:p.cards.map(c=>({...c,tagIds:c.tagIds||[],originalDoc:c.originalDoc||textDoc(c.originalText),editedDoc:c.editedDoc||textDoc(c.workingText)})) };
}
export function exportProject(project: Project): string { return JSON.stringify({ format: 'canvas-clipper', version: 2, project: { ...project, title: project.title.trim() || '未命名專案' } }, null, 2); }
function finite(v: unknown,min: number,max: number): v is number { return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max; }
export function validateProject(value: unknown, remap=true): Project {
  if(!value||typeof value!=='object')throw new Error('備份缺少專案。');
  const p=value as Project;
  if(typeof p.title!=='string'||!p.title.trim()||p.title.length>200||!Array.isArray(p.cards)||p.cards.length>1000||!p.view||!finite(p.view.zoom,.5,2)||!finite(p.view.x,-1e7,1e7)||!finite(p.view.y,-1e7,1e7)||!p.print||![10,12,14,16].includes(p.print.fontSize)||![1.4,1.6,1.8,2].includes(p.print.lineHeight))throw new Error('備份的專案、視角或排版資料不完整。');
  const ids=new Set<string>(),mapping=new Map<string,string>();
  const id=(old:unknown)=>{if(typeof old!=='string'||!old||ids.has(old))throw new Error('備份含無效或重複的 ID。');ids.add(old);const next=remap?crypto.randomUUID():old;mapping.set(old,next);return next;};
  const cards=p.cards.map(c=>{
    if(!c||typeof c.workingText!=='string'||c.workingText.length>MAX_TEXT||typeof c.note!=='string'||c.note.length>MAX_TEXT||!finite(c.x,-1e7,1e7)||!finite(c.y,-1e7,1e7))throw new Error('卡片資料不正確。');
    const cid=id(c.id),capture=validateCapture({kind:c.kind,title:c.title,text:c.originalText,url:c.url,capturedAt:c.capturedAt,...(c.originalDoc?{doc:c.originalDoc}:{})});
    const editedDoc=c.editedDoc?validateDoc(c.editedDoc):textDoc(c.workingText);
    return {...createClip(capture,0),id:cid,workingText:c.workingText,editedDoc,note:c.note,x:c.x,y:c.y,groupId:c.groupId,tagIds:c.tagIds||[]};
  });
  const groups=(p.groups||[]).map(g=>{if(!g||typeof g.title!=='string'||g.title.length>200||!GROUP_COLORS.includes(g.color)||!finite(g.x,-1e7,1e7)||!finite(g.y,-1e7,1e7)||!finite(g.width,200,1e6)||!finite(g.height,80,1e6))throw new Error('主題框資料無效。');return{id:id(g.id),title:g.title,color:g.color,x:g.x,y:g.y,width:g.width,height:g.height,collapsed:!!g.collapsed};});
  const tags=(p.tags||[]).map(t=>{if(!t||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||!GROUP_COLORS.includes(t.color))throw new Error('標籤資料無效。');return{id:id(t.id),title:t.title,color:t.color};});
  const groupIds=new Set((p.groups||[]).map(g=>g.id)),tagIds=new Set((p.tags||[]).map(t=>t.id)),cardIds=new Set(p.cards.map(c=>c.id));
  cards.forEach(c=>{if(c.groupId&&!groupIds.has(c.groupId)||!Array.isArray(c.tagIds)||c.tagIds.some(t=>!tagIds.has(t)))throw new Error('卡片包含失效的分組或標籤。');c.groupId=c.groupId?mapping.get(c.groupId):undefined;c.tagIds=[...new Set(c.tagIds)].map(t=>mapping.get(t)!);});
  const relationKeys=new Set<string>();
  const relations=(p.relations||[]).map(r=>{const key=[r.from,r.to,r.kind].join(':');if(!r||!cardIds.has(r.from)||!cardIds.has(r.to)||r.from===r.to||!RELATION_KINDS.includes(r.kind)||typeof r.label!=='string'||r.label.length>200||relationKeys.has(key))throw new Error('關係線資料無效。');relationKeys.add(key);return{id:id(r.id),from:mapping.get(r.from)!,to:mapping.get(r.to)!,kind:r.kind,label:r.label};});
  const outline=p.outline||{groupIds:[],cardIds:p.cards.map(c=>c.id)};
  if(!Array.isArray(outline.groupIds)||!Array.isArray(outline.cardIds)||outline.groupIds.some(g=>!groupIds.has(g))||outline.cardIds.some(c=>!cardIds.has(c)))throw new Error('輸出大綱引用了不存在的材料。');
  return {...newProject(remap?p.title.slice(0,190)+'（匯入）':p.title),...(remap?{}:{id:typeof p.id==='string'?p.id:crypto.randomUUID()}),cards,groups,tags,relations,outline:{groupIds:[...new Set(outline.groupIds)].map(g=>mapping.get(g)!),cardIds:[...new Set(outline.cardIds)].map(c=>mapping.get(c)!)},view:{...p.view},print:{...p.print,includeGraph:p.print.includeGraph??true}};
}
export function importProject(raw: string): Project {
  if(raw.length>30_000_000)throw new Error('備份檔過大。');
  let doc;try{doc=JSON.parse(raw);}catch{throw new Error('無法解析 JSON 備份。');}
  if(!doc||doc.format!=='canvas-clipper'||![1,2].includes(doc.version))throw new Error('這不是支援的 Canvas Clipper 備份版本。');
  return validateProject(doc.project);
}
export function addRelation(p:Project,from:string,to:string,kind:Relation['kind']='相關',id:string=crypto.randomUUID()):Project {
  if(from===to||!p.cards.some(c=>c.id===from)||!p.cards.some(c=>c.id===to)||p.relations.some(r=>r.from===from&&r.to===to&&r.kind===kind))return p;
  return {...p,relations:[...p.relations,{id,from,to,kind,label:''}]};
}
export function removeCard(p:Project,id:string):Project{return{...p,cards:p.cards.filter(c=>c.id!==id),relations:p.relations.filter(r=>r.from!==id&&r.to!==id),outline:{...p.outline,cardIds:p.outline.cardIds.filter(c=>c!==id)}};}
export function orderedCards(p:Project):Clip[]{const order=new Map(p.outline.cardIds.map((id,i)=>[id,i]));return [...p.cards].sort((a,b)=>(order.get(a.id)??1e6)-(order.get(b.id)??1e6));}
export function orderedGroups(p:Project):Group[]{const order=new Map(p.outline.groupIds.map((id,i)=>[id,i]));return [...p.groups].sort((a,b)=>(order.get(a.id)??1e6)-(order.get(b.id)??1e6));}
export function sourceLabel(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return '手動筆記'; } }
export function timeLabel(iso: string): string { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }); }
