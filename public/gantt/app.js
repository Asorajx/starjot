'use strict';

/* Local-first project state */
const STORAGE_KEY = 'gantt-studio-saas-v1';
const DAY = 86400000;
const STATUS = {todo:'To do',progress:'In progress',review:'In review',done:'Done',blocked:'Blocked'};
const TYPES = {epic:{label:'Epic',icon:'◆'},feature:{label:'Feature',icon:'▣'},task:{label:'Task',icon:'✓'}};
const PALETTE = ['#4e82f7','#2466d9','#17a0b5','#28a58c','#8a72e7','#db8e48','#db6488','#536780'];
const $ = id => document.getElementById(id);
const clone = obj => JSON.parse(JSON.stringify(obj));
const blankState = () => ({version:5,title:'Untitled project',members:[],sprints:[],items:[],collapsedSprints:{},collapsedItems:{}});
const uid = kind => kind+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
const esc = val => String(val??'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const xml = val => String(val??'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const colorOK = val => /^#[0-9a-f]{6}$/i.test(String(val??''));
const safeString = (val, max=140) => String(val??'').trim().slice(0,max);
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const two = n => String(n).padStart(2,'0');
function iso(d){return [d.getFullYear(),two(d.getMonth()+1),two(d.getDate())].join('-')}
function parseDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v??''))return null;const [y,m,d]=v.split('-').map(Number);const date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null}
function addDays(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n)}
function diffDays(a,b){return Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/DAY)}
function weekStart(d){return addDays(d,-((d.getDay()+6)%7))}
function today(){return iso(new Date())}
const niceDate = d => d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const niceMonth = d => d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
function fmtRange(a,b){return niceDate(parseDate(a))+' – '+niceDate(parseDate(b))}
function dateStart(){return iso(weekStart(new Date()))}
function dateEnd(start,n=6){return iso(addDays(parseDate(start),n))}

let state=blankState();
let zoom='week', expand=false, search='', editor=null, range=null, rows=[], drag=null;
let initialized=false, toastTimeout=0;

