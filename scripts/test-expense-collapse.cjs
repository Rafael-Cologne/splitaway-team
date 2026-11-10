const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('public/index.html','utf8');
const start=html.indexOf('const _collapsedExpenseDatesMemory=');
const end=html.indexOf('function showExpDetail(',start);
assert(start>=0&&end>start);
const source=html.slice(start,end);
const storage=new Map();
const list={innerHTML:'',listeners:{},addEventListener(type,handler){this.listeners[type]=handler;},contains(){return true;}};
const groups=new Map();
const header={attrs:{},setAttribute(key,value){this.attrs[key]=value;}};
const context={
  S:{trip:{id:'DBB0Y4'},expenses:[
    {id:'1',date:'2026-10-03',amount:20},
    {id:'2',date:'2026-10-01',amount:10},
  ]},
  localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,value)},
  document:{getElementById:id=>id==='exp-list'?list:groups.get(id),querySelector:()=>header},
  t:key=>key,fdate:String,fm:n=>String(n),expRow:e=>`<div>${e.id}</div>`,initializeIcons:()=>{},
};
vm.createContext(context);
vm.runInContext(source,context);

context.renderExpenses();
assert.match(list.innerHTML,/data-exp-date="2026-10-03" aria-expanded="true"/);
assert.equal((list.innerHTML.match(/data-exp-date=/g)||[]).length,2);
assert(!list.innerHTML.includes('onclick="toggleExpGroup'));
groups.set('eg20261003',{style:{display:'flex'}});
groups.set('chev-eg20261003',{style:{}});
context.toggleExpGroup('2026-10-03');
assert.equal(groups.get('eg20261003').style.display,'none');
assert.equal(header.attrs['aria-expanded'],'false');
assert.equal(JSON.parse(storage.get('sw_exp_collapsed_DBB0Y4'))[0],'2026-10-03');
context.renderExpenses();
assert.match(list.innerHTML,/data-exp-date="2026-10-03" aria-expanded="false"/);
assert.match(list.innerHTML,/id="eg20261003" style="display:none/);
assert.match(list.innerHTML,/id="eg20261001" style="display:flex/);
const clickHandler=list.listeners.click;
context.renderExpenses();
assert.equal(list.listeners.click,clickHandler,'listener should not duplicate on tab navigation');

context.S.trip.id='SECOND';
context.renderExpenses();
assert.match(list.innerHTML,/data-exp-date="2026-10-03" aria-expanded="true"/);
context.S.trip.id='DBB0Y4';
context.renderExpenses();
assert.match(list.innerHTML,/data-exp-date="2026-10-03" aria-expanded="false"/);

context.toggleExpGroup('2026-10-03');
assert.equal(storage.get('sw_exp_collapsed_DBB0Y4'),'[]');
console.log('PASS: collapsed dates persist across tab renders, remain trip-specific, reopen, update ARIA, and keep one listener');
