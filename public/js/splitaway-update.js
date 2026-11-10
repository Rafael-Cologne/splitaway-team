/* Splitaway 1.0.20: compact participant groups and expense avatars. */
let _expenseAvatarDraft=null;
let _expenseAvatarEditDraft=null;
let _avatarSyncBusy=false;
let _avatarCloudUnavailable=false;
const sw=key=>t('sw_'+key);
function customFamilyLabel(g){
  // 1.0.23: стандартное «Семья» любого языка не считаем названием — показываем имена
  const defaults=new Set(Object.values(typeof TRANSLATIONS!=='undefined'?TRANSLATIONS:{}).map(d=>d.family_label));
  return g&&g.label&&!defaults.has(g.label)?g.label:null;
}
function famLabel(g){return customFamilyLabel(g)||t('family_label')}
function avatarPendingKey(){return `sw_avatar_pending_${S.trip?.id||'local'}`}
function avatarLocalKey(){return `sw_avatar_local_${S.trip?.id||'local'}`}
function readAvatarPending(){try{return JSON.parse(localStorage.getItem(avatarPendingKey())||'{}')}catch{return{}}}
function localExpenseAvatar(id){try{return JSON.parse(localStorage.getItem(avatarLocalKey())||'{}')[id]||null}catch{return null}}
function queueExpenseAvatarSync(expense){
  if(!expense?.id)return;
  try{const local=JSON.parse(localStorage.getItem(avatarLocalKey())||'{}');local[expense.id]=expense.avatar||null;localStorage.setItem(avatarLocalKey(),JSON.stringify(local))}catch(error){console.warn('Avatar cache could not be saved',error)}
  const pending=readAvatarPending();pending[expense.id]=expense.avatar||null;
  try{localStorage.setItem(avatarPendingKey(),JSON.stringify(pending))}catch(error){console.warn('Avatar queue could not be saved',error)}
}
async function flushExpenseAvatarSync(){
  if(_avatarSyncBusy||_avatarCloudUnavailable||!S.inviteToken)return;
  const pending=readAvatarPending();if(!Object.keys(pending).length)return;
  _avatarSyncBusy=true;
  try{
    const sb=await getSupabase();if(!sb)return;
    for(const [id,avatar] of Object.entries(pending)){
      const {data,error}=await (typeof rpcWithAuth==='function'?rpcWithAuth(sb,'set_expense_avatar',{p_invite_token:S.inviteToken,p_expense_id:id,p_avatar:avatar}):sb.rpc('set_expense_avatar',{p_invite_token:S.inviteToken,p_expense_id:id,p_avatar:avatar}));
      if(error||data?.error){if(error?.code==='PGRST202'||error?.code==='42883')_avatarCloudUnavailable=true;break}
      const latest=readAvatarPending();if(latest[id]===avatar){delete latest[id];localStorage.setItem(avatarPendingKey(),JSON.stringify(latest))}
    }
  }catch(error){console.warn('Avatar sync pending',error)}
  finally{_avatarSyncBusy=false}
}

const expenseAvatarPresets={
  hotel:{icon:'🏨',labelKey:'avatar_hotel'},taxi:{icon:'🚕',labelKey:'avatar_taxi'},
  plane:{icon:'✈️',labelKey:'avatar_plane'},train:{icon:'🚆',labelKey:'avatar_train'},
  food:{icon:'🍽️',labelKey:'avatar_food'},museum:{icon:'🏛️',labelKey:'avatar_museum'},
  shopping:{icon:'🛍️',labelKey:'avatar_shopping'},ticket:{icon:'🎟️',labelKey:'avatar_ticket'}
};

function expenseAvatarMarkup(expense){
  const avatar=expense?.avatar;
  if(typeof avatar==='string'&&/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(avatar)&&avatar.length<=120000){
    return `<img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover">`;
  }
  if(Object.prototype.hasOwnProperty.call(expenseAvatarPresets,avatar))return expenseAvatarPresets[avatar].icon;
  return expense?.fromTreasury?'💰':'💳';
}

