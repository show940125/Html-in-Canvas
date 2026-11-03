import type { Clip,Group,Project } from './model';
export const GAP=24,HEADER=56,PADDING=24;
export interface Rect{id:string;x:number;y:number;width:number;height:number;}
export interface DropPreview{targetGroupId?:string;cardRects:Rect[];groupRects:(Rect&{collapsed:boolean})[];displacedNodes:string[];insertionHint:string;assignments:{id:string;groupId?:string}[];}
export interface DragIntent{ids:string[];dx:number;dy:number;pointer:{x:number;y:number};zoom:number;previousTarget?:string;alt?:boolean;expandedGroup?:string;resize?:{width:number;height:number};}
export function cardRect(c:Clip):Rect{return{id:c.id,x:c.x,y:c.y,width:c.width||308,height:c.height||374};}
export function groupRect(g:Group):Rect{return{id:g.id,x:g.x,y:g.y,width:g.width,height:g.collapsed?48:g.height};}
export function intersects(a:Rect,b:Rect,gap=0){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
function contains(r:Rect,p:{x:number;y:number},margin=0){return p.x>=r.x-margin&&p.x<=r.x+r.width+margin&&p.y>=r.y-margin&&p.y<=r.y+r.height+margin;}
function bounds(rects:Rect[]):Rect{const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return{id:'block',x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};}
export function fitGroup(group:Group,cards:Rect[]):Group{
  if(!cards.length)return{...group,width:360,height:160};const b=bounds(cards);
  return{...group,x:b.x-PADDING,y:b.y-HEADER-PADDING,width:Math.max(360,b.width+PADDING*2),height:Math.max(160,b.height+HEADER+PADDING*2)};
}
export function computeDropPreview(project:Project,intent:DragIntent):DropPreview{
  const moving=new Set(intent.ids),cards=new Map(project.cards.map(c=>[c.id,cardRect(c)]));
  const selected=project.cards.filter(c=>moving.has(c.id)).map(c=>({...cardRect(c),...(intent.resize||{}),x:c.x+(intent.resize?0:intent.dx),y:c.y+(intent.resize?0:intent.dy)}));
  if(!selected.length)return{cardRects:[],groupRects:[],displacedNodes:[],insertionHint:'',assignments:[]};
  let target:Group|undefined;
  if(!intent.alt){const previous=project.groups.find(g=>g.id===intent.previousTarget);target=previous&&contains(groupRect(previous),intent.pointer,64/intent.zoom)?previous:[...project.groups].reverse().find(g=>contains(groupRect(g),intent.pointer,32/intent.zoom));}
  if(intent.resize)target=project.groups.find(g=>g.id===project.cards.find(c=>c.id===intent.ids[0])?.groupId);
  let hint=intent.alt?'自由放置 · 移出主題':target?'移入 '+target.title:'自由放置';
  let axis:'x'|'y'=Math.abs(intent.dx)>=Math.abs(intent.dy)?'x':'y',direction=axis==='x'?Math.sign(intent.dx)||1:Math.sign(intent.dy)||1;
  if(target&&!intent.resize&&(!target.collapsed||intent.expandedGroup===target.id)){
    const others=project.cards.filter(c=>c.groupId===target!.id&&!moving.has(c.id)).map(cardRect);
    const block=bounds(selected);
    if(others.length){
      const nearest=[...others].sort((a,b)=>Math.hypot(intent.pointer.x-a.x-a.width/2,intent.pointer.y-a.y-a.height/2)-Math.hypot(intent.pointer.x-b.x-b.width/2,intent.pointer.y-b.y-b.height/2))[0];
      const rx=(intent.pointer.x-nearest.x-nearest.width/2)/nearest.width,ry=(intent.pointer.y-nearest.y-nearest.height/2)/nearest.height;
      axis=Math.abs(rx)>Math.abs(ry)?'x':'y';direction=(axis==='x'?rx:ry)>=0?1:-1;
      let x=block.x,y=block.y;
      if(axis==='x'){x=direction>0?nearest.x+nearest.width+GAP:nearest.x-block.width-GAP;if(Math.abs(block.y-nearest.y)<56/intent.zoom)y=nearest.y;}
      else{y=direction>0?nearest.y+nearest.height+GAP:nearest.y-block.height-GAP;if(Math.abs(block.x-nearest.x)<56/intent.zoom)x=nearest.x;}
      const sx=x-block.x,sy=y-block.y;selected.forEach(c=>{c.x+=sx;c.y+=sy;});
      // Directional sweep yields a deterministic collision-free local layout.
      const placed=[bounds(selected)];
      for(const other of others.sort((a,b)=>direction*(a[axis]-b[axis])||a.id.localeCompare(b.id))){const r={...other};for(let pass=0;pass<=others.length;pass++){const hit=placed.find(p=>intersects(r,p,GAP-.01));if(!hit)break;r[axis]=direction>0?hit[axis]+(axis==='x'?hit.width:hit.height)+GAP:hit[axis]-(axis==='x'?r.width:r.height)-GAP;}cards.set(r.id,r);placed.push(r);}
    }else{const sx=target.x+PADDING-block.x,sy=target.y+HEADER+PADDING-block.y;selected.forEach(c=>{c.x+=sx;c.y+=sy;});}
    hint=`${axis==='x'?'橫向':'縱向'}吸附 · ${target.title}`;
  }else if(target?.collapsed)hint='停留以展開主題 · '+target.title;
  selected.forEach(c=>cards.set(c.id,c));
  const assignments=intent.ids.map(id=>({id,groupId:target?.id}));
  const membership=new Map(project.cards.map(c=>[c.id,moving.has(c.id)?target?.id:c.groupId]));
  const touched=new Set([target?.id,...project.cards.filter(c=>moving.has(c.id)).map(c=>c.groupId)].filter(Boolean));
  const groups=project.groups.map(g=>{const next=touched.has(g.id)?fitGroup(g,[...cards.values()].filter(c=>membership.get(c.id)===g.id)):g;return{...next,collapsed:g.id===intent.expandedGroup?false:g.collapsed};});
  const active=groups.find(g=>g.id===target?.id);
  if(active){
    // Move only top-level collisions, carrying every member with its group.
    const nodes:Rect[]=[groupRect(active)];
    const neighbors=[...groups.filter(g=>g.id!==active.id).map(g=>({...groupRect(g),kind:'group' as const})),...[...cards.values()].filter(c=>!membership.get(c.id)&&!moving.has(c.id)).map(c=>({...c,kind:'card' as const}))].sort((a,b)=>direction*(a[axis]-b[axis])||a.id.localeCompare(b.id));
    for(const node of neighbors){const r={...node};for(let pass=0;pass<=neighbors.length;pass++){const hit=nodes.find(p=>intersects(r,p,GAP-.01));if(!hit)break;r[axis]=direction>0?hit[axis]+(axis==='x'?hit.width:hit.height)+GAP:hit[axis]-(axis==='x'?r.width:r.height)-GAP;}
      const dx=r.x-node.x,dy=r.y-node.y;
      if(dx||dy){if(node.kind==='group'){const g=groups.find(g=>g.id===node.id)!;g.x+=dx;g.y+=dy;for(const c of cards.values())if(membership.get(c.id)===g.id){c.x+=dx;c.y+=dy;}}else cards.set(node.id,r);nodes.push(r);}
    }
  }
  const changed=[...cards.values()].filter(r=>{const c=project.cards.find(c=>c.id===r.id)!;return c.x!==r.x||c.y!==r.y;});
  return{targetGroupId:target?.id,cardRects:[...cards.values()],groupRects:groups.map(g=>({...g})),displacedNodes:changed.filter(c=>!moving.has(c.id)).map(c=>c.id),insertionHint:hint,assignments};
}
export function applyDrop(project:Project,preview:DropPreview):Project{
  return{...project,cards:project.cards.map(c=>{const r=preview.cardRects.find(r=>r.id===c.id),a=preview.assignments.find(a=>a.id===c.id);return{...c,...(r?{x:r.x,y:r.y,width:r.width,height:r.height}:{}),...(a?{groupId:a.groupId}:{})};}),groups:project.groups.map(g=>{const r=preview.groupRects.find(r=>r.id===g.id);return r?{...g,x:r.x,y:r.y,width:r.width,height:r.height,collapsed:r.collapsed}:g;})};
}