function sanitizeProject(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.items)||!Array.isArray(raw.sprints))throw Error('This does not look like a Gantt Studio project backup.');
  const result=blankState();result.title=safeString(raw.title,70)||'Untitled project';
  const sprintIDs=new Set(), itemIDs=new Set();
  for(const [sIdx,s] of raw.sprints.slice(0,300).entries()){
    if(!s||!safeString(s.name)||!parseDate(s.start)||!parseDate(s.end)||s.start>s.end)continue;
    const id=safeString(s.id,100)||uid('s');if(sprintIDs.has(id))continue;sprintIDs.add(id);
    result.sprints.push({id,name:safeString(s.name),start:s.start,end:s.end,order:Number.isFinite(+s.order)?+s.order:sIdx});
  }
  for(const [tIdx,t] of raw.items.slice(0,1500).entries()){
    if(!t||!safeString(t.name)||!parseDate(t.start)||!parseDate(t.end)||t.start>t.end)continue;
    const id=safeString(t.id,100)||uid('i');if(itemIDs.has(id))continue;itemIDs.add(id);
    result.items.push({id,name:safeString(t.name),type:TYPES[t.type]?t.type:'task',parentId:safeString(t.parentId,100),sprintId:sprintIDs.has(t.sprintId)?t.sprintId:'',status:STATUS[t.status]?t.status:'todo',assignee:safeString(t.assignee,80),start:t.start,end:t.end,color:colorOK(t.color)?t.color:PALETTE[0],progress:clamp(Number(t.progress)||0,0,100),manualBacklog:t.manualBacklog===true,order:Number.isFinite(+t.order)?+t.order:tIdx});
  }
  // Keep member choices in project backups, including names from older JSON and CSV imports.
  const members=[...(Array.isArray(raw.members)?raw.members:[]),...result.items.map(t=>t.assignee)];
  const seenMembers=new Set();
  result.members=members.map(m=>safeString(m,80)).filter(m=>{const key=m.toLocaleLowerCase();if(!m||seenMembers.has(key))return false;seenMembers.add(key);return true}).slice(0,200);
  const byId=new Map(result.items.map(t=>[t.id,t]));
  for(const item of result.items){
    const parent=byId.get(item.parentId);
    if(!parent||parent.id===item.id||!validParentType(item.type,parent.type))item.parentId='';
    const visited=new Set([item.id]);let p=byId.get(item.parentId);
    while(p){if(visited.has(p.id)){item.parentId='';break}visited.add(p.id);p=byId.get(p.parentId)}
  }
  for(const [to,from] of [['collapsedSprints',raw.collapsedSprints],['collapsedItems',raw.collapsedItems]]){
    if(from&&typeof from==='object')for(const [k,v] of Object.entries(from).slice(0,1600))if(v===true)result[to][k]=true;
  }
  return result;
}
function restore(){
  try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)state=sanitizeProject(JSON.parse(saved))}catch(err){state=blankState();console.warn('Could not restore saved project:',err)}
}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
  catch(err){console.warn('Local storage unavailable:',err);toast('Could not save automatically. Export a JSON backup.')}
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2400)}
function importNotice(message,kind='info'){
  const el=$('importNotice');
  el.className='import-notice'+(kind==='info'?'':' '+kind);
  $('importNoticeMessage').textContent=message;
  el.hidden=false;
}
function mutate(callback){callback();save();render()}
function findItem(id){return state.items.find(x=>x.id===id)}
function findSprint(id){return state.sprints.find(x=>x.id===id)}
function childrenOf(parentId,sprintId){return state.items.filter(x=>x.parentId===parentId&&x.sprintId===sprintId)}
function allDescendants(id){let seen=new Set([id]),change=true;while(change){change=false;for(const t of state.items)if(seen.has(t.parentId)&&!seen.has(t.id)){seen.add(t.id);change=true}}return seen}
// Epics are summaries, not actionable tasks. Calculate completion from all nested tasks
// (including tasks nested beneath features or other tasks), independent of collapsed rows.
function epicCompletion(id){
  const ids=allDescendants(id);
  const tasks=state.items.filter(t=>t.type==='task'&&t.id!==id&&ids.has(t.id));
  const total=tasks.length,done=tasks.filter(t=>t.status==='done').length;
  return {total,done,percent:total?Math.round(done/total*100):0};
}
function epicProgressHtml(id){
  const {total,done,percent}=epicCompletion(id);
  return `<div class="epic-progress" role="progressbar" aria-label="Epic completion: ${done} of ${total} tasks done" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" title="${total?`${done} of ${total} tasks done`:'No tasks yet'}"><span class="mini-track"><b style="width:${percent}%"></b></span><span class="mini-percent">${percent}%</span></div>`;
}
function validParentType(type,parentType){return (type==='feature'&&parentType==='epic')||(type==='task'&&(parentType==='epic'||parentType==='feature'||parentType==='task'))}
function getRange(){
  const dates=[parseDate(today())];
  for(const s of state.sprints)dates.push(parseDate(s.start),parseDate(s.end));
  for(const t of state.items)dates.push(parseDate(t.start),parseDate(t.end));
  dates.sort((a,b)=>a-b);
  let min=weekStart(addDays(dates[0],-14));
  let max=addDays(weekStart(addDays(dates[dates.length-1],27)),6);
  const defaultEnd=addDays(weekStart(parseDate(today())),48);
  if(max<defaultEnd)max=defaultEnd;
  const px={day:42,week:22,month:7.5}[zoom];
  const span=diffDays(min,max)+1;
  return {start:min,end:max,span,px,width:Math.round(span*px),weekPx:px*7};
}
function xOf(date){return diffDays(range.start,parseDate(date))*range.px}
function widthOf(a,b){return Math.max(range.px,(diffDays(parseDate(a),parseDate(b))+1)*range.px)}
// Jira Epics are containers. An Epic can have no Sprint value even when its
// children are scheduled. Display it with its children without editing Jira data.
// A manual move to Backlog overrides this visual inference.
function displaySprintId(item){
  if(!item)return '';
  if(item.sprintId || item.type!=='epic' || item.manualBacklog)return item.sprintId||'';
  const family=allDescendants(item.id);
  const counts=new Map();
  for(const child of state.items){
    if(child.id===item.id || !family.has(child.id) || !child.sprintId)continue;
    counts.set(child.sprintId,(counts.get(child.sprintId)||0)+1);
  }
  if(!counts.size)return '';
  const valid=state.sprints.filter(s=>counts.has(s.id));
  valid.sort((a,b)=>(counts.get(b.id)-counts.get(a.id))||(a.order??0)-(b.order??0));
  return valid[0]?.id||'';
}
function getGroups(){
  const groups=[...state.sprints].sort((a,b)=>a.order-b.order||a.start.localeCompare(b.start)||a.name.localeCompare(b.name)).map(s=>({id:s.id,name:s.name,start:s.start,end:s.end,isBacklog:false}));
  if(state.items.some(t=>!displaySprintId(t)))groups.push({id:'__backlog__',name:'Backlog',start:'',end:'',isBacklog:true});
  return groups;
}
function itemSort(a,b){return (a.order??0)-(b.order??0)||a.name.localeCompare(b.name)}
function visibleRows(){
  const out=[];
  for(const g of getGroups()){
    const sectionId=g.isBacklog?'':g.id;
    const set=state.items.filter(t=>displaySprintId(t)===sectionId);
    const byId=new Map(set.map(t=>[t.id,t]));
    const isMatch=t=>t.name.toLowerCase().includes(search)||t.assignee.toLowerCase().includes(search);
    const matched=new Set();
    if(search)for(const t of set.filter(isMatch)){matched.add(t.id);let p=byId.get(t.parentId);while(p&&!matched.has(p.id)){matched.add(p.id);p=byId.get(p.parentId)}}
    const include=t=>!search||matched.has(t.id);
    if(search&&!set.some(include)&&!g.name.toLowerCase().includes(search))continue;
    out.push({kind:'sprint',group:g,count:set.length});
    if(state.collapsedSprints[g.id]&&!search)continue;
    const roots=set.filter(t=>!byId.has(t.parentId)).sort(itemSort);
    const drawn=new Set();
    function walk(t,depth){
      if(drawn.has(t.id)||depth>12||!include(t))return;
      drawn.add(t.id);
      const children=set.filter(child=>child.parentId===t.id).sort(itemSort);
      out.push({kind:'item',item:t,depth,children:children.length});
      if(!state.collapsedItems[t.id]||search)for(const child of children)walk(child,depth+1);
    }
    for(const root of roots)walk(root,0);
  }
  return out;
}
function tickMarkup(){
  let months='',ticks='';
  for(let current=new Date(range.start.getFullYear(),range.start.getMonth(),1);current<=range.end;current=new Date(current.getFullYear(),current.getMonth()+1,1)){
    const next=new Date(current.getFullYear(),current.getMonth()+1,1);
    const lo=Math.max(0,diffDays(range.start,current));const hi=Math.min(range.span,diffDays(range.start,next));
    if(hi>lo)months+=`<span class="month-label" style="left:${lo*range.px}px;width:${(hi-lo)*range.px}px">${esc(niceMonth(current))}</span>`;
  }
  const step=zoom==='day'?1:zoom==='week'?7:14;
  for(let i=0;i<range.span;i+=step){
    const d=addDays(range.start,i),isCur=diffDays(d,parseDate(today()))>=0&&diffDays(d,parseDate(today()))<step;
    const label=zoom==='day'?`${d.getDate()} ${d.toLocaleDateString('en-GB',{month:'short'})}`:zoom==='week'?niceDate(d):niceDate(d);
    ticks+=`<span class="scale-tick ${isCur?'current':''}" style="left:${i*range.px}px;width:${Math.min(step,range.span-i)*range.px}px">${esc(label)}</span>`;
  }
  const todayX=xOf(today())+range.px*.5;
  return `<div class="timeline-head" style="width:${range.width}px"><div class="month-labels">${months}</div><div class="scale-labels">${ticks}</div><i class="today-topline" title="Today" style="left:${todayX}px"></i></div>`;
}
function twistHtml(data,id,hasChildren,collapsed=false){
  if(!hasChildren)return '<span class="tree-toggle inert" aria-hidden="true"></span>';
  return `<button type="button" class="tree-toggle ${collapsed?'collapsed':''}" ${data}="${esc(id)}" aria-label="${collapsed?'Expand':'Collapse'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg></button>`;
}
function memberOptions(selected=''){
  const members=[...state.members];
  if(selected&&!members.some(m=>m.toLocaleLowerCase()===selected.toLocaleLowerCase()))members.push(selected);
  return `<option value="">Unassigned</option>`+members.sort((a,b)=>a.localeCompare(b)).map(m=>`<option value="${esc(m)}" ${m===selected?'selected':''}>${esc(m)}</option>`).join('');
}
function sprintRow(r){
  const {group:g,count}=r;
  const isBacklog=g.isBacklog;
  const related=state.items.filter(i=>displaySprintId(i)===(isBacklog?'':g.id));
  const tasks=related.filter(t=>t.type==='task');
  const done=tasks.filter(t=>t.status==='done').length,pct=tasks.length?Math.round(done/tasks.length*100):0;
  const controls=`${isBacklog?'<span class="row-drag-placeholder"></span>':`<span class="row-drag-handle" draggable="true" data-sort-sprint="${esc(g.id)}" title="Drag to reorder sprint" aria-label="Drag ${esc(g.name)} to reorder" role="button" tabindex="0">⠿</span>`}${twistHtml('data-collapse-sprint',g.id,true,!!state.collapsedSprints[g.id])}<span class="work-text" data-edit-sprint="${esc(g.id)}">${esc(g.name)}</span><span class="child-count">${count}</span><button class="inline-add" data-add-epic="${esc(g.id)}" title="Add epic to sprint" aria-label="Add epic to ${esc(g.name)}">+</button>`;
  const meta=`<div class="meta-cell"><div class="cell-work">${controls}</div><div class="cell-status"><div class="sprint-summary"><span class="mini-track"><b style="width:${pct}%"></b></span><span class="mini-percent">${pct}%</span></div></div><div class="cell-assignee"><span class="sprint-date-small">${isBacklog?'No sprint':esc(fmtRange(g.start,g.end))}</span></div></div>`;
  const bar=isBacklog?'':`<div class="gantt-bar sprint-bar" data-edit-sprint="${esc(g.id)}" style="left:${xOf(g.start)}px;width:${widthOf(g.start,g.end)}px" title="${esc(g.name)} · ${esc(fmtRange(g.start,g.end))}"><span>${esc(g.name)}</span></div>`;
  const timeline=`<div class="timeline-cell" style="width:${range.width}px;--week-px:${range.weekPx}px">${bar}<i class="today-line" style="left:${xOf(today())+range.px*.5}px"></i></div>`;
  return `<div class="grid-row sprint-row ${isBacklog?'backlog-row':''}" data-row-sprint="${esc(g.id)}">${meta}${timeline}</div>`;
}
function itemRow(r){
  const t=r.item;const hasChildren=r.children>0;const collapsed=!!state.collapsedItems[t.id];
  const w=18+Math.min(r.depth,7)*19;
  const icon=TYPES[t.type];
  const crossParent=findItem(t.parentId);
  const parentHint=crossParent&&displaySprintId(crossParent)!==displaySprintId(t)?` · Parent: ${crossParent.name}`:'';
  const work=`<span class="row-drag-handle" draggable="true" data-sort-item="${esc(t.id)}" title="Drag to reorder or move work item" aria-label="Drag ${esc(t.name)} to reorder" role="button" tabindex="0">⠿</span>${twistHtml('data-collapse-item',t.id,hasChildren,collapsed)}<span class="work-type ${t.type}">${icon.icon}</span><span class="work-text" data-edit-item="${esc(t.id)}" title="${esc(t.name+parentHint)}">${esc(t.name)}</span>${hasChildren?`<span class="child-count">${r.children}</span>`:''}<button type="button" class="inline-add" data-add-child="${esc(t.id)}" title="Add child work item" aria-label="Add child to ${esc(t.name)}">+</button>`;
  const statuses=Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('');
  const initials=t.assignee?esc(t.assignee.split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase()):'–';
  const statusContent=t.type==='epic'?epicProgressHtml(t.id):`<select class="status-picker ${t.status}" data-status="${esc(t.id)}" aria-label="Status for ${esc(t.name)}">${statuses}</select>`;
  const meta=`<div class="meta-cell"><div class="cell-work" style="padding-left:${w}px">${work}</div><div class="cell-status">${statusContent}</div><div class="cell-assignee"><span class="assignee-bubble">${initials}</span><select class="assignee-select" data-assignee="${esc(t.id)}" aria-label="Assignee for ${esc(t.name)}">${memberOptions(t.assignee)}</select></div></div>`;
  const bar=`<div class="gantt-bar draggable-bar ${t.type==='epic'?'epic-gantt-bar':''}" ${t.type==='epic'?`data-completion="${epicCompletion(t.id).percent}%"`: ''} data-drag-item="${esc(t.id)}" tabindex="0" role="button" aria-label="Drag to reschedule ${esc(t.name)}; drag ends to resize; press Enter to edit" style="--bar-color:${t.color};left:${xOf(t.start)}px;width:${widthOf(t.start,t.end)}px" title="Drag to move · Drag edges to resize · ${esc(fmtRange(t.start,t.end))}"><i class="bar-handle start" data-drag-edge="start"></i><span>${esc(t.name)}</span><i class="bar-handle end" data-drag-edge="end"></i></div>`;
  const tl=`<div class="timeline-cell" style="width:${range.width}px;--week-px:${range.weekPx}px">${bar}<i class="today-line" style="left:${xOf(today())+range.px*.5}px"></i></div>`;
  return `<div class="grid-row" data-row-item="${esc(t.id)}">${meta}${tl}</div>`;
}
function emptyMarkup(){return `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18"/><path d="M7 8h10M7 12h7M7 16h5"/></svg></div><h3>Make a plan, see the timeline.</h3><p>Create a sprint or your first work item to start mapping out a project.</p><button class="primary-button" type="button" data-empty-action="sprint">+ Create sprint</button></div>`}
function render({recenter=false}={}){
  const scroll=$('ganttScroll'),lastX=scroll.scrollLeft,lastY=scroll.scrollTop;
  range=getRange();rows=visibleRows();
  const head=`<div class="grid-header"><div class="meta-head"><span class="head-label">WORK</span><span class="head-label">STATUS</span><span class="head-label">ASSIGNEE</span></div>${tickMarkup()}</div>`;
  const content=rows.map(r=>r.kind==='sprint'?sprintRow(r):itemRow(r)).join('');
  const blank=!state.items.length&&!state.sprints.length;
  $('ganttContent').innerHTML=`<div style="--week-px:${range.weekPx}px">${head}${content}</div>${blank?emptyMarkup():''}${search&&!rows.length?'<div class="no-matches">No work matches your search.</div>':''}`;
  const rowH=parseFloat(getComputedStyle($('timelineCard')).getPropertyValue('--row-h'))||36;
  const sprintH=parseFloat(getComputedStyle($('timelineCard')).getPropertyValue('--sprint-h'))||39;
  const headerH=parseFloat(getComputedStyle($('timelineCard')).getPropertyValue('--header-h'))||58;
  const estimatedH=headerH+rows.reduce((height,r)=>height+(r.kind==='sprint'?sprintH:rowH),0)+45;
  $('ganttContent').style.minHeight=`${Math.max(scroll.clientHeight,estimatedH)}px`;
  $('projectTitle').value=state.title;
  $('counts').textContent=`${state.items.length} ${state.items.length===1?'item':'items'} · ${state.sprints.length} ${state.sprints.length===1?'sprint':'sprints'}`;
  $('subtitle').textContent=state.items.length?`${state.items.length} work items across ${state.sprints.length} sprint${state.sprints.length===1?'':'s'}.`:'Plan sprints, structure work, and track delivery.';
  $('clearSearch').hidden=!search;
  if(!initialized||recenter){initialized=true;requestAnimationFrame(()=>scrollToToday());}
  else{scroll.scrollLeft=lastX;scroll.scrollTop=lastY;}
}
function getMetaWidth(){return parseFloat(getComputedStyle($('timelineCard')).getPropertyValue('--meta-w'))||600}
function scrollToToday(){
  const sc=$('ganttScroll');

  /* On an empty embedded mobile chart, keep the Create sprint prompt visible. */
  if(document.documentElement.classList.contains('embedded')&&window.innerWidth<=770&&!state.items.length&&!state.sprints.length){
    sc.scrollLeft=0;
    return;
  }

  const timelineViewport=Math.max(220,sc.clientWidth-getMetaWidth());
  const target=xOf(today())+range.px*.5;
  sc.scrollLeft=clamp(getMetaWidth()+target-sc.clientWidth/2-getMetaWidth()/3,0,sc.scrollWidth-sc.clientWidth);
}
function changeZoom(z){if(!['day','week','month'].includes(z))return;zoom=z;document.querySelectorAll('[data-zoom]').forEach(b=>b.classList.toggle('active',b.dataset.zoom===z));render({recenter:true})}

