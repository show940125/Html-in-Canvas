import {framePath,type FrameId} from './appearance';
export function Frame({shape='rounded',width,height,color}:{shape?:FrameId;width:number;height:number;color:string}){
  return <svg className="frame-art" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none"><path d={framePath(shape,width,height)} fill={color} stroke="var(--frame-stroke, #9bad93)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></svg>;
}
