const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
const init=html.slice(html.indexOf('function init(){'),html.indexOf('function pickGender('));
const handlers=new Set();
const debt={fromInfo:{members:['A']},toInfo:{members:['B']},amount:10};
let opened=0,stopped=0;
const context={document:{addEventListener:(type,fn)=>handlers.add(fn),removeEventListener:(type,fn)=>handlers.delete(fn)},
 initializeIcons:()=>{throw Error('stop after binding');},groupedDebtStore:new Map([['test',debt]]),
 openDebtPayment:gd=>{assert.equal(gd,debt);opened++;},toast:()=>{},t:x=>x,renderBalances:()=>{}};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('async function handleDebtAction('),html.indexOf('function canRecordDebtPayment(')),context);
vm.runInContext(init,context);
for(let i=0;i<2;i++)assert.throws(()=>context.init(),/stop after binding/);
assert.equal(handlers.size,1);
assert(init.indexOf("addEventListener('click', handleDebtAction)")<init.indexOf('if(tc)'));
assert(init.indexOf("addEventListener('click', handleDebtAction)")<init.indexOf('if(last)'));
(async()=>{
 for(const fn of handlers)await fn({target:{closest:()=>({dataset:{action:'settle-debt',debtId:'test'}})},stopPropagation:()=>stopped++});
 assert.equal(opened,1);assert.equal(stopped,1);
 console.log('PASS: early binding before session/deep-link returns; repeated init has one listener; repayment click opens dialog once');
})().catch(e=>{console.error(e);process.exitCode=1;});