/* Timeline bars: move or resize. Sprint dates and colours are edited only in their form. */
function shiftMonths(date,count){
  const source=parseDate(date),first=new Date(source.getFullYear(),source.getMonth()+count,1);
  const last=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  first.setDate(Math.min(source.getDate(),last));return iso(first);
}
function dragShift(date,dx){
  if(zoom==='month')return shiftMonths(date,Math.round(dx/(range.px*30.4375)));
  const days=zoom==='week'?Math.round(dx/(range.px*7))*7:Math.round(dx/range.px);
  return iso(addDays(parseDate(date),days));
}
function dragDates(d,dx){
  let start=d.originalStart,end=d.originalEnd;
  if(d.mode==='move'){start=dragShift(start,dx);end=dragShift(end,dx)}
  else if(d.mode==='start'){start=dragShift(start,dx);if(start>end)start=end}
  else {end=dragShift(end,dx);if(end<start)end=start}
  return {start,end};
}
function beginBarDrag(e){
  const bar=e.target.closest('.draggable-bar');
  if(!bar||e.button!==0||drag)return;
  const item=findItem(bar.dataset.dragItem);if(!item)return;
  e.preventDefault();
  drag={pointerId:e.pointerId,bar,id:item.id,startX:e.clientX,mode:e.target.closest('[data-drag-edge]')?.dataset.dragEdge||'move',originalStart:item.start,originalEnd:item.end,started:false,dates:{start:item.start,end:item.end}};
  bar.classList.add('drag-active');
}
function moveBarDrag(e){
  if(!drag||e.pointerId!==drag.pointerId)return;
  const dx=e.clientX-drag.startX;
  if(!drag.started&&Math.abs(dx)<4)return;
  drag.started=true;
  drag.dates=dragDates(drag,dx);
  const {start,end}=drag.dates;
  drag.bar.style.left=xOf(start)+'px';drag.bar.style.width=widthOf(start,end)+'px';
  drag.bar.title=fmtRange(start,end);
  drag.bar.classList.add('drag-moving');
  $('dragTooltip').textContent=fmtRange(start,end);
  $('dragTooltip').style.left=clamp(e.clientX+12,8,window.innerWidth-170)+'px';
  $('dragTooltip').style.top=clamp(e.clientY-40,8,window.innerHeight-40)+'px';
  $('dragTooltip').hidden=false;
}
function finishBarDrag(e,cancelled=false){
  if(!drag||e.pointerId!==drag.pointerId)return;
  const current=drag;drag=null;$('dragTooltip').hidden=true;
  current.bar.classList.remove('drag-active','drag-moving');
  if(cancelled){render();return}
  if(!current.started){if(current.mode==='move')openEditor('item',current.id);return}
  const {start,end}=current.dates;
  if(start===current.originalStart&&end===current.originalEnd){render();return}
  mutate(()=>{const item=findItem(current.id);if(item){item.start=start;item.end=end}});
  toast('Dates updated · '+fmtRange(start,end));
}

