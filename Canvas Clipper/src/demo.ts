import {createClip,newProject,textDoc,type RichDoc} from './model';
/** Explicit onboarding action: always creates a separate, synthetic project. */
export function demoProject(){
 const p=newProject('示例｜從材料到自己的想法');
 const texts=[
  '收集資訊很容易，難的是知道它支持什麼判斷。\n\n先保留來源、原文與擷取時間，再用自己的話寫出這份材料的重點。\n\n閱讀時可以問：這裡的結論來自哪些證據？哪些前提尚未確認？\n\n把材料放入主題，讓彼此的關係具體可見。',
  '兩份材料放在一起，通常比各自讀完更容易發現差異。\n\n一份材料可能支持觀察，另一份則提供例外。用關係線寫明它們如何相關，並在筆記記錄自己的判斷。\n\n版面位置協助思考；輸出大綱安排成稿順序。這兩個順序可以分別調整。',
  '這是一個可以直接操作的示例，全部內容皆為合成材料。\n\n試著把這張卡片拖進左側主題，觀察放下前的磁吸預覽。也可以按「書本閱讀」連續閱讀，或輸出整個主題的圖片。',
 ];
 p.cards=texts.map((text,i)=>createClip({kind:'manual',title:['留下材料，保留自己的判斷','比較材料，指出不同假設','從這裡開始試用'][i],text,url:'',capturedAt:new Date().toISOString()},i));
 const groupId=crypto.randomUUID();p.cards[0].groupId=groupId;p.cards[1].groupId=groupId;p.cards.forEach((c,i)=>{c.x=[48,392,808][i];c.y=104;c.note=['哪些證據還需要確認？','把不同假設寫在關係線上。','拖曳我，或改變我的框型。'][i];});
 const structured:RichDoc={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'閱讀，從一個問題開始'}]},...textDoc(texts[0]).content,{type:'bulletList',content:['看見材料','寫下觀點','連起關係'].map(text=>({type:'listItem',content:[{type:'paragraph',content:[{type:'text',text}]}]}))}]};p.cards[0].originalDoc=structured;p.cards[0].editedDoc=structuredClone(structured);
 p.groups=[{id:groupId,title:'證據與觀點',color:'#dde8cb',cardColor:'#f4f6ec',frame:'folder',cardFrame:'note',x:24,y:24,width:724,height:478,collapsed:false}];
 const tag=crypto.randomUUID();p.tags=[{id:tag,title:'待查證',color:'#ede1cf'}];p.cards[0].tagIds=[tag];p.relations=[{id:crypto.randomUUID(),from:p.cards[0].id,to:p.cards[1].id,kind:'補充',label:'比較不同假設'}];p.outline={groupIds:[groupId],cardIds:p.cards.map(c=>c.id)};p.view={x:16,y:16,zoom:.75};return p;
}
