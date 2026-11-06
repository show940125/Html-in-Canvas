import {useLayoutEffect,useRef,useState} from 'react';
import type {Project} from './model';
interface Geometry{x:number;y:number;width:number;height:number;}
/** One geometry stream drives DOM, native pixels, SVG edges and hit tests. */
export function useSceneMotion(target:Project,direct:string[],enabled:boolean){
 const goals=new Map<string,Geometry>([...target.cards.map(c=>['c:'+c.id,{x:c.x,y:c.y,width:c.width||308,height:c.height||374}] as const),...target.groups.map(g=>['g:'+g.id,{x:g.x,y:g.y,width:g.width,height:g.collapsed?48:g.height}] as const)]);
 const live=useRef(goals),identity=useRef(target.id);const[,tick]=useState(0);
 const key=JSON.stringify([...goals]),directKey=direct.join('|');
 useLayoutEffect(()=>{
  if(identity.current!==target.id){identity.current=target.id;live.current=goals;tick(n=>n+1);return;}
  let frame=0,last=performance.now();const immediate=new Set(direct);
  const step=(now:number)=>{let moving=false;const amount=1-Math.exp(-Math.min(64,Math.max(1,now-last))/42);last=now;
   const next=new Map<string,Geometry>();for(const[id,to]of goals){const from=live.current.get(id)||to;const value={...to};
    for(const field of ['x','y','width','height'] as const){const delta=to[field]-from[field];if(enabled&&!immediate.has(id)&&Math.abs(delta)>.2){value[field]=from[field]+delta*amount;moving=true;}}
    next.set(id,value);
   }live.current=next;tick(n=>n+1);if(moving)frame=requestAnimationFrame(step);
  };step(performance.now());return()=>cancelAnimationFrame(frame);
 },[key,directKey,enabled,target.id]);
 const moving=[...goals].some(([id,to])=>{const from=live.current.get(id)||to;return(['x','y','width','height'] as const).some(k=>Math.abs(to[k]-from[k])>.2);});
 return{moving,scene:{...target,cards:target.cards.map(c=>({...c,...live.current.get('c:'+c.id)})),groups:target.groups.map(g=>({...g,...live.current.get('g:'+g.id)}))}};
}