function expenseAvatarEditor(prefix,value){
  const wrap=document.createElement('div');
  wrap.className='iw expense-avatar-editor';
  wrap.innerHTML=`<label class="il">${sw('avatar_title')}</label>
    <div class="expense-avatar-options" role="group" aria-label="${sw('avatar_icon_label')}"></div>
    <div class="expense-avatar-upload"><label class="btn btn-g btn-sm" for="${prefix}-avatar-file">${sw('avatar_upload')}</label>
      <input id="${prefix}-avatar-file" type="file" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0">
      <button class="btn btn-g btn-sm" type="button" data-clear-avatar>${sw('avatar_remove')}</button></div>
    <div class="expense-avatar-status" aria-live="polite"></div>`;
  const options=wrap.querySelector('.expense-avatar-options');
  for(const [key,item] of Object.entries(expenseAvatarPresets)){
    const button=document.createElement('button');
    button.type='button';button.className='expense-avatar-choice';
    button.dataset.avatarKey=key;button.textContent=item.icon;
    button.setAttribute('aria-label',sw(item.labelKey));button.title=sw(item.labelKey);
    options.appendChild(button);
  }
  const status=wrap.querySelector('.expense-avatar-status');
  const setValue=next=>{
    if(prefix==='ae')_expenseAvatarDraft=next;else _expenseAvatarEditDraft=next;
    wrap.querySelectorAll('[data-avatar-key]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.avatarKey===next)));
    status.textContent=next?.startsWith?.('data:image/')?sw('avatar_custom_selected'):next?sw('avatar_selected_prefix')+sw(expenseAvatarPresets[next]?.labelKey):sw('avatar_default');
  };
  options.addEventListener('click',event=>{const button=event.target.closest('[data-avatar-key]');if(button)setValue(button.dataset.avatarKey)});
  wrap.querySelector('[data-clear-avatar]').addEventListener('click',()=>{wrap.querySelector('input').value='';setValue(null)});
  wrap.querySelector('input').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('image/')||file.size>8*1024*1024){status.textContent=sw('avatar_too_large');return;}
    try{
      const source=URL.createObjectURL(file);
      const image=new Image();
      try{
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=source});
        const side=Math.min(image.naturalWidth,image.naturalHeight);
        const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
        canvas.getContext('2d').drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,128,128);
        const encoded=canvas.toDataURL('image/jpeg',0.76);
        if(encoded.length>120000)throw new Error('image too large');
        setValue(encoded);
      }finally{URL.revokeObjectURL(source)}
    }catch(error){status.textContent=sw('avatar_processing_failed')}
  });
  setValue(value||null);
  return wrap;
}

const originalOpenAddExp=openAddExp;
openAddExp=function(){
  _expenseAvatarDraft=null;
  originalOpenAddExp();
  document.querySelectorAll('#m-add-exp .expense-avatar-editor').forEach(editor=>editor.remove());
  const field=document.getElementById('ae-comment')?.closest('.iw');
  if(field)field.after(expenseAvatarEditor('ae',null));
  window.SplitawayExpenseCurrency?.open('ae',null);
};
const originalOpenExpEdit=openExpEdit;
openExpEdit=function(id){
  const expense=S.expenses.find(item=>item.id===id);
  _expenseAvatarEditDraft=expense?.avatar||null;
  originalOpenExpEdit(id);
  document.querySelectorAll('#m-exp-detail .expense-avatar-editor').forEach(editor=>editor.remove());
  const field=document.getElementById('ed-comment')?.closest('.iw');
  if(field)field.after(expenseAvatarEditor('ed',_expenseAvatarEditDraft));
  const amount=document.getElementById('ed-amount');
  if(amount){
    amount.value=expense?.originalAmount??expense?.amount??'';
    const container=document.createElement('div');container.id='ed-currency-controls';
    amount.closest('.iw')?.after(container);
    window.SplitawayExpenseCurrency?.open('ed',expense);
  }
};

