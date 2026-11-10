const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/sw.js','utf8');
const handlers={};
const stored=new Map();
let online=true;
let fetchCount=0;
const context={
  self:{location:{origin:'https://splitaway.netlify.app'},addEventListener:(name,handler)=>handlers[name]=handler},
  caches:{open:async()=>({
    match:async request=>stored.get(typeof request==='string'?request:new URL(request.url).pathname)?.clone()||null,
    put:async(request,response)=>{stored.set(new URL(request.url).pathname,response);},
  })},
  fetch:async()=>{fetchCount++;if(!online)throw Error('offline');return new Response('new-version',{status:200});},
  URL,Response,AbortController,setTimeout,clearTimeout,console:{log(){},warn(){}},
};
vm.createContext(context);
vm.runInContext(source,context);
assert.match(source,/const SW_VERSION = '\d+\.\d+';/);
const request={url:'https://splitaway.netlify.app/',method:'GET',mode:'navigate',headers:new Headers({accept:'text/html'})};
const run=request=>{
  let result;
  handlers.fetch({request,respondWith:response=>result=response});
  return result;
};
(async()=>{
  stored.set('/',new Response('old-version'));
  assert.equal(await (await run(request)).text(),'new-version','navigation must prefer new online shell');
  assert.equal(await stored.get('/').clone().text(),'new-version');
  online=false;
  assert.equal(await (await run(request)).text(),'new-version','offline navigation must use cached shell');
  const api={...request,url:'https://splitaway.netlify.app/api/receipts/analyze'};
  assert.equal(run(api),undefined,'OCR API must bypass service-worker cache');
  assert.equal(fetchCount,2);
  console.log('PASS: online PWA navigation gets fresh HTML; offline opens cached shell; OCR API is not cached');
})().catch(error=>{console.error(error);process.exitCode=1;});
