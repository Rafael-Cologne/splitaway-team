const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('public/index.html','utf8');
const i18n=fs.readFileSync('public/js/i18n.js','utf8');
const slice=(a,b)=>html.slice(html.indexOf(`function ${a}(`),html.indexOf(`function ${b}(`,html.indexOf(`function ${a}(`)));
const names=['Раф','Аня','Игорь','Эля','Эми'];
const expenses=[
  ...names.map(name=>({amount:1149.28,participants:[name]})),
  {amount:252,participants:names},
  {amount:197.56,participants:['Раф','Аня']},
  {amount:274.76,participants:['Игорь','Эля','Эми']},
  {amount:132,participants:['Раф','Аня']},
  {amount:193,participants:['Игорь','Эля','Эми']},
  {amount:851.52,participants:['Раф','Аня']},
  {amount:1062.47,participants:['Игорь','Эля','Эми'],pairReps:{'Игорь\x1fЭля\x1fЭми':'Игорь'}},
].map(e=>({...e,paidBy:'Раф',fromTreasury:false}));
const context={S:{members:names.map(name=>({name})),groups:[
  {type:'couple',members:['Раф','Аня']},
  {type:'family',members:['Игорь','Эля','Эми']},
],expenses,settledDebts:['Игорь','Эля','Эми'].map(from=>({from,to:'Раф',amount:1355.6}))}};
context.groupOf=name=>context.S.groups.find(group=>group.members.includes(name));
vm.createContext(context);
vm.runInContext(slice('getPairRepForExp','calcBal'),context);
vm.runInContext(slice('calcBal','simplify'),context);
const cents=n=>Math.round(n*100);
const shares=context.calcExpenseShares();
const balances=context.calcBal();
assert.equal(cents(expenses.reduce((sum,e)=>sum+e.amount,0)),870971);
assert.equal(cents(shares['Аня']),179022);
assert.equal(cents(balances['Аня']),-179022);
assert.equal(cents(shares['Игорь']),241807);
assert.equal(cents(balances['Игорь']),-106247);
assert.equal(cents(shares['Раф']+shares['Аня']),358044);
assert.equal(cents(shares['Игорь']+shares['Эля']+shares['Эми']),512927);
assert.equal(cents(balances['Раф']+balances['Аня']),106247);
assert.equal(cents(balances['Игорь']+balances['Эля']+balances['Эми']),-106247);
assert.equal(cents(Object.values(balances).reduce((sum,n)=>sum+n,0)),0);
for(const key of ['bal_personal_net','bal_group_net','bal_persons_help']){
  assert.equal((i18n.match(new RegExp(`${key}:`,'g'))||[]).length,7,`${key} missing translation`);
}
assert(html.includes("t('bal_persons_help')"));
assert(html.includes("t('bal_personal_net')"));
assert(html.includes("t('bal_group_net')"));
console.log('PASS: Anna share and -1790.22 balance, group totals and net balances, zero-sum invariant, 7-language explanation');
