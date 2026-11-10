const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
const source=html.slice(html.indexOf('function renderBalanceArchive('),html.indexOf('function renderBalances('));
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.listeners={};}
  appendChild(el){this.children.push(el);return el;}
  replaceChildren(){this.children=[];}
  addEventListener(type,handler){this.listeners[type]=handler;}
  set innerHTML(value){throw Error('Unsafe HTML sink');}
}
const payload='<img src=x onerror=alert(1)>';
const snapshot={recordedAt:'2026-10-01T12:00:00Z',recordedBy:'A',fromLabel:'A',toLabel:'B',paymentCents:2500,debtBeforeCents:10000,debtAfterCents:7500};
const context={document:{createElement:tag=>new Element(tag)},fm:n=>Number(n).toFixed(2),fdate:String,shareForExp:()=>50,isTripAdmin:()=>false,
 S:{expenses:[{name:payload,date:'2026-09-29',paidBy:'B',amount:100,participants:['A','B']}],treasury:{contributions:[{member:'A',date:'2026-09-28',amount:10}]},settledDebts:[
 {id:'1',groupSettleId:'g',from:'A',to:'B',amount:30,paymentSnapshot:snapshot},
 {id:'2',groupSettleId:'g',from:'B',to:'A',amount:5,paymentSnapshot:snapshot},
 {id:'old',from:'C',to:'D',date:'2026-09-30',amount:8}
 ]}};
context.localStorage={getItem:()=>null};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/js/i18n.js','utf8'),context);
vm.runInContext(fs.readFileSync('public/js/archive-i18n.js','utf8'),context);
vm.runInContext(source,context);
const root=new Element('main');context.renderBalanceArchive(root);
const flatten=el=>[el.textContent,...el.children.flatMap(flatten)];
let texts=flatten(root);
assert(texts.includes('Расход: '+payload));
assert(texts.includes('A → B: 25.00'));
assert(!texts.includes('A → B: 35.00'));
assert(texts.some(s=>s.includes('Остаток после: 75.00')));
assert(texts.some(s=>s.includes('точное время не сохранялись')));
assert.equal(root.children[1].children[0].textContent,'Погашение долга');
context.isTripAdmin=()=>true;
context.renderBalanceArchive(root);
assert(root.children.some(card=>card.children.some(child=>child.tag==='button'&&child.textContent===context.t('settlement_void_button'))));
context.S.settledDebts.filter(d=>d.groupSettleId==='g').forEach(d=>{d.voidedAt='2026-10-01T13:00:00Z';});
context.getLang=()=> 'ru';
context.renderBalanceArchive(root);
assert(flatten(root).includes(context.t('settlement_voided_label')));
assert(!root.children[1].children.some(child=>child.tag==='button'));
context.S.settledDebts.filter(d=>d.groupSettleId==='g').forEach(d=>{delete d.voidedAt;});
const count=root.children.length;context.renderBalanceArchive(root);assert.equal(root.children.length,count);
context.S={expenses:[],treasury:{contributions:[]},settledDebts:[]};context.renderBalanceArchive(root);
assert(flatten(root).some(s=>s.includes('Архив пока пуст')));
assert(html.includes("balTab('archive',this)"));
for(const language of ['ru','en','de','es','fr','pt','it']){
  vm.runInContext(`_lang='${language}'`,context);
  for(let i=0;i<27;i++)assert.notEqual(context.t('archive_'+i),'archive_'+i);
  for(const key of ['settlement_void_button','settlement_void_confirm','settlement_voided_label','settlement_voided_at','settlement_void_success','settlement_void_error'])assert.notEqual(context.t(key),key);
  context.renderBalanceArchive(root);
  assert(flatten(root).includes(context.t('archive_15')));
}
console.log('PASS: archive ordering, expenses/contributions/payments, group deduplication, remaining debt, legacy warning, literal XSS text, rerender, empty state');
