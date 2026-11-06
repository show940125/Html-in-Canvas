import {useId} from 'react';
import {framePath,type FrameId} from './appearance';
/** Optical direction from Law_test's approved glass: clear NE, frosted SW. */
export function GroupGlass({shape='rounded',width,height,color}:{shape?:FrameId;width:number;height:number;color:string}){
 const id='glass-'+useId().replace(/[^a-z0-9]/gi,'');const path=framePath(shape,width,height);
 return <svg className="frame-art group-glass-art" viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><defs>
  <linearGradient id={id} x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--glass-clear)"/><stop offset=".44" stopColor="var(--glass-mid)"/><stop offset="1" stopColor="var(--glass-frost)"/></linearGradient>
  <linearGradient id={id+'-edge'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffffff" stopOpacity=".78"/><stop offset=".55" stopColor="#ffffff" stopOpacity=".18"/><stop offset="1" stopColor="var(--frame-stroke)" stopOpacity=".65"/></linearGradient>
 </defs><path d={path} fill={color} fillOpacity=".13"/><path d={path} fill={`url(#${id})`}/><path d={path} fill="none" stroke={`url(#${id}-edge)`} strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>;
}
