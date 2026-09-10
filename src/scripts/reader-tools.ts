import identities from '../data/reader-identities.json';

type Day = { action: string; negotiation: string; within: string; slip: string; reset: string; returnSpeed: string; buffer: string };
type Notebook = { fields: Record<string,string>; audit: Record<string,string>[]; days: (Day|null)[]; started: string; images: Record<string,string>; archives: {started:string; identity:string; days:(Day|null)[]}[] };
const KEY = 'halo.reader-tools.v1';
const fresh = (): Notebook => ({fields:{},audit:[{domain:'',inherited:'',learned:'',pressure:''}],days:Array(7).fill(null),started:'',images:{},archives:[]});

document.querySelectorAll<HTMLElement>('[data-reader-tools]').forEach(root => {
  const $ = <T extends HTMLElement = HTMLElement>(s:string) => root.querySelector<T>(s)!;
  const all = <T extends HTMLElement = HTMLElement>(s:string) => [...root.querySelectorAll<T>(s)];
  let book = fresh(), selectedDay = 0, flipped = false, timer: ReturnType<typeof setInterval>|undefined, startedAt = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved.fields === 'object' && Array.isArray(saved.days) && saved.days.length === 7) book = {...fresh(),...saved};
  } catch { $('[data-save-status]').textContent = 'Saved tools could not be read. Export any recoverable entries before clearing this browser.'; }
  function save() {
    try { localStorage.setItem(KEY,JSON.stringify(book)); $('[data-save-status]').textContent = 'Saved on this browser. Other devices have separate entries.'; }
    catch { $('[data-save-status]').textContent = 'Not saved: browser storage is full or unavailable. Export your tools now.'; }
  }
  function panel(index:number) {
    all('[data-tool-panel]').forEach(p => p.hidden = Number(p.dataset.toolPanel) !== index);
    $<HTMLSelectElement>('[data-tool-picker]').value = String(index);
    renderCard(); renderReport(); loadDay();
  }
  function hydrate() {
    all<HTMLInputElement>('[data-field]').forEach(el => el.value = book.fields[el.dataset.field!] || '');
    all<HTMLImageElement>('[data-zone-image]').forEach(img => {const src=book.images[img.dataset.zoneImage!]; img.hidden=!src; if(src) img.src=src; else img.removeAttribute('src');});
    renderAudit(); renderCard(); renderReport(); loadDay();
  }
  function syncIdentity() {
    const identity = book.fields.identity || '';
    window.dispatchEvent(new CustomEvent('halo:reader-identity',{detail:{identity,action:book.fields.action || ''}}));
    const input = document.querySelector<HTMLInputElement>('[data-identity-input]');
    if(input) input.value=identity.replace(/^I am\s+/i,'');
  }
  function choose(statement:string, question:string, degree:string) {
    if(book.fields.identity && book.fields.identity !== statement && book.days.some(Boolean) && !confirm('Change the identity for this test? Existing evidence will remain.')) return;
    book.fields.identity=statement; book.fields.question=question; book.fields.degree=degree;
    book.fields.integrity0=statement; save(); hydrate(); syncIdentity(); panel(2);
  }
  $<HTMLSelectElement>('[data-tool-picker]').addEventListener('change',e => panel(Number((e.target as HTMLSelectElement).value)));
  all<HTMLInputElement>('[data-field]').forEach(el => el.addEventListener('input',() => {
    book.fields[el.dataset.field!]=el.value;
    all<HTMLInputElement>(`[data-field="${el.dataset.field}"]`).filter(other=>other!==el).forEach(other=>other.value=el.value);
    save(); renderCard(); if(el.dataset.field==='identity'||el.dataset.field==='action') syncIdentity();
  }));
  function filter() {
    const query=$<HTMLInputElement>('[data-search]').value.toLowerCase().trim(), domain=$<HTMLSelectElement>('[data-domain]').value;
    let count=0; all('[data-identity]').forEach(el=>{el.hidden=!!((domain&&el.dataset.domainName!==domain)||!el.dataset.searchText!.includes(query)); if(!el.hidden) count++;});
    $('[data-results]').textContent=count ? `${count} identities` : 'No matches. Try another word or write your own identity below.';
  }
  $('[data-search]').addEventListener('input',filter); $('[data-domain]').addEventListener('change',filter);
  all<HTMLButtonElement>('[data-choose]').forEach(btn=>btn.addEventListener('click',()=>{const item=identities.find(i=>i.id===Number(btn.dataset.choose))!; choose(item.statement,item.question,btn.closest('details')!.querySelector('select')!.value);}));
  $('[data-use-custom]').addEventListener('click',()=>{const input=$<HTMLInputElement>('[data-custom]'); if(!input.value.trim()){input.focus();return;} choose(input.value.trim(),'What would that person do right now?','');});
  function renderAudit() {
    const container=$('[data-audit-rows]'); container.replaceChildren();
    book.audit.forEach((row,index)=>{
      const section=document.createElement('div'); section.className='audit-row';
      for(const [key,title] of Object.entries({domain:'Domain',inherited:'Inherited',learned:'Learned',pressure:'Behavior under pressure'})) {
        const label=document.createElement('label');label.textContent=title;const input=document.createElement('textarea');input.rows=2;input.maxLength=1000;input.value=row[key]||'';input.addEventListener('input',()=>{book.audit[index][key]=input.value;save();});label.append(input);section.append(label);
      }
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove domain';remove.addEventListener('click',()=>{if(Object.values(row).some(Boolean)&&!confirm('Remove this audit row?'))return;book.audit.splice(index,1);save();renderAudit();});section.append(remove);container.append(section);
    });
  }
  $('[data-add-audit]').addEventListener('click',()=>{book.audit.push({domain:'',inherited:'',learned:'',pressure:''});save();renderAudit();});
  function renderCard(){ $('[data-card-side]').textContent=flipped?'THE QUESTION':'THE DECISION'; $('[data-card-text]').textContent=flipped?(book.fields.question||'What would that person do right now?'):(book.fields.identity||'I am...'); }
  $('[data-open-card]').addEventListener('click',()=>panel(3));
  $('[data-flip]').addEventListener('click',()=>{flipped=!flipped;renderCard();});
  $('[data-use-action]').addEventListener('click',()=>{book.fields.action=book.fields.integrity6||'';save();hydrate();syncIdentity();panel(3);});
  $('[data-start-timer]').addEventListener('click',()=>{
    if(!book.fields.identity?.trim()||!book.fields.action?.trim()){ $('[data-timer-status]').textContent='Enter your identity and a visible action first.';return; }
    clearInterval(timer); startedAt=Date.now(); $('[data-timer]').textContent='60';
    $<HTMLButtonElement>('[data-start-timer]').disabled=true;$<HTMLButtonElement>('[data-stop-timer]').disabled=false;
    $('[data-timer-status]').textContent='Take your next aligned action.';
    timer=setInterval(()=>{const seconds=Math.max(0,60-Math.floor((Date.now()-startedAt)/1000));$('[data-timer]').textContent=String(seconds);if(!seconds){clearInterval(timer);$('[data-timer-status]').textContent='The minute has passed. Mark complete when the action is done.';}},250);
  });
  $('[data-stop-timer]').addEventListener('click',()=>{
    clearInterval(timer);$<HTMLButtonElement>('[data-start-timer]').disabled=false;$<HTMLButtonElement>('[data-stop-timer]').disabled=true;
    panel(5); form.elements.namedItem('action') && ((form.elements.namedItem('action') as HTMLInputElement).value=book.fields.action||'');
    (form.elements.namedItem('within') as HTMLSelectElement).value=Date.now()-startedAt<=60000?'yes':'no';
    $('[data-day-feedback]').textContent='Action captured. Review the remaining details and save your day.';
  });
  const form=$<HTMLFormElement>('[data-day-form]');
  function loadDay(){const row=book.days[selectedDay];HTMLFormElement.prototype.reset.call(form);if(row) Object.entries(row).forEach(([key,value])=>{const el=form.elements.namedItem(key) as HTMLInputElement;if(el)el.value=value;});slipFields();$('[data-week-status]').textContent=book.started?`Test started ${book.started}. Day ${selectedDay+1} of 7.`:'Ready when you are. Start your seven-day test.';}
  function slipFields(){const slipped=(form.elements.namedItem('slip') as HTMLSelectElement).value==='yes';$('[data-slip-fields]').hidden=!slipped;const speed=form.elements.namedItem('returnSpeed') as HTMLInputElement;speed.required=slipped&&(form.elements.namedItem('reset') as HTMLSelectElement).value==='yes';}
  form.addEventListener('change',slipFields);
  $<HTMLSelectElement>('[data-day]').addEventListener('change',e=>{selectedDay=Number((e.target as HTMLSelectElement).value);loadDay();});
  const today=()=>new Date().toLocaleDateString('en-CA');
  $('[data-start-week]').addEventListener('click',()=>{if(!book.fields.identity?.trim()){panel(0);return;}if(!book.started)book.started=today();save();loadDay();});
  function syncDay(row:Day){window.dispatchEvent(new CustomEvent('halo:reader-day',{detail:{day:selectedDay+1,action:row.action,kind:row.slip==='yes'?(row.reset==='yes'?2:0):1}}));}
  form.addEventListener('submit',event=>{
    event.preventDefault(); if(!book.fields.identity?.trim()){ $('[data-day-feedback]').textContent='Choose an identity before saving evidence.';return; }
    const row=Object.fromEntries(new FormData(form).entries()) as Day;row.action=row.action.trim();if(!row.action){$('[data-day-feedback]').textContent='Name one visible action.';return;}
    if(!book.started)book.started=today();if(row.slip!=='yes'){row.reset='no';row.returnSpeed='';}
    book.days[selectedDay]=row;save();syncDay(row);renderReport();$('[data-day-feedback]').textContent=`Day ${selectedDay+1} saved.`;
  });
  function resetWeek(archive:boolean){
    if(!confirm(archive?'Archive this test and start another seven days?':'Clear the seven-day tracker? Your other worksheets will remain.'))return;
    if(archive)book.archives.push({started:book.started,identity:book.fields.identity||'',days:structuredClone(book.days)});
    book.days=Array(7).fill(null);book.started=archive?today():'';selectedDay=0;$<HTMLSelectElement>('[data-day]').value='0';save();loadDay();renderReport();window.dispatchEvent(new CustomEvent('halo:reader-reset'));
  }
  $('[data-reset-week]').addEventListener('click',()=>resetWeek(false));
  $('[data-next-week]').addEventListener('click',()=>resetWeek(true));
  function renderReport(){
    $('[data-report-identity]').textContent=book.fields.identity||'Choose your identity to begin.';
    const grid=$('[data-evidence]');grid.replaceChildren();
    book.days.forEach((day,i)=>{const btn=document.createElement('button');btn.type='button';const mark=!day?'':day.slip==='yes'?(day.reset==='yes'?'↺':'—'):'✓';btn.textContent=`${i+1} ${mark}`;btn.setAttribute('aria-label',`Day ${i+1}: ${!day?'not recorded':day.slip==='yes'?(day.reset==='yes'?'slipped and reset':'return still open'):'aligned action'}`);btn.className=day?(day.slip==='yes'?'reset':'proved'):'';btn.addEventListener('click',()=>{selectedDay=i;$<HTMLSelectElement>('[data-day]').value=String(i);panel(5);});grid.append(btn);});
    const recorded=book.days.filter((d):d is Day=>!!d);$<HTMLProgressElement>('[data-progress]').value=recorded.length;
    const report=$('[data-report]');report.replaceChildren();
    const add=(text:string)=>{const p=document.createElement('p');p.textContent=text;report.append(p);};
    add(recorded.length===7?'Your seven-day review':'Your daily trajectory');
    if(!recorded.length)add('Your first visible action starts the evidence.');
    else {
      const timed=recorded.filter(d=>d.within==='yes'||d.within==='no'),fast=timed.filter(d=>d.within==='yes').length,slips=recorded.filter(d=>d.slip==='yes'),resets=slips.filter(d=>d.reset==='yes');
      add(`${recorded.length}/7 days recorded. ${timed.length ? `${fast}/${timed.length} timed entries began within 60 seconds.` : 'Timing not recorded yet.'} ${slips.length ? `${resets.length}/${slips.length} slips followed by a same-day reset.` : 'No slips recorded.'}`);
      const minutes=recorded.filter(d=>d.negotiation!=='').map(d=>Number(d.negotiation));
      if(minutes.length)add(`Average negotiation: ${(minutes.reduce((a,b)=>a+b,0)/minutes.length).toFixed(1)} minutes (${minutes.length} entries).`);
      const returns=resets.filter(d=>d.returnSpeed!=='').map(d=>Number(d.returnSpeed));
      if(returns.length)add(`Average return speed: ${(returns.reduce((a,b)=>a+b,0)/returns.length).toFixed(1)} minutes.`);
      const last=recorded[recorded.length-1];add(last.slip==='yes'&&last.reset!=='yes'?'Next: choose one small action to close the open reset.':Number(last.negotiation)>5?'Next: shrink tomorrow\'s action and prepare what it needs today.':last.negotiation===''?'Next: record how long you negotiated before acting to help fine-tune tomorrow.':'Next: repeat the action at the same choice point tomorrow.');
      add('These observations describe your recorded behavior, not a rating of your identity.');
    }
    $<HTMLButtonElement>('[data-next-week]').disabled=recorded.length!==7;
    const archives=$('[data-archives]');archives.replaceChildren();book.archives.forEach(a=>{const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('p');s.textContent=`Previous test: ${a.started}`;p.textContent=`${a.identity}: ${a.days.filter(Boolean).length}/7 days recorded`;d.append(s,p);archives.append(d);});
  }
  all<HTMLInputElement>('[data-zone-upload]').forEach(input=>input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){$('[data-save-status]').textContent='Choose a JPG, PNG or WebP image under 10 MB.';input.value='';return;}
    try{const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();book.images[input.dataset.zoneUpload!]=canvas.toDataURL('image/jpeg',.75);save();hydrate();}catch{$('[data-save-status]').textContent='This image could not be opened. Try another image.';}
  }));
  all<HTMLButtonElement>('[data-remove-image]').forEach(btn=>btn.addEventListener('click',()=>{delete book.images[btn.dataset.removeImage!];save();hydrate();}));
  $('[data-export]').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(book,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='halo-reader-tools.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('[data-print]').addEventListener('click',()=>window.print());
  window.addEventListener('halo:app-state',(event:Event)=>{
    const state=(event as CustomEvent).detail;if(!state)return;
    if(state.identity)book.fields.identity=/^I\s/i.test(state.identity)?state.identity:`I am ${state.identity}`;
    if(state.firstProof&&!book.fields.action)book.fields.action=state.firstProof;
    state.days?.slice(0,7).forEach((kind:number,i:number)=>{if(kind&&state.proofs?.[i+1]){const prior=book.days[i]?.action===state.proofs[i+1]?book.days[i]:null;book.days[i]={action:state.proofs[i+1],negotiation:prior?.negotiation||'',within:prior?.within||'',slip:kind===2?'yes':'no',reset:kind===2?'yes':'no',returnSpeed:prior?.returnSpeed||'',buffer:prior?.buffer||'na'};}});
    save();hydrate();
  });
  window.addEventListener('storage',event=>{if(event.key===KEY){try{const incoming=JSON.parse(event.newValue||'null');if(incoming&&Array.isArray(incoming.days)&&incoming.days.length===7){book=incoming;hydrate();}}catch{}}});
  window.addEventListener('halo:app-reset',()=>{book.days=Array(7).fill(null);book.started='';save();});
  hydrate();filter();window.dispatchEvent(new CustomEvent('halo:reader-ready'));
});
