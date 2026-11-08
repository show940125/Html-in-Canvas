export {};
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=$('status'),select=$<HTMLSelectElement>('ending');
const call=async(type:string,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw new Error(r?.error||'操作失敗，請重試。');return r.data;};
async function refresh(){const {target}=await call('STATUS');$('target-name').textContent=target?target.title||target.url:'還沒有設定終點';$('target-name').title=target?.url||'';$('clear').hidden=!target;}
async function action(type:string){
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];buttons.forEach(b=>b.disabled=true);status.dataset.error='false';status.textContent=type==='BEGIN'?'正在讓網頁成形，請保持分頁不動…':'正在記住這個畫面…';
 try{await call(type,{ending:select.value});if(type==='BEGIN')window.close();else{await refresh();status.textContent=type==='REMEMBER'?'已記住終點，現在可以到另一個網頁開始演出。':'終點快照已清除。';}}
 catch(e){status.dataset.error='true';status.textContent=e instanceof Error?e.message:String(e);}
 finally{buttons.forEach(b=>b.disabled=false);}
}
$('start').addEventListener('click',()=>action('BEGIN'));$('remember').addEventListener('click',()=>action('REMEMBER'));$('clear').addEventListener('click',()=>action('CLEAR_TARGET'));
void refresh().catch(e=>{status.textContent=String(e);});