/* Reusable team roster. */
function redrawMembers(){
  const members=$('membersList');
  members.innerHTML=state.members.length?state.members.map(name=>{
    const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    const assigned=state.items.filter(i=>i.assignee===name).length;
    return `<div class="member-row"><span class="member-avatar">${esc(initials)}</span><span class="member-name">${esc(name)}</span><span class="member-count">${assigned} assigned</span><button type="button" class="remove-member" data-remove-member="${esc(name)}" title="Remove ${esc(name)}" aria-label="Remove ${esc(name)}">Remove</button></div>`;
  }).join(''):'<div class="members-empty">No team members yet.</div>';
  if(editor?.kind==='item'){
    const current=$('editAssignee').value;
    $('editAssignee').innerHTML=memberOptions(current);
    $('editAssignee').value=current;
  }
}
function openMembers(){redrawMembers();$('memberError').textContent='';$('membersBackdrop').hidden=false;$('membersDialog').classList.add('open');$('membersDialog').setAttribute('aria-hidden','false');$('newMemberName').focus()}
function closeMembers(){$('membersDialog').classList.remove('open');$('membersDialog').setAttribute('aria-hidden','true');$('membersBackdrop').hidden=true}
function addMember(e){
  e.preventDefault();const name=safeString($('newMemberName').value,80);
  if(!name){$('memberError').textContent='Enter a member name.';return}
  if(state.members.some(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase())){$('memberError').textContent='That member already exists.';return}
  if(state.members.length>=200){$('memberError').textContent='Member limit reached.';return}
  state.members.push(name);save();render();redrawMembers();$('newMemberName').value='';$('memberError').textContent='';$('newMemberName').focus();
}
function removeMember(name){
  const assigned=state.items.filter(i=>i.assignee===name).length;
  if(assigned&&!confirm(`Remove ${name}? This will unassign ${assigned} work item${assigned===1?'':'s'}.`))return;
  mutate(()=>{state.members=state.members.filter(m=>m!==name);for(const item of state.items)if(item.assignee===name)item.assignee=''});
  redrawMembers();
}

/* Editor */
function sprintOptions(value=''){return `<option value="">Backlog</option>`+state.sprints.map(s=>`<option value="${esc(s.id)}" ${s.id===value?'selected':''}>${esc(s.name)}</option>`).join('')}
function parentOptions(type,sprintId,currentID='',value=''){
  const descendants=currentID?allDescendants(currentID):new Set();
  const choices=state.items.filter(p=>validParentType(type,p.type)&&!descendants.has(p.id));
  return `<option value="">No parent</option>`+choices.map(p=>`<option value="${esc(p.id)}" ${p.id===value?'selected':''}>${esc(TYPES[p.type].label)} · ${esc(p.name)}</option>`).join('');
}
function setSwatches(selected){
  const box=$('swatches');
  if(!box.childElementCount)box.innerHTML=PALETTE.map(c=>`<button type="button" class="swatch" data-swatch="${c}" style="--swatch:${c}" aria-label="Use ${c} colour" title="${c}"></button>`).join('');
  box.querySelectorAll('[data-swatch]').forEach(b=>b.classList.toggle('active',b.dataset.swatch.toLowerCase()===selected.toLowerCase()));
}
function syncEditorParents(){
  if(!editor||editor.kind!=='item')return;
  const type=$('editType').value,sprint=$('editSprint').value,prev=$('editParent').value;
  $('editParent').innerHTML=parentOptions(type,sprint,editor.id,prev);
  if([...$('editParent').options].some(o=>o.value===prev))$('editParent').value=prev;
}
function updateColor(value){if(!colorOK(value))return;$('editColor').value=value;setSwatches(value)}
function refreshEditorProgress(){
  const isEpic=$('editType').value==='epic';
  $('editStatusField').hidden=isEpic;
  $('editProgressField').hidden=isEpic;
  $('epicCompletionField').hidden=!isEpic;
  if(isEpic){
    const {done,total,percent}=editor?.id?epicCompletion(editor.id):{done:0,total:0,percent:0};
    $('epicCompletionValue').textContent=`${percent}%`;
    $('epicCompletionTrack').style.width=`${percent}%`;
    $('epicCompletionDetail').textContent=total?`${done} of ${total} tasks done`:'No tasks yet';
  }
}
function openEditor(kind,id='',opts={}){
  editor={kind,id};
  const sprint=kind==='sprint'&&id?findSprint(id):null;
  const item=kind==='item'&&id?findItem(id):null;
  const parent=opts.parentId?findItem(opts.parentId):null;
  const referenceSprint=findSprint(item?.sprintId||opts.sprintId||parent?.sprintId||'');
  const start=item?.start||sprint?.start||parent?.start||referenceSprint?.start||dateStart();
  const end=item?.end||sprint?.end||parent?.end||referenceSprint?.end||dateEnd(start,6);
  $('drawerOverline').textContent=kind==='sprint'?'SPRINT':'WORK ITEM';
  $('drawerTitle').textContent=id?`Edit ${kind==='sprint'?'sprint':'work item'}`:`New ${kind==='sprint'?'sprint':'work item'}`;
  $('itemFields').hidden=kind==='sprint';$('sprintInfo').hidden=kind!=='sprint';
  $('editName').value=item?.name||sprint?.name||(kind==='sprint'?`Sprint ${state.sprints.length+1}`:'');
  $('editStart').value=start;$('editEnd').value=end;
  $('deleteButton').hidden=!id;
  $('formError').textContent='';
  if(kind==='item'){
    $('editType').value=item?.type||opts.type||'task';
    $('editStatus').value=item?.status||'todo';
    refreshEditorProgress();
    $('editSprint').innerHTML=sprintOptions(item?displaySprintId(item):(opts.sprintId??(parent?displaySprintId(parent):'')));
    $('editAssignee').innerHTML=memberOptions(item?.assignee||'');
    syncEditorParents();
    $('editParent').value=item?.parentId||opts.parentId||'';
    updateColor(item?.color||PALETTE[0]);
    $('editProgress').value=item?.progress??0;
    $('progressOutput').value=`${item?.progress??0}%`;
  }
  $('backdrop').hidden=false;
  $('drawer').classList.add('open');$('drawer').setAttribute('aria-hidden','false');
  setTimeout(()=>$('editName').focus(),40);
}
function closeEditor(){editor=null;$('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');$('backdrop').hidden=true}
function saveEditor(){
  if(!editor)return;
  const name=safeString($('editName').value),start=$('editStart').value,end=$('editEnd').value;
  if(!name){$('formError').textContent='Enter a name.';return}
  if(!parseDate(start)||!parseDate(end)||end<start){$('formError').textContent='Choose a valid start date and an end date on or after it.';return}
  if(editor.kind==='sprint'){
    mutate(()=>{
      const s=findSprint(editor.id);if(s)Object.assign(s,{name,start,end});
      else state.sprints.push({id:uid('s'),name,start,end,order:state.sprints.length});
    });closeEditor();toast('Sprint saved');return;
  }
  const type=$('editType').value,status=$('editStatus').value,sprintId=$('editSprint').value;
  let parentId=$('editParent').value;
  const p=findItem(parentId);
  if(parentId&&(!p||!validParentType(type,p.type)||(editor.id&&allDescendants(editor.id).has(parentId)))){$('formError').textContent='Choose a valid parent work item.';return}
  const progress=type==='epic'?0:status==='done'?100:clamp(Number($('editProgress').value),0,100);
  const color=$('editColor').value;
  mutate(()=>{
    const item=findItem(editor.id);
    const fields={name,type,parentId,sprintId,manualBacklog:type==='epic'&&!sprintId,status:type==='epic'?'todo':status,assignee:safeString($('editAssignee').value,80),start,end,color:colorOK(color)?color:PALETTE[0],progress};
    if(item){const oldSprint=item.sprintId,moved=oldSprint!==sprintId;Object.assign(item,fields);if(moved){const family=allDescendants(item.id);for(const t of state.items)if(family.has(t.id)&&t.id!==item.id&&t.sprintId===oldSprint)t.sprintId=sprintId}for(const child of state.items.filter(t=>t.parentId===item.id))if(!validParentType(child.type,item.type))child.parentId=''}
    else state.items.push({id:uid('i'),...fields,order:state.items.length});
  });closeEditor();toast('Work item saved');
}
function deleteEditor(){
  if(!editor?.id)return;
  if(editor.kind==='sprint'){
    const s=findSprint(editor.id);if(!s||!confirm(`Delete sprint "${s.name}"? Its work items will move to Backlog.`))return;
    mutate(()=>{state.sprints=state.sprints.filter(x=>x.id!==s.id);for(const t of state.items)if(t.sprintId===s.id)t.sprintId='';delete state.collapsedSprints[s.id]});
  }else{
    const t=findItem(editor.id);if(!t)return;const ids=allDescendants(t.id),desc=ids.size-1;
    if(!confirm(`Delete "${t.name}"${desc?` and ${desc} nested work item${desc===1?'':'s'}`:''}?`))return;
    mutate(()=>{state.items=state.items.filter(x=>!ids.has(x.id));for(const id of ids)delete state.collapsedItems[id]});
  }
  closeEditor();toast('Deleted');
}

