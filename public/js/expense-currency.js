/* Expense entry currency. All balances continue to use expense.amount in the trip currency. */
(function(){
  'use strict';
  const states={ae:null,ed:null};
  const labels={
    ru:{base:'Основная',extra:'Дополнительная',rate:'Курс',date:'Дата курса',loading:'Загрузка курса…',unavailable:'Курс недоступен. Введите его вручную.',cached:'Сохранённый курс',stale:'устарел',manual:'Курс вручную',refresh:'Обновить курс для новой даты',old:'Дата расхода изменилась. Сохранённый курс останется прежним.',bad:'Укажите корректную сумму и курс.',source:'Источник',deviation:'Сильно отличается от рыночного курса ({market}). Проверьте направление.'},
    en:{base:'Base',extra:'Local',rate:'Rate',date:'Rate date',loading:'Loading rate…',unavailable:'Rate unavailable. Enter it manually.',cached:'Saved rate',stale:'outdated',manual:'Manual rate',refresh:'Update rate for the new date',old:'Expense date changed. The saved rate will stay unchanged.',bad:'Enter a valid amount and rate.',source:'Source',deviation:'Differs a lot from the market rate ({market}). Check the direction.'},
    de:{base:'Basis',extra:'Lokal',rate:'Kurs',date:'Kursdatum',loading:'Kurs wird geladen…',unavailable:'Kurs nicht verfügbar. Bitte manuell eingeben.',cached:'Gespeicherter Kurs',stale:'veraltet',manual:'Manueller Kurs',refresh:'Kurs für neues Datum aktualisieren',old:'Datum geändert. Der gespeicherte Kurs bleibt erhalten.',bad:'Gültigen Betrag und Kurs eingeben.',source:'Quelle',deviation:'Weicht stark vom Marktkurs ab ({market}). Bitte Richtung prüfen.'},
    es:{base:'Principal',extra:'Local',rate:'Tipo de cambio',date:'Fecha del tipo de cambio',loading:'Cargando tipo de cambio…',unavailable:'Tipo de cambio no disponible. Introdúcelo manualmente.',cached:'Tipo de cambio guardado',stale:'desactualizado',manual:'Tipo de cambio manual',refresh:'Actualizar el tipo de cambio para la nueva fecha',old:'La fecha del gasto cambió. El tipo de cambio guardado no se modificará.',bad:'Introduce un importe y un tipo de cambio válidos.',source:'Fuente',deviation:'Difiere mucho del tipo de mercado ({market}). Comprueba la dirección.'},
    fr:{base:'Principale',extra:'Locale',rate:'Taux',date:'Date du taux',loading:'Chargement du taux…',unavailable:'Taux indisponible. Saisissez-le.',cached:'Taux enregistré',stale:'ancien',manual:'Taux manuel',refresh:'Actualiser le taux pour la nouvelle date',old:'Date modifiée. Le taux enregistré reste inchangé.',bad:'Saisissez un montant et un taux valides.',source:'Source',deviation:'Très différent du taux du marché ({market}). Vérifiez le sens.'},
    pt:{base:'Principal',extra:'Local',rate:'Taxa de câmbio',date:'Data da taxa de câmbio',loading:'A carregar a taxa de câmbio…',unavailable:'Taxa de câmbio indisponível. Introduza-a manualmente.',cached:'Taxa de câmbio guardada',stale:'desatualizada',manual:'Taxa de câmbio manual',refresh:'Atualizar a taxa de câmbio para a nova data',old:'A data da despesa mudou. A taxa de câmbio guardada não será alterada.',bad:'Introduza um montante e uma taxa de câmbio válidos.',source:'Fonte',deviation:'Muito diferente da taxa de mercado ({market}). Verifique o sentido.'},
    it:{base:'Principale',extra:'Locale',rate:'Tasso',date:'Data del tasso',loading:'Caricamento tasso…',unavailable:'Tasso non disponibile. Inseriscilo manualmente.',cached:'Tasso salvato',stale:'obsoleto',manual:'Tasso manuale',refresh:'Aggiorna il tasso per la nuova data',old:'Data modificata. Il tasso salvato resta invariato.',bad:'Inserisci importo e tasso validi.',source:'Fonte',deviation:'Molto diverso dal tasso di mercato ({market}). Controlla la direzione.'},
    pl:{base:'Główna',extra:'Dodatkowa',rate:'Kurs',date:'Data kursu',loading:'Pobieranie kursu…',unavailable:'Kurs niedostępny. Wprowadź go ręcznie.',cached:'Zapisany kurs',stale:'nieaktualny',manual:'Kurs ręczny',refresh:'Pobierz kurs dla nowej daty',old:'Data wydatku została zmieniona. Zapisany kurs pozostanie bez zmian.',bad:'Wprowadź prawidłową kwotę i kurs.',source:'Źródło',deviation:'Znacznie różni się od kursu rynkowego ({market}). Sprawdź kierunek.'},
    el:{base:'Βασικό',extra:'Δευτερεύον',rate:'Ισοτιμία',date:'Ημερομηνία ισοτιμίας',loading:'Φόρτωση ισοτιμίας…',unavailable:'Η ισοτιμία δεν είναι διαθέσιμη. Εισαγάγετέ την χειροκίνητα.',cached:'Αποθηκευμένη ισοτιμία',stale:'παρωχημένη',manual:'Χειροκίνητη ισοτιμία',refresh:'Ανανέωση ισοτιμίας για τη νέα ημερομηνία',old:'Η ημερομηνία του εξόδου άλλαξε. Η αποθηκευμένη ισοτιμία θα παραμείνει ίδια.',bad:'Εισαγάγετε έγκυρο ποσό και ισοτιμία.',source:'Πηγή',deviation:'Διαφέρει πολύ από την ισοτιμία της αγοράς ({market}). Ελέγξτε την κατεύθυνση.'},
    tr:{base:'Ana',extra:'Yerel',rate:'Kur',date:'Kur tarihi',loading:'Kur yükleniyor…',unavailable:'Kur alınamadı. Manuel olarak girin.',cached:'Kayıtlı kur',stale:'güncel değil',manual:'Manuel kur',refresh:'Yeni tarih için kuru güncelle',old:'Harcama tarihi değişti. Kayıtlı kur aynı kalacak.',bad:'Geçerli bir tutar ve kur girin.',source:'Kaynak',deviation:'Piyasa kurundan çok farklı ({market}). Yönü kontrol edin.'}
  };
  const words=()=>labels[typeof getLang==='function'?getLang():'ru']||labels.en;
  const base=()=>S.trip?.currency||'EUR';
  const extra=()=>S.trip?.secondaryCurrency||null;
  const localToday=()=>typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const validCode=code=>typeof CURRENCIES!=='undefined'&&CURRENCIES.some(item=>item.code===code);
  function key(){
    if(!S.trip?.id||!S.me)return null;
    return 'sw_exp_currency_'+encodeURIComponent(S.trip.id)+'_'+encodeURIComponent(S.me);
  }
  function remembered(){try{return localStorage.getItem(key())}catch{return null}}
  function remember(code){try{const k=key();if(k)localStorage.setItem(k,code)}catch{}}
  function choice(code){return code&&(code===base()||code===extra())?code:base()}
  const money=(amount,code)=>Number.isFinite(amount)?fm(amount,code):'—';
  const other=code=>code===base()?extra():base();
  // 1.0.22: курс всегда показывается и вводится как «1 <основная валюта> = X <другая>»
  const perBase=(code,rate)=>code===base()?rate:1/rate;
  const foreignOf=(code,target)=>code===base()?target:code;
  const plain=value=>String(Number(Number(value).toPrecision(8)));
  function fmtRate(value){
    const locale=typeof fmtLocale==='function'?fmtLocale():undefined;
    const opts=value>=100?{minimumFractionDigits:2,maximumFractionDigits:2}:value>=1?{minimumFractionDigits:2,maximumFractionDigits:4}:{maximumSignificantDigits:4};
    return value.toLocaleString(locale,opts);
  }
  function displayRate(code,target,rate){
    if(!Number.isFinite(rate)||rate<=0||!target)return '';
    return `1 ${base()} ≈ ${fmtRate(perBase(code,rate))} ${foreignOf(code,target)}`;
  }
  function deviationText(s,target){
    if(!s.manual||!s.rate||!Number.isFinite(s.marketPerBase)||s.marketPerBase<=0)return '';
    const ratio=perBase(s.code,s.rate.rate)/s.marketPerBase;
    if(ratio<1.2&&ratio>1/1.2)return '';
    return words().deviation.replace('{market}',`1 ${base()} ≈ ${fmtRate(s.marketPerBase)} ${foreignOf(s.code,target)}`);
  }
  function cacheKey(from,to,date){return 'sw_exp_rate_'+from+'_'+to+'_'+date}
  function cacheRead(from,to,date){try{const value=JSON.parse(localStorage.getItem(cacheKey(from,to,date))||'null');return Number.isFinite(value?.rate)&&value.rate>0?value:null}catch{return null}}
  function cacheWrite(from,to,date,value){try{localStorage.setItem(cacheKey(from,to,date),JSON.stringify({...value,savedAt:Date.now()}))}catch{}}
  async function historicalRate(from,to,date){
    if(date>=localToday())return SplitawayFx.requestLatestRate(from,to,new AbortController().signal);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const url='https://api.frankfurter.dev/v2/rate/'+encodeURIComponent(from)+'/'+encodeURIComponent(to)+'?date='+encodeURIComponent(date);
      const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('rate_unavailable');
      const data=await response.json();
      if(data.base!==from||data.quote!==to||!Number.isFinite(data.rate)||data.rate<=0||
         !/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')||data.date>date)throw Error('invalid_historical_rate');
      return {rate:data.rate,asOf:data.date,source:'Frankfurter'};
    }finally{clearTimeout(timer)}
  }
  async function load(prefix,force=false){
    const s=states[prefix];if(!s||s.manual)return;
    const target=other(s.code);if(!target)return;
    const date=document.getElementById(prefix+'-date')?.value||localToday();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>localToday()){
      s.error=words().unavailable;paint(prefix);return;
    }
    const cached=cacheRead(s.code,target,date);
    if(cached&&!force&&(date<localToday()||Date.now()-cached.savedAt<86400000)){
      s.rate=cached;s.cached=true;s.error=null;paint(prefix);return;
    }
    const request=++s.request;s.loading=true;s.error=null;paint(prefix);
    try{
      const rate=await historicalRate(s.code,target,date);
      if(states[prefix]!==s||request!==s.request)return;
      s.rate=rate;s.cached=false;cacheWrite(s.code,target,date,rate);
    }catch(error){
      if(states[prefix]!==s||request!==s.request)return;
      if(cached){s.rate=cached;s.cached=true;s.error=null}else{s.rate=null;s.error=words().unavailable}
    }finally{if(states[prefix]===s&&request===s.request){s.loading=false;paint(prefix)}}
  }
  function paint(prefix){
    const s=states[prefix],root=document.getElementById(prefix+'-currency-controls');if(!s||!root)return;
    root.querySelectorAll('[data-exp-code]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.expCode===s.code)));
    const panel=root.querySelector('[data-exp-panel]');if(!panel)return;
    const target=other(s.code);
    panel.hidden=!target;if(panel.hidden)return;
    const amount=document.getElementById(prefix==='ae'?'ae-amt':'ed-amount')?.value||'';
    const converted=s.rate&&amount?SplitawayFx.convertMinor(amount,String(s.rate.rate),s.code,target):null;
    const result=root.querySelector('[data-exp-result]');
    result.textContent=converted?'≈ '+money(converted.minor/10**converted.digits,target):'';
    const info=root.querySelector('[data-exp-info]');
    const age=s.rate?.asOf?Date.now()-new Date(s.rate.asOf+'T00:00:00Z').getTime():0;
    const stale=s.cached&&document.getElementById(prefix+'-date')?.value===localToday()&&age>6*86400000;
    const sourceText=src=>src==='Manual'?words().manual:(typeof rateSourceName==='function'?rateSourceName(src):src);
    info.textContent=s.loading?words().loading:s.error||
      (s.rate?(s.manual
        ?`${words().manual} · ${displayRate(s.code,target,s.rate.rate)}${s.rate.asOf?` · ${fmtRateDate(s.rate.asOf)}`:''}`
        :`${s.cached?words().cached+(stale?' ('+words().stale+')':'')+' · ':''}${displayRate(s.code,target,s.rate.rate)} · ${fmtRateDate(s.rate.asOf)} · ${sourceText(s.rate.source)}`):'');
    const manual=root.querySelector('[data-exp-manual]');manual.checked=s.manual;
    const field=root.querySelector('[data-exp-rate]');const row=root.querySelector('[data-exp-rate-row]');row.hidden=!s.manual;
    row.querySelector('[data-exp-rate-prefix]').textContent='1 '+base()+' =';
    row.querySelector('[data-exp-rate-suffix]').textContent=foreignOf(s.code,target);
    if(s.manual&&s.rate&&!field.dataset.touched)field.value=plain(perBase(s.code,s.rate.rate));
    const deviation=root.querySelector('[data-exp-deviation]');const devText=deviationText(s,target);
    deviation.hidden=!devText;deviation.textContent=devText;
    const update=root.querySelector('[data-exp-refresh]');
    update.hidden=prefix!=='ed'||!s.original||document.getElementById('ed-date')?.value===s.original.date;
    const warning=root.querySelector('[data-exp-date-warning]');warning.hidden=update.hidden;warning.textContent=words().old;
  }
  function mount(prefix,expense){
    const root=document.getElementById(prefix+'-currency-controls');if(!root)return;
    const code=expense?.originalCurrency&&validCode(expense.originalCurrency)?expense.originalCurrency:base();
    const s={code,rate:expense?.fxRate&&code!==base()?{rate:expense.fxRate,asOf:expense.fxRateDate,source:expense.fxRateSource}:null,
      manual:!!expense?.fxRateManual,cached:false,loading:false,error:null,request:0,
      original:expense?{amount:expense.originalAmount??expense.amount,code:expense.originalCurrency||base(),date:expense.date,
        baseAmount:expense.amount,rate:expense.fxRate,rateDate:expense.fxRateDate,rateSource:expense.fxRateSource,manual:!!expense.fxRateManual}:null};
    states[prefix]=s;root.replaceChildren();
    const switcher=document.createElement('div');switcher.className='expense-currency-switch';
    for(const currency of [...new Set([base(),extra(),expense?.originalCurrency].filter(Boolean))]){
      const button=document.createElement('button');button.type='button';button.dataset.expCode=currency;
      button.textContent=(typeof currencyFlag==='function'?currencyFlag(currency)+' ':'')+currency;
      button.onclick=()=>{s.code=currency;s.rate=null;s.error=null;s.manual=false;++s.request;
        if(prefix==='ae')remember(currency);paint(prefix);load(prefix)};
      switcher.append(button);
    }
    root.append(switcher);
    if(!extra()&&(!expense?.originalCurrency||expense.originalCurrency===base())){
      switcher.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.expCode===code)));
      return;
    }
    const panel=document.createElement('div');panel.dataset.expPanel='';panel.className='expense-currency-panel';
    panel.innerHTML='<strong data-exp-result></strong><div data-exp-info></div><label><input type="checkbox" data-exp-manual> '+words().manual+'</label><div data-exp-rate-row hidden style="display:flex;align-items:center;gap:6px;margin-top:5px"><span data-exp-rate-prefix style="white-space:nowrap"></span><input class="inp" type="text" inputmode="decimal" data-money data-exp-rate style="flex:1;min-width:0"><span data-exp-rate-suffix></span></div><div data-exp-deviation hidden style="color:var(--red);margin-top:4px"></div><div data-exp-date-warning hidden></div><button type="button" class="btn btn-g btn-sm" data-exp-refresh hidden>'+words().refresh+'</button>';
    root.append(panel);
    panel.querySelector('[data-exp-manual]').onchange=event=>{s.manual=event.target.checked;++s.request;
      const field=panel.querySelector('[data-exp-rate]');
      if(s.manual){
        s.marketPerBase=s.rate?perBase(s.code,s.rate.rate):null;
        field.value=s.marketPerBase?plain(s.marketPerBase):'';field.dataset.touched='1';
        s.rate=s.rate?{rate:s.rate.rate,asOf:document.getElementById(prefix+'-date')?.value||'',source:'Manual'}:null;
        setTimeout(()=>field.focus(),0);
      }else{field.dataset.touched='';s.rate=null;load(prefix)}
      paint(prefix)};
    panel.querySelector('[data-exp-rate]').oninput=event=>{
      event.target.dataset.touched='1';
      const value=Number(String(event.target.value).replace(',','.'));
      s.rate=Number.isFinite(value)&&value>0
        ?{rate:Number((s.code===base()?value:1/value).toFixed(12)),asOf:document.getElementById(prefix+'-date')?.value||'',source:'Manual'}
        :null;
      paint(prefix)};
    panel.querySelector('[data-exp-refresh]').onclick=()=>{s.original=null;s.rate=null;s.manual=false;load(prefix,true)};
    document.getElementById(prefix==='ae'?'ae-amt':'ed-amount')?.addEventListener('input',()=>paint(prefix),{signal:controllerFor(prefix).signal});
    document.getElementById(prefix+'-date')?.addEventListener('change',()=>{
      if(prefix==='ed'&&s.original){paint(prefix);return}
      s.rate=null;load(prefix);
    },{signal:controllerFor(prefix).signal});
    paint(prefix);
    if(!s.rate)load(prefix);
  }
  const controllers={};
  function controllerFor(prefix){if(!controllers[prefix]||controllers[prefix].signal.aborted)controllers[prefix]=new AbortController();return controllers[prefix]}
  function open(prefix,expense){controllers[prefix]?.abort();controllers[prefix]=new AbortController();mount(prefix,expense)}
  function resolve(prefix,expense){
    const s=states[prefix],raw=String(document.getElementById(prefix==='ae'?'ae-amt':'ed-amount')?.value||'').trim().replace(',','.');
    const originalAmount=Number(raw);
    if(!s||!Number.isFinite(originalAmount)||originalAmount<=0)return null;
    if(s.original&&s.original.amount===originalAmount&&s.original.code===s.code&&s.original.rate&&
       s.original.rate===s.rate?.rate){
      return {amount:s.original.baseAmount,metadata:expense?{}:null};
    }
    if(s.code===base()&&!extra()&&!expense?.originalCurrency)return {amount:originalAmount,metadata:{}};
    if(s.code===base())return {amount:originalAmount,metadata:{originalAmount,originalCurrency:s.code,
      baseCurrency:base(),fxRate:1,fxRateDate:null,fxRateSource:'same currency',fxRateManual:false}};
    if(s.loading||!s.rate||!Number.isFinite(s.rate.rate)||s.rate.rate<=0)return null;
    const converted=SplitawayFx.convertMinor(raw,String(s.rate.rate),s.code,base());if(!converted)return null;
    return {amount:converted.minor/10**converted.digits,metadata:{originalAmount,originalCurrency:s.code,
      baseCurrency:base(),fxRate:s.rate.rate,fxRateDate:s.rate.asOf,fxRateSource:s.rate.source,fxRateManual:s.manual}};
  }
  let schemaReady=false;
  async function backendReady(){
    if(schemaReady)return true;
    const saved=()=>{try{return localStorage.getItem('sw_exp_fx_schema_ready')==='1'}catch{return false}};
    try{
      const sb=await getSupabase();if(!sb)return saved();
      const [trip,expense]=await Promise.all([
        sb.from('trips').select('secondary_currency_code').limit(1),
        sb.from('expenses').select('original_currency_code').limit(1)
      ]);
      if(trip.error||expense.error)return false;
      schemaReady=true;
      try{localStorage.setItem('sw_exp_fx_schema_ready','1')}catch{}
      return true;
    }catch{return saved()}
  }
  window.SplitawayExpenseCurrency={open,resolve,words,backendReady};
  const style=document.createElement('style');style.textContent=`
    .expense-currency-switch{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
    .expense-currency-switch button{background:var(--s2);border:1px solid var(--b1);border-radius:var(--rxs);color:var(--text);padding:6px 10px;font:inherit;font-size:.76rem;min-height:34px}
    .expense-currency-switch button[aria-pressed="true"]{border-color:var(--accent);background:var(--aglow);color:var(--ac2)}
    .expense-currency-panel{font-size:.73rem;color:var(--t2);line-height:1.4;margin-bottom:8px}
    .expense-currency-panel[hidden],.expense-currency-panel [hidden]{display:none!important}
    .expense-currency-panel [data-exp-result]{display:block;color:var(--text);font-size:.9rem;margin:4px 0}
    .expense-currency-panel label{display:flex;gap:6px;align-items:center;margin-top:5px}
    .expense-currency-panel [data-exp-rate]{margin-top:5px}
  `;document.head.append(style);
})();