const participantGroupUiKey=()=>`sw_participant_groups_${S.trip?.id||'local'}`;
function readParticipantGroupUi(){
  try{const value=JSON.parse(localStorage.getItem(participantGroupUiKey())||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}
}
function saveParticipantGroupUi(value){try{localStorage.setItem(participantGroupUiKey(),JSON.stringify(value))}catch{}}
function groupPaidCents(members){
  const names=new Set(members);
  return S.expenses.reduce((sum,expense)=>sum+(!expense.fromTreasury&&names.has(expense.paidBy)?Math.round(Number(expense.amount||0)*100):0),0);
}
function showParticipantExpenses(name){
  const member=S.members.find(item=>item.name===name);if(!member)return;
  const shares=calcExpenseShares();
  const entries=S.expenses.map(expense=>({expense,shareCents:Math.round(exactShare(expense,name)*100)}))
    .filter(entry=>entry.shareCents>0||entry.expense.paidBy===name).reverse();
  const root=document.getElementById('m-member-detail-content');root.replaceChildren();
  const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px';
  const title=document.createElement('div');title.className='sec-ttl';title.textContent=name;
  const close=document.createElement('button');close.type='button';close.className='btn btn-g btn-sm';close.textContent='×';close.setAttribute('aria-label',sw('close'));close.onclick=()=>closeModal('m-member-detail');
  header.append(title,close);root.appendChild(header);
  const summary=document.createElement('div');summary.className='participant-summary';
  [[fm(shares[name]||0),sw('member_expenses')],[fm(groupPaidCents([name])/100),sw('member_paid')]].forEach(([amount,label])=>{
    const box=document.createElement('div');box.className='sbox';
    const value=document.createElement('div');value.className='sv';value.textContent=amount;
    const caption=document.createElement('div');caption.className='sl';caption.textContent=label;
    box.append(value,caption);summary.appendChild(box);
  });
  // 1.0.22: «Оплачено участником» открывает список его оплат
  const paidBox=summary.lastChild;
  if(paidBox){paidBox.style.cursor='pointer';paidBox.setAttribute('role','button');paidBox.tabIndex=0;paidBox.onclick=()=>showExpensePayments(name);}
  root.appendChild(summary);
  const section=document.createElement('div');section.className='sec-ttl';section.textContent=sw('expense_items');root.appendChild(section);
  if(!entries.length){const empty=document.createElement('div');empty.className='emp';empty.textContent=sw('no_expenses');root.appendChild(empty)}
  entries.forEach(({expense,shareCents})=>{
    const row=document.createElement('button');row.type='button';row.className='er';row.style.cssText='width:100%;text-align:left;cursor:pointer;margin-bottom:7px';
    const info=document.createElement('div');info.className='ei';
    const nameEl=document.createElement('div');nameEl.className='en';nameEl.textContent=expense.name;
    const meta=document.createElement('div');meta.className='em';
    // 1.0.22: касса — переведённой строкой, плательщик — с учётом рода
    meta.innerHTML=`${expense.date?escHtml(fdate(expense.date))+' · ':''}${expense.fromTreasury?escHtml(t('label_treasury_source')):`<span class="ic-num"><i data-lucide="wallet" style="width:12px;height:12px"></i>${escHtml(expense.paidBy)}</span>`}`;
    info.append(nameEl,meta);
    if(!expense.fromTreasury&&expense.paidBy===name){
      const paid=document.createElement('div');paid.className='em';paid.style.color='var(--green)';
      paid.textContent=`${sw('member_paid')}: ${fm(expense.amount)}`;info.appendChild(paid);
    }
    const amount=document.createElement('div');amount.className='da';amount.textContent=fm(shareCents/100);
    row.append(info,amount);row.onclick=()=>{closeModal('m-member-detail');showExpDetail(expense.id)};
    root.appendChild(row);
  });
  initializeIcons(root);openModal('m-member-detail');
}
function showExpensePayments(name){
  const expenses=S.expenses.filter(expense=>!expense.fromTreasury&&expense.paidBy===name).slice().reverse();
  const root=document.getElementById('m-member-detail-content');
  root.replaceChildren();
  const header=document.createElement('div');
  header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px';
  const title=document.createElement('div');title.className='sec-ttl';title.textContent=name+sw('payments_suffix');
  const close=document.createElement('button');close.type='button';close.className='btn btn-g btn-sm';close.textContent='×';close.setAttribute('aria-label',sw('close'));close.onclick=()=>closeModal('m-member-detail');
  header.append(title,close);root.appendChild(header);
  const total=document.createElement('div');total.className='sbox';total.style.cssText='text-align:left;padding:14px;margin-bottom:12px';
  const amount=document.createElement('div');amount.className='sv';amount.textContent=fm(groupPaidCents([name])/100);
  const caption=document.createElement('div');caption.className='sl';caption.textContent=sw('paid_by_expenses');
  total.append(amount,caption);root.appendChild(total);
  if(!expenses.length){const empty=document.createElement('div');empty.className='emp';empty.textContent=sw('no_payments');root.appendChild(empty)}
  expenses.forEach(expense=>{
    const row=document.createElement('button');row.type='button';row.className='er';row.style.cssText='width:100%;text-align:left;cursor:pointer;margin-bottom:7px';
    const info=document.createElement('div');info.className='ei';
    const nameEl=document.createElement('div');nameEl.className='en';nameEl.textContent=expense.name;
    const date=document.createElement('div');date.className='em';date.textContent=expense.date?fdate(expense.date):'';
    info.append(nameEl,date);
    const value=document.createElement('div');value.className='da';value.textContent=fm(expense.amount);
    row.append(info,value);row.onclick=()=>{closeModal('m-member-detail');showExpDetail(expense.id)};
    root.appendChild(row);
  });
  openModal('m-member-detail');
}

function renderMembersList(){
  const list=document.getElementById('d-members');if(!list)return;
  const shares=calcExpenseShares();
  const ui=readParticipantGroupUi();const groupIds=new Set();
  const groups=S.groups.map((group,groupIndex)=>({group,groupIndex,members:group.members.filter(name=>S.members.some(member=>member.name===name))})).filter(entry=>entry.members.length);
  const groupedNames=new Set(groups.flatMap(entry=>entry.members));
  S.members.filter(member=>!groupedNames.has(member.name)).forEach(member=>groups.push({group:null,groupIndex:null,members:[member.name]}));
  const visible=ui.all?groups:groups.slice(0,2);
  const header=list.previousElementSibling;
  if(header?.classList.contains('sec-hd')){
    let count=header.querySelector('.participant-count');
    if(!count){count=document.createElement('span');count.className='participant-count';header.appendChild(count)}
    const realGroups=groups.filter(x=>x.group).length;
    count.innerHTML=icNum('users',S.members.length)+(realGroups?' · '+icNum('layers',realGroups):'');
    initializeIcons(count);
  }
  list.innerHTML=visible.map(({group,groupIndex,members},index)=>{
    const id=group?.id||`solo:${members[0]}`;groupIds.add(id);
    const expanded=Object.prototype.hasOwnProperty.call(ui,id)?!!ui[id]:index===0;
    const representative=group?getGrpRep(group):members[0];
    const title=group?(group.type==='couple'?members.join(' + '):(customFamilyLabel(group)||members.join(' + '))):members[0];
    const type=group?(group.type==='couple'?sw('couple'):sw('family')):sw('member');
    const shareCents=members.reduce((sum,name)=>sum+Math.round((shares[name]||0)*100),0);
    const detail=members.map(name=>`<button type="button" class="participant-payment" data-member-name="${escHtml(name)}"><span class="participant-person">${group?`<span class="participant-person-av">${peopleIcon([name],1)}</span>`:''}<span>${escHtml(name)}<small class="ic-num"><i data-lucide="wallet" style="width:12px;height:12px"></i>${fm(groupPaidCents([name])/100)}</small></span></span><strong>${fm(shares[name]||0)}</strong></button>`).join('');
    const iconCount=group?(group.type==='couple'?2:3):1;
    return `<div class="participant-group">
      <div class="participant-group-top">
      <button type="button" class="participant-group-head" data-group-id="${escHtml(id)}" aria-expanded="${expanded}">
        <span class="participant-symbol" data-people-count="${iconCount}">${peopleIcon(members,iconCount)}</span>
        <span class="participant-name"><strong>${escHtml(title)}</strong><small>${type}</small></span>
        <span class="participant-chevron">${expanded?'⌄':'›'}</span>
      </button>
      <button type="button" class="participant-share" ${group?`data-group-detail-index="${groupIndex}"`:`data-member-name="${escHtml(members[0])}"`} aria-label="${sw('show_expenses_prefix')}${escHtml(title)}"><strong>${fm(shareCents/100)}</strong><small>${sw('total_expenses')}</small></button>
      </div>
      <div class="participant-details" ${expanded?'':'hidden'}>${detail}</div>
    </div>`;
  }).join('')+(groups.length>2?`<button type="button" class="participant-show-all">${ui.all?sw('collapse_list'):`${t('btn_view_all')} (${groups.length}) ›`}</button>`:'');
  list.querySelectorAll('[data-group-id]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.groupId;
    const detail=button.closest('.participant-group')?.querySelector('.participant-details');
    if(!detail)return;
    const expanded=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(expanded));button.querySelector('.participant-chevron').textContent=expanded?'⌄':'›';detail.hidden=!expanded;
    ui[id]=expanded;saveParticipantGroupUi(ui);
  });
  list.querySelectorAll('[data-member-name]').forEach(button=>button.onclick=()=>showParticipantExpenses(button.dataset.memberName));
  list.querySelectorAll('[data-group-detail-index]').forEach(button=>button.onclick=()=>showGroupExpenseDetail(Number(button.dataset.groupDetailIndex)));
  initializeIcons(list);
  const more=list.querySelector('.participant-show-all');if(more)more.onclick=()=>{ui.all=!ui.all;saveParticipantGroupUi(ui);renderMembersList()};
}

