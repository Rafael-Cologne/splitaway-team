const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');

class Element {
  constructor(){this.children=[];this.style={};this.textContent='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  set innerHTML(_){throw new Error('Notification used an HTML sink');}
}
const list=new Element();
const dot=new Element();
const context={
  Date,
  document:{createElement:()=>new Element(),getElementById:id=>id==='notif-list'?list:id==='notif-dot'?dot:null},
  S:{me:'Игорь',members:[{name:'Игорь',gender:'m'}]},
  fm:value=>`${Number(value).toFixed(2)} €`,
  t:key=>({notif_empty:'No updates',notif_new_expense:'Новый расход',notif_amount:'Сумма',notif_paid_by:'Платил',notif_expense_changed:'Расход изменён',exp_from_treasury:'Из общей кассы'})[key]||key,
};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('const _notifLog=[]'),html.indexOf('function _rtExpenseNotif(')),context);
vm.runInContext(html.slice(html.indexOf('function _renderNotifDot(){'),html.indexOf('function openNotifPanel(){')),context);
vm.runInContext(html.slice(html.indexOf('function _rtExpenseNotif('),html.indexOf('function _rtMemberNotif(')),context);

context.addNotif('💸','First expense');
context.addNotif('🗑️','<img src=x onerror=alert(1)>');
context._renderNotifList();
assert.equal(list.children.length,1);
assert.equal(list.children[0].children[1].children[0].textContent,'<img src=x onerror=alert(1)>');
assert.equal(dot.style.display,'block');
context._rtNotifOnce('exp_upd','💸','Expense changed: A',3000);
context._rtNotifOnce('exp_upd','💸','Expense changed: B',3000);
context._renderNotifList();
assert.equal(list.children.length,1);
assert.equal(list.children[0].children[1].children[0].textContent,'Expense changed: B');

const added={id:'new',name:'Test 2',amount:2,paidBy:'Игорь'};
context.rememberLocalExpenseAction(added.id);
context.notifyExpenseCreated(added);
const expected='Новый расход: Test 2 · Сумма: 2.00 € · Платил: Игорь';
context._renderNotifList();
assert.equal(list.children[0].children[1].children[0].textContent,expected);
const oldHotel={id:'hotel',name:'Отель Чжанцзяцзе',amount:60,paid_by:'Игорь',participants:['Игорь'],from_treasury:false};
context._rtExpenseNotif({eventType:'UPDATE',old:oldHotel,new:{...oldHotel}});
context._rtExpenseNotif({eventType:'INSERT',new:{...added,created_by:'Игорь'}});
context._renderNotifList();
assert.equal(list.children[0].children[1].children[0].textContent,expected,'realtime echoes must not replace the new expense');
context._rtExpenseNotif({eventType:'INSERT',new:{id:'other',name:'Кофе',amount:3,paid_by:'Анна',created_by:'Анна'}});
context._renderNotifList();
assert.equal(list.children[0].children[1].children[0].textContent,'Новый расход: Кофе · Сумма: 3.00 € · Платил: Анна');
context._rtExpenseNotif({eventType:'UPDATE',old:{...oldHotel},new:{...oldHotel,amount:61}});
context._renderNotifList();
assert.equal(list.children[0].children[1].children[0].textContent,'Расход изменён: Отель Чжанцзяцзе');

const translations={localStorage:{getItem:()=>null}};
vm.createContext(translations);
vm.runInContext(fs.readFileSync('public/js/i18n.js','utf8'),translations);
for(const lang of ['ru','en','de','es','fr','pt','it']){
  vm.runInContext(`_lang='${lang}'`,translations);
  for(const key of ['notif_expense_deleted','notif_expense_changed','notif_new_expense','notif_amount','notif_paid_by','notif_joined_m','notif_joined_f','notif_left_m','notif_left_f','notif_group_created','notif_group_deleted']){
    assert.notEqual(translations.t(key),key,`${lang}: ${key}`);
  }
}
console.log('PASS: Test 2 remains latest after unchanged hotel update and own echo; remote new and real edit; safe text; seven languages');
