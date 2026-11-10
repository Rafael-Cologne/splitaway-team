const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/index.html','utf8');
const calcSource=html.slice(html.indexOf('function calcBal(){'),html.indexOf('function simplify(',html.indexOf('function calcBal(){')));
const voidSource=html.slice(html.indexOf('let _settlementVoidPending=false;'),html.indexOf('function renderBalances(){',html.indexOf('let _settlementVoidPending=false;')));
assert(calcSource.includes('if(sd.voidedAt)return'));

async function scenario({confirmResult=true,syncResult=true,syncError=false,admin=true}={}){
  let syncCalls=0;
  const records=[
    {id:'test-payment',groupSettleId:'test-group',from:'Аня',to:'Игорь',amount:2,date:'2026-10-01'},
    {id:'other-payment',from:'Raf',to:'Эля',amount:1,date:'2026-10-01'}
  ];
  const context={
    S:{trip:{id:'DBB0Y4'},me:'Раф',members:[{name:'Аня'},{name:'Игорь'},{name:'Raf'},{name:'Эля'}],expenses:[],settledDebts:records},
    USE_SUPABASE:true,_syncTimer:null,
    isTripAdmin:()=>admin,confirm:()=>confirmResult,
    getSupabase:async()=>({}),
    sbSync:async()=>{syncCalls++;if(syncError)throw new Error('network');return syncResult;},
    saveLocal:()=>{},renderBalances:()=>{},renderDash:()=>{},toast:()=>{},t:x=>x,fm:x=>Number(x).toFixed(2),
    clearTimeout:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(calcSource+voidSource,context);
  const before=context.calcBal();
  const result=await context.voidSettlementGroup('test-group');
  return {context,records,before,result,syncCalls};
}

(async()=>{
  const ok=await scenario();
  assert.equal(ok.before['Аня'],2);
  assert.equal(ok.before['Игорь'],-2);
  assert.equal(ok.result,true);
  assert.equal(ok.context.calcBal()['Аня'],0);
  assert.equal(ok.context.calcBal()['Игорь'],0);
  assert.equal(ok.context.calcBal()['Raf'],1);
  assert.equal(ok.context.calcBal()['Эля'],-1);
  assert.ok(ok.records[0].voidedAt);
  assert.equal(ok.records[0].voidedBy,'Раф');
  assert.equal(ok.records.length,2,'payment history must remain');
  assert.equal(ok.records[1].voidedAt,undefined,'unrelated payment must remain active');
  assert.equal(ok.syncCalls,1);
  assert.equal(await ok.context.voidSettlementGroup('test-group'),false,'repeat must not sync');

  for(const options of [{syncResult:false},{syncError:true},{confirmResult:false},{admin:false}]){
    const failed=await scenario(options);
    assert.equal(failed.result,false);
    assert.equal(failed.records[0].voidedAt,undefined);
    assert.equal(failed.context.calcBal()['Игорь'],-2);
  }
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  console.log('PASS: test settlement cancellation, unchanged archive, unrelated payment, retry guard, sync rollback and inline JS syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});
