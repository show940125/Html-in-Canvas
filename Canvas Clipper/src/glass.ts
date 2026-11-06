import {framePath,type FrameId} from './appearance';
const frostLayers=new WeakMap<HTMLCanvasElement,HTMLCanvasElement>();
/** Native Canvas composes an actual blurred backdrop between scene units.
 * Cards are painted afterwards, so their text and inputs remain sharp. */
export function glassBackdrop(ctx:CanvasRenderingContext2D,canvas:HTMLCanvasElement,buffer:HTMLCanvasElement,rect:{x:number;y:number;width:number;height:number},view:{x:number;y:number;zoom:number},shape:FrameId,dpr:number){
 const sx=Math.max(0,Math.floor((view.x+rect.x*view.zoom)*dpr)),sy=Math.max(0,Math.floor((view.y+rect.y*view.zoom)*dpr));
 const right=Math.min(canvas.width,Math.ceil((view.x+(rect.x+rect.width)*view.zoom)*dpr)),bottom=Math.min(canvas.height,Math.ceil((view.y+(rect.y+rect.height)*view.zoom)*dpr));
 if(right<=sx||bottom<=sy)return;buffer.width=right-sx;buffer.height=bottom-sy;
 const copy=buffer.getContext('2d');if(!copy)return;copy.drawImage(canvas,sx,sy,buffer.width,buffer.height,0,0,buffer.width,buffer.height);
 ctx.save();ctx.translate(rect.x,rect.y);ctx.clip(new Path2D(framePath(shape,rect.width,rect.height)));ctx.translate(-rect.x,-rect.y);
 const x=(sx/dpr-view.x)/view.zoom,y=(sy/dpr-view.y)/view.zoom,w=buffer.width/dpr/view.zoom,h=buffer.height/dpr/view.zoom;
 // A very small optical offset at the boundary, then directional frosting.
 ctx.globalAlpha=.65;ctx.drawImage(buffer,x-1,y-1,w+2,h+2);
 let frost=frostLayers.get(buffer);if(!frost){frost=document.createElement('canvas');frostLayers.set(buffer,frost);}frost.width=buffer.width;frost.height=buffer.height;
 const blurred=frost.getContext('2d');if(blurred){blurred.filter='blur(12px) saturate(1.25)';blurred.drawImage(buffer,0,0);blurred.filter='none';blurred.globalCompositeOperation='destination-in';const mask=blurred.createLinearGradient(frost.width,0,0,frost.height);mask.addColorStop(0,'rgba(0,0,0,.03)');mask.addColorStop(.44,'rgba(0,0,0,.18)');mask.addColorStop(1,'rgba(0,0,0,.88)');blurred.fillStyle=mask;blurred.fillRect(0,0,frost.width,frost.height);ctx.globalAlpha=1;ctx.drawImage(frost,x,y,w,h);}ctx.restore();
}
