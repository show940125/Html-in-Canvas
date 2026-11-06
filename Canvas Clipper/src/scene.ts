import type {Project} from './model';
/** A topic is a single stacking unit: frame, members, then its own lid. */
export function sceneOrder(project:Project,front:string[],selected:string[]){
 const units=[...project.groups.map(g=>'g:'+g.id),...project.cards.filter(c=>!project.groups.some(g=>g.id===c.groupId)).map(c=>'c:'+c.id)];
 const ordered=[...units.filter(id=>!front.includes(id)),...front.filter(id=>units.includes(id))];
 return ordered.flatMap(unit=>{
  if(unit.startsWith('c:'))return[unit.slice(2)];
  const id=unit.slice(2),cards=project.cards.filter(c=>c.groupId===id);
  return[id,...cards.filter(c=>!selected.includes(c.id)).map(c=>c.id),...cards.filter(c=>selected.includes(c.id)).map(c=>c.id),id+'-header'];
 });
}
export function sceneUnit(project:Project,id:string){const c=project.cards.find(c=>c.id===id);return c?(project.groups.some(g=>g.id===c.groupId)?'g:'+c.groupId:'c:'+c.id):'g:'+id;}
