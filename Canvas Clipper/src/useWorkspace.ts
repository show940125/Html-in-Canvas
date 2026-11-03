import { useCallback,useEffect,useRef,useState } from 'react';
import type { Project } from './model';
import { currentProject,getProject,listProjects,setCurrent,updateProject,watchProjects } from './storage';
export type ProjectEdit=(p:Project)=>Project;
type Collection='cards'|'groups'|'tags'|'relations';
type Row={id:string;[key:string]:unknown};
interface Delta{field:Collection;id:string;before?:Row;after?:Row;keys:string[];}
interface History{deltas:Delta[];beforeOutline?:Project['outline'];afterOutline?:Project['outline'];}
function difference(before:Project,after:Project):History{
  const deltas:Delta[]=[];
  for(const field of ['cards','groups','tags','relations'] as Collection[]){
    const a=new Map((before[field] as unknown as Row[]).map(r=>[r.id,r])),b=new Map((after[field] as unknown as Row[]).map(r=>[r.id,r]));
    for(const id of new Set([...a.keys(),...b.keys()])){const old=a.get(id),next=b.get(id);if(old===next)continue;const keys=old&&next?[...new Set([...Object.keys(old),...Object.keys(next)])].filter(k=>!Object.is(old[k],next[k])):[];if(!old||!next||keys.length)deltas.push({field,id,before:old,after:next,keys});}
  }
  return{deltas,...(before.outline!==after.outline?{beforeOutline:before.outline,afterOutline:after.outline}:{})};
}
function applyHistory(p:Project,h:History,undo:boolean):Project{
  const next={...p};
  for(const field of ['cards','groups','tags','relations'] as Collection[]){let rows=[...p[field]] as unknown as Row[];for(const d of h.deltas.filter(d=>d.field===field)){const target=undo?d.before:d.after,other=undo?d.after:d.before;const index=rows.findIndex(r=>r.id===d.id);if(!target){rows=rows.filter(r=>r.id!==d.id);}else if(!other||index<0){rows=rows.filter(r=>r.id!==d.id);rows.push(target);}else{const row={...rows[index]};for(const key of d.keys){if(key in target)row[key]=target[key];else delete row[key];}rows[index]=row;}}
    (next as unknown as Record<Collection,Row[]>)[field]=rows;
  }
  const outline=undo?h.beforeOutline:h.afterOutline;
  if(outline){const ordered=(wanted:string[],existing:string[],valid:string[])=>[...new Set([...wanted,...existing,...valid])].filter(id=>valid.includes(id));next.outline={groupIds:ordered(outline.groupIds,p.outline.groupIds,next.groups.map(g=>g.id)),cardIds:ordered(outline.cardIds,p.outline.cardIds,next.cards.map(c=>c.id))};}
  return next;
}
export function useWorkspace(){
  const[project,setProject]=useState<Project>(),[projects,setProjects]=useState<Project[]>([]);
  const[error,setError]=useState(new URLSearchParams(location.search).get('error')||''),[notice,setNotice]=useState('');
  const[saving,setSaving]=useState<'saved'|'saving'|'error'>('saved');
  const ref=useRef<Project|undefined>(undefined),pending=useRef<{id:string;edit:ProjectEdit}[]>([]);
  const flight=useRef<Promise<boolean>|undefined>(undefined),refreshNeeded=useRef(false),editEpoch=useRef(0);
  const history=useRef(new Map<string,{past:History[];future:History[]}>()),[historyTick,setHistoryTick]=useState(0);
  const refresh=useCallback(async()=>{setProjects(await listProjects());},[]);
  const adopt=useCallback((p:Project)=>{ref.current=p;setProject(p);setHistoryTick(n=>n+1);},[]);
  const load=useCallback(async()=>{
    const requested=new URLSearchParams(location.hash.slice(1)).get('project');const candidate=requested&&await getProject(requested)||await currentProject();await setCurrent(candidate.id);
    // Hash changes and incoming captures may race an optimistic local edit.
    // Read again after setCurrent; never adopt a snapshot older than that edit.
    for(;;){if(pending.current.length){refreshNeeded.current=true;await refresh();return;}const epoch=editEpoch.current;const fresh=await getProject(candidate.id);if(pending.current.length){refreshNeeded.current=true;await refresh();return;}if(epoch!==editEpoch.current)continue;adopt(fresh||candidate);await refresh();return;}
  },[adopt,refresh]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));const changed=()=>{if(pending.current.length){refreshNeeded.current=true;return;}void load().catch(e=>setError(String(e)));};const unsubscribe=watchProjects(changed);window.addEventListener('hashchange',changed);const before=(e:BeforeUnloadEvent)=>{if(pending.current.length)e.preventDefault();};window.addEventListener('beforeunload',before);return()=>{unsubscribe();window.removeEventListener('hashchange',changed);window.removeEventListener('beforeunload',before);};},[load]);
  const flush=useCallback(()=>{
    if(flight.current)return flight.current;
    const task=(async()=>{try{for(;;){while(pending.current.length){setSaving('saving');const op=pending.current[0];const saved=await updateProject(op.id,op.edit);pending.current.shift();if(!pending.current.some(item=>item.id===op.id)&&ref.current?.id===op.id)adopt(saved);}if(refreshNeeded.current){refreshNeeded.current=false;await load();}await refresh();if(!pending.current.length&&!refreshNeeded.current)break;}setSaving('saved');return true;}catch(e){setSaving('error');setError('尚未儲存。編輯仍留在畫面上，可重試或先下載備份。'+String(e));return false;}finally{flight.current=undefined;}})();
    flight.current=task;return task;
  },[adopt,load,refresh]);
  const commit=useCallback((edit:ProjectEdit,record=false)=>{
    const before=ref.current;if(!before)return;
    const next=edit(before);if(next===before)return;editEpoch.current++;
    if(record){let stack=history.current.get(before.id);if(!stack){stack={past:[],future:[]};history.current.set(before.id,stack);}stack.past.push(difference(before,next));if(stack.past.length>20)stack.past.shift();stack.future=[];setHistoryTick(n=>n+1);}
    adopt(next);pending.current.push({id:before.id,edit});setSaving('saving');void flush();
  },[adopt,flush]);
  const switchProject=useCallback(async(id:string)=>{if(!await flush())throw new Error('請先完成儲存。');const p=await getProject(id);if(!p)throw new Error('找不到專案。');await setCurrent(id);adopt(p);location.hash='project='+id;},[flush,adopt]);
  function navigateHistory(undo:boolean){const p=ref.current;if(!p)return;const stack=history.current.get(p.id);if(!stack)return;const h=(undo?stack.past:stack.future).pop();if(!h)return;for(const delta of h.deltas){const removing=undo?!delta.before:!delta.after;if(removing){const latest=(p[delta.field] as unknown as Row[]).find(row=>row.id===delta.id);if(latest){if(undo)delta.after=latest;else delta.before=latest;}}}(undo?stack.future:stack.past).push(h);commit(value=>applyHistory(value,h,undo));setHistoryTick(n=>n+1);}
  const stack=project?history.current.get(project.id):undefined;void historyTick;
  return{project,projects,error,setError,notice,setNotice,saving,commit,flush,refresh,switchProject,undo:()=>navigateHistory(true),redo:()=>navigateHistory(false),canUndo:!!stack?.past.length,canRedo:!!stack?.future.length};
}
