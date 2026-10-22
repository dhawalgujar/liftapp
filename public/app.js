'use strict';

const icons = {
  cycle: '<rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect>',
  train: '<path d="m6.5 6.5 11 11M4 9l5-5M15 20l5-5M2 7l5-5M17 22l5-5M4.5 4.5l3 3M16.5 16.5l3 3"></path>',
  progress: '<path d="M4 17l5-6 4 3 7-10M15 4h5v5M4 21h16"></path>',
  settings: '<path d="M4 7h16M4 17h16"></path><circle cx="9" cy="7" r="3" fill="var(--surface)"></circle><circle cx="15" cy="17" r="3" fill="var(--surface)"></circle>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"></path>',
  left: '<path d="m15 6-6 6 6 6"></path>',
  right: '<path d="m9 6 6 6-6 6"></path>',
  down: '<path d="m6 9 6 6 6-6"></path>',
  up: '<path d="m6 15 6-6 6 6"></path>',
  check: '<path d="m5 12 4 4L19 6"></path>',
  close: '<path d="m6 6 12 12M6 18 18 6"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"></circle><circle cx="12" cy="12" r="1" fill="currentColor"></circle><circle cx="19" cy="12" r="1" fill="currentColor"></circle>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path>',
  swap: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"></path>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M7 3v4M17 3v4M3 11h18"></path>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"></path>',
  target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="4"></circle><circle cx="12" cy="12" r=".7" fill="currentColor"></circle>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"></path>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"></path>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"></path>',
  upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6"></path>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
  reset: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"></path>',
  skip: '<path d="m5 5 10 7L5 19ZM19 5v14"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7h.01"></path>'
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.cycle}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const phases = ['Foundation', 'Build', 'Push', 'Deload'];
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const calendarFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function calendarDate(value=new Date()) {return calendarFormatter.format(value);}
const uid = () => globalThis.crypto?.randomUUID?.()||`plan-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
const ex = (id,name,sets,reps,weight,lastReps,section) => ({id,name,sets,reps,weight,lastReps,section});

// View-only prescriptions do not start sessions or persist workout data locally.
function createRecord(day, week) {
  return {id:null,week,dayId:day.id,dayName:day.name,focus:day.focus,status:'pending',finished:false,
    exercises:day.exercises.map(item=>({...item,originalName:item.name,targetReps:item.reps,weight:'',reps:'',lastWeight:null,lastReps:null,done:false}))};
}
let state=null;
let tab='cycle', page='cycle', openExercise=undefined, showCompletedExercises=false, progressView='activity', selectedTrend=null, trendCycle='all', historyYear=Number(calendarDate().slice(0,4)), historyMonth=null, historyId=null, openDay=null, exerciseSearch='';
let toastTimer;
const app = document.getElementById('app');
const screen = document.getElementById('screen');
const header = document.getElementById('app-header');
const navigation = document.getElementById('navigation');
const overlay = document.getElementById('overlay-root');
const actionArea = document.getElementById('workout-action');
let user=null, serverOffset=0, busy=false, pendingRetry=null, autosaveTimer=null, refreshInFlight=false, returnFocus=null,recapId=null,pendingTimeoutId=null;
let requestChain=Promise.resolve();
const drafts=new Map();
let libraryAbort=null;
let planConflict=null;
let renderingBackground=false,lastRenderedSignature='',backgroundChangesPending=false;
let saveFeedbackTimer=null,saveFeedbackVisible=false;
const markupCache=new WeakMap(),localInitials=new Map();
function resultValue(value) {return value==null||value===''?'—':String(value);}
function performanceText(item) {return `${resultValue(item.weight)} lb × ${resultValue(item.reps)}`;}
function preference(key,value) {try {if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);return true;}catch {return false;}}
function stored(key) {try{return localStorage.getItem(key);}catch{return null;}}
function initialsKey() {const id=state?.user?.id||user?.id;return id?`lift-initials:${id}`:null;}
function customInitials() {const key=initialsKey();return key?(localInitials.get(key)??stored(key)??''):'';}
function initials() {return customInitials()||Array.from(state?.user?.username?.trim()||'LIFT').slice(0,2).join('').toUpperCase();}
function isFinished(rec) {return Boolean(rec&&(rec.finished||rec.finishedAt||(rec.finished===undefined&&['completed','skipped'].includes(rec.status))));}
function statusLabel(rec) {return rec.status==='skipped'?'SKIPPED':isFinished(rec)?rec.status==='completed'?'COMPLETED':'PARTIAL · FINISHED':'IN PROGRESS';}
/** JSON API boundary. All mutations are serialized; views never fetch directly. */
async function api(method,path,body,{signal}={}) {
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
  const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
    const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
    let result;try{result=await response.json();}catch{throw new Error('The server returned an unreadable response. Please retry.');}
    if(!response.ok){const error=new Error(result.error||'Unable to save your changes.');error.status=response.status;throw error;}
    return result;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
function endpoint(path) {return `/api/v2/users/${encodeURIComponent(user.id)}${path}`;}
function setBusy(value) {
  busy=value;app.setAttribute('aria-busy',String(value));
  for(const button of app.querySelectorAll('button')) {
    if(value&&!button.disabled){button.dataset.savingDisabled='true';button.disabled=true;}
    else if(!value&&button.dataset.savingDisabled){delete button.dataset.savingDisabled;button.disabled=false;}
  }
  for(const input of app.querySelectorAll('input,textarea')){
    if(value&&!input.readOnly){input.dataset.savingReadonly='true';input.readOnly=true;}
    else if(!value&&input.dataset.savingReadonly){delete input.dataset.savingReadonly;input.readOnly=false;}
  }
  updateSaveStatus();
  if(!value&&backgroundChangesPending)setTimeout(applyBackgroundChanges,0);
}
function updateSaveStatus() {
  let node=document.getElementById('save-status');
  if(!node){node=document.createElement('div');node.id='save-status';node.className='save-status';node.setAttribute('role','status');(document.getElementById('notifications')||app).append(node);}
  const saving=busy||drafts.size;
  if(!saving||pendingRetry||planConflict){clearTimeout(saveFeedbackTimer);saveFeedbackTimer=null;saveFeedbackVisible=false;}
  else if(!saveFeedbackTimer&&!saveFeedbackVisible){
    saveFeedbackTimer=setTimeout(()=>{saveFeedbackTimer=null;saveFeedbackVisible=true;updateSaveStatus();},350);
  }
  const conflictContent=planConflict?`<span>${esc(planConflict.message)} Your edits are kept. Reloading discards unsaved plan edits.</span><button class="text-btn" data-action="reload-plan" ${busy?'disabled':''}>Reload latest plan ${icon('reset')}</button>`:'';
  const content=conflictContent||(pendingRetry?`<span>${esc(pendingRetry.message)}</span><button class="text-btn" data-action="retry-save">Retry ${icon('reset')}</button>`:saving&&saveFeedbackVisible?drafts.size?'Saving quick entries…':'Saving…':'');
  if(node.innerHTML!==content)node.innerHTML=content;
  node.dataset.transient=String(!pendingRetry&&!planConflict);
  // Passive save feedback stays at the top; actionable recovery belongs in the dialog.
  const sheet=overlay.querySelector('.sheet');
  node.hidden=!node.innerHTML||Boolean(sheet&&(pendingRetry||planConflict));
  overlay.querySelector('.sheet-save-error')?.remove();
  const recovery=planConflict?`<div class="sheet-save-error" role="alert">${conflictContent}</div>`:pendingRetry?`<div class="sheet-save-error" role="alert"><p class="form-error">${esc(pendingRetry.message)}</p><button class="text-btn" data-action="retry-save">Retry ${icon('reset')}</button></div>`:'';
  if(sheet&&recovery){
    const heading=overlay.querySelector('.sheet-heading');
    if(heading)heading.insertAdjacentHTML('afterend',recovery);
    else sheet.insertAdjacentHTML('afterbegin',recovery);
  }
}
function enqueue(work) {
  const result=requestChain.then(work);requestChain=result.catch(()=>{});return result;
}
function isExistingPlanForm(form) {return Boolean(form&&(form.id==='exercise-form'||form.id==='text-form'&&form.dataset.kind!=='create-split'));}
function isEditingPlan() {return page==='editor'||isExistingPlanForm(overlay.querySelector('form'))||Boolean(planConflict);}
async function loadState({preserveSelection=false,preserveEditorPlan=true,background=false}={}) {
  const before=Date.now(), selected=state?.selected,identity=user?.id;
  const fresh=await api('GET',endpoint('/state'));
  // An in-flight background read must not sign a user back in after logout.
  if(background&&user?.id!==identity)return null;
  serverOffset=Date.parse(fresh.serverNow)-(before+Date.now())/2;
  if(!Number.isFinite(serverOffset))serverOffset=0;
  fresh.theme=stored('lift-theme')==='dark'?'dark':'light';
  if(state){const expired=Object.values(fresh.records).find(r=>r.finishReason==='timeout'&&isFinished(r)&&Object.values(state.records).some(old=>old.id===r.id&&!isFinished(old)));if(expired)pendingTimeoutId=expired.id;}
  if(preserveSelection&&selected&&fresh.plan.some(day=>day.id===selected.dayId))fresh.selected=selected;
  // The visible editor and its source tree must keep the same original version.
  // Do not attach stale typed form values to a newer background-fetched tree.
  if(preserveEditorPlan&&state&&isEditingPlan()){
    if(fresh.activeRoutineId!==state.activeRoutineId){for(const key of ['activeRoutineId','cycle','selected','records'])fresh[key]=state[key];}
    for(const key of ['plan','splitName','planVersion'])fresh[key]=state[key];
  }
  fresh.savedSplits=fresh.savedSplits.filter(split=>split.id!==fresh.activeRoutineId);
  state=fresh;
  // In-flight input stays authoritative until its own acknowledged write.
  for(const draft of drafts.values()){
    const record=Object.values(state.records).find(r=>r.id===draft.sessionId);
    const exercise=record?.exercises.find(e=>e.id===draft.exerciseId);
    if(exercise)Object.assign(exercise,draft.values);
  }
  return state;
}
function saveFailure(error,retry) {
  if(error.status>=400&&error.status<500&&error.status!==429){
    pendingRetry=null;updateSaveStatus();
    const field=overlay.querySelector('.form-error');if(field)field.textContent=error.message;
    else if(overlay.querySelector('.sheet')){overlay.querySelector('.sheet-validation-error')?.remove();overlay.querySelector('.sheet').insertAdjacentHTML('beforeend',`<p class="form-error sheet-validation-error" role="alert">${esc(error.message)}</p>`);}
    toast(error.message);return;
  }
  pendingRetry={message:error.message||'Your changes could not be saved.',run:retry};updateSaveStatus();toast('Not saved. Your input is kept. Please retry.');
}
async function mutation(method,path,body,{after=null,preserveSelection=true}={}) {
  const planWrite=method==='PUT'&&/^\/routines\/[^/]+\/plan$/.test(path);
  if(planWrite&&planConflict){updateSaveStatus();return null;}
  if(method==='POST'&&(path==='/cycles'||path==='/routines')){
    body={...structuredClone(body||{}),operationId:body?.operationId||uid()};
    if(path==='/cycles')body={...body,routineId:body.routineId??state.activeRoutineId,expectedCycle:body.expectedCycle??state.cycle};
  }
  let committed=false,result,attempted=false;
  const work=async()=>{
    if(planWrite&&planConflict){updateSaveStatus();return null;}
    let requestBody=body;
    if(attempted&&!committed){
      captureLogInputs();
      const entryPath=path.match(/^\/sessions\/([^/]+)\/exercises\/([^/]+)$/);
      const record=entryPath&&Object.values(state?.records||{}).find(rec=>rec.id===decodeURIComponent(entryPath[1]));
      const item=record?.exercises.find(exercise=>exercise.id===decodeURIComponent(entryPath[2]));
      if(item&&body){
        requestBody={...body};
        for(const field of ['weight','reps'])if(Object.hasOwn(body,field))requestBody[field]=item[field]==null||item[field]===''?'':Number(item[field]);
        if(body.done&&!hasRecordedResult(requestBody)){const error=new Error('Enter a valid weight and positive whole-number reps before retrying completion.');error.status=400;saveFailure(error,()=>{});return null;}
      }
    }
    attempted=true;
    setBusy(true);
    try{
      if(!committed){result=await api(method,endpoint(path),requestBody);committed=true;}
      await loadState({preserveSelection,preserveEditorPlan:!planWrite});pendingRetry=null;
      if(planWrite)planConflict=null;
      if(after)after(result);render();return result;
    }finally{setBusy(false);}
  };
  const run=async()=>{try{return await enqueue(work);}catch(error){
    if(planWrite&&error.status===409&&!committed){
      planConflict={routineId:decodeURIComponent(path.split('/')[2]),message:error.message||'This plan changed elsewhere.'};pendingRetry=null;updateSaveStatus();toast('Plan not saved. Your edits are kept. Reload the latest plan to continue.');return null;
    }
    if(error.status>=400&&error.status<500&&error.status!==429){try{await enqueue(()=>loadState({preserveSelection}));render();}catch{/* Keep the user's form available if reconnecting also fails. */}}
    saveFailure(error,run);return null;
  }};
  return run();
}
function savePlan() {
  if(planConflict){updateSaveStatus();return Promise.resolve(null);}
  const body={name:state.splitName,plan:structuredClone(state.plan),planVersion:state.planVersion};
  // The callback also runs when Retry completes a previously acknowledged save.
  // Do not leave an old add/edit form attached to the newly refreshed version.
  return mutation('PUT',`/routines/${encodeURIComponent(state.activeRoutineId)}/plan`,body,{after:closeSheet});
}
async function reloadLatestPlan() {
  if(!planConflict||busy)return false;
  return enqueue(async()=>{
    setBusy(true);
    try{
      await loadState({preserveSelection:true,preserveEditorPlan:false});
      planConflict=null;pendingRetry=null;closeSheet();page='editor';tab='settings';render();return true;
    }catch(error){toast(error.message||'Unable to reload the latest plan. Your edits are kept.');return false;}
    finally{setBusy(false);}
  });
}
function writeDraft(item,field,value) {
  const rec=getRecord();if(!rec?.id||(!rec.startedAt&&!isFinished(rec)))return;
  const key=`${rec.id}:${item.id}`;
  const existing=drafts.get(key);
  drafts.set(key,{sessionId:rec.id,exerciseId:item.id,values:{...existing?.values,[field]:value},version:(existing?.version||0)+1});
  item[field]=value;updateSaveStatus();clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(()=>flushDrafts(),550);
}
function captureLogInputs() {
  for(const input of screen.querySelectorAll('[data-log]')){
    if(input.disabled||input.readOnly)continue;
    const item=getSelectedExercise(input.dataset.id),field=input.dataset.log;
    if(item&&String(item[field]??'')!==input.value)writeDraft(item,field,input.value);
  }
}
async function flushDrafts() {
  captureLogInputs();
  clearTimeout(autosaveTimer);
  if(!drafts.size)return true;
  return enqueue(async()=>{
    captureLogInputs();clearTimeout(autosaveTimer);
    // Draft writes are serialized, but must never lock the keyboard or controls.
    // A newer draft version is drained below before an explicit action proceeds.
    updateSaveStatus();
    try{
      // Drain versions added during a request before navigation or completion may continue.
      while(drafts.size)for(const [key,draft] of [...drafts]){
        const version=draft.version, body={...draft.values};
        for(const field of ['weight','reps'])if(body[field]!==undefined&&body[field]!==''){
          const value=Number(body[field]);
          if(!Number.isFinite(value)||value<0||(field==='reps'&&(!Number.isInteger(value)||value<1)))throw new Error('Enter a valid weight and positive whole-number reps.');
          body[field]=value;
        }
        await api('PUT',endpoint(`/sessions/${encodeURIComponent(draft.sessionId)}/exercises/${encodeURIComponent(draft.exerciseId)}`),body);
        if(drafts.get(key)?.version===version)drafts.delete(key);
      }
      pendingRetry=null;return true;
    }catch(error){saveFailure(error,async()=>{if(await flushDrafts()){await loadState({preserveSelection:true});render();}});return false;}
    finally{updateSaveStatus();if(backgroundChangesPending)setTimeout(applyBackgroundChanges,0);}
  });
}
function loginScreen(message='') {
  closeSheet();header.innerHTML='<span class="brand">LIFT</span>';navigation.innerHTML='';actionArea.innerHTML='';
  screen.innerHTML=`<section class="login-screen">${pageTitle('Your next rep.','Your training. Your bigger picture.')}<form id="login-form"><label class="form-field">Username<input name="username" autocomplete="username" required maxlength="80" autofocus></label><p class="form-error" role="alert">${esc(message)}</p><button class="primary" type="submit">Continue ${icon('arrow')}</button><p class="detail-info">Use your existing username to return to your training log. A new username creates a new account.</p></form></section>`;
  document.documentElement.dataset.theme=app.dataset.theme=stored('lift-theme')==='dark'?'dark':'light';
}
async function signOut() {
  if(!await flushDrafts())return false;
  clearTimeout(autosaveTimer);user=null;state=null;pendingRetry=null;planConflict=null;recapId=null;pendingTimeoutId=null;openExercise=undefined;openDay=null;trendCycle='all';selectedTrend=null;progressView='activity';tab='cycle';page='cycle';
  preference('lift-user',null);updateSaveStatus();loginScreen();return true;
}
async function boot() {
  header.innerHTML='<span class="brand">LIFT</span>';screen.innerHTML='<div class="empty-state" role="status">Loading your training space…</div>';
  try{user=JSON.parse(stored('lift-user'));}catch{user=null;}
  if(!user?.id){loginScreen();return;}
  try{
    await loadState();prepareSignedInView();user=state.user;preference('lift-user',JSON.stringify(user));
    render();
  }
  catch(error){if(error.status===404||error.status===401){preference('lift-user',null);user=null;loginScreen('Please sign in to continue.');}else{screen.innerHTML=pageTitle('Unable to load your training',esc(error.message))+'<button class="primary" data-action="retry-load">Try again</button><button class="text-btn" data-action="logout">Use another username</button>';}}
}
function prepareSignedInView() {
  selectNextOnLaunch();tab='cycle';page='cycle';recapId=null;pendingTimeoutId=null;progressView='activity';
  const latest=state.history.slice().sort((a,b)=>String(b.finishedAt||b.startedAt||b.date||'').localeCompare(String(a.finishedAt||a.startedAt||a.date||'')))[0];
  if(latest?.finishReason==='timeout'){recapId=latest.id;page='recap';}
}
async function startSelected() {
  const rec=getRecord();if(isFinished(rec)){render();return;}
  await mutation('POST','/sessions/start',{dayId:state.selected.dayId,week:state.selected.week});
}
async function skipSession(week,dayId) {
  let sessionId=getRecord(week,dayId)?.id,skipped=false;
  const run=async()=>{
    try{return await enqueue(async()=>{
      setBusy(true);
      try{
        // The v2 skip endpoint requires an ID. The confirmation explicitly says Start & skip.
        if(!sessionId)sessionId=(await api('POST',endpoint('/sessions/start'),{week,dayId})).sessionId;
        if(!skipped){await api('POST',endpoint(`/sessions/${encodeURIComponent(sessionId)}/skip`),{});skipped=true;}
        await loadState({preserveSelection:true});pendingRetry=null;closeSheet();navigate('cycle');toast('Session skipped.');return true;
      }finally{setBusy(false);}
    });}catch(error){saveFailure(error,run);return false;}
  };
  return run();
}
/** Display only: the persisted server start/deadline and timeout policy never change. */
function elapsedWorkoutTime(rec) {
  const start=Date.parse(rec?.startedAt),now=Date.now()+(Number.isFinite(serverOffset)?serverOffset:0);
  if(!rec?.startedAt||!Number.isFinite(start)||!Number.isFinite(now))return null;
  const seconds=Math.min(90*60,Math.max(0,Math.floor((now-start)/1000)));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function timerMarkup(rec) {
  const elapsed=elapsedWorkoutTime(rec);
  if(!rec?.expiresAt||isFinished(rec)||elapsed===null)return '';
  return `<div class="workout-timer"><span class="eyebrow">Time spent</span><strong id="countdown" role="timer" aria-label="Workout time spent">${elapsed}</strong><span class="small muted">/ 90 min</span></div>`;
}
function tick() {
  if(!state)return;const rec=getRecord();const node=document.getElementById('countdown');
  if(node){const elapsed=elapsedWorkoutTime(rec);if(node.parentElement)node.parentElement.hidden=!rec?.expiresAt||isFinished(rec)||elapsed===null;if(rec?.expiresAt&&!isFinished(rec)&&elapsed!==null)node.textContent=elapsed;}
}
function hasActiveWorkout() {
  return [...Object.values(state?.records||{}),...(state?.history||[])].some(rec=>rec.startedAt&&rec.expiresAt&&!isFinished(rec));
}
function viewSignature() {
  if(!state)return '';
  const common={page,user:state.user,theme:state.theme,initials:initials()};
  const records=Object.fromEntries(Object.entries(state.records).filter(([,rec])=>rec.id));
  let visible;
  if(page==='settings')visible={split:state.splitName,cycle:state.cycle,days:state.plan.length,completed:completedCount()};
  else if(page==='history-detail')visible=state.history.find(rec=>rec.id===historyId);
  else if(page==='train')visible={selected:state.selected,record:getRecord()?.id?getRecord():null,plan:state.plan,history:state.history};
  else if(page==='cycle')visible={plan:state.plan,records,cycle:state.cycle,split:state.splitName};
  else if(page==='progress'&&progressView==='activity')visible={history:state.history,year:historyYear,month:historyMonth};
  else visible={plan:state.plan,records,history:state.history,splits:state.savedSplits,cycle:state.cycle,
    routine:state.activeRoutineId,split:state.splitName,selectedTrend,trendCycle,exerciseSearch,progressView,recapId};
  // serverNow deliberately never participates: clock correction is not a UI change.
  return JSON.stringify({common,visible},(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)
    ?Object.fromEntries(Object.keys(value).sort().map(name=>[name,value[name]])):value);
}
function applyBackgroundChanges() {
  if(!state||busy||pendingRetry||drafts.size)return;
  if(!pendingTimeoutId&&viewSignature()===lastRenderedSignature){backgroundChangesPending=false;return;}
  backgroundChangesPending=true;
  if(overlay.children.length||page==='editor'||screen.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable="true"]'))return;
  render(false,{background:true});
}
async function refresh({force=true}={}) {
  if(!user||!state||busy||drafts.size||refreshInFlight||document.hidden||pendingRetry||!force&&!hasActiveWorkout())return;
  refreshInFlight=true;
  try{
    await enqueue(async()=>{
      if(!user||!state||busy||drafts.size||pendingRetry)return;
      const previousRecords=new Map(Object.values(state.records).map(rec=>[rec.id,isFinished(rec)]));
      if(!await loadState({preserveSelection:true,background:true}))return;
      const timedOut=Object.values(state.records).find(rec=>rec.finishReason==='timeout'&&isFinished(rec)&&previousRecords.has(rec.id)&&!previousRecords.get(rec.id));
      if(timedOut&&overlay.querySelector('form'))toast('Automatically finished after 90 minutes.');
      applyBackgroundChanges();
      tick();
    });
  }catch{ /* Background reads are silent; mutations retain their explicit save/retry UI. */ }
  finally{refreshInFlight=false;}
}
setInterval(tick,1000);setInterval(()=>refresh({force:false}),15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('online',()=>refresh());
document.addEventListener('focusout',()=>{if(backgroundChangesPending)setTimeout(applyBackgroundChanges,0);});
window.addEventListener('beforeunload',event=>{if(drafts.size||busy||pendingRetry||planConflict){event.preventDefault();event.returnValue='';}});
function save() { return savePlan(); }
function toast(message) {const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800);}
function getRecord(week=state?.selected?.week,dayId=state?.selected?.dayId) {return state?.records?.[`${week}:${dayId}`];}
function statusOf(week,dayId) {const rec=getRecord(week,dayId);if(!rec)return 'pending';if(['completed','partial','skipped'].includes(rec.status))return rec.status;return rec.exercises.some(e=>e.done)?'partial':'pending';}
function nextWorkout() {
  if(!state?.plan?.length)return null;
  for(let week=1;week<=4;week++) {
    const days=state.plan.filter(day=>!isFinished(getRecord(week,day.id)));
    if(days.length) return {week,day:days.find(day=>statusOf(week,day.id)==='partial')||days[0]};
  }
  return null;
}
function selectNextOnLaunch() {const next=nextWorkout();if(next)state.selected={week:next.week,dayId:next.day.id};}
function ensureRecord(week,dayId) {const key=`${week}:${dayId}`;if(!state.records[key]) {const day=state.plan.find(d=>d.id===dayId);state.records[key]=createRecord(day,week);}return state.records[key];}
function completedCount() {let count=0;for(let w=1;w<=4;w++) for(const day of state.plan) if(statusOf(w,day.id)==='completed')count++;return count;}
function pageTitle(title,subtitle='',right='') {return `<div class="page-title"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${right}</div>`;}
function tag(text,kind='') {return `<span class="tag ${kind}">${text}</span>`;}
function getSelectedExercise(id=openExercise) {return getRecord()?.exercises.find(e=>e.id===id);}
function showSheet(title,content) {
  libraryAbort?.abort();libraryAbort=null;
  if(!overlay.children.length)returnFocus=document.activeElement;
  overlay.innerHTML=`<div class="scrim" data-action="dismiss"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="sheet-handle"></div><div class="sheet-heading"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-sheet" aria-label="Close dialog">${icon('close')}</button></div>${content}</section></div>`;
  screen.inert=true;header.inert=true;navigation.inert=true;actionArea.inert=true;
  for(const error of overlay.querySelectorAll('.form-error')){error.setAttribute('role','alert');error.setAttribute('aria-live','polite');}
  overlay.querySelector('.sheet').focus();
  updateSaveStatus();
}
function closeSheet() {libraryAbort?.abort();libraryAbort=null;const wasOpen=Boolean(overlay.children.length);overlay.innerHTML='';screen.inert=false;header.inert=false;navigation.inert=false;actionArea.inert=false;if(wasOpen){if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else screen.focus({preventScroll:true});}returnFocus=null;updateSaveStatus();if(backgroundChangesPending)setTimeout(applyBackgroundChanges,0);}
function navigate(dest) {closeSheet();if(dest==='progress')progressView='activity';tab=dest;page=dest;render(true);}
function nodeKey(node) {
  if(node.nodeType!==1)return null;
  if(node.id)return `id:${node.id}`;
  if(node.hasAttribute('data-screen-label'))return `screen:${node.getAttribute('data-screen-label')}`;
  if(node.hasAttribute('data-view-key'))return `view:${node.getAttribute('data-view-key')}`;
  if(node.hasAttribute('data-exercise'))return `exercise:${node.getAttribute('data-exercise')}`;
  if(node.hasAttribute('data-log'))return `log:${node.getAttribute('data-id')}:${node.getAttribute('data-log')}`;
  if(node.hasAttribute('data-action'))return ['data-action','data-id','data-week','data-value','data-tab','data-day','data-section'].map(key=>node.getAttribute(key)||'').join('|');
  return null;
}
function reconcileChildren(parent,wantedParent) {
  const oldChildren=Array.from(parent.childNodes),wantedChildren=Array.from(wantedParent.childNodes);
  const countKeys=nodes=>{const counts=new Map();for(const node of nodes){const key=nodeKey(node);if(key)counts.set(key,(counts.get(key)||0)+1);}return counts;};
  const oldCounts=countKeys(oldChildren),wantedCounts=countKeys(wantedChildren);
  const keyed=new Map(oldChildren.filter(node=>{const key=nodeKey(node);return key&&oldCounts.get(key)===1&&wantedCounts.get(key)===1;}).map(node=>[nodeKey(node),node]));
  const compatible=(a,b)=>a&&a.nodeType===b.nodeType&&a.nodeName===b.nodeName&&nodeKey(a)===nodeKey(b);
  let cursor=parent.firstChild;
  for(const wanted of wantedChildren){
    const key=nodeKey(wanted);let current=keyed.get(key);
    if(!current||current.parentNode!==parent||!compatible(current,wanted))current=compatible(cursor,wanted)?cursor:null;
    if(!current){current=wanted.cloneNode(true);parent.insertBefore(current,cursor);}
    else{
      if(current!==cursor)parent.insertBefore(current,cursor);
      if(current.nodeType===1){
        for(const attribute of Array.from(current.attributes))if(!wanted.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
        for(const attribute of Array.from(wanted.attributes))if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
        if(['INPUT','TEXTAREA','SELECT'].includes(current.tagName)&&current!==document.activeElement&&current.value!==wanted.value)current.value=wanted.value;
        reconcileChildren(current,wanted);
      }else if(current.nodeValue!==wanted.nodeValue)current.nodeValue=wanted.nodeValue;
    }
    cursor=current.nextSibling;
  }
  while(cursor){const next=cursor.nextSibling;parent.removeChild(cursor);cursor=next;}
}
function setMarkup(target,markup) {
  const previous=markupCache.get(target);
  if(previous?.source===markup&&previous.html===target.innerHTML)return;
  // Keep existing controls attached during refreshes, saves and local edits.
  // Distinct screens and keyed rows are replaced only when their identity changes.
  if(target.childNodes?.length){const template=document.createElement('template');template.innerHTML=markup;reconcileChildren(target,template.content);}
  else target.innerHTML=markup;
  markupCache.set(target,{source:markup,html:target.innerHTML});
}
function setScreenMarkup(markup) {setMarkup(screen,markup);}
function render(resetScroll=false,{background=false}={}) {
  if(!state)return;
  const wasBackground=renderingBackground,scrollTop=screen.scrollTop;
  if(pendingTimeoutId&&!overlay.querySelector('form')){recapId=pendingTimeoutId;pendingTimeoutId=null;tab='train';page='recap';background=false;resetScroll=true;}
  renderingBackground=background;
  try{
  document.documentElement.dataset.theme=app.dataset.theme=state.theme;
  app.dataset.page=page;
  const nested=['exercise-detail','history-detail','splits','editor','recap','cycle-summary'].includes(page);
  setMarkup(header,nested?`<button class="back-header" data-action="back">${icon('left')} ${page==='editor'?'Training splits':page==='splits'?'Settings':page==='recap'?'Your cycle':page==='cycle-summary'?'Your cycle':'Progress'}</button><span class="small muted">LIFT</span>`:`<button class="brand" data-action="nav" data-tab="cycle" aria-label="LIFT cycle dashboard"><span class="brand-mark"><i></i><i></i><i></i></span>LIFT</button><div class="header-end"><button class="avatar" data-action="nav" data-tab="settings" aria-label="Profile and settings">${esc(initials())}</button></div>`);
  setMarkup(navigation,['cycle','train','progress','settings'].map(name=>`<button class="nav-item ${tab===name?'active':''}" data-action="nav" data-tab="${name}" ${tab===name?'aria-current="page"':''}><span class="nav-icon-wrap">${icon(name)}</span>${name[0].toUpperCase()+name.slice(1)}</button>`).join(''));
  if(page!=='train')setMarkup(actionArea,'');
  if(page==='cycle')renderCycle();
  if(page==='train'){if(state.plan.length)renderTrain();else{setScreenMarkup(pageTitle('Your plan starts here','Add a training day in Settings.')+'<button class="primary" data-action="editor">Build your plan</button>');setMarkup(actionArea,'');}}
  if(page==='progress')renderProgress();
  if(page==='exercise-detail')renderExerciseDetail();
  if(page==='history-detail')renderHistoryDetail();
  if(page==='settings')renderSettings();
  if(page==='splits')renderSplits();
  if(page==='editor')renderEditor();
  if(page==='recap')renderRecap();
  if(page==='cycle-summary')renderCycleSummary();
  if(resetScroll)screen.scrollTop=0;
  const rec=getRecord();
  if(page==='train'&&rec){
    if(!rec.startedAt&&!isFinished(rec)){
      for(const input of screen.querySelectorAll('[data-log]'))input.disabled=true;
      for(const button of screen.querySelectorAll('[data-action="complete-exercise"],[data-action="use-last"],[data-action="substitute"],[data-action="exercise-options"]'))button.disabled=true;
      setMarkup(actionArea,`<button class="primary" data-action="start-selected">${rec.id?'Resume workout':'Start workout'} ${icon('arrow')}</button>`);
      const note=screen.querySelector('.save-note');if(note)note.textContent='Start when you’re ready. Your 90-minute timer begins only then.';
    }
    if(rec.finishReason==='timeout')screen.querySelector('.training-title')?.insertAdjacentHTML('afterend','<div class="viewing-note">Automatically finished after 90 minutes.</div>');
  }
  if(['recap','history-detail'].includes(page)){
    const record=page==='recap'?recapRecord():state.history.find(r=>r.id===historyId);
    if(record?.finishReason==='timeout')screen.querySelector('section')?.insertAdjacentHTML('afterbegin','<p class="viewing-note">Automatically finished after 90 minutes.</p>');
  }
  const dots=screen.querySelectorAll('.session-dot');
  for(const dot of dots){const rec=getRecord(Number(dot.dataset.week),dot.dataset.id);if(rec?.status==='partial'&&isFinished(rec)){dot.classList.add('partial-finished');dot.setAttribute('aria-label',`${dot.getAttribute('aria-label')}, finished`);dot.innerHTML=icon('check');}}
  for(const row of screen.querySelectorAll('.history-row')){const record=state.history.find(r=>r.id===row.dataset.id);if(record){row.lastElementChild?.remove();row.insertAdjacentHTML('beforeend',tag(statusLabel(record),record.status==='completed'?'green':'neutral'));}}
  if(page==='history-detail'){const record=state.history.find(r=>r.id===historyId);const badge=screen.querySelector('.page-title .tag');if(record){if(badge)badge.textContent=statusLabel(record);appendHistoricalSets(record);}}
  if(background&&!resetScroll)screen.scrollTop=scrollTop;
  updateSaveStatus();tick();if(busy)setBusy(true);
  lastRenderedSignature=viewSignature();backgroundChangesPending=false;
  }finally{renderingBackground=wasBackground;}
}

function renderCycle() {
  if(!state.plan.length){setScreenMarkup(`<section>${pageTitle('Your cycle starts here','Build your training plan, then take it one session at a time.')}<div class="empty-state">No training days yet.</div><button class="primary" data-action="editor">Build your plan ${icon('plus')}</button><button class="text-btn full" data-action="splits">Choose or import a split</button></section>`);return;}
  const next=nextWorkout(), total=state.plan.length*4, completed=completedCount();
  const rec=next?getRecord(next.week,next.day.id):null;
  const done=rec?.exercises.filter(e=>e.done).length||0;
  const exerciseTotal=rec?.exercises.length||next?.day.exercises.length||0;
  const phaseWeek=next?.week||4;
  setScreenMarkup(`<section data-screen-label="Cycle dashboard"><div class="cycle-heading"><div class="eyebrow muted">Your training, in focus</div><h2>A little stronger.<br>Every session.</h2><p class="cycle-subtitle">${esc(state.splitName)} · Week ${phaseWeek} of 4</p></div><div class="cycle-dashboard"><div class="cycle-main">
    ${next?`<article class="next-card"><div class="eyebrow">${done?'Ready when you are':'Up next'}</div><div class="hero-icon">${icon('train')}</div><h2>${esc(next.day.name)}</h2><p class="hero-meta">Week ${next.week} · Day ${state.plan.indexOf(next.day)+1} &nbsp; / &nbsp; ${esc(next.day.focus)}</p><div class="hero-progress"><div class="mini-bars">${Array.from({length:exerciseTotal},(_,i)=>`<i class="${i<done?'done':''}"></i>`).join('')}</div><span>${done} / ${exerciseTotal} exercises</span></div><button class="primary" data-action="resume"><span>${done?'Resume workout':'Start workout'}</span>${icon('arrow')}</button><p class="hero-foot">One session closer to your best.</p></article>`:
    `<article class="next-card"><div class="eyebrow">All four weeks. Well earned.</div><div class="hero-icon">${icon('check')}</div><h2>Cycle complete.</h2><p class="hero-meta">${completed} sessions trained. Time to see your progress.</p><div class="hero-progress"></div><button class="primary" data-action="cycle-summary">Review your cycle ${icon('arrow')}</button></article>`}
    <div class="phase-note"><span class="phase-icon">${icon('target')}</span><p><strong>Week ${phaseWeek} · ${phases[phaseWeek-1]}</strong><br>${['Find your rhythm. Establish working weights.','A little more load. Or one more good rep.','Follow your plan’s higher-effort targets.','Recover with intention. Follow your deload plan.'][phaseWeek-1]}</p></div>
    <button class="split-shortcut card" data-action="splits"><span class="split-icon">${icon('settings')}</span><span><strong>Your training plan</strong><span class="small muted">${esc(state.splitName)} · ${state.plan.length} sessions / week</span></span>${icon('right')}</button></div><div class="cycle-overview"><div class="cycle-top"><h3>Your cycle</h3><div class="cycle-number">Cycle <b>${String(state.cycle).padStart(2,'0')}</b></div></div><div class="cycle-overview-card card">
    <div class="journey-summary"><span><strong>${completed}</strong> of ${total} sessions trained</span><span>${Math.round(completed/Math.max(1,total)*100)}% through</span></div>
    <div class="journey-track">${Array.from({length:4},(_,i)=>`<span class="${i<phaseWeek-1?'complete':i===phaseWeek-1?'current':''}"></span>`).join('')}</div>
    <div class="cycle-map">${[1,2,3,4].map(week=>{
      const states=state.plan.map(day=>statusOf(week,day.id)), count=states.filter(s=>s==='completed').length;
      return `<div class="week-row ${week===phaseWeek?'current':''} ${week===4?'deload':''}"><div class="week-row-top"><div class="week-info"><span class="week-number">${String(week).padStart(2,'0')}</span><span class="week-title">${phases[week-1]}</span></div><span class="week-state">${count===state.plan.length?'Complete':states.some(s=>s!=='pending')?`${count} / ${state.plan.length} trained`:'Upcoming'}</span></div><div class="session-dots">${state.plan.map((day,i)=>{const status=states[i];return `<button class="session-dot ${status==='completed'?'done':status==='partial'?'current':status==='skipped'?'skipped':''}" data-action="session-preview" data-week="${week}" data-id="${day.id}" aria-label="Week ${week}, ${esc(day.name)}, ${status}">${status==='completed'?icon('check'):status==='partial'?'<span class="status-ring"></span>':status==='skipped'?icon('skip'):String(i+1).padStart(2,'0')}</button>`;}).join('')}</div></div>`;
    }).join('')}</div></div><div class="map-legend" aria-label="Session status legend"><span><i class="legend-session done" aria-hidden="true">${icon('check')}</i>Completed</span><span><i class="legend-session current" aria-hidden="true"><span class="status-ring"></span></i>In progress</span><span><i class="legend-session" aria-hidden="true">01</i>Upcoming</span>${Object.values(state.records).some(r=>r.status==='skipped')?`<span><i class="legend-session" aria-hidden="true">${icon('skip')}</i>Skipped</span>`:''}</div><p class="cycle-hint small muted">Tap a session to preview or review.</p></div></div></section>`);
}

function renderTrain() {
  if(!state.plan.some(d=>d.id===state.selected?.dayId)) {const next=nextWorkout();state.selected={week:next?.week||1,dayId:(next?.day||state.plan[0]).id};}
  const rec=ensureRecord(state.selected.week,state.selected.dayId);
  const done=rec.exercises.filter(e=>e.done).length;
  const finished=isFinished(rec);
  if(openExercise!==null&&!rec.exercises.some(e=>e.id===openExercise))openExercise=rec.exercises.find(e=>!e.done)?.id||rec.exercises[0]?.id;
  const guidance=['RIR 2 · Establish your working weights','RIR 1–2 · Progress reps or load','RIR 0–1 · Follow your higher-effort plan','RIR 2 · Follow your reduced-volume plan'][state.selected.week-1];
  const sections=[...new Set(rec.exercises.map(e=>e.section))];
  setScreenMarkup(`<section data-screen-label="Workout quick logger"><div class="row between"><span class="tag">WEEK ${String(state.selected.week).padStart(2,'0')} / ${phases[state.selected.week-1].toUpperCase()}</span><button class="text-btn" data-action="session-picker">Change session ${icon('down')}</button></div>
    <div class="training-title"><div class="training-title-copy"><h2>${esc(rec.dayName)}</h2><p>${esc(rec.focus)} · ${rec.exercises.length} exercises</p></div>${timerMarkup(rec)}</div>
    ${finished?`<div class="viewing-note">${rec.status==='skipped'?'This session was skipped.':rec.status==='partial'?'This session finished with some exercises incomplete.':'This session is complete.'} You can review or edit its quick entries below.</div>`:''}
    <div class="training-progress"><div class="row between"><span><b>${done} of ${rec.exercises.length}</b> exercises complete</span><span>${Math.round(done/Math.max(1,rec.exercises.length)*100)}%</span></div><div class="thin-track"><span style="width:${done/Math.max(1,rec.exercises.length)*100}%"></span></div></div>
    <div class="training-guidance">${icon('target')} ${guidance}</div>
    ${done&&!finished?`<button class="completed-review" data-action="toggle-completed" aria-expanded="${showCompletedExercises}"><span>${icon('check')} ${done} exercises in the books</span><span>${showCompletedExercises?'Hide':'Review'} ${icon(showCompletedExercises?'up':'down')}</span></button>`:''}
    ${sections.map(section=>{const items=rec.exercises.filter(e=>e.section===section&&(!e.done||showCompletedExercises||finished));return items.length?`<div class="eyebrow exercise-group">${esc(section)}</div>${items.map(item=>exerciseCard(item,rec)).join('')}`:'';}).join('')}
    ${!rec.exercises.length?'<div class="empty-state">This session has no exercises.<br>Add them in your training plan.</div>':''}
    <div class="workout-footer">${rec.startedAt&&!finished?`<div><button class="text-btn" data-action="add-session-exercise">${icon('plus')} Add exercise</button></div>`:''}<div><button class="text-btn" data-action="edit-current-day">${icon('edit')} Edit plan for future workouts</button></div></div><div class="save-note">${icon('check')} Quick entries saved to your training log</div></section>`);
  setMarkup(actionArea,`<button class="${finished||done===rec.exercises.length?'primary':'secondary full'}" data-action="${finished?'recap':'finish'}">${finished?'View workout recap':'Finish workout'} ${icon(finished?'arrow':'check')}</button>`);
}
function exerciseCard(item,rec) {
  const expanded=openExercise===item.id;
  const num=rec.exercises.indexOf(item)+1;
  const targetReps=item.targetReps??item.originalReps??state.plan.flatMap(d=>d.exercises).find(e=>e.id===item.id)?.reps??'8–10';
  const substituted=item.name!==item.originalName,previous=substituted?lastPerformedExercise(item.name):null;
  const previousWeight=previous?.weight??item.lastWeight,previousReps=previous?.reps??item.lastReps;
  return `<article class="exercise-card card ${expanded?'is-open':''}" data-exercise="${item.id}"><button class="exercise-head" data-action="toggle-exercise" data-id="${item.id}" aria-expanded="${expanded}"><span class="exercise-index ${item.done?'done':''}">${item.done?icon('check'):String(num).padStart(2,'0')}</span><span class="exercise-label"><strong>${esc(item.name)}</strong><span>${item.done?`${item.sets} sets · ${esc(performanceText(item))}`:`${item.sets} sets${targetReps?` · ${esc(targetReps)} reps`:''}`}${item.name!==item.originalName?' · Substituted':''}</span></span>${icon(expanded?'up':'down')}</button>
    ${expanded?`<div class="exercise-body"><div class="last-entry"><div><div class="eyebrow">${substituted?previous?'Last time · substitute':'Last time · original exercise':'Last time'}</div><strong>${esc(previousWeight??'—')} lb <span class="muted">×</span> ${esc(previousReps??'—')}</strong></div><span class="small muted">${substituted?esc(previous?item.name:item.originalName):state.selected.week>1?`Week ${state.selected.week-1}`:'Previous cycle'}</span></div>
    <div class="input-grid"><label>Weight, lb<input class="log-input" type="number" min="0" step="0.5" inputmode="decimal" data-log="weight" data-id="${item.id}" value="${esc(item.weight)}" placeholder="—" aria-label="${esc(item.name)} weight in pounds"></label><label>Reps<input class="log-input" type="number" min="1" max="100" inputmode="numeric" data-log="reps" data-id="${item.id}" value="${typeof item.reps==='number'||/^\d+$/.test(item.reps)?esc(item.reps):''}" placeholder="—" aria-label="${esc(item.name)} reps"></label></div>
    <button class="text-btn" data-action="use-last" data-id="${item.id}">${icon('reset')} ${substituted&&!previous?'Use original’s last values':'Use last values'}</button>
    <button class="primary" data-action="complete-exercise" data-id="${item.id}">${icon('check')} ${item.done?'Save exercise changes':'Complete exercise'}</button><div class="exercise-options"><button class="text-btn" data-action="substitute" data-id="${item.id}">${icon('swap')} Substitute for this session</button><button class="icon-btn" data-action="exercise-options" data-id="${item.id}" aria-label="More exercise options">${icon('more')}</button></div></div>`:''}</article>`;
}

function uniqueExercises() {
  const seen=new Set(), items=[...state.plan.flatMap(d=>d.exercises),...state.history.flatMap(r=>r.exercises),...Object.values(state.records).flatMap(r=>r.exercises)];
  return items.filter(e=>{if(seen.has(e.name))return false;seen.add(e.name);return true;}).map(e=>({...e,id:encodeURIComponent(e.name)}));
}
function cycleKey(routineId,cycle) {return encodeURIComponent(JSON.stringify([routineId,Number(cycle)]));}
function trendCycleChoices() {
  const choices=new Map();
  if(state.activeRoutineId)choices.set(cycleKey(state.activeRoutineId,state.cycle),{value:'current',routineId:state.activeRoutineId,cycle:state.cycle,splitName:state.splitName,current:true});
  for(const rec of [...state.history,...Object.values(state.records)]){
    if(!rec.routineId||!Number.isInteger(Number(rec.cycle))||Number(rec.cycle)<1)continue;
    const value=cycleKey(rec.routineId,rec.cycle);
    if(!choices.has(value))choices.set(value,{value,routineId:rec.routineId,cycle:Number(rec.cycle),splitName:rec.splitName||state.savedSplits.find(s=>s.id===rec.routineId)?.name||'Unnamed split',current:false});
  }
  return [{value:'all',all:true,routineId:null,cycle:null,splitName:'All splits',current:false},...choices.values()].sort((a,b)=>Number(Boolean(b.all))-Number(Boolean(a.all))||Number(b.current)-Number(a.current)||b.cycle-a.cycle||a.splitName.localeCompare(b.splitName));
}
function selectedCycle(value=trendCycle) {return trendCycleChoices().find(choice=>choice.value===value)||{routineId:null,cycle:null,splitName:'Unavailable split',current:false};}
function cycleLabel(choice) {return choice.all?'All sessions · Continuous':`Cycle ${String(choice.cycle??'—').padStart(2,'0')} · ${choice.splitName}${choice.current?' · Current':''}`;}
function hasRecordedResult(item) {return [item.weight,item.reps].every(value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value)))&&Number(item.weight)>=0&&Number.isInteger(Number(item.reps))&&Number(item.reps)>0;}
const exerciseNameKey = name => typeof name==='string'?name.trim().toLocaleLowerCase():'';
function sessionTimestamp(record) {
  for(const value of [record.finishedAt,record.startedAt,record.date]){const time=Date.parse(value);if(Number.isFinite(time))return time;}
  return null;
}
/** Completion proves a name was used; missing result values must still stay unknown. */
function performedExercises() {
  const records=new Map();
  for(const record of [...state.history,...Object.values(state.records)])records.set(record.id??record,record);
  return [...records.values()].filter(record=>!record.id||record.id!==getRecord()?.id).flatMap(record=>(record.exercises||[]).flatMap(exercise=>{
    const entries=[...(exercise.done?[exercise]:[]),...(exercise.setLogs||[]).filter(log=>log.done).map(log=>({...log,name:log.name||exercise.name}))];
    return entries.map(entry=>({...entry,originalName:exercise.originalName,exerciseId:exercise.id,time:sessionTimestamp(record)}));
  })).sort((a,b)=>(b.time??-Infinity)-(a.time??-Infinity));
}
function lastPerformedExercise(name) {return performedExercises().find(entry=>exerciseNameKey(entry.name)===exerciseNameKey(name)&&hasRecordedResult(entry))||null;}
function substitutionGroups(library,previous,item) {
  const original=item.originalName||item.name,originalKey=exerciseNameKey(original),performed=performedExercises();
  const matching=performed.filter(entry=>entry.exerciseId===item.id||exerciseNameKey(entry.originalName)===originalKey);
  // This API is scoped to the original exercise. Bare names remain choices, not invented performances/dates.
  const apiPerformed=previous.filter(entry=>entry?.done&&(!entry.originalName||exerciseNameKey(entry.originalName)===originalKey)).map(entry=>({...entry,time:sessionTimestamp(entry)}));
  const performances=[...performed,...apiPerformed].filter(hasRecordedResult).sort((a,b)=>(b.time??-Infinity)-(a.time??-Infinity));
  const recent=[...matching,...apiPerformed].filter(entry=>exerciseNameKey(entry.name)&&exerciseNameKey(entry.name)!==originalKey).sort((a,b)=>(b.time??-Infinity)-(a.time??-Infinity));
  const seen=new Set([originalKey]);
  const unique=entries=>entries.flatMap(entry=>{const name=typeof entry?.name==='string'?entry.name.trim():'',key=exerciseNameKey(name);if(!key||seen.has(key))return [];seen.add(key);return [{name,performance:performances.find(result=>exerciseNameKey(result.name)===key)||null}];});
  const last=recent.find(entry=>entry.time!==null),lastUsed=unique(last?[last]:[]);
  const previousUsed=unique([...recent,...previous.filter(entry=>!entry?.originalName||exerciseNameKey(entry.originalName)===originalKey)]);
  const other=unique(library).sort((a,b)=>a.name.localeCompare(b.name));
  return {lastUsed,previousUsed,other};
}
function substitutionOptionRows(entries,id) {return entries.map(entry=>{const {name,performance}=typeof entry==='string'?{name:entry}:entry;return `<button type="button" class="option-row" data-action="apply-substitute" data-id="${esc(id)}" data-name="${esc(name)}">${icon('swap')}<span class="trend-main"><strong>${esc(name)}</strong>${performance?`<span class="small muted">Last performance · ${esc(performanceText(performance))}</span>`:''}</span></button>`;}).join('');}
function substitutionOptionsMarkup(library,previous,item) {
  const groups=substitutionGroups(library,previous,item);
  return [['Last used',groups.lastUsed],['Previously used',groups.previousUsed],['Other library choices',groups.other]].map(([label,entries])=>entries.length?`<div class="eyebrow exercise-group">${label}</div>${substitutionOptionRows(entries,item.id)}`:'').join('')||'<p class="sheet-description">No saved alternatives yet. Enter an exercise name below.</p>';
}
async function loadSubstitutionOptions(id) {
  libraryAbort?.abort();const controller=new AbortController();libraryAbort=controller;
  const item=getSelectedExercise(id),identity=user?.id;if(!item||!identity)return;
  const root=overlay.querySelector('#substitution-options');if(!root)return;
  root.innerHTML=substitutionOptionsMarkup([],[],item)+'<p class="sheet-description" role="status">Loading your exercise library…</p>';
  const base=`/api/users/${encodeURIComponent(identity)}`;
  const results=await Promise.allSettled([api('GET',`${base}/library`,undefined,{signal:controller.signal}),api('GET',`${base}/exercises/${encodeURIComponent(id)}/substitution-history`,undefined,{signal:controller.signal})]);
  if(controller.signal.aborted||libraryAbort!==controller||user?.id!==identity||overlay.querySelector('#substitution-options')!==root)return;
  const lists=results.map(result=>result.status==='fulfilled'&&Array.isArray(result.value)?result.value:[]);
  const failed=results.some(result=>result.status==='rejected');
  root.innerHTML=`${substitutionOptionsMarkup(lists[0],lists[1],item)}${failed?`<p class="form-error" role="alert">Some saved alternatives could not be loaded. You can still enter a name.</p><button class="text-btn" data-action="retry-library" data-id="${esc(id)}">Retry library ${icon('reset')}</button>`:''}`;
  if(busy)setBusy(true);
}
async function showSubstitution(id) {
  const item=getSelectedExercise(id);if(!item)return;
  showSheet('Substitute exercise',`<p class="sheet-description">A change for this session only. Your plan stays the same. Completed performance cannot be relabeled; its recorded exercise and results are kept.</p><div id="substitution-options" aria-live="polite"></div>${item.name!==item.originalName?`<button type="button" class="option-row" data-action="apply-substitute" data-id="${esc(id)}" data-name="${esc(item.originalName)}">${icon('reset')} Restore ${esc(item.originalName)}</button>`:''}<form id="substitute-form" data-id="${esc(id)}"><label class="form-field">Enter another exercise name<input name="name" required maxlength="80" value="${esc(item.name)}"></label><p class="form-error" role="alert"></p><button class="primary" type="submit">Save substitution ${icon('check')}</button></form>`);
  await loadSubstitutionOptions(id);
}
function progressEntries(item,cycle=trendCycle) {
  return LiftTrends.sessionPoints([...state.history,...Object.values(state.records)],item.name,selectedCycle(cycle));
}
function sparkline(points) {
  if(!points.length)return '';
  const values=points.map(p=>p.weight), min=Math.min(...values)-3,max=Math.max(...values)+3;
  const coords=values.map((v,i)=>`${6+i*(44/Math.max(1,values.length-1))},${24-(v-min)/(max-min)*20}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 56 30" fill="none" aria-hidden="true"><polyline points="${coords}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>`;
}
function deltaLabel(points) {if(!points.length)return 'No recorded results yet';if(points.length===1)return 'First recorded session';const a=points.at(-2),b=points.at(-1);if(b.weight!==a.weight)return `${b.weight>a.weight?'+':''}${b.weight-a.weight} lb from previous session`;if(b.reps!==a.reps)return `Same load · ${b.reps>a.reps?'+':''}${b.reps-a.reps} reps`;return 'Consistent with previous session';}
function trendRows() {const items=uniqueExercises().filter(e=>e.name.toLowerCase().includes(exerciseSearch.toLowerCase()));return items.length?items.map(item=>{const points=progressEntries(item,'current'),last=points.at(-1);return `<button class="exercise-trend" data-action="trend-detail" data-id="${item.id}"><span class="trend-main"><strong>${esc(item.name)}</strong><span class="result">${last?`${last.weight} lb <span class="muted">×</span> ${last.reps}`:'No completed entries yet'}</span><span class="delta">${last?icon('progress'):''}${deltaLabel(points)}</span></span>${sparkline(points)}${icon('right')}</button>`;}).join(''):'<div class="empty-state">No exercises match your search.</div>';}
function renderProgress() {
  setScreenMarkup(`<section data-screen-label="Progress"><div class="page-title"><div><h2>The bigger picture</h2><p>Small improvements. Built over time.</p></div></div><div class="segment-control"><button class="${progressView==='activity'?'active':''}" data-action="progress-view" data-view="activity">Activity</button><button class="${progressView==='trends'?'active':''}" data-action="progress-view" data-view="trends">Exercise trends</button></div>
    ${progressView==='trends'?`<div class="insight-card">${icon('progress')}<div><strong>Your work is adding up.</strong><p>Compare weight and reps together to see the whole story.</p></div></div><label class="search-box">${icon('search')}<input id="exercise-search" type="search" value="${esc(exerciseSearch)}" placeholder="Find an exercise" aria-label="Search exercises"></label><div class="filter-row"><span class="small muted">CYCLE ${String(state.cycle).padStart(2,'0')} · ALL TRAINING DAYS</span><span class="small muted">lb × reps</span></div><div class="trend-list card" id="trend-rows">${trendRows()}</div>`:activityContent()}</section>`);
}
function renderExerciseDetail() {
  const item=uniqueExercises().find(e=>e.id===selectedTrend)||uniqueExercises()[0];
  if(!item){setScreenMarkup(pageTitle('No exercises yet','Add an exercise to your training plan.'));return;}
  const points=progressEntries(item),last=points.at(-1),layout=LiftTrends.chartLayout(points),scope=selectedCycle();
  const shortDate=p=>{const value=p.date?new Date(p.date+'T12:00:00'):p.time!=null?new Date(p.time):null;return value&&!Number.isNaN(value.getTime())?value.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'Undated';};
  const pointLabel=p=>`${shortDate(p)} · ${p.dayName} · ${p.splitName} · Cycle ${p.cycle} Week ${p.week}: ${p.weight} lb × ${p.reps}`;
  setScreenMarkup(`<section data-screen-label="Exercise progress detail">${pageTitle(esc(item.name),'Every training day. Every recorded result.')}
    <div class="filter-row trend-filters"><button class="pill" data-action="trend-cycle">${esc(cycleLabel(scope))} ${icon('down')}</button><span class="small muted">${points.length} recorded ${points.length===1?'entry':'entries'}</span></div>
    <div class="chart-card card"><div class="eyebrow muted">Latest completed result</div><div class="chart-value">${last?last.weight:'—'} <span>lb × ${last?last.reps:'—'} reps</span></div><div class="chart-sub">${esc(deltaLabel(points))}</div>
    ${points.length?`<div class="trend-chart-frame"><div class="trend-chart-scroll" tabindex="0" role="region" aria-label="Scrollable exercise session history"><svg class="trend-chart" style="width:${layout.width}px" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-label="${esc(item.name)} load in chronological session order; ${points.length} separate results. Dates are equally spaced by entry.">
    ${layout.ticks.map(t=>`<line class="chart-axis" x1="${layout.left}" y1="${t.y}" x2="${layout.width-layout.right}" y2="${t.y}"></line><text class="chart-label" x="0" y="${t.y+4}">${Number(t.value.toFixed(1))}</text>`).join('')}
    ${layout.boundaries.map(b=>`<line class="trend-cycle-boundary" x1="${b.x}" x2="${b.x}" y1="${layout.top-8}" y2="${layout.height-layout.bottom+8}"></line>`).join('')}
    <polyline points="${layout.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${layout.points.map(p=>`<g class="trend-point-target" tabindex="0" role="button" aria-label="${esc(pointLabel(p))}" data-trend-value="${p.weight} lb × ${p.reps} reps"><circle class="trend-point-hit" cx="${p.x}" cy="${p.y}" r="22" fill="transparent"></circle><circle class="trend-point" data-session-id="${esc(p.sessionId)}" cx="${p.x}" cy="${p.y}" r="5" fill="var(--blue)" stroke="var(--surface)" stroke-width="3"></circle></g><text class="chart-label" x="${p.x}" y="${layout.height-38}" text-anchor="middle">${esc(shortDate(p))}</text><text class="chart-label" x="${p.x}" y="${layout.height-22}" text-anchor="middle">C${p.cycle} · W${p.week}</text><text class="chart-label" x="${p.x}" y="${layout.height-6}" text-anchor="middle">${esc(p.dayName.length>10?p.dayName.slice(0,9)+'…':p.dayName)}</text>`).join('')}</svg></div><div id="trend-point-tooltip" class="trend-point-tooltip" role="tooltip" hidden></div></div><p class="detail-info">Tap a point to see weight × reps. Scroll for earlier sessions; dashed lines mark a new cycle or split.</p>`:'<div class="empty-state">No completed results in this view yet.<br>Choose another cycle or log this exercise to begin.</div>'}</div>
    <div class="section-heading"><h3>${scope.all?'Session history':'Sessions in this cycle'}</h3><span class="small muted">Newest first</span></div>
    ${points.length?`<table class="week-table session-results"><thead><tr><th>SESSION</th><th>WEIGHT</th><th>REPS</th><th>SETS</th></tr></thead><tbody>${points.slice().reverse().map(p=>`<tr data-session-id="${esc(p.sessionId)}"><td><strong>${esc(p.dayName)}</strong><span>${esc(shortDate(p))} · C${p.cycle} / W${p.week}${p.week===4?' · Deload':''}</span><span>${esc(p.splitName)}</span></td><td>${p.weight} lb</td><td>${p.reps}</td><td>${esc(p.sets??'—')}</td></tr>`).join('')}</tbody></table>`:''}
    <p class="detail-info">Multiple training days in the same week stay separate. Each result is an exercise-level quick entry, not an individually measured set.</p></section>`);
  if(!renderingBackground)setTimeout(()=>{const chart=screen.querySelector('.trend-chart-scroll');if(chart)chart.scrollLeft=chart.scrollWidth;},0);
}
function activityContent() {
  const yearRecords=state.history.filter(r=>r.date?.startsWith(String(historyYear)));
  const completed=yearRecords.filter(r=>r.exercises.some(e=>e.done));
  const selected=yearRecords.filter(r=>historyMonth===null||Number(r.date.slice(5,7))-1===historyMonth).sort((a,b)=>b.date.localeCompare(a.date));
  const activeDays=new Set(completed.map(record=>record.date)),today=calendarDate();
  const currentYear=Number(today.slice(0,4)),currentMonth=Number(today.slice(5,7))-1;
  const monthGrid=Array.from({length:12},(_,m)=>{
    const count=new Date(historyYear,m+1,0).getDate(),offset=(new Date(historyYear,m,1).getDay()+6)%7;
    return `<button class="month-button ${historyMonth===m?'selected':''}" data-action="filter-month" data-month="${m}" aria-label="Filter history to ${monthNames[m]} ${historyYear}" aria-pressed="${historyMonth===m}"><span class="month-name">${monthNames[m]}</span><span class="month-cells">${Array.from({length:offset},()=>'<i></i>').join('')}${Array.from({length:count},(_,i)=>{const date=`${historyYear}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<i class="heat-cell ${date>today?'future':activeDays.has(date)?'recorded':''}" aria-hidden="true"></i>`;}).join('')}</span></button>`;
  }).join('');
  return `<div class="year-controls"><strong>Your consistency</strong><div class="row"><button class="icon-btn" data-action="history-year" data-delta="-1" aria-label="Previous year">${icon('left')}</button><span class="small numeric">${historyYear}</span><button class="icon-btn" data-action="history-year" data-delta="1" aria-label="Next year" ${historyYear>=currentYear?'disabled':''}>${icon('right')}</button></div></div>
    <div class="stats-strip"><div class="stat-tile"><strong>${completed.length}</strong><span>workouts this year</span></div><div class="stat-tile"><strong>${completed.filter(r=>Number(r.date.slice(5,7))===currentMonth+1).length}</strong><span>workouts in ${monthNames[currentMonth]}</span></div></div><div class="heatmap card">${monthGrid}</div><div class="heat-legend"><i class="recorded" aria-hidden="true"></i>Workout recorded.</div>
    <div class="section-heading history-filter"><h3>${historyMonth===null?'Recent sessions':monthNames[historyMonth]+' sessions'}</h3>${historyMonth!==null?'<button class="text-btn" data-action="clear-month">Show all</button>':'<span class="small muted">Newest first</span>'}</div>
    ${selected.length?selected.map(r=>`<button class="history-row" data-action="history-detail" data-id="${r.id}"><span class="date-box"><span>${monthNames[Number(r.date.slice(5,7))-1]}</span><strong>${Number(r.date.slice(8,10))}</strong></span><span class="trend-main"><strong>${esc(r.dayName)}</strong><span>Cycle ${String(r.cycle).padStart(2,'0')} · Week ${r.week} · ${r.exercises.filter(e=>e.done).length}/${r.exercises.length} exercises</span></span>${r.status==='skipped'?tag('SKIPPED','neutral'):r.status==='partial'?tag('PARTIAL','neutral'):icon('check')}</button>`).join(''):'<div class="empty-state">No sessions in this period.<br>Your next workout will add to your story.</div>'}`;
}
function renderHistoryDetail() {
  const record=state.history.find(r=>r.id===historyId);
  if(!record){setScreenMarkup(pageTitle('Session unavailable'));return;}
  const date=new Date(record.date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  setScreenMarkup(`<section data-screen-label="Historical workout snapshot">${pageTitle(esc(record.dayName),date,tag(record.status.toUpperCase(),record.status==='completed'?'green':'neutral'))}<div class="small muted">${esc(record.splitName)} · Cycle ${String(record.cycle).padStart(2,'0')} · Week ${record.week}</div><div class="stats-strip"><div class="stat-tile"><strong>${record.exercises.filter(e=>e.done).length}<span style="display:inline;font-size:16px"> / ${record.exercises.length}</span></strong><span>exercises complete</span></div><div class="stat-tile"><strong class="phase-value">${phases[record.week-1]}</strong><span>training phase</span></div></div><div class="section-heading"><h3>Recorded performance</h3>${icon('lock')}</div><div class="history-sets card">${record.exercises.map(e=>`<div class="snapshot-row"><div><strong>${esc(e.name)}</strong><div class="small muted">${e.sets} prescribed sets</div></div><span>${e.done?esc(performanceText(e)):'Not completed'}</span></div>`).join('')}</div><p class="detail-info">A snapshot of this exact session. Changes to your current plan do not change this record.</p></section>`);
}

function appendHistoricalSets(record) {
  const logs=record.exercises.flatMap(e=>(e.setLogs||[]).filter(log=>log.setIndex>=0).map(log=>({...log,exerciseName:e.name})));
  const container=screen.querySelector('.history-sets');
  if(!container)return;
  if(!record.exercises.length){container.innerHTML=`<div class="empty-state">Exercise details are not available for this session.${record.legacyStats?.total?`<br>${esc(record.legacyStats.done??'—')} of ${esc(record.legacyStats.total)} historical sets recorded complete.`:''}</div>`;}
  if(logs.length)container.insertAdjacentHTML('afterend',`<div class="section-heading"><h3>Historical set logs</h3></div><div class="history-sets card">${logs.map(log=>`<div class="snapshot-row"><div><strong>${esc(log.name||log.exerciseName)}</strong><div class="small muted">Set ${esc(log.setIndex+1)} · ${log.done?'Completed':'Not completed'}</div></div><span>${esc(performanceText(log))}</span></div>`).join('')}</div>`);
  const rows=container.querySelectorAll('.snapshot-row');
  record.exercises.forEach((exercise,index)=>{if(!exercise.done&&(resultValue(exercise.weight)!=='—'||resultValue(exercise.reps)!=='—')&&rows[index]){const value=rows[index].querySelector('span');if(value)value.textContent=`${performanceText(exercise)} · Not completed`;}});
}
function showInitialsSheet() {
  showSheet('Display initials',`<div class="initials-preview"><span class="avatar" aria-hidden="true">${esc(initials())}</span><p class="small muted">Personalize your profile icon.<br>Your username and workout data stay the same.</p></div><form id="initials-form"><label class="form-field">Initials · 1–3 letters or numbers<input name="initials" maxlength="3" value="${esc(initials())}" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><p class="sheet-description">Saved only in this browser for this account. It won’t sync to other devices.</p><p class="form-error" role="alert"></p><div class="sheet-actions"><button class="primary" type="submit">Save initials ${icon('check')}</button><button class="secondary full" type="button" data-action="reset-initials">Use username initials</button></div></form>`);
}
function saveDisplayInitials(value) {
  const key=initialsKey();if(!key)return;
  localInitials.set(key,value);
  const persisted=preference(key,value||null);
  closeSheet();render();
  toast(persisted?'Display initials updated.':'Initials updated for this visit. Browser storage is unavailable.');
}
function renderSettings() {
  setScreenMarkup(`<section data-screen-label="Settings">${pageTitle('Make it yours','A plan that fits the way you train.')}<div class="settings-profile card"><div class="avatar">${esc(initials())}</div><div><strong>${esc(state.user.username)}</strong><span>Your personal training space</span></div></div><div class="section-heading"><h3>Training</h3></div><div class="settings-list card"><button class="settings-row" data-action="splits"><span class="setting-icon">${icon('cycle')}</span><span class="trend-main"><strong>Training splits</strong><span>${esc(state.splitName)} · Active</span></span>${icon('right')}</button><button class="settings-row" data-action="edit-current-day"><span class="setting-icon">${icon('edit')}</span><span class="trend-main"><strong>Edit your current plan</strong><span>Days, sections, exercises & targets</span></span>${icon('right')}</button><button class="settings-row" data-action="cycle-options"><span class="setting-icon">${icon('reset')}</span><span class="trend-main"><strong>Cycle ${String(state.cycle).padStart(2,'0')}</strong><span>${completedCount()} of ${state.plan.length*4} sessions trained</span></span>${icon('right')}</button></div>
    <div class="section-heading"><h3>Appearance</h3></div><div class="card"><div class="theme-options"><button class="theme-option ${state.theme==='light'?'selected':''}" data-action="theme" data-theme="light">Light</button><button class="theme-option ${state.theme==='dark'?'selected':''}" data-action="theme" data-theme="dark">Dark</button></div></div>
    <div class="section-heading"><h3>Account</h3></div><div class="settings-list card"><button class="settings-row" data-action="edit-initials"><span class="avatar" aria-hidden="true">${esc(initials())}</span><span class="trend-main"><strong>Display initials</strong><span data-initials-label>${esc(initials())} · Saved only in this browser</span></span>${icon('edit')}</button><button class="settings-row" data-action="logout"><span class="setting-icon">${icon('left')}</span><span class="trend-main"><strong>Sign out</strong><span>Your recorded training stays saved.</span></span>${icon('right')}</button></div></section>`);
}
function renderSplits() {
  setScreenMarkup(`<section data-screen-label="Training splits">${pageTitle('Your training splits','Build the structure. Then focus on training.')}<div class="split-choice card active" data-view-key="active-split:${esc(state.activeRoutineId)}"><div class="split-choice-info"><div style="margin-bottom:12px">${tag('ACTIVE SPLIT')}</div><h3>${esc(state.splitName)}</h3><p>${state.plan.length} days · ${state.plan.flatMap(d=>d.exercises).length} exercises · 4-week cycle</p></div><button class="icon-btn" data-action="editor" aria-label="Edit active split">${icon('edit')}</button></div><button class="secondary full" data-action="split-options">${icon('more')} Manage split</button><div class="section-heading"><h3>Add a split</h3></div><div class="settings-list card"><button class="settings-row" data-action="create-split"><span class="setting-icon">${icon('plus')}</span><span class="trend-main"><strong>Build your own</strong><span>Start with a name and training days</span></span>${icon('right')}</button><button class="settings-row" data-action="import-split"><span class="setting-icon">${icon('upload')}</span><span class="trend-main"><strong>Import a split</strong><span>Paste your structured workout plan</span></span>${icon('right')}</button></div>${(state.savedSplits||[]).length?`<div class="section-heading"><h3>Saved splits</h3></div>${state.savedSplits.map(s=>`<div class="split-choice card" data-view-key="saved-split:${esc(s.id)}"><div class="split-choice-info"><h3>${esc(s.name)}</h3><p>${s.plan.length} training days</p></div><button class="text-btn" data-action="activate-split" data-id="${s.id}">Use split ${icon('arrow')}</button><button class="icon-btn" data-action="delete-split" data-id="${s.id}" aria-label="Delete ${esc(s.name)}">${icon('trash')}</button></div>`).join('')}`:''}<p class="detail-info">Switching splits restores its previous cycle and position. Existing sessions remain in Activity.</p></section>`);
}
function renderEditor() {
  if(openDay!==null&&!state.plan.some(d=>d.id===openDay))openDay=state.plan[0]?.id;
  setScreenMarkup(`<section data-screen-label="Split editor">${pageTitle(esc(state.splitName),'Your plan, one training day at a time.',`<button class="icon-btn" data-action="rename-split" aria-label="Rename split">${icon('edit')}</button>`)}<div class="insight-card">${icon('info')}<div><strong>Plan changes apply to future sessions.</strong><p>Workouts already started keep their original prescription.</p></div></div>${state.plan.map((day,i)=>`<article class="editor-day card" data-view-key="day:${esc(day.id)}"><button class="editor-day-header" data-action="toggle-day" data-id="${day.id}" aria-expanded="${openDay===day.id}"><span class="day-label">${String(i+1).padStart(2,'0')}</span><strong>${esc(day.name)}</strong><span class="small muted">${day.exercises.length} exercises</span>${icon(openDay===day.id?'up':'down')}</button>${openDay===day.id?`${day.sections.map(section=>`<div class="editor-section" data-view-key="section:${esc(section)}"><div class="editor-section-heading"><span class="eyebrow">${esc(section)}</span><button class="icon-btn" data-action="section-options" data-id="${day.id}" data-section="${esc(section)}" aria-label="Edit ${esc(section)} section">${icon('more')}</button></div>${day.exercises.filter(e=>e.section===section).map((item,index,items)=>`<div class="editor-item" data-view-key="exercise:${esc(item.id)}"><button class="reorder-button" data-action="move-exercise" data-id="${item.id}" data-day="${day.id}" aria-label="Move ${esc(item.name)} ${index===0?'down':'up'}">${icon(index===0?'down':'up')}</button><span class="trend-main"><strong>${esc(item.name)}</strong><span>${item.sets} sets · ${esc(item.reps)} reps</span></span><button class="icon-btn" data-action="edit-exercise" data-id="${item.id}" data-day="${day.id}" aria-label="Edit ${esc(item.name)}">${icon('edit')}</button></div>`).join('')}<button class="editor-add" data-action="add-exercise" data-id="${day.id}" data-section="${esc(section)}">${icon('plus')} Add exercise</button></div>`).join('')}<div class="editor-day-bottom"><button class="text-btn" data-action="add-section" data-id="${day.id}">${icon('plus')} Add section</button><button class="text-btn" data-action="day-options" data-id="${day.id}">Day options ${icon('more')}</button></div>`:''}</article>`).join('')}<button class="secondary full" data-action="add-day">${icon('plus')} Add training day</button><div class="save-note">${icon('check')} Plan changes saved to your training log</div></section>`);
}
function recapRecord() {return recapId?Object.values(state.records).find(r=>r.id===recapId)||state.history.find(r=>r.id===recapId):getRecord();}
function renderRecap() {
  const rec=recapRecord();if(!rec){navigate('cycle');return;}
  const done=rec.exercises.filter(e=>e.done), improvements=done.filter(e=>hasRecordedResult(e)&&hasRecordedResult({weight:e.lastWeight,reps:e.lastReps})&&(Number(e.weight)>e.lastWeight||(Number(e.weight)===e.lastWeight&&Number(e.reps)>e.lastReps)));
  const next=nextWorkout();
  setScreenMarkup(`<section data-screen-label="Workout completion recap"><div class="recap-icon">${icon('check')}</div><h2 class="recap-title">Another one in the books.</h2><p class="recap-sub">${esc(rec.dayName)} · Week ${rec.week}<br>${done.length===rec.exercises.length?'You showed up. You did the work.':'Every recorded effort counts.'}</p><div class="stats-strip"><div class="stat-tile"><strong>${done.length}<span style="display:inline;font-size:16px"> / ${rec.exercises.length}</span></strong><span>exercises completed</span></div><div class="stat-tile"><strong>${improvements.length}</strong><span>improved quick entries</span></div></div><div class="history-sets card">${done.map(e=>`<div class="snapshot-row"><div><strong>${esc(e.name)}</strong><div class="small muted">${e.sets} prescribed sets</div></div><span>${esc(performanceText(e))}</span></div>`).join('')||'<div class="empty-state">No completed exercises recorded.</div>'}</div><div class="recap-next"><span class="eyebrow muted">${next?'Next in your cycle':'The four-week finish line'}</span><strong>${next?esc(next.day.name):'Cycle complete'}</strong><p>${next?`Week ${next.week} · ${phases[next.week-1]}`:'Review your work and begin your next chapter.'}</p></div><div style="height:24px"></div><button class="primary" data-action="${next?'nav':'cycle-summary'}" data-tab="cycle">${next?'Back to your cycle':'Review your cycle'} ${icon('arrow')}</button></section>`);
}

function renderCycleSummary() {
  const records=Object.values(state.records),total=state.plan.length*4,completed=completedCount();
  const results=uniqueExercises().map(e=>{const p=progressEntries(e,'current');return p.length>1?{name:e.name,from:`${p[0].weight} lb × ${p[0].reps}`,to:`${p.at(-1).weight} lb × ${p.at(-1).reps}`}:null;}).filter(Boolean).slice(0,3);
  setScreenMarkup(`<section data-screen-label="Cycle completion summary"><div class="recap-icon">${icon('spark')}</div><h2 class="recap-title">Four weeks.<br>A stronger foundation.</h2><p class="recap-sub">${esc(state.splitName)} · Cycle ${String(state.cycle).padStart(2,'0')}<br>Take a moment to see how far you’ve come.</p><div class="stats-strip"><div class="stat-tile"><strong>${completed}<span style="display:inline;font-size:16px"> / ${total}</span></strong><span>sessions trained</span></div><div class="stat-tile"><strong>${new Set(records.filter(r=>r.status==='completed').map(r=>r.week)).size}</strong><span>weeks with training</span></div></div><div class="section-heading"><h3>A few things to take with you</h3></div><div class="history-sets card">${results.map(r=>`<div class="snapshot-row"><div><strong>${esc(r.name)}</strong><div class="small muted">${r.from} → <span style="color:var(--green)">${r.to}</span></div></div>${icon('progress')}</div>`).join('')||'<p class="empty-state">Complete more sessions to compare your results.</p>'}</div><p class="detail-info">Your previous cycle stays available in Activity. Keep the same split, or adjust your plan before the next one.</p><div class="sheet-actions"><button class="primary" data-action="new-cycle">Start next cycle ${icon('arrow')}</button><button class="secondary full" data-action="editor">${icon('edit')} Adjust the plan first</button></div></section>`);
}

async function openSession(week,dayId) {
  if(!await flushDrafts())return;
  state.selected={week,dayId};showCompletedExercises=false;
  const rec=ensureRecord(week,dayId);openExercise=rec.exercises.find(e=>!e.done)?.id||rec.exercises[0]?.id;
  tab='train';page='train';closeSheet();
  await mutation('PUT','/navigation',{week,dayId});render(true);
}
function sessionPreview(week,dayId) {
  const day=state.plan.find(d=>d.id===dayId),rec=getRecord(week,dayId),status=statusOf(week,dayId),finished=isFinished(rec);
  showSheet(`${day.name} · Week ${week}`,`<p class="sheet-description">${esc(rec?.focus||day.focus)}<br>${rec?.exercises.length??day.exercises.length} exercises · ${phases[week-1]} phase</p>${tag(rec?statusLabel(rec):'UPCOMING',status==='completed'?'green':'')}<div class="sheet-actions"><button class="primary" data-action="${status==='partial'&&!finished?'resume-session':'open-session'}" data-week="${week}" data-id="${dayId}">${finished?'Review session':status==='partial'?'Resume workout':'Open workout'} ${icon('arrow')}</button>${!finished?`<button class="secondary full" data-action="skip-session" data-week="${week}" data-id="${dayId}">Skip this session</button>`:''}</div>`);
}
async function completeExercise(id) {
  if(!await flushDrafts())return;
  const rec=getRecord(),item=rec.exercises.find(e=>e.id===id);
  const weight=Number(item.weight),reps=Number(item.reps);
  if(!hasRecordedResult(item)||reps>100){toast('Enter a valid weight and 1–100 reps first.');return;}
  if(!rec.id)return;
  const result=await mutation('PUT',`/sessions/${encodeURIComponent(rec.id)}/exercises/${encodeURIComponent(id)}`,{weight,reps,done:true});
  if(!result)return;
  openExercise=getRecord().exercises.find(e=>!e.done)?.id||id;
  render();toast(`${item.name} saved`);
  setTimeout(()=>{const node=screen.querySelector('.exercise-card.is-open');node?.scrollIntoView({behavior:'smooth',block:'nearest'});},20);
}
function finishWorkout() {
  const rec=getRecord(),count=rec.exercises.filter(e=>e.done).length;
  if(count<rec.exercises.length){showSheet('Finish this workout?',`<p class="sheet-description">You’ve completed ${count} of ${rec.exercises.length} exercises. The remaining exercises will stay incomplete. Your recorded results are preserved.</p><div class="sheet-actions"><button class="primary" data-action="confirm-finish">Save partial workout</button><button class="secondary full" data-action="close-sheet">Keep training</button></div>`);return;}
  confirmFinish();
}
async function confirmFinish() {const rec=getRecord();if(!rec?.id)return;await mutation('POST',`/sessions/${encodeURIComponent(rec.id)}/finish`,{}, {after:()=>{recapId=rec.id;closeSheet();page='recap';}});}
function exerciseForm(dayId,section,id=null) {
  const item=state.plan.find(d=>d.id===dayId).exercises.find(e=>e.id===id);
  showSheet(item?'Edit exercise':'Add exercise',`<form id="exercise-form" data-day="${dayId}" data-section="${esc(section)}" data-id="${id||''}"><label class="form-field">Exercise name<input name="name" required maxlength="80" value="${esc(item?.name||'')}" placeholder="e.g. Seated leg curl"></label><div class="form-pair"><label class="form-field">Prescribed sets<input name="sets" type="number" min="1" max="12" required value="${item?.sets||3}"></label><label class="form-field">Target reps<input name="reps" required maxlength="30" value="${esc(item?.reps||'8–12')}"></label></div><p class="form-error" id="form-error"></p><div class="sheet-actions"><button type="submit" class="primary">${item?'Save exercise':'Add exercise'}</button>${item?`<button type="button" class="secondary danger" data-action="delete-exercise" data-day="${dayId}" data-id="${id}">${icon('trash')} Remove from plan</button>`:''}</div></form>`);
}
function sessionExerciseForm() {
  const rec=getRecord();if(!rec?.startedAt||isFinished(rec))return;
  showSheet('Add exercise',`<p class="sheet-description">Extra work for this workout only. Your training plan stays the same.</p><form id="session-exercise-form" data-session="${esc(rec.id)}" data-id="session-${uid()}"><label class="form-field">Exercise name<input name="name" required maxlength="80" placeholder="e.g. Seated leg curl"></label><div class="form-pair"><label class="form-field">Prescribed sets<input name="sets" type="number" min="1" max="12" required value="3"></label><label class="form-field">Target reps (optional)<input name="reps" maxlength="30" placeholder="e.g. 8–12"></label></div><p class="form-error" role="alert"></p><button type="submit" class="primary">Add exercise ${icon('plus')}</button></form>`);
}
function textForm(title,label,value,kind,extra={}) {showSheet(title,`<form id="text-form" data-kind="${kind}" data-id="${extra.id||''}" data-section="${esc(extra.section||'')}"><label class="form-field">${label}<input name="value" required maxlength="70" value="${esc(value)}" placeholder="${esc(extra.placeholder||'')}"></label><p class="form-error" id="form-error"></p><button type="submit" class="primary">Save ${icon('check')}</button></form>`);}
function confirmAction(title,description,action,attributes='') {showSheet(title,`<p class="sheet-description">${description}</p><div class="sheet-actions"><button class="primary" data-action="${action}" ${attributes}>Confirm ${icon('check')}</button><button class="secondary full" data-action="close-sheet">Cancel</button></div>`);}
async function startNewCycle(target={routineId:state.activeRoutineId,expectedCycle:state.cycle}) {await mutation('POST','/cycles',target, {preserveSelection:false,after:()=>{closeSheet();navigate('cycle');toast('A fresh cycle. Your history is preserved.');}});}

const aiImportPrompt=`Format my workout routine exactly like this structure for LIFT.
Return only Split:, Day:, Section:, and Exercise: lines, without markdown or commentary.
Use | as the delimiter between fields. Separate days with a blank line.
Include a Split: name. Each day must have a Section: before its Exercise: lines.
Exercise fields are name | number of sets (1–12) | target reps. Do not invent recorded weights or results.

Split: My training split

Day: Day 1 | Push | Chest and shoulders
Section: Chest
Exercise: Barbell Bench Press | 3 | 8-10
Exercise: Incline Dumbbell Press | 3 | 10-12

Day: Day 2 | Pull | Back and biceps
Section: Back
Exercise: Barbell Rows | 3 | 8-10
Exercise: Lat Pulldown | 3 | 10-12

Here is my routine:
[your routine here]`;
/** Usage: showImportSheet(); copying/selecting the prompt never rebuilds this form. */
function showImportSheet() {
  showSheet('Import your split',`<p class="sheet-description">1. Copy the AI prompt below, replace [your routine here], and paste it into your AI assistant.<br>2. Paste the AI output here.<br>3. Import your split, then choose Use split and review its days, exercises, and targets in the editor before training. No AI service is connected to LIFT.</p><form id="import-form"><label class="form-field">Split name (optional)<input name="name" maxlength="70" placeholder="For older output without a Split: line"></label><label class="form-field">Paste AI output<textarea class="import-area" name="plan" required placeholder="Split: Full body&#10;Day: Day 1 | Full body A | Strength&#10;Section: Main lifts&#10;Exercise: Back squat | 3 | 6–8"></textarea></label><p class="form-error" id="form-error"></p><div class="import-actions"><button class="primary" type="submit">Import split ${icon('arrow')}</button><button class="secondary" type="button" data-action="copy-ai-prompt">Copy AI prompt ${icon('upload')}</button></div></form><label class="form-field">AI prompt · supported format<textarea id="ai-import-prompt" class="import-area" readonly aria-describedby="ai-prompt-status">${esc(aiImportPrompt)}</textarea></label><p id="ai-prompt-status" class="sheet-description" role="status" aria-live="polite">You can also select and copy this prompt directly.</p>`);
}
async function copyAIImportPrompt() {
  const area=overlay.querySelector('#ai-import-prompt'),status=overlay.querySelector('#ai-prompt-status');
  if(!area||!status)return;
  try{
    if(!globalThis.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await globalThis.navigator.clipboard.writeText(area.value);
    status.textContent='AI prompt copied. Replace [your routine here] with your routine in your AI assistant.';
  }catch{
    try{
      area.focus();area.select();
      if(document.execCommand?.('copy'))status.textContent='AI prompt copied. Replace [your routine here] with your routine in your AI assistant.';
      else status.textContent='Could not copy automatically. The prompt is selected — use your device’s Copy command or press Ctrl+C / Command+C.';
    }catch{status.textContent='Copy failed. Select the visible AI prompt and copy it manually. Your pasted plan has been kept.';}
  }
}

document.addEventListener('input',event=>{
  const input=event.target;
  if(input.matches('[data-log]')){const item=getSelectedExercise(input.dataset.id);if(item)writeDraft(item,input.dataset.log,input.value);}
  if(input.id==='exercise-search'){exerciseSearch=input.value;document.getElementById('trend-rows').innerHTML=trendRows();}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const a=button.dataset.action,d=button.dataset;
  const cycleTarget=a==='confirm-new-cycle'?{routineId:d.routine??state?.activeRoutineId,expectedCycle:d.cycle===undefined?state?.cycle:Number(d.cycle)}:null;
  if(a==='retry-load'){await boot();return;}
  if(a==='reload-plan'){await reloadLatestPlan();return;}
  if(a==='retry-save'){const retry=pendingRetry;if(retry&&!busy)await retry.run();return;}
  if(a==='logout'){await signOut();return;}
  if(!state||busy)return;
  if(a==='edit-initials'){showInitialsSheet();return;}
  if(a==='reset-initials'){saveDisplayInitials('');return;}
  if(a==='copy-ai-prompt'){await copyAIImportPrompt();return;}
  if(!await flushDrafts())return;
  if(pendingRetry&&!['close-sheet','dismiss','use-last'].includes(a)){toast('Retry the unsaved changes first.');return;}
  if(a==='dismiss'){if(event.target===button)closeSheet();return;}
  if(a==='close-sheet'){closeSheet();if(pendingTimeoutId)render();return;}
  if(a==='nav'){navigate(d.tab);return;}
  if(a==='back'){closeSheet();page=page==='editor'?'splits':page==='splits'?'settings':['recap','cycle-summary'].includes(page)?'cycle':'progress';tab=['splits','settings'].includes(page)?'settings':page==='cycle'?'cycle':'progress';render(true);return;}
  if(a==='resume'){const next=nextWorkout();if(next){await openSession(next.week,next.day.id);if(!pendingRetry)await startSelected();}return;}
  if(a==='start-selected'){await startSelected();return;}
  if(a==='resume-session'){await openSession(Number(d.week),d.id);if(!pendingRetry)await startSelected();return;}
  if(a==='session-preview'){sessionPreview(Number(d.week),d.id);return;}
  if(a==='open-session'){openSession(Number(d.week),d.id);return;}
  if(a==='session-picker'){showSheet('Choose your session',`<p class="sheet-description">Week ${state.selected.week} · ${phases[state.selected.week-1]}. Browse all four weeks from your Cycle dashboard.</p>${state.plan.map(day=>`<button class="session-picker-row" data-action="open-session" data-week="${state.selected.week}" data-id="${day.id}"><span class="trend-main"><strong>${esc(day.name)}</strong><span>${esc(day.focus)}</span></span>${tag(statusOf(state.selected.week,day.id).toUpperCase(),'neutral')}${icon('right')}</button>`).join('')}<button class="text-btn full" data-action="skip-session" data-week="${state.selected.week}" data-id="${state.selected.dayId}">Skip selected session</button>`);return;}
  if(a==='toggle-exercise'){openExercise=openExercise===d.id?null:d.id;render();return;}
  if(a==='toggle-completed'){showCompletedExercises=!showCompletedExercises;render();return;}
  if(a==='use-last'){const e=getSelectedExercise(d.id),previous=e.name!==e.originalName?lastPerformedExercise(e.name):null,weight=previous?.weight??e.lastWeight,reps=previous?.reps??e.lastReps;if(weight==null||reps==null){toast('No previous completed entry is available.');return;}writeDraft(e,'weight',weight);writeDraft(e,'reps',reps);render();toast(e.name!==e.originalName&&!previous?'Original exercise values copied. Adjust for today.':'Last values copied. Adjust for today.');return;}
  if(a==='complete-exercise'){completeExercise(d.id);return;}
  if(a==='add-session-exercise'){sessionExerciseForm();return;}
  if(a==='exercise-options'){const e=getSelectedExercise(d.id);showSheet('Exercise options',`${e.done?`<button class="option-row" data-action="undo-exercise" data-id="${d.id}">${icon('reset')} Mark as incomplete</button>`:''}<button class="option-row" data-action="substitute" data-id="${d.id}">${icon('swap')} Substitute for this session</button><button class="option-row" data-action="trend-detail" data-id="${d.id}">${icon('progress')} View exercise progress</button>`);return;}
  if(a==='undo-exercise'){const rec=getRecord();await mutation('PUT',`/sessions/${encodeURIComponent(rec.id)}/exercises/${encodeURIComponent(d.id)}`,{done:false},{after:()=>{closeSheet();toast('Completion undone. Your values are kept.');}});return;}
  if(a==='substitute'){await showSubstitution(d.id);return;}
  if(a==='retry-library'){await loadSubstitutionOptions(d.id);return;}
  if(a==='apply-substitute'){await mutation('PUT',`/sessions/${encodeURIComponent(getRecord().id)}/exercises/${encodeURIComponent(d.id)}/substitute`,{name:d.name},{after:()=>{closeSheet();toast('Session substitution saved. Recorded values kept.');}});return;}
  if(a==='finish'){finishWorkout();return;}
  if(a==='confirm-finish'){confirmFinish();return;}
  if(a==='recap'){recapId=getRecord()?.id;page='recap';render(true);return;}
  if(a==='skip-session'){
    const rec=getRecord(Number(d.week),d.id);
    if(!rec?.id){showSheet('Skip this session?',`<p class="sheet-description">Start a session record and immediately mark it skipped, not completed. No exercises will be filled in. The timer stops when the skip is saved.</p><div class="sheet-actions"><button class="primary" data-action="confirm-skip" data-week="${d.week}" data-id="${d.id}">Start &amp; skip session ${icon('skip')}</button><button class="secondary full" data-action="close-sheet">Cancel</button></div>`);}
    else confirmAction('Skip this session?','It will be marked skipped, not completed. Any quick entries you have already saved will be retained.','confirm-skip',`data-week="${d.week}" data-id="${d.id}"`);return;
  }
  if(a==='confirm-skip'){await skipSession(Number(d.week),d.id);return;}
  if(a==='progress-view'){progressView=d.view;render(true);return;}
  if(a==='trend-detail'){progressView='trends';selectedTrend=uniqueExercises().some(e=>e.id===d.id)?d.id:encodeURIComponent(getSelectedExercise(d.id)?.name||'');trendCycle='all';closeSheet();tab='progress';page='exercise-detail';render(true);return;}
  if(a==='trend-cycle'){showSheet('Choose your timeline',trendCycleChoices().map(choice=>`<button class="option-row" data-action="select-trend-cycle" data-value="${esc(choice.value)}">${icon(choice.all?'progress':'cycle')} ${esc(cycleLabel(choice))}</button>`).join(''));return;}
  if(a==='select-trend-cycle'){trendCycle=d.value;closeSheet();render();return;}
  if(a==='history-year'){historyYear+=Number(d.delta);historyMonth=null;render();return;}
  if(a==='filter-month'){historyMonth=historyMonth===Number(d.month)?null:Number(d.month);render();return;}
  if(a==='clear-month'){historyMonth=null;render();return;}
  if(a==='history-detail'){historyId=d.id;page='history-detail';render(true);return;}
  if(a==='theme'){state.theme=d.theme;preference('lift-theme',d.theme);render();return;}
  if(a==='splits'){tab='settings';page='splits';closeSheet();render(true);return;}
  if(a==='editor'||a==='edit-current-day'){tab='settings';page='editor';if(a==='edit-current-day')openDay=state.selected?.dayId??null;closeSheet();render(true);return;}
  if(a==='toggle-day'){openDay=openDay===d.id?null:d.id;render();return;}
  if(a==='edit-exercise'){const e=state.plan.find(day=>day.id===d.day).exercises.find(e=>e.id===d.id);exerciseForm(d.day,e.section,d.id);return;}
  if(a==='add-exercise'){exerciseForm(d.id,d.section);return;}
  if(a==='delete-exercise'){confirmAction('Remove exercise?','This removes the exercise from future sessions. Existing session snapshots and history are kept.','confirm-delete-exercise',`data-day="${d.day}" data-id="${d.id}"`);return;}
  if(a==='confirm-delete-exercise'){const day=state.plan.find(day=>day.id===d.day);day.exercises=day.exercises.filter(e=>e.id!==d.id);if(await save()){closeSheet();render();toast('Exercise removed from future sessions.');}return;}
  if(a==='move-exercise'){const day=state.plan.find(day=>day.id===d.day),index=day.exercises.findIndex(e=>e.id===d.id),e=day.exercises[index],siblings=day.exercises.filter(x=>x.section===e.section);if(siblings.length<2){toast('Add another exercise to reorder this section.');return;}const target=siblings.indexOf(e)===0?siblings[1]:siblings[siblings.indexOf(e)-1],other=day.exercises.indexOf(target);[day.exercises[index],day.exercises[other]]=[day.exercises[other],day.exercises[index]];if(await save()){render();toast('Exercise order saved.');}return;}
  if(a==='rename-split'){textForm('Rename your split','Split name',state.splitName,'rename-split');return;}
  if(a==='add-section'){textForm('Add a section','Section name','','add-section',{id:d.id,placeholder:'e.g. Accessories'});return;}
  if(a==='section-options'){showSheet(d.section,`<button class="option-row" data-action="rename-section" data-id="${d.id}" data-section="${esc(d.section)}">${icon('edit')} Rename section</button><button class="option-row danger" data-action="delete-section" data-id="${d.id}" data-section="${esc(d.section)}">${icon('trash')} Remove section and its exercises</button>`);return;}
  if(a==='rename-section'){textForm('Rename section','Section name',d.section,'rename-section',{id:d.id,section:d.section});return;}
  if(a==='delete-section'){confirmAction('Remove this section?','Its exercises will also be removed from future sessions. Historical records are preserved.','confirm-delete-section',`data-id="${d.id}" data-section="${esc(d.section)}"`);return;}
  if(a==='confirm-delete-section'){const day=state.plan.find(day=>day.id===d.id);day.sections=day.sections.filter(s=>s!==d.section);day.exercises=day.exercises.filter(e=>e.section!==d.section);if(await save()){closeSheet();render();}return;}
  if(a==='add-day'){textForm('Add training day','Day name','','add-day',{placeholder:'e.g. Upper C'});return;}
  if(a==='day-options'){showSheet('Training day options',`<button class="option-row" data-action="rename-day" data-id="${d.id}">${icon('edit')} Rename day</button><button class="option-row" data-action="edit-focus" data-id="${d.id}">${icon('target')} Edit training focus</button><button class="option-row danger" data-action="delete-day" data-id="${d.id}">${icon('trash')} Remove day from plan</button>`);return;}
  if(a==='edit-focus'){textForm('Edit training focus','Focus',state.plan.find(day=>day.id===d.id).focus,'edit-focus',{id:d.id});return;}
  if(a==='rename-day'){textForm('Rename training day','Day name',state.plan.find(day=>day.id===d.id).name,'rename-day',{id:d.id});return;}
  if(a==='delete-day'){confirmAction('Remove training day?','This removes the day from your plan. Saved session snapshots remain in Activity.','confirm-delete-day',`data-id="${d.id}"`);return;}
  if(a==='confirm-delete-day'){state.plan=state.plan.filter(day=>day.id!==d.id);if(state.selected.dayId===d.id)state.selected.dayId=state.plan[0]?.id;if(await save()){closeSheet();render();}return;}
  if(a==='split-options'){showSheet('Manage your split',`<button class="option-row" data-action="editor">${icon('edit')} Edit days and exercises</button><button class="option-row" data-action="rename-split">${icon('edit')} Rename split</button><button class="option-row" data-action="export-split">${icon('upload')} Export plan text</button>`);return;}
  if(a==='export-split'){const text=`Split: ${state.splitName}\n\n`+state.plan.map(day=>`Day: ${day.name} | ${day.name} | ${day.focus}\n`+day.sections.map(s=>`Section: ${s}\n`+day.exercises.filter(e=>e.section===s).map(e=>`Exercise: ${e.name} | ${e.sets} | ${e.reps}`).join('\n')).join('\n')).join('\n\n');showSheet('Your plan as text',`<p class="sheet-description">Copy this text to keep a portable version of your plan.</p><textarea class="import-area" readonly aria-label="Exported plan">${esc(text)}</textarea><button class="text-btn" data-action="copy-export">Copy to clipboard ${icon('upload')}</button>`);return;}
  if(a==='copy-export'){const area=overlay.querySelector('textarea');if(navigator.clipboard)navigator.clipboard.writeText(area.value).then(()=>toast('Plan copied.')).catch(()=>{area.select();toast('Select and copy the plan text.');});else{area.select();toast('Select and copy the plan text.');}return;}
  if(a==='create-split'){textForm('Build a new split','Split name','','create-split',{placeholder:'e.g. Full body'});return;}
  if(a==='import-split'){showImportSheet();return;}
  if(a==='activate-split'){confirmAction('Use this split?','Your previous cycle and position in this split will be restored. Your current results remain saved.','confirm-activate-split',`data-id="${d.id}"`);return;}
  if(a==='confirm-activate-split'){await mutation('POST','/active-routine',{routineId:d.id},{preserveSelection:false,after:()=>{closeSheet();navigate('cycle');toast('Split restored. Your progress is kept.');}});return;}
  if(a==='delete-split'){confirmAction('Remove saved split?','Your recorded sessions will stay in Activity.','confirm-delete-split',`data-id="${d.id}"`);return;}
  if(a==='confirm-delete-split'){await mutation('DELETE',`/routines/${encodeURIComponent(d.id)}`,undefined,{after:closeSheet});return;}
  if(a==='cycle-options'){showSheet('Your current cycle',`<p class="sheet-description">Cycle ${state.cycle} · ${completedCount()} of ${state.plan.length*4} sessions trained. Starting another cycle keeps your history and training split.</p><button class="option-row" data-action="cycle-summary">${icon('progress')} Review cycle so far</button><button class="option-row" data-action="new-cycle">${icon('reset')} Start next cycle</button>`);return;}
  if(a==='cycle-summary'){closeSheet();tab='cycle';page='cycle-summary';render(true);return;}
  if(a==='new-cycle'){confirmAction('Start your next cycle?',`This starts Week 1 of Cycle ${state.cycle+1}. Your actual completed entries and history will be preserved.`,'confirm-new-cycle',`data-routine="${esc(state.activeRoutineId)}" data-cycle="${state.cycle}"`);return;}
  if(a==='confirm-new-cycle'){await startNewCycle(cycleTarget);return;}
});

document.addEventListener('submit',async event=>{
  if(event.target.id==='session-exercise-form'){
    event.preventDefault();if(busy||pendingRetry)return;
    const form=event.target,data=new FormData(form),name=data.get('name').trim(),sets=Number(data.get('sets')),reps=data.get('reps').trim();
    if(!name||!Number.isInteger(sets)||sets<1||sets>12){form.querySelector('.form-error').textContent='Enter a name and 1–12 sets.';return;}
    if(!await flushDrafts())return;
    await mutation('POST',`/sessions/${encodeURIComponent(form.dataset.session)}/exercises`,{id:form.dataset.id,name,sets,reps},{after:result=>{openExercise=result.exerciseId;closeSheet();toast('Exercise added to this workout.');}});
    return;
  }
  if(event.target.id==='initials-form'){
    event.preventDefault();if(!state||busy)return;
    const form=event.target,value=String(new FormData(form).get('initials')||'').trim().toUpperCase();
    if(!/^[\p{L}\p{N}]{1,3}$/u.test(value)){form.querySelector('.form-error').textContent='Use 1–3 letters or numbers.';return;}
    saveDisplayInitials(value);return;
  }
  if(event.target.id==='login-form'){
    event.preventDefault();if(busy)return;
    const form=event.target,username=new FormData(form).get('username').trim();if(!username)return;
    setBusy(true);
    try{user=await api('POST','/api/auth/login',{username});preference('lift-user',JSON.stringify(user));await loadState();prepareSignedInView();render(true);}
    catch(error){const node=form.querySelector('.form-error');if(node)node.textContent=error.message;}
    finally{setBusy(false);}return;
  }
  if(event.target.id==='substitute-form'){
    event.preventDefault();if(busy)return;
    const form=event.target,name=new FormData(form).get('name').trim();if(!name)return;
    await mutation('PUT',`/sessions/${encodeURIComponent(getRecord().id)}/exercises/${encodeURIComponent(form.dataset.id)}/substitute`,{name},{after:closeSheet});return;
  }
  if(!['exercise-form','text-form','import-form'].includes(event.target.id))return;
  event.preventDefault();if(busy||pendingRetry)return;const form=event.target, data=new FormData(form),error=form.querySelector('#form-error');
  if(planConflict&&isExistingPlanForm(form)){updateSaveStatus();return;}
  const fail=message=>{error.textContent=message;};
  if(form.id==='exercise-form'){
    const name=data.get('name').trim(),sets=Number(data.get('sets')),reps=data.get('reps').trim();
    if(!name||!reps||!Number.isInteger(sets)||sets<1||sets>12){fail('Enter a name, target reps, and 1–12 sets.');return;}
    const day=state.plan.find(d=>d.id===form.dataset.day),item=day.exercises.find(e=>e.id===form.dataset.id);
    if(item)Object.assign(item,{name,sets,reps});else day.exercises.push(ex(uid(),name,sets,reps,null,null,form.dataset.section));
  }
  if(form.id==='text-form'){
    const value=data.get('value').trim(),kind=form.dataset.kind;
    if(!value){fail('Please enter a name.');return;}
    const day=state.plan.find(day=>day.id===form.dataset.id);
    if(kind==='rename-split')state.splitName=value;
    if(kind==='rename-day')day.name=value;
    if(kind==='edit-focus')day.focus=value;
    if(kind==='add-day'){const id=uid();state.plan.push({id,name:value,focus:'Custom training day',sections:['Main lifts'],exercises:[]});openDay=id;}
    if(kind==='add-section'){if(day.sections.includes(value)){fail('This section already exists in this day.');return;}day.sections.push(value);}
    if(kind==='rename-section'){if(value!==form.dataset.section&&day.sections.includes(value)){fail('This section name already exists.');return;}if(day.sectionIds?.[form.dataset.section]){day.sectionIds[value]=day.sectionIds[form.dataset.section];if(value!==form.dataset.section)delete day.sectionIds[form.dataset.section];}day.sections=day.sections.map(s=>s===form.dataset.section?value:s);day.exercises.forEach(e=>{if(e.section===form.dataset.section)e.section=value;});}
    if(kind==='create-split'){await mutation('POST','/routines',{name:value,plan:[]},{after:()=>{closeSheet();toast('Split created. Select Use split to configure it.');}});return;}
  }
  if(form.id==='import-form'){
    const lines=data.get('plan').split('\n').map(s=>s.trim()).filter(Boolean);let name=(data.get('name')||'').trim(),plan=[],day=null,section='';
    for(const line of lines){
      if(line.startsWith('Split:'))name=line.slice(6).trim();
      else if(line.startsWith('Day:')){const parts=line.slice(4).split('|').map(s=>s.trim());day={id:uid(),name:parts[1]||parts[0],focus:parts[2]||'',sections:[],exercises:[]};plan.push(day);section='';}
      else if(line.startsWith('Section:')&&day){section=line.slice(8).trim();if(!section){fail('Sections need a name.');return;}day.sections.push(section);}
      else if(line.startsWith('Exercise:')&&day&&section){const parts=line.slice(9).split('|').map(s=>s.trim()),sets=Number(parts[1]);if(!parts[0]||!Number.isInteger(sets)||sets<1||sets>12||!parts[2]){fail('Use Exercise: Name | Sets (1–12) | Reps.');return;}day.exercises.push(ex(uid(),parts[0],sets,parts[2],null,null,section));}
      else{fail(`Could not read: ${line}. Use Split, Day, Section, and Exercise lines in that order.`);return;}
    }
    if(!name||!plan.length||!plan.every(d=>d.name)){fail('Include a split name and at least one named training day.');return;}
    await mutation('POST','/routines',{name,plan},{after:()=>{closeSheet();toast('Split imported. Select Use split to begin.');}});return;
  }
  const result=await save();if(result){closeSheet();render();toast('Plan changes saved.');}
});
document.addEventListener('keydown',event=>{
  if(!overlay.children.length)return;
  if(event.key==='Escape'){if(!busy)closeSheet();return;}
  if(event.key==='Tab'){
    const items=[...overlay.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]')];
    if(!items.length)return;
    const first=items[0],last=items.at(-1);
    if(!overlay.contains(document.activeElement)){event.preventDefault();first.focus();}
    else if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay.querySelector('.sheet'))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
boot();
