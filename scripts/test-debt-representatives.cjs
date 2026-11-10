const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('public/index.html','utf8');
const i18n=fs.readFileSync('public/js/i18n.js','utf8');

assert(!html.includes("balTab('persons',this)"),'Persons tab should not be visible');
assert(html.includes("balTab('archive',this)"),'Archive tab remains available');
const detail=html.slice(html.indexOf('function showGroupDebtDetail('),html.indexOf('async function doSettleGroupedDebt('));
assert(!detail.includes('settle-from-modal'),'Debt details must not contain a second settle button');
const individualDetail=html.slice(html.indexOf('function showDebtDetail('),html.indexOf('function showPersonDetail('));
assert(!individualDetail.includes('openDebtPayment('),'Individual debt details must not contain a second settle button');
const payment=html.slice(html.indexOf('function openDebtPayment('),html.indexOf('function balTab('));
assert(payment.includes('debtRepresentativeName(gd.fromInfo)'));
assert(payment.includes('debtRepresentativeName(gd.toInfo)'));
assert.equal((i18n.match(/label_couple_rep_question:/g)||[]).length,7);
assert(!i18n.includes('На чьё имя считать расходы пары?'));

const source=html.slice(html.indexOf('function debtRepresentativeName('),html.indexOf('function renderGroupedDebtRow('));
const pair={type:'couple',members:['Раф','Аня']};
const family={type:'family',members:['Игорь','Эля','Эми']};
const context={S:{groups:[pair,family]},getGrpRep:g=>g===pair?'Раф':'Игорь'};
vm.createContext(context);vm.runInContext(source,context);
assert.equal(context.debtRepresentativeName({isGroup:true,members:family.members,label:'Семья'}),'Игорь');
assert.equal(context.debtRepresentativeName({isGroup:true,members:pair.members,label:'Пара'}),'Раф');
context.getGrpRep=()=>'<invalid>';
assert.equal(context.debtRepresentativeName({isGroup:true,members:family.members,label:'Семья'}),'Игорь');
console.log('PASS: two balance tabs, single settlement entry point, Igor → Raf representatives, generic setting in seven languages');
