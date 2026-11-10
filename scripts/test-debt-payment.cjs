const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=readFileSync('public/index.html','utf8');
function extract(name){
  const start=html.indexOf('function '+name+'(');
  const end=html.indexOf('\nfunction ',start+1);
  return html.slice(start,end<0?undefined:end).replace(/\n\/\/[^]*$/,'');
}
const parser=extract('parseDebtPaymentCents');
const parse=vm.runInNewContext(parser+';parseDebtPaymentCents');
const simplify=vm.runInNewContext(extract('simplify')+';simplify');
assert.equal(simplify({A:-0.01,B:0.01})[0].amount,0.01);
assert.equal(simplify({A:-0.00999999999,B:0.00999999999})[0].amount,0.01);
assert.equal(simplify({A:0,B:0}).length,0);
assert.equal(simplify({A:-75,B:75})[0].amount,75);
for(const [value,want] of [['10',1000],['10,25',1025],['0.01',1],[' 1.20 ',120],['0',null],['-1',null],['1.001',null],['NaN',null],['1e3',null],['',null]])assert.equal(parse(value),want);
// Parse every inline script without executing application or contacting production.
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
async function scenario(payment,success=true,throws=false){
  let counter=0;
  const context={S:{me:'A',trip:{id:'test'},settledDebts:[]},USE_SUPABASE:true,
    _settlePending:false,_syncTimer:null,_debtDetailState:null,
    canRecordDebtPayment:()=>true,calcBal:()=>({}),
    simplify:()=>[{from:'A',to:'B',amount:100}],
    buildGroupedDebts:()=>[{fromInfo:{key:'A'},toInfo:{key:'B'},amount:100}],
    debtRepresentativeName:info=>info.label||info.members?.[0]||'',
    uid:()=>String(++counter),today:()=> '2026-10-01',saveLocal:()=>{},
    sbSync:async()=>{if(throws)throw Error('network');return success;},
    renderBalances:()=>{},renderDash:()=>{},toast:()=>{},t:s=>s,fm:String,
    clearTimeout:()=>{},closeModal:()=>{},onProtectedUiFinished:()=>{},
    document:{getElementById:()=>null}};
  const start=html.indexOf('async function doSettleGroupedDebt(');
  const end=html.indexOf('// ── Event delegation',start);
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const button={textContent:'Погасить',innerHTML:'Погасить',disabled:false};
  await context.doSettleGroupedDebt({fromInfo:{key:'A',members:['A'],label:'A'},toInfo:{key:'B',members:['B'],label:'B'},amount:100},button,true,payment);
  assert.equal(context._settlePending,false);assert.equal(button.disabled,false);
  return context.S.settledDebts.reduce((s,d)=>s+Math.round(d.amount*100),0);
}
(async()=>{
  assert.equal(await scenario(2500),2500);
  assert.equal(await scenario(undefined),10000);
  assert.equal(await scenario(1),1);
  assert.equal(await scenario(10001),0);
  assert.equal(await scenario(2500,false),0);
  assert.equal(await scenario(2500,true,true),0);
  console.log('PASS: 10 amount cases, inline JS syntax, full/partial/cent/overpayment, sync failure and exception cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
