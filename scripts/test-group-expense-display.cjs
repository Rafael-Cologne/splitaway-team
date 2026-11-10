const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('public/index.html', 'utf8');
function section(start, end) {
  const first = html.indexOf(`function ${start}(`);
  const last = html.indexOf(`function ${end}(`, first);
  assert(first >= 0 && last > first, `Missing ${start}`);
  return html.slice(first, last);
}
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.innerHTML = ''; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  setAttribute(name, value) { this[name] = value; }
  contains() { return true; }
}
const membersRoot = new Element('div');
const balancesRoot = new Element('div');
const detailRoot = new Element('div');
const expenses = [
  {amount:1149.28,participants:['Раф']},
  {amount:1149.28,participants:['Аня']},
  {amount:1149.28,participants:['Игорь']},
  {amount:1149.28,participants:['Эля']},
  {amount:1149.28,participants:['Эми']},
  {amount:252,participants:['Раф','Аня','Игорь','Эля','Эми']},
  {amount:197.56,participants:['Раф','Аня']},
  {amount:274.76,participants:['Игорь','Эля','Эми']},
  {amount:132,participants:['Раф','Аня']},
  {amount:193,participants:['Игорь','Эля','Эми']},
].map((e,i)=>({id:String(i),name:`Расход ${i+1}`,date:'2026-09-01',paidBy:'Раф',fromTreasury:false,items:[],...e}));
const context = {
  S: {
    me:'Раф',adminName:'Раф',balTab:'persons',
    members:['Раф','Аня','Игорь','Эля','Эми'].map(name=>({name})),
    groups:[
      {id:'pair',type:'couple',members:['Раф','Аня']},
      {id:'family',type:'family',label:'Семья',members:['Игорь','Эля','Эми']},
    ],
    expenses,
    settledDebts:[
      ...['Игорь','Эля','Эми'].map(from=>({from,to:'Раф',amount:1355.6})),
      {from:'Игорь',to:'Раф',amount:2,voidedAt:'2026-10-01'},
    ],
  },
  document:{getElementById:id=>id==='d-members'?membersRoot:id==='bal-content'?balancesRoot:detailRoot,createElement:tag=>new Element(tag)},
  groupedDebtStore:new Map(),
  t:key=>({pair_label:'Пара',family_label:'Семья',dash_total_label:'Общие расходы',bal_share_label:'Доля',group_close_label:'Закрыть',dash_no_expenses:'Нет расходов',badge_you:'вы'})[key]||key,
  fm:n=>Number(n).toFixed(2).replace('.',',')+' €',
  ac:()=> '#333',escHtml:String,mg:()=> 'm',fdate:String,
  memberLastAction:()=>null,initializeIcons:()=>{},
  createTextElement:(tag,value,cls)=>{const el=new Element(tag);el.textContent=String(value);el.className=cls;return el;},
  setSafeText:(el,value)=>{el.textContent=String(value);},
  openModal:()=>{},closeModal:()=>{},showExpDetail:()=>{},
  simplify:()=>[],
};
context.groupOf=name=>context.S.groups.find(g=>g.members.includes(name));
vm.createContext(context);
vm.runInContext(section('getPairRepForExp','calcBal'),context);
vm.runInContext(section('calcBal','simplify'),context);
vm.runInContext(section('bindGroupExpenseHeaders','memberLastAction'),context);
vm.runInContext(section('renderBalances','showPersonDetail'),context);

const shares=context.calcExpenseShares();
assert.equal(context.S.expenses.reduce((sum,e)=>sum+Math.round(e.amount*100),0),679572);
assert.equal(['Раф','Аня'].reduce((sum,n)=>sum+Math.round(shares[n]*100),0),272892);
assert.equal(['Игорь','Эля','Эми'].reduce((sum,n)=>sum+Math.round(shares[n]*100),0),406680);
assert.equal(Object.values(shares).reduce((sum,n)=>sum+Math.round(n*100),0),679572);
assert.equal(Object.values(context.expenseSharesCents(expenses[7])).reduce((sum,n)=>sum+n,0),27476);
assert.equal(Object.values(context.expenseSharesCents(expenses[9])).reduce((sum,n)=>sum+n,0),19300);
const splitExpense={amount:10,participants:['Раф','Игорь'],splits:{Раф:6.25,Игорь:3.75}};
assert.equal(context.expenseSharesCents(splitExpense)['Игорь'],375);
const pairExpense={amount:10,participants:['Раф','Аня','Игорь','Эля','Эми'],pairReps:{'Аня\x1fРаф':'Раф'}};
assert.equal(context.expenseSharesCents(pairExpense)['Раф'],400);
assert.equal(context.expenseSharesCents(pairExpense)['Аня']||0,0);
assert.equal(Object.values(context.expenseSharesCents(pairExpense)).reduce((sum,n)=>sum+n,0),1000);
const before=JSON.stringify(shares);
context.S.settledDebts=[];
assert.equal(JSON.stringify(context.calcExpenseShares()),before,'Repayments must not change expense shares');
context.renderMembersList();
assert.match(membersRoot.innerHTML,/Общие расходы: <span[^>]*>2728,92 €/);
assert.match(membersRoot.innerHTML,/Общие расходы: <span[^>]*>4066,80 €/);
assert(!membersRoot.innerHTML.includes('Погашено долгов'));
assert.equal(typeof membersRoot.listeners.click,'function');
membersRoot.listeners.click({target:{closest:()=>({dataset:{groupIndex:'1'}})}});
assert.equal(detailRoot.children[1].children[0].textContent,'4066,80 €');
context.renderBalances();
assert.match(balancesRoot.innerHTML,/Общие расходы: 2728,92 €/);
assert.match(balancesRoot.innerHTML,/Общие расходы: 4066,80 €/);
assert(!balancesRoot.innerHTML.includes('Погашено долгов'));
assert.equal(typeof balancesRoot.listeners.click,'function');
context.showGroupExpenseDetail(1);
assert.equal(detailRoot.children[1].children[0].textContent,'4066,80 €');
assert.equal(detailRoot.children[2].children.length,6);
const familyRows=detailRoot.children[2].children;
assert.equal(familyRows[0].children[1].textContent,'193,00 €');
assert.equal(familyRows[1].children[1].textContent,'274,76 €');
context.showGroupExpenseDetail(0);
assert.equal(detailRoot.children[1].children[0].textContent,'2728,92 €');
assert.equal(detailRoot.children[2].children.length,5);
assert.equal(context.S.expenses.length,10,'Historical expenses must remain unchanged');
console.log('PASS: DBB0Y4 6795.72 = pair 2728.92 + family 4066.80; group detail rows; repayment independence; history unchanged');
