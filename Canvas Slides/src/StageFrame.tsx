import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import type {Bridge,Deck} from './model';
export interface StageHandle {command:(type:string,payload?:any)=>Promise<any>}
interface Props{deck:Deck;index:number;epoch:number;zoom:number;forceDOM:boolean;mode?:'edit'|'preview'|'play';onEvent:(type:string,payload:any)=>void}
export const Stage=forwardRef<StageHandle,Props>(function Stage(props,ref){
 const frame=useRef<HTMLIFrameElement>(null),host=useRef<HTMLDivElement>(null),session=useRef(crypto.randomUUID()),port=useRef<MessagePort|undefined>(undefined),pending=useRef(new Map<string,{resolve:(value:any)=>void;reject:(reason:any)=>void;timer:ReturnType<typeof setTimeout>}>());
 const latest=useRef(props);latest.current=props;const[fit,setFit]=useState(.6),[ready,setReady]=useState(false);
 function command(type:string,payload?:any){return new Promise<any>((resolve,reject)=>{if(!port.current){reject(new Error('舞台尚未準備完成。'));return;}const request=crypto.randomUUID();const timer=setTimeout(()=>{pending.current.delete(request);reject(new Error('舞台未回應；請先保存專案再重新開啟。'));},15000);pending.current.set(request,{resolve,reject,timer});port.current.postMessage({protocol:'canvas-slides/1',session:session.current,type,payload,request} satisfies Bridge);});}
 useImperativeHandle(ref,()=>({command}));
 useEffect(()=>{
  const listener=(e:MessageEvent)=>{if(e.source!==frame.current?.contentWindow||e.data?.protocol!=='canvas-slides/1'||e.data.session!==session.current||e.data.type!=='hello')return;
   const channel=new MessageChannel();port.current?.close();port.current=channel.port1;channel.port1.onmessage=event=>{const m=event.data as Bridge;if(m.protocol!=='canvas-slides/1'||m.session!==session.current)return;const task=m.request&&pending.current.get(m.request);if(task&&(m.type==='result'||m.type==='failure')){clearTimeout(task.timer);pending.current.delete(m.request!);m.type==='result'?task.resolve(m.payload):task.reject(new Error(m.payload));return;}if(m.type==='ready')setReady(true);else latest.current.onEvent(m.type,m.payload);};channel.port1.start();frame.current!.contentWindow!.postMessage({protocol:'canvas-slides/1',session:session.current,type:'connect'},'*',[channel.port2]);
  };addEventListener('message',listener);return()=>{removeEventListener('message',listener);port.current?.close();for(const task of pending.current.values()){clearTimeout(task.timer);task.reject(new Error('舞台已關閉。'));}pending.current.clear();};
 },[]);
 useEffect(()=>{if(ready)command('load',{deck:props.deck,index:props.index,mode:props.mode||'edit',forceDOM:props.forceDOM}).catch(e=>latest.current.onEvent('error',String(e)));},[ready,props.deck.id,props.index,props.epoch,props.forceDOM,props.mode]);
 useLayoutEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(()=>{const styles=getComputedStyle(element);const width=element.clientWidth-parseFloat(styles.paddingLeft)-parseFloat(styles.paddingRight);const height=element.clientHeight-parseFloat(styles.paddingTop)-parseFloat(styles.paddingBottom);setFit(Math.min(width/props.deck.width,height/props.deck.height,props.mode==='play'||props.mode==='preview'?Infinity:1));});observer.observe(element);return()=>observer.disconnect();},[props.deck.width,props.deck.height,props.mode]);
 const scale=Math.max(.1,fit)*props.zoom;
 return <div className="canvas-viewport" ref={host}><div className="stage-envelope" style={{width:props.deck.width*scale,height:props.deck.height*scale}}><iframe title="投影片編輯舞台" ref={frame} src={`stage.html#${session.current}`} sandbox="allow-scripts" style={{width:props.deck.width,height:props.deck.height,transform:`scale(${scale})`}}/></div></div>;
});