const groupStyle=document.createElement('style');
groupStyle.textContent=`
.participant-count{margin-left:auto;color:var(--t2);font-size:.72rem;white-space:nowrap}
.participant-group{background:var(--s1);border-radius:var(--rsm);overflow:hidden;border:1px solid var(--b1)}
.participant-group-top{display:flex;align-items:stretch}.participant-group-head{min-width:0;flex:1;background:none;border:0;color:var(--text);font:inherit;display:flex;align-items:center;gap:9px;padding:10px 11px;text-align:left;min-height:56px}
.participant-symbol{width:38px;height:38px;border-radius:19px;display:grid;place-items:center;flex:none}
.participant-name{min-width:0;flex:1}.participant-name strong,.participant-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.participant-name small{white-space:normal;overflow-wrap:anywhere;line-height:1.3}.participant-name strong{font-size:.82rem}.participant-name small{font-size:.68rem;color:var(--t2);margin-top:3px}
.participant-share{background:none;border:0;color:var(--text);font:inherit;text-align:right;flex:none;padding:10px 11px 10px 3px}.participant-share strong,.participant-share small{display:block;white-space:nowrap}.participant-share strong{font-family:var(--mono);font-size:.78rem}.participant-share small{font-size:.62rem;color:var(--t2);margin-top:3px}
.participant-chevron{color:var(--t2)}
.participant-details{padding:0 12px 10px 48px}.participant-details[hidden]{display:none}
.participant-person{display:flex;align-items:center;gap:9px;min-width:0}.participant-person-av .people-icon-wrap,.participant-person-av .people-icon{width:30px;height:30px}.participant-person-av .people-count{display:none}
.participant-payment{width:100%;background:none;border:0;border-top:1px solid var(--b1);color:var(--text);font:inherit;display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;padding:10px 0;font-size:.77rem}.participant-payment span small{display:block;color:var(--t2);font-size:.66rem;margin-top:3px}.participant-payment strong{font-family:var(--mono);white-space:nowrap}
.participant-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}.participant-summary .sbox{min-width:0;padding:12px 8px}.participant-summary .sv{font-size:1rem;white-space:normal;overflow-wrap:anywhere}
.participant-note{font-size:.68rem;color:var(--t2);line-height:1.4;padding-top:5px}
.participant-show-all{background:var(--s1);color:var(--ac2);border:1px solid var(--b1);border-radius:var(--rsm);padding:12px;width:100%;font:inherit;font-size:.78rem}
.expense-avatar-options{display:flex;gap:7px;flex-wrap:wrap;margin:6px 0}.expense-avatar-choice{width:42px;height:42px;border:1px solid var(--b1);border-radius:var(--rxs);background:var(--s2);font-size:1.2rem}.expense-avatar-choice[aria-pressed="true"]{border-color:var(--accent);background:var(--aglow)}
.expense-avatar-upload{display:flex;gap:7px;align-items:center;position:relative}.expense-avatar-status{font-size:.72rem;color:var(--t2);margin-top:6px}
`;
document.head.appendChild(groupStyle);
