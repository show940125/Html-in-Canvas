import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { prepareCanvas,supportsCanvas,syncGeometry,type DrawableCanvas,type DrawableContext } from '../../shared/html-in-canvas/canvas';
export function InteractiveSurface({children,forceDOM=false,className=''}:{children:ReactNode;forceDOM?:boolean;className?:string}){
  const cv=useRef<DrawableCanvas>(null),content=useRef<HTMLDivElement>(null);
  const[failed,setFailed]=useState(false);
  const native=supportsCanvas()&&!forceDOM&&!failed;
  useLayoutEffect(()=>{
    const canvas=cv.current,element=content.current;if(!native||!canvas||!element)return;
    prepareCanvas(canvas);const ctx=canvas.getContext('2d') as DrawableContext;
    const paint=()=>{try{ctx.reset();const dpr=canvas.width/Math.max(1,canvas.clientWidth);ctx.scale(dpr,dpr);const result=ctx.drawElementImage(element,0,0,element.offsetWidth,element.offsetHeight);syncGeometry(canvas,element,result);canvas.dataset.paints=String(Number(canvas.dataset.paints||0)+1);}catch{setFailed(true);}};
    canvas.addEventListener('paint',paint);
    const resize=new ResizeObserver(([entry])=>{const w=Math.round(entry.contentRect.width*devicePixelRatio),h=Math.round(entry.contentRect.height*devicePixelRatio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}canvas.requestPaint();});
    resize.observe(canvas,{box:'device-pixel-content-box'});canvas.requestPaint();
    return()=>{resize.disconnect();canvas.removeEventListener('paint',paint);};
  },[native]);
  useLayoutEffect(()=>{if(native)cv.current?.requestPaint();},[children,native]);
  return <div className={'interactive-surface '+className} data-surface-mode={native?'native':'dom'}>{native?<canvas ref={cv}><div ref={content} drawable="" className="surface-content">{children}</div></canvas>:<div className="surface-content">{children}</div>}</div>;
}
