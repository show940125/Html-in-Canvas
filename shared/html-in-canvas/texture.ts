import type {DrawableCanvas} from './canvas';
export interface HTMLGL extends WebGL2RenderingContext{texElementImage2D?:(target:number,internal:number,element:Element)=>void;texElementSubImage2D?:(target:number,level:number,x:number,y:number,element:Element)=>void;}
type SizedCanvas=DrawableCanvas&{getElementImageDefaultSize?:(element:Element)=>{width:number;height:number};};
const allocations=new WeakMap<WebGLTexture,{width:number;height:number}>();
const modes=new WeakMap<HTMLGL,'modern'|'legacy'>();
/** Called during canvas paint, with this texture bound to TEXTURE_2D. */
export function uploadHTML(gl:HTMLGL,canvas:SizedCanvas,texture:WebGLTexture,element:HTMLElement){
 if(modes.get(gl)!=='legacy'&&canvas.getElementImageDefaultSize&&gl.texElementSubImage2D){
  try{const size=canvas.getElementImageDefaultSize(element),width=Math.ceil(size.width),height=Math.ceil(size.height),old=allocations.get(texture);if(!old||old.width!==width||old.height!==height){if(width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||height>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('HTML 紋理超過 GPU 尺寸上限。');gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);allocations.set(texture,{width,height});}gl.texElementSubImage2D(gl.TEXTURE_2D,0,0,0,element);modes.set(gl,'modern');return;}catch(error){if(modes.get(gl)==='modern'||!gl.texElementImage2D)throw error;}
 }
 if(!gl.texElementImage2D)throw new Error('目前環境沒有 HTML 紋理上傳 API。');gl.texElementImage2D(gl.TEXTURE_2D,gl.RGBA8,element);modes.set(gl,'legacy');
}