/* File export */
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),6000)}
function filename(ext){return (safeString(state.title,55).replace(/[^a-z0-9_-]+/gi,'_')||'Gantt_Studio')+'.'+ext}
function csvValue(value){
  let s=String(value??'');
  // Prevent a downloaded spreadsheet from executing a formula in Excel.
  if(/^\s*[=+@-]/.test(s))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function exportCSV(){
  const columns=['Key','Type','Name','Start','End','Sprint','Parent','Status','Assignee','Color','Progress','Order','Placement'];
  const sprintName=new Map(state.sprints.map(s=>[s.id,s.name]));
  const entries=[...state.sprints.map(s=>[s.id,'Sprint',s.name,s.start,s.end,'','','','','','',s.order??0,'']),
    ...state.items.map(i=>[i.id,TYPES[i.type].label,i.name,i.start,i.end,sprintName.get(i.sprintId)||'',i.parentId||'',i.type==='epic'?'':STATUS[i.status],i.assignee,i.color,i.type==='epic'?epicCompletion(i.id).percent:i.progress,i.order??0,i.manualBacklog?'Backlog':''])];
  const content='\uFEFF'+[columns,...entries].map(row=>row.map(csvValue).join(',')).join('\r\n')+'\r\n';
  download(new Blob([content],{type:'text/csv;charset=utf-8'}),filename('csv'));
  toast('CSV spreadsheet exported');
}
function generateSVG(){
  const exportRows=visibleRows();
  const dates=[...state.items.flatMap(t=>[parseDate(t.start),parseDate(t.end)]),...state.sprints.flatMap(s=>[parseDate(s.start),parseDate(s.end)])].filter(Boolean);
  dates.sort((a,b)=>a-b);
  const first=dates[0]||parseDate(today()),last=dates.at(-1)||addDays(first,14);
  const exportStart=weekStart(addDays(first,-7));
  const exportEnd=addDays(weekStart(addDays(last,13)),6);
  const span=diffDays(exportStart,exportEnd)+1;
  const ePx=Math.min(20,Math.max(4.2,2100/span));
  const left=386,head=100,rowH=27,margin=15;
  const w=Math.ceil(left+span*ePx+margin),h=Math.max(172,head+exportRows.length*rowH+8);
  const E=[];
  const rect=(x,y,ww,hh,fill,extra='')=>E.push(`<rect x="${x}" y="${y}" width="${Math.max(0,ww)}" height="${hh}" fill="${fill}" ${extra}/>`);
  const line=(x1,y1,x2,y2,col,sw=1)=>E.push(`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${col}" stroke-width="${sw}"/>`);
  const text=(x,y,t,size=12,col='#243451',weight=500,extra='')=>E.push(`<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" fill="${col}" ${extra}>${xml(t)}</text>`);
  const label=(value,max=48)=>String(value).length>max?String(value).slice(0,max-1)+'…':String(value);
  const point=d=>left+diffDays(exportStart,parseDate(d))*ePx;
  const spanWidth=(a,b)=>Math.max(ePx,(diffDays(parseDate(a),parseDate(b))+1)*ePx);
  rect(0,0,w,h,'#fff');
  rect(0,0,w,57,'#f8fbff');rect(0,0,4,57,'#3978f7');
  text(17,25,label(state.title||'Untitled project',75),18,'#15284b',700);
  text(17,44,`${state.items.length} WORK ITEMS   ·   ${state.sprints.length} SPRINTS`,9,'#8492a7',700);
  rect(0,57,w,43,'#edf3ff');line(0,head,w,head,'#d9e4f4');
  text(18,84,'WORK',9,'#627796',750);text(307,84,'STATUS',9,'#627796',750);
  const tickStep=span>160?28:7;
  for(let i=0;i<span;i+=tickStep){
    const xx=left+i*ePx;
    line(xx,57,xx,h,'#e8edf5');
    text(xx+5,84,niceDate(addDays(exportStart,i)),9,'#7d8da3',600);
  }
  line(left,57,left,h,'#cbd9ed',1.3);
  for(let i=0;i<exportRows.length;i++){
    const r=exportRows[i],y=head+i*rowH;
    rect(0,y,w,rowH,r.kind==='sprint'?'#eef5ff':i%2?'#fff':'#fafcff');
    line(0,y+rowH,w,y+rowH,'#edf1f7');
    if(r.kind==='sprint'){
      const g=r.group;
      text(17,y+18,(state.collapsedSprints[g.id]?'▸  ':'▾  ')+label(g.name,40),10,'#294569',700);
      if(!g.isBacklog){
        const bx=point(g.start),bw=spanWidth(g.start,g.end);
        rect(bx,y+7,bw,14,'#dce9ff');rect(bx,y+7,3,14,'#3978f7');
        text(bx+7,y+17,label(g.name,Math.max(2,Math.floor(bw/6.4))),8,'#3866ba',700);
      }
    }else{
      const t=r.item,indent=Math.min(6,r.depth)*13;
      rect(17+indent,y+10,7,7,t.type==='epic'?'#9778d9':t.type==='feature'?'#4f86e9':'#31b191');
      text(30+indent,y+18,label(t.name,43-Math.floor(indent/8)),9.5,'#30435e',570);
      if(t.type==='epic'){
        const {done,total,percent}=epicCompletion(t.id);
        rect(307,y+12,46,5,'#dbe6fc');
        rect(307,y+12,46*percent/100,5,'#3978f7');
        text(358,y+18,`${percent}%`,9,'#3866ba',650);
      }else text(307,y+18,STATUS[t.status],9,'#6a7c97',530);
      const bx=point(t.start),bw=spanWidth(t.start,t.end);
      rect(bx,y+6,bw,15,t.color);
      text(bx+5,y+17,label(t.name,Math.max(2,Math.floor(bw/6.1))),8,'#fff',650);
    }
  }
  const todayOffset=diffDays(exportStart,parseDate(today()));
  if(todayOffset>=0&&todayOffset<span){
    const todayX=left+(todayOffset+.5)*ePx;
    line(todayX,57,todayX,h,'#3980f7',1.2);rect(todayX-2.5,56,5,5,'#3980f7');
  }
  E.unshift(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  E.push('</svg>');
  return {markup:E.join(''),width:w,height:h};
}
async function doExport(format){
  if(format==='csv'){exportCSV();return;}
  if(format==='json'){
    download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),filename('json'));
    toast('Project backup downloaded');return;
  }
  const {markup,width,height}=generateSVG();
  if(format==='svg'){download(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),filename('svg'));toast('SVG exported');return}
  if(format==='png'){
    try{
      const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('SVG image could not be loaded'));img.src=url});
      const scale=Math.min(2,6000/width,10000/height);
      const c=document.createElement('canvas');c.width=Math.max(1,Math.floor(width*scale));c.height=Math.max(1,Math.floor(height*scale));
      const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed')),'image/png'));
      download(blob,filename('png'));toast('PNG image exported');
    }catch(err){console.error(err);toast('PNG export failed. Try SVG export instead.')}
  }
}
function parseCSV(content){
  let input=String(content??'').replace(/^\uFEFF/,'');
  let forcedDelimiter='';
  const sep=input.match(/^sep=([,;\t])\r?\n/i);
  if(sep){forcedDelimiter=sep[1];input=input.slice(sep[0].length)}
  let first='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'&&quoted&&input[i+1]==='"'){i++;continue}
    if(c==='"')quoted=!quoted;
    if(!quoted&&(c==='\r'||c==='\n'))break;
    first+=c;
  }
  const delimiter=forcedDelimiter||[',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  if(first.split(delimiter).length<2)throw Error('CSV needs a header row with multiple columns.');
  const rows=[];let row=[],field='',inQuotes=false;
  function pushRow(){row.push(field);field='';if(row.some(cell=>cell.trim()!==''))rows.push(row);row=[]}
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){
      if(inQuotes&&input[i+1]==='"'){field+='"';i++}else if(inQuotes||!field.trim())inQuotes=!inQuotes;
      else field+='"';
    }else if(c===delimiter&&!inQuotes){row.push(field);field=''}
    else if((c==='\r'||c==='\n')&&!inQuotes){pushRow();if(c==='\r'&&input[i+1]==='\n')i++}
    else field+=c;
  }
  if(inQuotes)throw Error('CSV contains an unclosed quoted field.');
  if(field.length||row.length)pushRow();
  return rows;
}
function csvDate(value){
  const v=safeString(value,70);
  if(!v)return '';
  if(/^\d{5}(?:\.0+)?$/.test(v)){
    const serial=Number(v);
    if(serial>=20000&&serial<=80000)return iso(new Date(Date.UTC(1899,11,30)+serial*DAY));
  }
  const yearFirst=v.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:[T\s].*)?$/);
  if(yearFirst){const day=`${yearFirst[1]}-${two(+yearFirst[2])}-${two(+yearFirst[3])}`;return parseDate(day)?day:null}
  const isoDay=v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if(isoDay){const day=`${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;return parseDate(day)?day:null}
  const numeric=v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s+.*)?$/);
  if(numeric){
    let [,d,m,y]=numeric;let year=+y;if(year<100)year+=year>=70?1900:2000;
    if(+m>12&&+d<=12)[d,m]=[m,d]; // unambiguous US-style dates
    const day=`${year}-${two(+m)}-${two(+d)}`;return parseDate(day)?day:null;
  }
  const named=v.match(/^(\d{1,2})[\s/-]([a-z]{3,9})[\s/-](\d{2,4})(?:\s+.*)?$/i);
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  if(named){let year=+named[3];if(year<100)year+=year>=70?1900:2000;const m=months.indexOf(named[2].slice(0,3).toLowerCase());if(m<0)return null;const day=`${year}-${two(m+1)}-${two(+named[1])}`;return parseDate(day)?day:null}
  const monthFirst=v.match(/^([a-z]{3,9})[\s/-]+(\d{1,2}),?[\s/-]+(\d{2,4})(?:\s+.*)?$/i);
  if(monthFirst){let year=+monthFirst[3];if(year<100)year+=year>=70?1900:2000;const m=months.indexOf(monthFirst[1].slice(0,3).toLowerCase());if(m>=0){const day=`${year}-${two(m+1)}-${two(+monthFirst[2])}`;return parseDate(day)?day:null}}
  return null;
}
function csvType(value){
  const v=safeString(value,60).toLowerCase().replace(/[\s_-]/g,'');
  if(v==='sprint')return 'sprint';
  if(v==='epic'||v==='initiative')return 'epic';
  if(['feature','story','userstory'].includes(v))return 'feature';
  return 'task';
}
function csvStatus(value){
  const v=safeString(value,50).toLowerCase().replace(/[\s_-]/g,'');
  if(['done','complete','completed','closed','resolved'].includes(v))return 'done';
  if(['inprogress','progress','doing','started'].includes(v))return 'progress';
  if(['review','inreview','inqa','testing'].includes(v))return 'review';
  if(['blocked','onhold','impediment'].includes(v))return 'blocked';
  return 'todo';
}
function csvProject(textContent,filenameHint){
  const data=parseCSV(textContent);
  if(data.length<2)throw Error('CSV is empty. Add at least one work item.');
  const cols=data[0].map(h=>safeString(h,100).toLowerCase().replace(/[^a-z0-9]/g,''));
  const locate=(...aliases)=>aliases.map(a=>cols.indexOf(a)).find(idx=>idx>=0)??-1;
  const fields={
    name:locate('name','summary','taskname','task','title','developmenttask','workitem'),
    type:locate('type','issuetype','workitemtype'),
    key:locate('key','issuekey','taskid','id','workitemid'),
    start:locate('start','startdate','plannedstart','plannedstartdate','begin'),
    inferredStart:locate('inferredstartdate'),
    end:locate('end','enddate','duedate','finish','finishdate','targetend'),
    inferredEnd:locate('inferredduedate','inferredenddate'),
    sprint:locate('sprint','sprintname','iteration'),
    placement:locate('placement'),
    parent:locate('parent','parentkey','parentid','parentissue','parentissuekey','parentworkitem'),
    epic:locate('epiclink','epickey'),
    status:locate('status','state'),assignee:locate('assignee','assignedto','owner'),
    color:locate('color','colour'),progress:locate('progress','percentcomplete','completion'),order:locate('order','sortorder','position')
  };
  if(fields.name<0)throw Error('Could not find a Name or Summary column. Detected: '+data[0].slice(0,8).join(', ').slice(0,175)+'.');
  const cell=(r,k)=>fields[k]<0?'':safeString(r[fields[k]],200);
  const project=blankState();
  project.title=safeString(filenameHint.replace(/\.(csv|txt)$/i,'').replace(/[_-]/g,' '),70)||'Imported project';
  const incoming=[],sprints=new Map();let skipped=0,defaults=0,badDates=0;
  for(const row of data.slice(1)){
    if(!row.some(v=>v.trim()))continue;
    const name=cell(row,'name'),type=csvType(cell(row,'type'));
    if(!name){skipped++;continue}
    const rawStart=cell(row,'start')||cell(row,'inferredStart'),rawEnd=cell(row,'end')||cell(row,'inferredEnd');
    let start=csvDate(rawStart),end=csvDate(rawEnd);
    // Keep the work item, but clearly tell the user when a date was not recognised.
    if(rawStart&&!start){start='';badDates++}
    if(rawEnd&&!end){end='';badDates++}
    if(start&&end&&start>end){end=start;badDates++}
    const entry={name,type,start,end,key:cell(row,'key'),sprint:cell(row,'sprint'),parent:cell(row,'parent')||cell(row,'epic'),status:cell(row,'status'),assignee:cell(row,'assignee'),color:cell(row,'color'),progress:cell(row,'progress'),order:cell(row,'order'),placement:cell(row,'placement')};
    if(type==='sprint')sprints.set(name.toLowerCase(),entry);
    else incoming.push(entry);
  }
  if(!incoming.length&&!sprints.size)throw Error('No valid sprint or work item rows were found.');
  // Preserve Jira sprint assignments; Epic placement in the chart is inferred separately.
  const allSprintNames=new Map([...sprints.values()].map(s=>[s.name.toLowerCase(),s.name]));
  for(const item of incoming){
    if(item.sprint&&item.sprint.toLowerCase()!=='backlog')allSprintNames.set(item.sprint.toLowerCase(),item.sprint);
  }
  const sprintIds=new Map();
  for(const [lower,name] of allSprintNames){
    const explicit=sprints.get(lower);
    const members=incoming.filter(t=>t.sprint.toLowerCase()===lower);
    const starts=members.map(m=>m.start).filter(Boolean).sort();
    const ends=members.map(m=>m.end).filter(Boolean).sort();
    let start=explicit?.start||starts[0]||dateStart();
    let end=explicit?.end||ends.at(-1)||dateEnd(start);
    if(end<start)end=start;
    const id=explicit?.key||uid('s');
    const uniqueId=project.sprints.some(s=>s.id===id)?uid('s'):id;
    project.sprints.push({id:uniqueId,name,start,end,order:Number.isFinite(+explicit?.order)&&explicit?.order!==''?+explicit.order:project.sprints.length});sprintIds.set(lower,uniqueId);
  }
  const used=new Set(project.sprints.map(s=>s.id));
  const keyed=new Map(),named=new Map(),pending=[];
  for(const item of incoming.slice(0,1500)){
    const sprintId=sprintIds.get(item.sprint.toLowerCase())||'';
    const sprint=project.sprints.find(s=>s.id===sprintId);
    const start=item.start||sprint?.start||item.end||dateStart();
    const end=item.end||((item.start||!sprint)?dateEnd(start):sprint.end);
    if(end<start){skipped++;continue}
    if(!item.start||!item.end)defaults++;
    const id=item.key&&!used.has(item.key)?item.key:uid('i');used.add(id);
    const progressRaw=Number(item.progress.replace('%',''));
    const progress=Number.isFinite(progressRaw)?clamp(progressRaw,0,100):0;
    const next={id,name:item.name,type:item.type,parentId:'',sprintId,status:csvStatus(item.status),assignee:item.assignee.slice(0,80),start,end,color:colorOK(item.color)?item.color:PALETTE[0],progress,manualBacklog:item.type==='epic'&&item.placement.toLowerCase()==='backlog',order:item.order!==''&&Number.isFinite(+item.order)?+item.order:project.items.length};
    project.items.push(next);pending.push({row:item,created:next});
    if(item.key&&!keyed.has(item.key.toLowerCase()))keyed.set(item.key.toLowerCase(),next);
    if(!named.has(item.name.toLowerCase()))named.set(item.name.toLowerCase(),next);
  }
  for(const {row,created} of pending){
    const ref=row.parent.toLowerCase();
    const parent=keyed.get(ref)||named.get(ref);
    if(parent&&parent.id!==created.id&&validParentType(created.type,parent.type))created.parentId=parent.id;
  }
  const result=sanitizeProject(project);
  if(!result.items.length&&!result.sprints.length)throw Error('No valid rows to import.');
  return {project:result,items:result.items.length,sprints:result.sprints.length,skipped:skipped+Math.max(0,incoming.length-1500),defaults,badDates};
}
async function readImportText(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]===0x50&&bytes[1]===0x4b)throw Error('This looks like an Excel .xlsx file. In Excel, choose File → Save As → CSV UTF-8, then import the .csv file.');
  if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes);
  // Some Excel CSV exports use UTF-16 without a BOM.
  if(bytes.length>8&&bytes[1]===0&&bytes[3]===0)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes.length>8&&bytes[0]===0&&bytes[2]===0)return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}
async function importProject(file){
  if(!file)return;
  try{
    if(/\.xlsx?$/i.test(file.name))throw Error('Excel .xlsx files cannot be imported directly. Save the sheet as CSV UTF-8 first.');
    const isCSV=/\.(csv|tsv|txt)$/i.test(file.name)||/csv|tab-separated/i.test(file.type);
    const content=await readImportText(file);
    const result=isCSV?csvProject(content,file.name):null;
    const project=isCSV?result.project:sanitizeProject(JSON.parse(content));
    if((state.items.length||state.sprints.length)&&!confirm('Import this project? Your current local project will be replaced. Export a JSON backup first if needed.'))return;
    state=project;search='';$('searchInput').value='';initialized=false;save();render();
    if(isCSV){
      const info=`Imported ${result.items} work item${result.items===1?'':'s'} and ${result.sprints} sprint${result.sprints===1?'':'s'}.`;
      const warn=[result.skipped?`${result.skipped} row${result.skipped===1?'':'s'} skipped`:null,result.badDates?`${result.badDates} unrecognised date${result.badDates===1?'':'s'}`:null,result.defaults?`${result.defaults} work item${result.defaults===1?'':'s'} given provisional dates`:null].filter(Boolean);
      importNotice(info+(warn.length?' Check the dates: '+warn.join(' · ')+'.':''),warn.length?'warning':'info');
    }else importNotice('JSON project backup imported.');
  }catch(err){importNotice('Import failed: '+(err.message||'Unknown error')+' Your existing project was not changed.','error');console.error(err)}
}

/* Row ordering: use handles so this does not conflict with resizing timeline bars. */
let sorting=null;
function sortedSiblings(sprintId,parentId){return state.items.filter(t=>t.sprintId===sprintId&&t.parentId===parentId).sort(itemSort)}
function dropLocation(row,event){
  const box=row.getBoundingClientRect(),fraction=(event.clientY-box.top)/box.height;
  if(row.dataset.rowSprint!==undefined)return {mode:'section',sprintId:row.dataset.rowSprint==='__backlog__'?'':row.dataset.rowSprint};
  if(row.dataset.rowItem===undefined)return null;
  const target=findItem(row.dataset.rowItem);if(!target)return null;
  return {mode:fraction<.27?'before':fraction>.73?'after':'inside',target};
}
function validateDrop(loc){
  if(!sorting||!loc)return false;
  if(sorting.kind==='sprint')return loc.mode==='section'&&loc.sprintId&&loc.sprintId!==sorting.id;
  const moving=findItem(sorting.id);if(!moving)return false;
  if(loc.mode==='section')return true;
  const target=loc.target;if(target.id===moving.id)return false;
  const parent=loc.mode==='inside'?target:findItem(target.parentId);
  if(parent&&(!validParentType(moving.type,parent.type)||allDescendants(moving.id).has(parent.id)))return false;
  return true;
}
function clearSortIndicators(){document.querySelectorAll('.sort-before,.sort-after,.sort-inside,.sort-section').forEach(el=>el.classList.remove('sort-before','sort-after','sort-inside','sort-section'))}
function reorderWork(loc){
  const moving=findItem(sorting.id);if(!moving)return;
  const oldSprint=displaySprintId(moving);
  const nextSprint=loc.mode==='section'?loc.sprintId:displaySprintId(loc.target);
  const nextParent=loc.mode==='section'?'':loc.mode==='inside'?loc.target.id:loc.target.parentId;
  const family=allDescendants(moving.id);
  // Move only descendants already in the same section as the dragged parent.
  // Cross-sprint Jira references remain in their originally assigned sections.
  const movingRows=state.items.filter(t=>family.has(t.id)&&displaySprintId(t)===oldSprint).sort(itemSort);
  const movingIds=new Set(movingRows.map(t=>t.id));
  const destination=state.items.filter(t=>displaySprintId(t)===nextSprint&&!movingIds.has(t.id)).sort(itemSort);
  let index=destination.length;
  if(loc.mode==='before'||loc.mode==='after'){
    index=destination.findIndex(t=>t.id===loc.target.id);
    if(index<0)index=destination.length;
    if(loc.mode==='after')index++;
  }else if(loc.mode==='inside'){
    const subtree=allDescendants(loc.target.id);
    const last=destination.findLastIndex(t=>subtree.has(t.id));
    index=last<0?destination.length:last+1;
  }
  moving.parentId=nextParent;
  if(oldSprint!==nextSprint){
    moving.sprintId=nextSprint;
    moving.manualBacklog=moving.type==='epic'&&!nextSprint;
    for(const child of movingRows)if(child.id!==moving.id){
      child.sprintId=nextSprint;
      if(child.type==='epic')child.manualBacklog=!nextSprint;
    }
  }
  destination.splice(index,0,...movingRows);
  destination.forEach((t,i)=>t.order=i);
  if(oldSprint!==nextSprint)state.items.filter(t=>displaySprintId(t)===oldSprint).sort(itemSort).forEach((t,i)=>t.order=i);
}

function handleSortStart(e){
  const handle=e.target.closest('[data-sort-sprint],[data-sort-item]');if(!handle)return;
  sorting={kind:handle.dataset.sortSprint?'sprint':'item',id:handle.dataset.sortSprint||handle.dataset.sortItem};
  e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',sorting.id);
  requestAnimationFrame(()=>handle.closest('.grid-row')?.classList.add('sort-dragging'));
}
function handleSortOver(e){
  if(!sorting)return;
  const row=e.target.closest('[data-row-item],[data-row-sprint]');const loc=row&&dropLocation(row,e);
  clearSortIndicators();if(!validateDrop(loc))return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  row.classList.add(loc.mode==='section'?'sort-section':'sort-'+loc.mode);
}
function handleSortDrop(e){
  if(!sorting)return;
  const row=e.target.closest('[data-row-item],[data-row-sprint]');const loc=row&&dropLocation(row,e);
  if(!validateDrop(loc)){sorting=null;clearSortIndicators();return}
  e.preventDefault();const source=sorting;
  mutate(()=>{
    if(source.kind==='sprint'){
      const sorted=[...state.sprints].sort((a,b)=>a.order-b.order);
      const from=sorted.findIndex(x=>x.id===source.id),to=sorted.findIndex(x=>x.id===loc.sprintId);
      if(from<0||to<0)return;
      const [current]=sorted.splice(from,1);sorted.splice(to,0,current);sorted.forEach((s,i)=>s.order=i);
    }else reorderWork(loc);
  });
  sorting=null;clearSortIndicators();toast('Order updated');
}
function handleSortEnd(){sorting=null;clearSortIndicators();document.querySelectorAll('.sort-dragging').forEach(el=>el.classList.remove('sort-dragging'))}

/* Interactions */
function hideMenus(){for(const el of [$('createMenu'),$('exportMenu')])el.hidden=true;$('createButton').setAttribute('aria-expanded','false');$('exportButton').setAttribute('aria-expanded','false')}
function toggleMenu(id,button){const menu=$(id),was=menu.hidden;hideMenus();menu.hidden=!was;button.setAttribute('aria-expanded',String(was))}
function childType(parent){return parent.type==='epic'?'feature':'task'}
function delegatedClick(e){
  const el=e.target.closest('[data-collapse-sprint],[data-collapse-item],[data-edit-sprint],[data-edit-item],[data-add-epic],[data-add-child],[data-empty-action]');
  if(!el)return;
  const d=el.dataset;
  if(d.collapseSprint!==undefined){state.collapsedSprints[d.collapseSprint]=!state.collapsedSprints[d.collapseSprint];save();render()}
  else if(d.collapseItem!==undefined){state.collapsedItems[d.collapseItem]=!state.collapsedItems[d.collapseItem];save();render()}
  else if(d.editSprint!==undefined){if(d.editSprint!=='__backlog__')openEditor('sprint',d.editSprint)}
  else if(d.editItem!==undefined)openEditor('item',d.editItem);
  else if(d.addEpic!==undefined)openEditor('item','',{type:'epic',sprintId:d.addEpic==='__backlog__'?'':d.addEpic});
  else if(d.addChild!==undefined){const parent=findItem(d.addChild);if(parent)openEditor('item','',{type:childType(parent),parentId:parent.id,sprintId:parent.sprintId})}
  else if(d.emptyAction!==undefined)openEditor('sprint');
}
function onGridChange(e){
  const x=e.target,d=x.dataset;
  if(d.status!==undefined){mutate(()=>{const t=findItem(d.status);if(t&&t.type!=='epic'){const old=t.status;t.status=x.value;if(x.value==='done')t.progress=100;else if(old==='done'&&t.progress===100)t.progress=0}})}
  else if(d.assignee!==undefined)mutate(()=>{const t=findItem(d.assignee);if(t)t.assignee=safeString(x.value,80)});
}
function init(){
  restore();render();
  $('toggleSidebar').addEventListener('click',()=>{
    const collapsed=$('appShell').classList.toggle('rail-collapsed');
    $('toggleSidebar').setAttribute('aria-expanded',String(!collapsed));
    $('toggleSidebar').setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');
    $('toggleSidebar').title=collapsed?'Expand sidebar':'Collapse sidebar';
  });
  $('ganttContent').addEventListener('click',delegatedClick);
  $('ganttContent').addEventListener('dragstart',handleSortStart);
  $('ganttContent').addEventListener('dragover',handleSortOver);
  $('ganttContent').addEventListener('drop',handleSortDrop);
  $('ganttContent').addEventListener('dragend',handleSortEnd);
  $('ganttContent').addEventListener('pointerdown',beginBarDrag);
  window.addEventListener('pointermove',moveBarDrag);
  window.addEventListener('pointerup',finishBarDrag);
  window.addEventListener('pointercancel',e=>finishBarDrag(e,true));
  $('ganttContent').addEventListener('keydown',e=>{const bar=e.target.closest('.draggable-bar');if(bar&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openEditor('item',bar.dataset.dragItem)}});
  $('ganttContent').addEventListener('change',onGridChange);
  $('projectTitle').addEventListener('change',e=>mutate(()=>{state.title=safeString(e.target.value,70)||'Untitled project'}));
  $('projectTitle').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur()});
  $('newSprintButton').addEventListener('click',()=>openEditor('sprint'));
  $('manageMembersButton').addEventListener('click',openMembers);
  $('editManageMembers').addEventListener('click',openMembers);
  $('closeMembers').addEventListener('click',closeMembers);
  $('membersBackdrop').addEventListener('click',closeMembers);
  $('memberForm').addEventListener('submit',addMember);
  $('membersList').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-member]');if(remove)removeMember(remove.dataset.removeMember)});
  $('createButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu('createMenu',$('createButton'))});
  $('exportButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu('exportMenu',$('exportButton'))});
  $('createMenu').addEventListener('click',e=>{const action=e.target.closest('[data-create]')?.dataset.create;if(!action)return;hideMenus();if(action==='sprint')openEditor('sprint');else openEditor('item','',{type:action,sprintId:state.sprints.at(-1)?.id||''})});
  $('exportMenu').addEventListener('click',e=>{const action=e.target.closest('[data-export]')?.dataset.export;if(action){hideMenus();doExport(action)}});
  document.addEventListener('click',e=>{if(!e.target.closest('.menu-anchor'))hideMenus()});
  $('todayButton').addEventListener('click',scrollToToday);
  document.querySelectorAll('[data-zoom]').forEach(btn=>btn.addEventListener('click',()=>changeZoom(btn.dataset.zoom)));
  $('expandButton').addEventListener('click',()=>{expand=!expand;$('timelineCard').classList.toggle('expanded-mode',expand);$('expandButton').title=expand?'Restore columns':'Expand Gantt chart';$('expandButton').setAttribute('aria-label',expand?'Restore columns':'Expand Gantt chart');render()});
  $('searchInput').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();render()});
  $('clearSearch').addEventListener('click',()=>{search='';$('searchInput').value='';render()});
  $('closeDrawer').addEventListener('click',closeEditor);
  $('cancelButton').addEventListener('click',closeEditor);
  $('backdrop').addEventListener('click',closeEditor);
  $('deleteButton').addEventListener('click',deleteEditor);
  $('editorForm').addEventListener('submit',e=>{e.preventDefault();saveEditor()});
  $('editSprint').addEventListener('change',syncEditorParents);
  $('editType').addEventListener('change',()=>{syncEditorParents();refreshEditorProgress()});
  $('editProgress').addEventListener('input',e=>$('progressOutput').value=e.target.value+'%');
  $('swatches').addEventListener('click',e=>{const swatch=e.target.closest('[data-swatch]');if(swatch)updateColor(swatch.dataset.swatch)});
  $('editColor').addEventListener('input',e=>setSwatches(e.target.value));
  $('importButton').addEventListener('click',()=>$('importFile').click());
  $('dismissImportNotice').addEventListener('click',()=>$('importNotice').hidden=true);
  $('importFile').addEventListener('change',async e=>{await importProject(e.target.files[0]);e.target.value=''});
  $('railHelp').addEventListener('click',()=>toast('Export JSON to back up or move your project.'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideMenus();if(!$('membersBackdrop').hidden)closeMembers();else if(editor)closeEditor()}});
}
init();
