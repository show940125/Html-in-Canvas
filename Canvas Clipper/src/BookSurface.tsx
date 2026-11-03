import {useLayoutEffect,useRef,useState} from 'react';
import {prepareCanvas,supportsCanvas,syncGpuGeometry,type DrawableCanvas} from '../../shared/html-in-canvas/canvas';
import {uploadHTML,type HTMLGL} from '../../shared/html-in-canvas/texture';
import {InteractiveSurface} from './InteractiveSurface';
import type {BookPage} from './pagination';
export interface BookTurn{from:number;to:number;direction:number;started:number;}
interface Props{pages:BookPage[];index:number;width:number;height:number;spread:number;turn?:BookTurn;forceDOM:boolean;onFinished:()=>void;onRenderer:(value:string)=>void;}
function PageHTML({page,index,total,width,height}:{page:BookPage;index:number;total:number;width:number;height:number}){return <article className="book-html-page" data-book-page={index} data-book-card={page.cardId} style={{width,height}}><header><span>CANVAS CLIPPER / READING</span><h2>{page.title}</h2></header><div className="book-page-body" dangerouslySetInnerHTML={{__html:page.html}}/><footer><span>圖文與筆記分別保存</span><span>{index+1} / {total}</span></footer></article>;}
const vertex=`#version 300 es
in vec2 uv;uniform mat4 matrix;uniform vec2 size;uniform float curl;out vec2 vuv;
void main(){vuv=uv;float z=sin(uv.x*3.14159265)*curl*size.x*.15;gl_Position=matrix*vec4(uv*size,z,1.);}`;
const fragment=`#version 300 es
precision highp float;uniform sampler2D frontPaper;uniform sampler2D backPaper;uniform float curl;in vec2 vuv;out vec4 color;
void main(){vec2 uv=gl_FrontFacing?vuv:vec2(1.-vuv.x,vuv.y);vec4 c=gl_FrontFacing?texture(frontPaper,uv):texture(backPaper,uv);float shade=1.-curl*(.12+.14*sin(vuv.x*3.14159265));color=vec4(c.rgb*shade,c.a);}`;
export function BookSurface(props:Props){
 const canvas=useRef<DrawableCanvas>(null),state=useRef(props),finished=useRef<BookTurn|undefined>(undefined);state.current=props;
 const[error,setError]=useState('');const native=supportsCanvas()&&!props.forceDOM&&!error;
 const visible=new Set<number>();for(let n=0;n<props.spread;n++){visible.add(props.index+n);if(props.turn)visible.add(props.turn.to+n);}const indices=[...visible].filter(i=>props.pages[i]);
 useLayoutEffect(()=>{
  const cv=canvas.current;if(!cv||!native)return;prepareCanvas(cv);const gl=cv.getContext('webgl2',{alpha:true,antialias:true}) as HTMLGL|null;
  if(!gl||(!gl.texElementImage2D&&!gl.texElementSubImage2D)){setError('WebGL HTML 紋理不可用');return;}
  const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader error');return s;};
  let program:WebGLProgram|undefined,vs:WebGLShader|undefined,fs:WebGLShader|undefined,buffer:WebGLBuffer|undefined;const textures=new Map<number,WebGLTexture>();
  try{vs=shader(gl.VERTEX_SHADER,vertex);fs=shader(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Program error');gl.useProgram(program);
   const vertices:number[]=[];for(let n=0;n<48;n++){const a=n/48,b=(n+1)/48;vertices.push(a,0,b,0,a,1,b,0,b,1,a,1);}buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);const uv=gl.getAttribLocation(program,'uv');gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,8,0);gl.frontFace(gl.CW);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   const matrix=gl.getUniformLocation(program,'matrix'),size=gl.getUniformLocation(program,'size'),curlUniform=gl.getUniformLocation(program,'curl');gl.uniform1i(gl.getUniformLocation(program,'frontPaper'),0);gl.uniform1i(gl.getUniformLocation(program,'backPaper'),1);
   function texture(index:number,unit:number){const el=cv!.querySelector<HTMLElement>(`[data-book-root="${index}"]`);if(!el)return;let tex=textures.get(index);if(!tex){tex=gl!.createTexture()!;textures.set(index,tex);gl!.activeTexture(gl!.TEXTURE0+unit);gl!.bindTexture(gl!.TEXTURE_2D,tex);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);}gl!.activeTexture(gl!.TEXTURE0+unit);gl!.bindTexture(gl!.TEXTURE_2D,tex);uploadHTML(gl!,cv!,tex,el);return el;}
   const paint=()=>{try{const s=state.current,w=s.width,h=s.height,full=w*s.spread;gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(size,w,h);const projection=new DOMMatrix([2/full,0,0,0,0,-2/h,0,0,0,0,.0005,0,-1,1,0,1]);
    for(const el of cv.querySelectorAll<HTMLElement>('[data-book-root]')){cv.clearElementGeometry(el);el.inert=!!s.turn;}
    const draw=(index:number,x:number,angle=0,curl=0,back=index,reverse=false)=>{if(!s.pages[index])return;const el=texture(index,0);texture(s.pages[back]?back:index,1);if(!el)return;const perspective=new DOMMatrix();perspective.m34=-1/1600;const model=reverse?new DOMMatrix().translate(x+w,0).multiply(perspective).rotate(0,angle,0).translate(-w,0):new DOMMatrix().translate(x,0).multiply(perspective).rotate(0,-angle,0);gl.uniformMatrix4fv(matrix,false,projection.multiply(model).toFloat32Array());gl.uniform1f(curlUniform,curl);gl.drawArrays(gl.TRIANGLES,0,48*6);if(!s.turn)syncGpuGeometry(cv,el,model);};
    if(s.turn){const t=Math.min(1,(performance.now()-s.turn.started)/420),eased=t*t*(3-2*t);for(let n=0;n<s.spread;n++)draw(s.turn.to+n,n*w);if(s.spread===2&&s.turn.direction>0)draw(s.turn.from,0);const turning=s.turn.direction>0?s.turn.from+s.spread-1:s.turn.from;draw(turning,s.turn.direction>0?(s.spread-1)*w:0,eased*180,Math.sin(t*Math.PI),s.turn.to,s.turn.direction<0);if(t<1)cv.requestPaint();else if(finished.current!==s.turn){finished.current=s.turn;s.onFinished();}}
    else for(let n=0;n<s.spread;n++)draw(s.index+n,n*w);
    // Keep only the current spread's resources.
    for(const[index,tex]of textures)if(!cv.querySelector(`[data-book-root="${index}"]`)){gl.deleteTexture(tex);textures.delete(index);}
    cv.dataset.renderer='webgl2-html-book';cv.dataset.paints=String(Number(cv.dataset.paints||0)+1);
   }catch(e){setError(String(e));}};
   cv.addEventListener('paint',paint);const lost=(e:Event)=>{e.preventDefault();setError('GPU 畫面中斷');};cv.addEventListener('webglcontextlost',lost);cv.requestPaint();props.onRenderer('WebGL · 真實 HTML 紋理');
   return()=>{cv.removeEventListener('paint',paint);cv.removeEventListener('webglcontextlost',lost);textures.forEach(t=>gl.deleteTexture(t));gl.deleteBuffer(buffer!);gl.deleteProgram(program!);gl.deleteShader(vs!);gl.deleteShader(fs!);};
  }catch(e){setError(String(e));if(program)gl.deleteProgram(program);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);if(buffer)gl.deleteBuffer(buffer);textures.forEach(t=>gl.deleteTexture(t));}
 },[native,props.width,props.height,props.spread]);
 useLayoutEffect(()=>{if(native)canvas.current?.requestPaint();else props.onRenderer(error?'平面閱讀 · '+error:props.forceDOM||!supportsCanvas()?'HTML 平面閱讀':'原生 2D 平面閱讀');},[props.pages,props.index,props.turn,native,error]);
 if(!native)return <div className="book-flat-spread" style={{width:props.width*props.spread,height:props.height}}>{Array.from({length:props.spread},(_,n)=>props.pages[props.index+n]&&<InteractiveSurface key={n} forceDOM={props.forceDOM} className="book-flat-page"><PageHTML page={props.pages[props.index+n]} index={props.index+n} total={props.pages.length} width={props.width} height={props.height}/></InteractiveSurface>)}</div>;
 return <canvas ref={canvas} className="book-canvas" width={Math.round(props.width*props.spread*devicePixelRatio)} height={Math.round(props.height*devicePixelRatio)} style={{width:props.width*props.spread,height:props.height}} aria-label="可選字的 HTML 書本">{indices.map(i=><div key={i} data-book-root={i} drawable="" className="book-drawable" style={{width:props.width,height:props.height}}><PageHTML page={props.pages[i]} index={i} total={props.pages.length} width={props.width} height={props.height}/></div>)}</canvas>;
}
