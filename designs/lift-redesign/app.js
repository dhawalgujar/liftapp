'use strict';

const STORAGE_KEY = 'lift-cycle-concept-v1';
const icons = {
  cycle: '<rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect>',
  train: '<path d="m6.5 6.5 11 11M4 9l5-5M15 20l5-5M2 7l5-5M17 22l5-5"></path>',
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
const uid = () => `mock-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const ex = (id,name,sets,reps,weight,lastReps,section) => ({id,name,sets,reps,weight,lastReps,section});

function makePlan() {
  return [
    { id:'upper-a', name:'Upper A', focus:'Chest & back', sections:['Main lifts','Accessories'], exercises:[
      ex('ua1','Dumbbell bench press',3,'8–10',45,10,'Main lifts'), ex('ua2','Chest-supported row',3,'8–10',45,10,'Main lifts'), ex('ua3','Lat pulldown',3,'10–12',100,12,'Main lifts'), ex('ua4','Cable lateral raise',3,'12–15',15,15,'Accessories'), ex('ua5','Triceps pushdown',3,'10–12',35,12,'Accessories'), ex('ua6','Incline dumbbell curl',3,'10–12',20,12,'Accessories') ]},
    { id:'lower-a', name:'Lower A', focus:'Quads & calves', sections:['Main lifts','Accessories'], exercises:[
      ex('la1','Back squat',3,'6–8',135,8,'Main lifts'), ex('la2','Leg press',3,'10–12',180,12,'Main lifts'), ex('la3','Walking lunge',3,'10 each side',25,10,'Main lifts'), ex('la4','Seated leg curl',3,'10–12',65,12,'Accessories'), ex('la5','Leg extension',3,'12–15',60,15,'Accessories'), ex('la6','Standing calf raise',3,'12–15',90,15,'Accessories') ]},
    { id:'upper-b', name:'Upper B', focus:'Shoulders & arms', sections:['Main lifts','Accessories'], exercises:[
      ex('ub1','Dumbbell shoulder press',3,'8–10',30,10,'Main lifts'), ex('ub2','Neutral-grip pulldown',3,'8–10',100,10,'Main lifts'), ex('ub3','Incline dumbbell press',3,'8–10',40,10,'Main lifts'), ex('ub4','Cable lateral raise',3,'12–15',15,15,'Accessories'), ex('ub5','Hammer curl',3,'10–12',25,12,'Accessories'), ex('ub6','Overhead cable extension',3,'10–12',30,12,'Accessories') ]},
    { id:'lower-b', name:'Lower B', focus:'Posterior chain & quads', sections:['Main lifts','Accessories'], exercises:[
      ex('lb1','Romanian deadlift',3,'8–10',95,10,'Main lifts'), ex('lb2','Bulgarian split squat',3,'10 each side',25,10,'Main lifts'), ex('lb3','Leg press',3,'10–12',180,12,'Main lifts'), ex('lb4','Seated leg curl',3,'10–12',65,12,'Accessories'), ex('lb5','Leg extension',3,'12–15',60,15,'Accessories'), ex('lb6','Seated calf raise',3,'12–15',70,15,'Accessories') ]}
  ];
}

function createRecord(day, week, completed = false) {
  return {id:uid(), week, dayId:day.id, dayName:day.name, focus:day.focus, status:completed?'completed':'pending', exercises:day.exercises.map(item => ({...item, originalName:item.name, targetReps:item.reps, weight:completed ? item.weight + (week > 1 ? 5 : 0) : '', reps:completed?item.lastReps:'', lastWeight:item.weight, lastReps:item.lastReps, done:completed}))};
}

function initialState() {
  const plan = makePlan();
  const records = {};
  const history = [];
  let n = 0;
  for (let week = 1; week <= 2; week++) {
    for (let d = 0; d < 4; d++) {
      if (week === 2 && d === 3) break;
      const record = createRecord(plan[d],week,true);
      record.date = ['2026-10-01','2026-10-03','2026-10-05','2026-10-07','2026-10-10','2026-10-12','2026-10-14'][n++];
      record.cycle = 3;
      record.splitName = 'Upper / Lower';
      records[`${week}:${plan[d].id}`] = record;
      history.push(structuredClone(record));
    }
  }
  const current = createRecord(plan[3],2);
  current.status = 'partial';
  current.exercises[0] = {...current.exercises[0],weight:100,reps:10,done:true};
  current.exercises[1] = {...current.exercises[1],weight:30,reps:10,done:true};
  current.exercises[2].weight = 190;
  current.exercises[2].reps = 10;
  records['2:lower-b'] = current;
  // Fictional activity snapshots, separate from current-cycle navigation.
  for (const year of [2025,2026]) {
    for (let month = 0; month < (year===2026?9:12); month++) {
      for (let date = 2; date <= 28; date += 3) {
        if ((date+month)%11 === 0) continue;
        const day = plan[(date+month)%4];
        const record = createRecord(day,Math.floor((date-2)/7)%4+1,true);
        record.date = `${year}-${String(month+1).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
        record.cycle = year===2025?1:month<4?1:2;
        record.splitName = 'Upper / Lower';
        if ((date+month)%17===0) {record.status='skipped';record.exercises.forEach(e=>{e.done=false;e.weight='';e.reps='';});}
        history.push(record);
      }
    }
  }
  return {version:1, cycle:3,splitName:'Upper / Lower',plan,records,history,theme:'light',selected:{week:2,dayId:'lower-b'},archivedCycles:[]};
}

let state;
try {state = JSON.parse(localStorage.getItem(STORAGE_KEY));} catch {state = null;}
if (!state || state.version !== 1 || !state.plan?.length) state = initialState();
let tab='cycle', page='cycle', openExercise='lb3', showCompletedExercises=false, progressView='trends', selectedTrend='lb3', trendCycle='current', historyYear=2026, historyMonth=null, historyId=null, openDay='lower-b', exerciseSearch='';
let toastTimer;
const app = document.getElementById('app');
const screen = document.getElementById('screen');
const header = document.getElementById('app-header');
const navigation = document.getElementById('navigation');
const overlay = document.getElementById('overlay-root');
const actionArea = document.getElementById('workout-action');
function save() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));} catch {toast('Browser storage unavailable. Changes last until refresh.');}}
function toast(message) {const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800);}
function getRecord(week=state.selected.week,dayId=state.selected.dayId) {return state.records[`${week}:${dayId}`];}
function statusOf(week,dayId) {const rec=getRecord(week,dayId);if(!rec)return 'pending';if(['completed','partial','skipped'].includes(rec.status))return rec.status;return rec.exercises.some(e=>e.done)?'partial':'pending';}
function nextWorkout() {
  for(let week=1;week<=4;week++) {
    const days=state.plan.filter(day=>!['completed','skipped'].includes(statusOf(week,day.id)));
    if(days.length) return {week,day:days.find(day=>statusOf(week,day.id)==='partial')||days[0]};
  }
  return null;
}
function ensureRecord(week,dayId) {const key=`${week}:${dayId}`;if(!state.records[key]) {const day=state.plan.find(d=>d.id===dayId);state.records[key]=createRecord(day,week);}return state.records[key];}
function completedCount() {let count=0;for(let w=1;w<=4;w++) for(const day of state.plan) if(statusOf(w,day.id)==='completed')count++;return count;}
function pageTitle(title,subtitle='',right='') {return `<div class="page-title"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${right}</div>`;}
function tag(text,kind='') {return `<span class="tag ${kind}">${text}</span>`;}
function getSelectedExercise(id=openExercise) {return getRecord()?.exercises.find(e=>e.id===id);}
function showSheet(title,content) {
  overlay.innerHTML=`<div class="scrim" data-action="dismiss"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="sheet-handle"></div><div class="sheet-heading"><h3>${esc(title)}</h3><button class="icon-btn" data-action="close-sheet" aria-label="Close dialog">${icon('close')}</button></div>${content}</section></div>`;
  screen.inert=true;header.inert=true;navigation.inert=true;actionArea.inert=true;
  overlay.querySelector('.sheet').focus();
}
function closeSheet() {overlay.innerHTML='';screen.inert=false;header.inert=false;navigation.inert=false;actionArea.inert=false;screen.focus({preventScroll:true});}
function navigate(dest) {closeSheet();tab=dest;page=dest;render(true);}
function render(resetScroll=false) {
  app.dataset.theme=state.theme;
  const nested=['exercise-detail','history-detail','splits','editor','recap','cycle-summary'].includes(page);
  header.innerHTML=nested?`<button class="back-header" data-action="back">${icon('left')} ${page==='editor'?'Training splits':page==='splits'?'Settings':page==='recap'?'Your cycle':page==='cycle-summary'?'Your cycle':'Progress'}</button><span class="demo-badge">LIFT / CONCEPT</span>`:`<button class="brand" data-action="nav" data-tab="cycle" aria-label="LIFT cycle dashboard"><span class="brand-mark"><i></i><i></i><i></i></span>LIFT</button><div class="header-end"><span class="demo-badge">DEMO</span><button class="avatar" data-action="nav" data-tab="settings" aria-label="Profile and settings">AJ</button></div>`;
  navigation.innerHTML=['cycle','train','progress','settings'].map(name=>`<button class="nav-item ${tab===name?'active':''}" data-action="nav" data-tab="${name}" ${tab===name?'aria-current="page"':''}><span class="nav-icon-wrap">${icon(name)}</span>${name[0].toUpperCase()+name.slice(1)}</button>`).join('');
  actionArea.innerHTML='';
  if(page==='cycle')renderCycle();
  if(page==='train')renderTrain();
  if(page==='progress')renderProgress();
  if(page==='exercise-detail')renderExerciseDetail();
  if(page==='history-detail')renderHistoryDetail();
  if(page==='settings')renderSettings();
  if(page==='splits')renderSplits();
  if(page==='editor')renderEditor();
  if(page==='recap')renderRecap();
  if(page==='cycle-summary')renderCycleSummary();
  if(resetScroll)screen.scrollTop=0;
}

function renderCycle() {
  const next=nextWorkout(), total=state.plan.length*4, completed=completedCount();
  const rec=next?getRecord(next.week,next.day.id):null;
  const done=rec?.exercises.filter(e=>e.done).length||0;
  const exerciseTotal=rec?.exercises.length||next?.day.exercises.length||0;
  const phaseWeek=next?.week||4;
  screen.innerHTML=`<section data-screen-label="Cycle dashboard"><div class="cycle-top"><div><h2 class="cycle-title">Your cycle</h2><p class="cycle-subtitle">${esc(state.splitName)}</p></div><div class="cycle-number">CYCLE <b>${String(state.cycle).padStart(2,'0')}</b></div></div>
    <div class="journey-summary"><span><strong>${completed}</strong> of ${total} sessions trained</span><span>${Math.round(completed/total*100)}% through</span></div>
    <div class="journey-track">${Array.from({length:4},(_,i)=>`<span class="${i<phaseWeek-1?'complete':i===phaseWeek-1?'current':''}"></span>`).join('')}</div>
    ${next?`<article class="next-card"><div class="eyebrow">${done?'Ready when you are':'Up next'}</div><div class="hero-icon">${icon('train')}</div><h2>${esc(next.day.name)}</h2><p class="hero-meta">Week ${next.week} · Day ${state.plan.indexOf(next.day)+1} &nbsp; / &nbsp; ${esc(next.day.focus)}</p><div class="hero-progress"><div class="mini-bars">${Array.from({length:exerciseTotal},(_,i)=>`<i class="${i<done?'done':''}"></i>`).join('')}</div><span>${done} / ${exerciseTotal} exercises</span></div><button class="primary" data-action="resume"><span>${done?'Resume workout':'Start workout'}</span>${icon('arrow')}</button></article>`:
    `<article class="next-card"><div class="eyebrow">All four weeks. Well earned.</div><div class="hero-icon">${icon('check')}</div><h2>Cycle complete.</h2><p class="hero-meta">${completed} sessions trained. Time to see your progress.</p><div style="height:24px"></div><button class="primary" data-action="cycle-summary">Review your cycle ${icon('arrow')}</button></article>`}
    <div class="phase-note"><span class="phase-icon">${icon('target')}</span><p><strong>Week ${phaseWeek} · ${phases[phaseWeek-1]}</strong><br>${['Find your rhythm. Establish working weights.','A little more load. Or one more good rep.','Follow your plan’s higher-effort targets.','Recover with intention. Follow your deload plan.'][phaseWeek-1]}</p></div>
    <div class="section-heading"><h3>The four-week plan</h3><span class="small muted">Tap a session</span></div>
    <div class="cycle-map card">${[1,2,3,4].map(week=>{
      const states=state.plan.map(day=>statusOf(week,day.id)), count=states.filter(s=>s==='completed').length;
      return `<div class="week-row ${week===phaseWeek?'current':''} ${week===4?'deload':''}"><div class="week-row-top"><div class="week-info"><span class="week-number">${String(week).padStart(2,'0')}</span><span class="week-title">${phases[week-1]}</span></div><span class="week-state">${count===state.plan.length?'Complete':states.some(s=>s!=='pending')?`${count} / ${state.plan.length} trained`:'Upcoming'}</span></div><div class="session-dots">${state.plan.map((day,i)=>{const status=states[i];return `<button class="session-dot ${status==='completed'?'done':status==='partial'?'current':status==='skipped'?'skipped':''}" data-action="session-preview" data-week="${week}" data-id="${day.id}" aria-label="Week ${week}, ${esc(day.name)}, ${status}">${status==='completed'?icon('check'):status==='partial'?'<span class="status-ring"></span>':status==='skipped'?icon('skip'):String(i+1).padStart(2,'0')}</button>`;}).join('')}</div></div>`;
    }).join('')}</div><div class="map-legend"><span><i class="legend-dot"></i>Completed</span><span><i class="legend-dot blue"></i>In progress</span><span><i class="legend-dot gray"></i>Upcoming</span></div>
    <button class="split-shortcut card" data-action="splits"><span class="split-icon">${icon('settings')}</span><span><strong>Your training plan</strong><span class="small muted">${esc(state.splitName)} · ${state.plan.length} sessions / week</span></span>${icon('right')}</button></section>`;
}

function renderTrain() {
  if(!state.plan.some(d=>d.id===state.selected.dayId)) {const next=nextWorkout();state.selected={week:next?.week||1,dayId:(next?.day||state.plan[0]).id};}
  const rec=ensureRecord(state.selected.week,state.selected.dayId);
  const done=rec.exercises.filter(e=>e.done).length;
  const finished=['completed','skipped'].includes(rec.status);
  if(openExercise!==null&&!rec.exercises.some(e=>e.id===openExercise))openExercise=rec.exercises.find(e=>!e.done)?.id||rec.exercises[0]?.id;
  const guidance=['RIR 2 · Establish your working weights','RIR 1–2 · Progress reps or load','RIR 0–1 · Follow your higher-effort plan','RIR 2 · Follow your reduced-volume plan'][state.selected.week-1];
  const sections=[...new Set(rec.exercises.map(e=>e.section))];
  screen.innerHTML=`<section data-screen-label="Workout quick logger"><div class="row between"><span class="tag">WEEK ${String(state.selected.week).padStart(2,'0')} / ${phases[state.selected.week-1].toUpperCase()}</span><button class="text-btn" data-action="session-picker">Change session ${icon('down')}</button></div>
    <div class="training-title"><h2>${esc(rec.dayName)}</h2><p>${esc(rec.focus)} · ${rec.exercises.length} exercises</p></div>
    ${finished?`<div class="viewing-note">${rec.status==='skipped'?'This session was skipped.':'This session is complete.'} You can review or edit its quick entries below.</div>`:''}
    <div class="training-progress"><div class="row between"><span><b>${done} of ${rec.exercises.length}</b> exercises complete</span><span>${Math.round(done/Math.max(1,rec.exercises.length)*100)}%</span></div><div class="thin-track"><span style="width:${done/Math.max(1,rec.exercises.length)*100}%"></span></div></div>
    <div class="training-guidance">${icon('target')} ${guidance}</div>
    ${done&&!finished&&done<rec.exercises.length?`<button class="completed-review" data-action="toggle-completed" aria-expanded="${showCompletedExercises}"><span>${icon('check')} ${done} exercises in the books</span><span>${showCompletedExercises?'Hide':'Review'} ${icon(showCompletedExercises?'up':'down')}</span></button>`:''}
    ${sections.map(section=>{const items=rec.exercises.filter(e=>e.section===section&&(!e.done||showCompletedExercises||finished||done===rec.exercises.length));return items.length?`<div class="eyebrow exercise-group">${esc(section)}</div>${items.map(item=>exerciseCard(item,rec)).join('')}`:'';}).join('')}
    ${!rec.exercises.length?'<div class="empty-state">This session has no exercises.<br>Add them in your training plan.</div>':''}
    <div class="workout-footer"><button class="text-btn" data-action="edit-current-day">${icon('edit')} Edit this day’s plan</button></div><div class="save-note">${icon('check')} Demo entries saved on this device</div></section>`;
  actionArea.innerHTML=`<button class="${finished||done===rec.exercises.length?'primary':'secondary full'}" data-action="${finished?'recap':'finish'}">${finished?'View workout recap':'Finish workout'} ${icon(finished?'arrow':'check')}</button>`;
}
function exerciseCard(item,rec) {
  const expanded=openExercise===item.id;
  const num=rec.exercises.indexOf(item)+1;
  return `<article class="exercise-card card ${expanded?'is-open':''}" data-exercise="${item.id}"><button class="exercise-head" data-action="toggle-exercise" data-id="${item.id}" aria-expanded="${expanded}"><span class="exercise-index ${item.done?'done':''}">${item.done?icon('check'):String(num).padStart(2,'0')}</span><span class="exercise-label"><strong>${esc(item.name)}</strong><span>${item.done?`${item.sets} sets · ${esc(item.weight)} lb × ${esc(item.reps)}`:`${item.sets} sets · ${esc(item.targetReps||item.originalReps||state.plan.flatMap(d=>d.exercises).find(e=>e.id===item.id)?.reps||'8–10')} reps`}${item.name!==item.originalName?' · Substituted':''}</span></span>${icon(expanded?'up':'down')}</button>
    ${expanded?`<div class="exercise-body"><div class="last-entry"><div><div class="eyebrow">${item.name!==item.originalName?'Last time · original exercise':'Last time'}</div><strong>${item.lastWeight} lb <span class="muted">×</span> ${item.lastReps}</strong></div><span class="small muted">${item.name!==item.originalName?esc(item.originalName):state.selected.week>1?`Week ${state.selected.week-1}`:'Previous cycle'}</span></div>
    <div class="input-grid"><label>Weight, lb<input class="log-input" type="number" min="0" step="0.5" inputmode="decimal" data-log="weight" data-id="${item.id}" value="${esc(item.weight)}" placeholder="—" aria-label="${esc(item.name)} weight in pounds"></label><label>Reps<input class="log-input" type="number" min="1" max="100" inputmode="numeric" data-log="reps" data-id="${item.id}" value="${typeof item.reps==='number'||/^\d+$/.test(item.reps)?esc(item.reps):''}" placeholder="—" aria-label="${esc(item.name)} reps"></label></div>
    <button class="text-btn" data-action="use-last" data-id="${item.id}">${icon('reset')} Use last values</button>
    <button class="primary" data-action="complete-exercise" data-id="${item.id}">${icon('check')} ${item.done?'Save exercise changes':'Complete exercise'}</button><div class="exercise-options"><button class="text-btn" data-action="substitute" data-id="${item.id}">${icon('swap')} Substitute for this session</button><button class="icon-btn" data-action="exercise-options" data-id="${item.id}" aria-label="More exercise options">${icon('more')}</button></div></div>`:''}</article>`;
}

function uniqueExercises() {const seen=new Set();return state.plan.flatMap(d=>d.exercises).filter(e=>{if(seen.has(e.name))return false;seen.add(e.name);return true;});}
function progressEntries(item,cycle=trendCycle) {
  const archive=state.history.filter(r=>r.cycle===(cycle==='current'?state.cycle:2)&&r.status!=='skipped');
  const source=cycle==='current'?[...archive,...Object.values(state.records)]:archive;
  const byWeek=new Map();
  for(const rec of source)for(const e of rec.exercises)if(e.name===item.name&&e.done&&e.weight!==''&&e.reps!=='') {
    const existing=byWeek.get(rec.week);
    if(!existing||Number(e.weight)>existing.weight)byWeek.set(rec.week,{week:rec.week,weight:Number(e.weight),reps:Number(e.reps),sets:e.sets});
  }
  return [...byWeek.values()].sort((a,b)=>a.week-b.week);
}
function sparkline(points) {
  if(!points.length)return '';
  const values=points.map(p=>p.weight), min=Math.min(...values)-3,max=Math.max(...values)+3;
  const coords=values.map((v,i)=>`${6+i*(44/Math.max(1,values.length-1))},${24-(v-min)/(max-min)*20}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 56 30" fill="none" aria-hidden="true"><polyline points="${coords}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>`;
}
function deltaLabel(points) {if(points.length<2)return 'First entry this cycle';const a=points.at(-2),b=points.at(-1);if(b.weight!==a.weight)return `${b.weight>a.weight?'+':''}${b.weight-a.weight} lb from Week ${a.week}`;if(b.reps!==a.reps)return `Same load · ${b.reps>a.reps?'+':''}${b.reps-a.reps} reps`;return 'Consistent with last week';}
function trendRows() {const items=uniqueExercises().filter(e=>e.name.toLowerCase().includes(exerciseSearch.toLowerCase()));return items.length?items.map(item=>{const points=progressEntries(item,'current'),last=points.at(-1);return `<button class="exercise-trend" data-action="trend-detail" data-id="${item.id}"><span class="trend-main"><strong>${esc(item.name)}</strong><span class="result">${last?`${last.weight} lb <span class="muted">×</span> ${last.reps}`:'No completed entries yet'}</span><span class="delta">${last?icon('progress'):''}${deltaLabel(points)}</span></span>${sparkline(points)}${icon('right')}</button>`;}).join(''):'<div class="empty-state">No exercises match your search.</div>';}
function renderProgress() {
  screen.innerHTML=`<section data-screen-label="Progress"><div class="page-title"><div><h2>The bigger picture</h2><p>Small improvements. Built over time.</p></div></div><div class="segment-control"><button class="${progressView==='trends'?'active':''}" data-action="progress-view" data-view="trends">Exercise trends</button><button class="${progressView==='activity'?'active':''}" data-action="progress-view" data-view="activity">Activity</button></div>
    ${progressView==='trends'?`<div class="insight-card">${icon('progress')}<div><strong>Your work is adding up.</strong><p>Compare weight and reps together to see the whole story.</p></div></div><label class="search-box">${icon('search')}<input id="exercise-search" type="search" value="${esc(exerciseSearch)}" placeholder="Find an exercise" aria-label="Search exercises"></label><div class="filter-row"><span class="small muted">CYCLE ${String(state.cycle).padStart(2,'0')} · ALL TRAINING DAYS</span><span class="small muted">lb × reps</span></div><div class="trend-list card" id="trend-rows">${trendRows()}</div>`:activityContent()}</section>`;
}
function renderExerciseDetail() {
  const item=uniqueExercises().find(e=>e.id===selectedTrend)||uniqueExercises()[0];
  if(!item){screen.innerHTML=pageTitle('No exercises yet','Add an exercise to your training plan.');return;}
  const points=progressEntries(item), last=points.at(-1), currentWeek=nextWorkout()?.week||4;
  const max=Math.max(...points.map(p=>p.weight),item.weight)+10,min=Math.max(0,Math.min(...points.map(p=>p.weight),item.weight)-20);
  const pos=p=>({x:36+(p.week-1)*82,y:128-(p.weight-min)/(max-min)*100});
  const line=points.map(p=>`${pos(p).x},${pos(p).y}`).join(' ');
  screen.innerHTML=`<section data-screen-label="Exercise progress detail">${pageTitle(esc(item.name),'Performance across your four-week cycle')}
    <div class="filter-row"><button class="pill" data-action="trend-cycle">Cycle ${trendCycle==='current'?String(state.cycle).padStart(2,'0'):'02'} ${trendCycle==='current'?'· Current':''} ${icon('down')}</button><span class="small muted">Best completed load / week</span></div>
    <div class="chart-card card"><div class="eyebrow muted">Latest completed result</div><div class="chart-value">${last?last.weight:'—'} <span>lb × ${last?last.reps:'—'} reps</span></div><div class="chart-sub">${esc(deltaLabel(points))}</div><svg class="line-chart" viewBox="0 0 310 164" role="img" aria-label="${esc(item.name)} weight by week. ${points.map(p=>`Week ${p.week}: ${p.weight} pounds for ${p.reps} reps`).join('. ')}">
    ${[0,1,2].map(i=>`<line class="chart-axis" x1="32" y1="${28+i*50}" x2="286" y2="${28+i*50}"></line><text class="chart-label" x="0" y="${32+i*50}">${Math.round(max-i*(max-min)/2)}</text>`).join('')}
    <polyline points="${line}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>${points.map(p=>`<circle cx="${pos(p).x}" cy="${pos(p).y}" r="5" fill="var(--blue)" stroke="var(--surface)" stroke-width="3"></circle>`).join('')}${[1,2,3,4].map(w=>`<text class="chart-label" x="${36+(w-1)*82}" y="156" text-anchor="middle">W${w}</text>`).join('')}</svg></div>
    <div class="section-heading"><h3>Week by week</h3><span class="small muted">Quick entries</span></div><table class="week-table"><thead><tr><th>WEEK</th><th>WEIGHT</th><th>REPS</th><th>SETS</th></tr></thead><tbody>${[1,2,3,4].map(w=>{const p=points.find(p=>p.week===w);return `<tr><td class="${w===currentWeek&&trendCycle==='current'?'current-cell':''}">W${w} ${w===4?'<span class="small muted">Deload</span>':''}</td><td>${p?p.weight+' lb':'—'}</td><td>${p?p.reps:'—'}</td><td>${p?p.sets:'—'}</td></tr>`;}).join('')}</tbody></table><p class="detail-info">One quick entry represents an exercise, not individually measured sets. Missing weeks stay blank. Deload performance is part of the plan.</p></section>`;
}
function activityContent() {
  const yearRecords=state.history.filter(r=>r.date.startsWith(String(historyYear)));
  const completed=yearRecords.filter(r=>r.status==='completed'||r.status==='partial');
  const selected=yearRecords.filter(r=>historyMonth===null||Number(r.date.slice(5,7))-1===historyMonth).sort((a,b)=>b.date.localeCompare(a.date));
  const activeDays=new Map();
  for(const record of completed){const ratio=record.exercises.filter(e=>e.done).length/Math.max(1,record.exercises.length);activeDays.set(record.date,Math.max(activeDays.get(record.date)||0,ratio));}
  const monthGrid=Array.from({length:12},(_,m)=>{
    const count=new Date(historyYear,m+1,0).getDate(),offset=(new Date(historyYear,m,1).getDay()+6)%7;
    return `<button class="month-button ${historyMonth===m?'selected':''}" data-action="filter-month" data-month="${m}" aria-label="Filter history to ${monthNames[m]} ${historyYear}" aria-pressed="${historyMonth===m}"><span class="month-name">${monthNames[m]}</span><span class="month-cells">${Array.from({length:offset},()=>'<i></i>').join('')}${Array.from({length:count},(_,i)=>{const date=`${historyYear}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<i class="heat-cell ${activeDays.has(date)?'level'+Math.max(1,Math.ceil(activeDays.get(date)*3)):date>'2026-10-17'?'future':''}" aria-hidden="true"></i>`;}).join('')}</span></button>`;
  }).join('');
  return `<div class="year-controls"><strong>Your consistency</strong><div class="row"><button class="icon-btn" data-action="history-year" data-delta="-1" aria-label="Previous year">${icon('left')}</button><span class="small numeric">${historyYear}</span><button class="icon-btn" data-action="history-year" data-delta="1" aria-label="Next year" ${historyYear>=2026?'disabled':''}>${icon('right')}</button></div></div>
    <div class="stats-strip"><div class="stat-tile"><strong>${completed.length}</strong><span>workouts this year</span></div><div class="stat-tile"><strong>${completed.filter(r=>r.date.slice(5,7)==='10').length}</strong><span>workouts in October</span></div></div><div class="heatmap card">${monthGrid}</div><div class="heat-legend">Less<i></i><i></i><i></i>More exercises completed</div>
    <div class="section-heading history-filter"><h3>${historyMonth===null?'Recent sessions':monthNames[historyMonth]+' sessions'}</h3>${historyMonth!==null?'<button class="text-btn" data-action="clear-month">Show all</button>':'<span class="small muted">Newest first</span>'}</div>
    ${selected.length?selected.map(r=>`<button class="history-row" data-action="history-detail" data-id="${r.id}"><span class="date-box"><span>${monthNames[Number(r.date.slice(5,7))-1]}</span><strong>${Number(r.date.slice(8,10))}</strong></span><span class="trend-main"><strong>${esc(r.dayName)}</strong><span>Cycle ${String(r.cycle).padStart(2,'0')} · Week ${r.week} · ${r.exercises.filter(e=>e.done).length}/${r.exercises.length} exercises</span></span>${r.status==='skipped'?tag('SKIPPED','neutral'):r.status==='partial'?tag('PARTIAL','neutral'):icon('check')}</button>`).join(''):'<div class="empty-state">No sessions in this period.<br>Your next workout will add to your story.</div>'}`;
}
function renderHistoryDetail() {
  const record=state.history.find(r=>r.id===historyId);
  if(!record){screen.innerHTML=pageTitle('Session unavailable');return;}
  const date=new Date(record.date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  screen.innerHTML=`<section data-screen-label="Historical workout snapshot">${pageTitle(esc(record.dayName),date,tag(record.status.toUpperCase(),record.status==='completed'?'green':'neutral'))}<div class="small muted">${esc(record.splitName)} · Cycle ${String(record.cycle).padStart(2,'0')} · Week ${record.week}</div><div class="stats-strip"><div class="stat-tile"><strong>${record.exercises.filter(e=>e.done).length}<span style="display:inline;font-size:16px"> / ${record.exercises.length}</span></strong><span>exercises complete</span></div><div class="stat-tile"><strong class="phase-value">${phases[record.week-1]}</strong><span>training phase</span></div></div><div class="section-heading"><h3>Recorded performance</h3>${icon('lock')}</div><div class="history-sets card">${record.exercises.map(e=>`<div class="snapshot-row"><div><strong>${esc(e.name)}</strong><div class="small muted">${e.sets} prescribed sets</div></div><span>${e.done?`${e.weight} lb × ${e.reps}`:'Not completed'}</span></div>`).join('')}</div><p class="detail-info">A snapshot of this exact session. Changes to your current plan do not change this record.</p></section>`;
}

function renderSettings() {
  screen.innerHTML=`<section data-screen-label="Settings">${pageTitle('Make it yours','A plan that fits the way you train.')}<div class="settings-profile card"><div class="avatar">AJ</div><div><strong>Alex Jordan</strong><span>Your personal training space</span></div></div><div class="section-heading"><h3>Training</h3></div><div class="settings-list card"><button class="settings-row" data-action="splits"><span class="setting-icon">${icon('cycle')}</span><span class="trend-main"><strong>Training splits</strong><span>${esc(state.splitName)} · Active</span></span>${icon('right')}</button><button class="settings-row" data-action="edit-current-day"><span class="setting-icon">${icon('edit')}</span><span class="trend-main"><strong>Edit your current plan</strong><span>Days, sections, exercises & targets</span></span>${icon('right')}</button><button class="settings-row" data-action="cycle-options"><span class="setting-icon">${icon('reset')}</span><span class="trend-main"><strong>Cycle ${String(state.cycle).padStart(2,'0')}</strong><span>${completedCount()} of ${state.plan.length*4} sessions trained</span></span>${icon('right')}</button></div>
    <div class="section-heading"><h3>Appearance</h3></div><div class="card"><div class="theme-options"><button class="theme-option ${state.theme==='light'?'selected':''}" data-action="theme" data-theme="light">Light</button><button class="theme-option ${state.theme==='dark'?'selected':''}" data-action="theme" data-theme="dark">Dark</button></div></div>
    <div class="section-heading"><h3>Prototype controls</h3></div><div class="settings-list card"><button class="settings-row" data-action="preview-complete"><span class="setting-icon">${icon('spark')}</span><span class="trend-main"><strong>Preview cycle completion</strong><span>Explore the end-of-cycle experience</span></span>${icon('right')}</button><button class="settings-row" data-action="reset-demo"><span class="setting-icon">${icon('reset')}</span><span class="trend-main"><strong>Reset sample data</strong><span>Return this concept to its starting point</span></span>${icon('right')}</button></div><p class="prototype-note">LIFT · Design study 01<br>Fictional data. Saved locally. Separate from your live app.</p></section>`;
}
function renderSplits() {
  screen.innerHTML=`<section data-screen-label="Training splits">${pageTitle('Your training splits','Build the structure. Then focus on training.')}<div class="split-choice card active"><div class="split-choice-info"><div style="margin-bottom:12px">${tag('ACTIVE SPLIT')}</div><h3>${esc(state.splitName)}</h3><p>${state.plan.length} days · ${state.plan.flatMap(d=>d.exercises).length} exercises · 4-week cycle</p></div><button class="icon-btn" data-action="editor" aria-label="Edit active split">${icon('edit')}</button></div><button class="secondary full" data-action="split-options">${icon('more')} Manage split</button><div class="section-heading"><h3>Add a split</h3></div><div class="settings-list card"><button class="settings-row" data-action="create-split"><span class="setting-icon">${icon('plus')}</span><span class="trend-main"><strong>Build your own</strong><span>Start with a name and training days</span></span>${icon('right')}</button><button class="settings-row" data-action="import-split"><span class="setting-icon">${icon('upload')}</span><span class="trend-main"><strong>Import a split</strong><span>Paste your structured workout plan</span></span>${icon('right')}</button></div>${(state.savedSplits||[]).length?`<div class="section-heading"><h3>Saved splits</h3></div>${state.savedSplits.map(s=>`<div class="split-choice card"><div class="split-choice-info"><h3>${esc(s.name)}</h3><p>${s.plan.length} training days</p></div><button class="text-btn" data-action="activate-split" data-id="${s.id}">Use split ${icon('arrow')}</button><button class="icon-btn" data-action="delete-split" data-id="${s.id}" aria-label="Delete ${esc(s.name)}">${icon('trash')}</button></div>`).join('')}`:''}<p class="detail-info">Switching splits starts a fresh cycle in this concept. Existing sessions remain in Activity.</p></section>`;
}
function renderEditor() {
  if(openDay!==null&&!state.plan.some(d=>d.id===openDay))openDay=state.plan[0]?.id;
  screen.innerHTML=`<section data-screen-label="Split editor">${pageTitle(esc(state.splitName),'Your plan, one training day at a time.',`<button class="icon-btn" data-action="rename-split" aria-label="Rename split">${icon('edit')}</button>`)}<div class="insight-card">${icon('info')}<div><strong>Plan changes apply to future sessions.</strong><p>Workouts already started keep their original prescription.</p></div></div>${state.plan.map((day,i)=>`<article class="editor-day card"><button class="editor-day-header" data-action="toggle-day" data-id="${day.id}" aria-expanded="${openDay===day.id}"><span class="day-label">${String(i+1).padStart(2,'0')}</span><strong>${esc(day.name)}</strong><span class="small muted">${day.exercises.length} exercises</span>${icon(openDay===day.id?'up':'down')}</button>${openDay===day.id?`${day.sections.map(section=>`<div class="editor-section"><div class="editor-section-heading"><span class="eyebrow">${esc(section)}</span><button class="icon-btn" data-action="section-options" data-id="${day.id}" data-section="${esc(section)}" aria-label="Edit ${esc(section)} section">${icon('more')}</button></div>${day.exercises.filter(e=>e.section===section).map((item,index,items)=>`<div class="editor-item"><button class="reorder-button" data-action="move-exercise" data-id="${item.id}" data-day="${day.id}" aria-label="Move ${esc(item.name)} ${index===0?'down':'up'}">${icon(index===0?'down':'up')}</button><span class="trend-main"><strong>${esc(item.name)}</strong><span>${item.sets} sets · ${esc(item.reps)} reps</span></span><button class="icon-btn" data-action="edit-exercise" data-id="${item.id}" data-day="${day.id}" aria-label="Edit ${esc(item.name)}">${icon('edit')}</button></div>`).join('')}<button class="editor-add" data-action="add-exercise" data-id="${day.id}" data-section="${esc(section)}">${icon('plus')} Add exercise</button></div>`).join('')}<div class="editor-day-bottom"><button class="text-btn" data-action="add-section" data-id="${day.id}">${icon('plus')} Add section</button><button class="text-btn" data-action="day-options" data-id="${day.id}">Day options ${icon('more')}</button></div>`:''}</article>`).join('')}<button class="secondary full" data-action="add-day">${icon('plus')} Add training day</button><div class="save-note">${icon('check')} Plan changes saved in this prototype</div></section>`;
}
function renderRecap() {
  const rec=getRecord();if(!rec){navigate('cycle');return;}
  const done=rec.exercises.filter(e=>e.done), improvements=done.filter(e=>Number(e.weight)>e.lastWeight||(Number(e.weight)===e.lastWeight&&Number(e.reps)>e.lastReps));
  const next=nextWorkout();
  screen.innerHTML=`<section data-screen-label="Workout completion recap"><div class="recap-icon">${icon('check')}</div><h2 class="recap-title">Another one in the books.</h2><p class="recap-sub">${esc(rec.dayName)} · Week ${rec.week}<br>${done.length===rec.exercises.length?'You showed up. You did the work.':'Every recorded effort counts.'}</p><div class="stats-strip"><div class="stat-tile"><strong>${done.length}<span style="display:inline;font-size:16px"> / ${rec.exercises.length}</span></strong><span>exercises completed</span></div><div class="stat-tile"><strong>${improvements.length}</strong><span>improved quick entries</span></div></div><div class="history-sets card">${done.map(e=>`<div class="snapshot-row"><div><strong>${esc(e.name)}</strong><div class="small muted">${e.sets} prescribed sets</div></div><span>${e.weight} lb × ${e.reps}</span></div>`).join('')||'<div class="empty-state">No completed exercises recorded.</div>'}</div><div class="recap-next"><span class="eyebrow muted">${next?'Next in your cycle':'The four-week finish line'}</span><strong>${next?esc(next.day.name):'Cycle complete'}</strong><p>${next?`Week ${next.week} · ${phases[next.week-1]}`:'Review your work and begin your next chapter.'}</p></div><div style="height:24px"></div><button class="primary" data-action="${next?'nav':'cycle-summary'}" data-tab="cycle">${next?'Back to your cycle':'Review your cycle'} ${icon('arrow')}</button></section>`;
}
let completionPreview=false;
function renderCycleSummary() {
  const records=Object.values(state.records),total=state.plan.length*4,completed=completionPreview?total:completedCount();
  const results=completionPreview?[{name:'Romanian deadlift',from:'95 lb × 10',to:'110 lb × 10'},{name:'Leg press',from:'180 lb × 12',to:'200 lb × 12'},{name:'Dumbbell bench press',from:'45 lb × 10',to:'50 lb × 10'}]:uniqueExercises().map(e=>{const p=progressEntries(e,'current');return p.length>1?{name:e.name,from:`${p[0].weight} lb × ${p[0].reps}`,to:`${p.at(-1).weight} lb × ${p.at(-1).reps}`}:null;}).filter(Boolean).slice(0,3);
  screen.innerHTML=`<section data-screen-label="Cycle completion summary">${completionPreview?'<span class="tag">COMPLETION PREVIEW · ILLUSTRATIVE RESULTS</span>':''}<div class="recap-icon">${icon('spark')}</div><h2 class="recap-title">Four weeks.<br>A stronger foundation.</h2><p class="recap-sub">${esc(state.splitName)} · Cycle ${String(state.cycle).padStart(2,'0')}<br>Take a moment to see how far you’ve come.</p><div class="stats-strip"><div class="stat-tile"><strong>${completed}<span style="display:inline;font-size:16px"> / ${total}</span></strong><span>sessions trained</span></div><div class="stat-tile"><strong>${completionPreview?4:new Set(records.filter(r=>r.status==='completed').map(r=>r.week)).size}</strong><span>weeks with training</span></div></div><div class="section-heading"><h3>A few things to take with you</h3></div><div class="history-sets card">${results.map(r=>`<div class="snapshot-row"><div><strong>${esc(r.name)}</strong><div class="small muted">${r.from} → <span style="color:var(--green)">${r.to}</span></div></div>${icon('progress')}</div>`).join('')||'<p class="empty-state">Complete more sessions to compare your results.</p>'}</div><p class="detail-info">Your previous cycle stays available in Activity. Keep the same split, or adjust your plan before the next one.</p><div class="sheet-actions"><button class="primary" data-action="new-cycle">Start next cycle ${icon('arrow')}</button><button class="secondary full" data-action="editor">${icon('edit')} Adjust the plan first</button></div></section>`;
}

function openSession(week,dayId) {state.selected={week,dayId};showCompletedExercises=false;const rec=ensureRecord(week,dayId);openExercise=rec.exercises.find(e=>!e.done)?.id||rec.exercises[0]?.id;save();tab='train';page='train';closeSheet();render(true);}
function sessionPreview(week,dayId) {const day=state.plan.find(d=>d.id===dayId),status=statusOf(week,dayId);showSheet(`${day.name} · Week ${week}`,`<p class="sheet-description">${esc(day.focus)}<br>${day.exercises.length} exercises · ${phases[week-1]} phase</p>${tag(status.toUpperCase(),status==='completed'?'green':'')}<div class="sheet-actions"><button class="primary" data-action="open-session" data-week="${week}" data-id="${dayId}">${status==='partial'?'Resume workout':status==='completed'?'Review session':'Open workout'} ${icon('arrow')}</button>${status==='pending'||status==='partial'?`<button class="secondary full" data-action="skip-session" data-week="${week}" data-id="${dayId}">Skip this session</button>`:''}</div>`);}
function upsertHistory(rec) {const snapshot=structuredClone({...rec,cycle:state.cycle,splitName:state.splitName,date:rec.date||'2026-10-17'});rec.date=snapshot.date;const index=state.history.findIndex(r=>r.id===rec.id);if(index>=0)state.history[index]=snapshot;else state.history.push(snapshot);}
function completeExercise(id) {
  const rec=getRecord(),item=rec.exercises.find(e=>e.id===id);
  const weight=Number(item.weight),reps=Number(item.reps);
  if(item.weight===''||!Number.isFinite(weight)||weight<0||item.reps===''||!Number.isInteger(reps)||reps<1||reps>100){toast('Enter a valid weight and 1–100 reps first.');return;}
  item.weight=weight;item.reps=reps;item.done=true;
  rec.status=rec.status==='completed'?'completed':'partial';
  if(rec.status==='completed')upsertHistory(rec);
  openExercise=rec.exercises.find(e=>!e.done)?.id||id;
  save();render();toast(`${item.name} saved`);
  setTimeout(()=>{const node=screen.querySelector('.exercise-card.is-open');node?.scrollIntoView({behavior:'smooth',block:'nearest'});},20);
}
function finishWorkout() {
  const rec=getRecord(),count=rec.exercises.filter(e=>e.done).length;
  if(!count){toast('Complete an exercise first, or skip this session from Change session.');return;}
  if(count<rec.exercises.length){showSheet('Finish this workout?',`<p class="sheet-description">You’ve completed ${count} of ${rec.exercises.length} exercises. The remaining exercises will stay incomplete. Your recorded results are preserved.</p><div class="sheet-actions"><button class="primary" data-action="confirm-finish">Save partial workout</button><button class="secondary full" data-action="close-sheet">Keep training</button></div>`);return;}
  confirmFinish();
}
function confirmFinish() {const rec=getRecord();rec.status=rec.exercises.every(e=>e.done)?'completed':'partial';rec.finished=true;upsertHistory(rec);save();closeSheet();page='recap';render(true);}
function exerciseForm(dayId,section,id=null) {
  const item=state.plan.find(d=>d.id===dayId).exercises.find(e=>e.id===id);
  showSheet(item?'Edit exercise':'Add exercise',`<form id="exercise-form" data-day="${dayId}" data-section="${esc(section)}" data-id="${id||''}"><label class="form-field">Exercise name<input name="name" required maxlength="80" value="${esc(item?.name||'')}" placeholder="e.g. Seated leg curl"></label><div class="form-pair"><label class="form-field">Prescribed sets<input name="sets" type="number" min="1" max="12" required value="${item?.sets||3}"></label><label class="form-field">Target reps<input name="reps" required maxlength="30" value="${esc(item?.reps||'8–12')}"></label></div><p class="form-error" id="form-error"></p><div class="sheet-actions"><button type="submit" class="primary">${item?'Save exercise':'Add exercise'}</button>${item?`<button type="button" class="secondary danger" data-action="delete-exercise" data-day="${dayId}" data-id="${id}">${icon('trash')} Remove from plan</button>`:''}</div></form>`);
}
function textForm(title,label,value,kind,extra={}) {showSheet(title,`<form id="text-form" data-kind="${kind}" data-id="${extra.id||''}" data-section="${esc(extra.section||'')}"><label class="form-field">${label}<input name="value" required maxlength="70" value="${esc(value)}" placeholder="${esc(extra.placeholder||'')}"></label><p class="form-error" id="form-error"></p><button type="submit" class="primary">Save ${icon('check')}</button></form>`);}
function confirmAction(title,description,action,attributes='') {showSheet(title,`<p class="sheet-description">${description}</p><div class="sheet-actions"><button class="primary" data-action="${action}" ${attributes}>Confirm ${icon('check')}</button><button class="secondary full" data-action="close-sheet">Cancel</button></div>`);}
function startNewCycle() {
  state.archivedCycles.push({cycle:state.cycle,splitName:state.splitName});
  for(const rec of Object.values(state.records))if(rec.exercises.some(e=>e.done))upsertHistory(rec);
  state.records={};state.cycle++;state.selected={week:1,dayId:state.plan[0].id};completionPreview=false;save();closeSheet();navigate('cycle');toast('A fresh cycle. Your history is preserved.');
}

document.addEventListener('input',event=>{
  const input=event.target;
  if(input.matches('[data-log]')){const item=getSelectedExercise(input.dataset.id);item[input.dataset.log]=input.value;save();}
  if(input.id==='exercise-search'){exerciseSearch=input.value;document.getElementById('trend-rows').innerHTML=trendRows();}
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const a=button.dataset.action,d=button.dataset;
  if(a==='dismiss'){if(event.target===button)closeSheet();return;}
  if(a==='close-sheet'){closeSheet();return;}
  if(a==='nav'){navigate(d.tab);return;}
  if(a==='back'){closeSheet();page=page==='editor'?'splits':page==='splits'?'settings':['recap','cycle-summary'].includes(page)?'cycle':'progress';tab=['splits','settings'].includes(page)?'settings':page==='cycle'?'cycle':'progress';completionPreview=false;render(true);return;}
  if(a==='resume'){const next=nextWorkout();if(next)openSession(next.week,next.day.id);return;}
  if(a==='session-preview'){sessionPreview(Number(d.week),d.id);return;}
  if(a==='open-session'){openSession(Number(d.week),d.id);return;}
  if(a==='session-picker'){showSheet('Choose your session',`<p class="sheet-description">Week ${state.selected.week} · ${phases[state.selected.week-1]}. Browse all four weeks from your Cycle dashboard.</p>${state.plan.map(day=>`<button class="session-picker-row" data-action="open-session" data-week="${state.selected.week}" data-id="${day.id}"><span class="trend-main"><strong>${esc(day.name)}</strong><span>${esc(day.focus)}</span></span>${tag(statusOf(state.selected.week,day.id).toUpperCase(),'neutral')}${icon('right')}</button>`).join('')}<button class="text-btn full" data-action="skip-session" data-week="${state.selected.week}" data-id="${state.selected.dayId}">Skip selected session</button>`);return;}
  if(a==='toggle-exercise'){openExercise=openExercise===d.id?null:d.id;render();return;}
  if(a==='toggle-completed'){showCompletedExercises=!showCompletedExercises;render();return;}
  if(a==='use-last'){const e=getSelectedExercise(d.id);e.weight=e.lastWeight;e.reps=e.lastReps;save();render();toast('Last values copied. Adjust for today.');return;}
  if(a==='complete-exercise'){completeExercise(d.id);return;}
  if(a==='exercise-options'){const e=getSelectedExercise(d.id);showSheet('Exercise options',`${e.done?`<button class="option-row" data-action="undo-exercise" data-id="${d.id}">${icon('reset')} Mark as incomplete</button>`:''}<button class="option-row" data-action="substitute" data-id="${d.id}">${icon('swap')} Substitute for this session</button><button class="option-row" data-action="trend-detail" data-id="${d.id}">${icon('progress')} View exercise progress</button>`);return;}
  if(a==='undo-exercise'){const rec=getRecord(),e=getSelectedExercise(d.id);e.done=false;rec.status=rec.exercises.some(e=>e.done)?'partial':'pending';if(rec.finished)upsertHistory(rec);save();closeSheet();render();toast('Completion undone. Your values are kept.');return;}
  if(a==='substitute'){const e=getSelectedExercise(d.id);showSheet('Substitute exercise',`<p class="sheet-description">A change for this session only. Your training plan stays the same.</p>${['Hack squat','Dumbbell Romanian deadlift','Lying leg curl','Goblet squat','Cable pull-through',e.originalName].filter((v,i,arr)=>arr.indexOf(v)===i&&v!==e.name).map(name=>`<button class="option-row" data-action="apply-substitute" data-id="${d.id}" data-name="${esc(name)}">${icon('swap')}${esc(name)}${name===e.originalName?' · Original':''}</button>`).join('')}`);return;}
  if(a==='apply-substitute'){const e=getSelectedExercise(d.id);e.name=d.name;e.weight='';e.reps='';e.done=false;getRecord().status='partial';save();closeSheet();render();toast('Session substitution applied. Enter today’s result.');return;}
  if(a==='finish'){finishWorkout();return;}
  if(a==='confirm-finish'){confirmFinish();return;}
  if(a==='recap'){page='recap';render(true);return;}
  if(a==='skip-session'){confirmAction('Skip this session?','It will be marked skipped, not completed. Any quick entries you have already saved will be retained.','confirm-skip',`data-week="${d.week}" data-id="${d.id}"`);return;}
  if(a==='confirm-skip'){const rec=ensureRecord(Number(d.week),d.id);rec.status='skipped';upsertHistory(rec);save();closeSheet();navigate('cycle');toast('Session skipped. Your cycle is ready for what’s next.');return;}
  if(a==='progress-view'){progressView=d.view;render(true);return;}
  if(a==='trend-detail'){selectedTrend=d.id;trendCycle='current';closeSheet();tab='progress';page='exercise-detail';render(true);return;}
  if(a==='trend-cycle'){showSheet('Compare a cycle',`<button class="option-row" data-action="select-trend-cycle" data-value="current">${icon('cycle')} Cycle ${String(state.cycle).padStart(2,'0')} · Current</button><button class="option-row" data-action="select-trend-cycle" data-value="previous">${icon('calendar')} Cycle 02 · Previous</button>`);return;}
  if(a==='select-trend-cycle'){trendCycle=d.value;closeSheet();render();return;}
  if(a==='history-year'){historyYear+=Number(d.delta);historyMonth=null;render();return;}
  if(a==='filter-month'){historyMonth=historyMonth===Number(d.month)?null:Number(d.month);render();return;}
  if(a==='clear-month'){historyMonth=null;render();return;}
  if(a==='history-detail'){historyId=d.id;page='history-detail';render(true);return;}
  if(a==='theme'){state.theme=d.theme;save();render();return;}
  if(a==='splits'){tab='settings';page='splits';closeSheet();render(true);return;}
  if(a==='editor'||a==='edit-current-day'){tab='settings';page='editor';if(a==='edit-current-day')openDay=state.selected.dayId;closeSheet();render(true);return;}
  if(a==='toggle-day'){openDay=openDay===d.id?null:d.id;render();return;}
  if(a==='edit-exercise'){const e=state.plan.find(day=>day.id===d.day).exercises.find(e=>e.id===d.id);exerciseForm(d.day,e.section,d.id);return;}
  if(a==='add-exercise'){exerciseForm(d.id,d.section);return;}
  if(a==='delete-exercise'){confirmAction('Remove exercise?','This removes the exercise from future sessions. Existing session snapshots and history are kept.','confirm-delete-exercise',`data-day="${d.day}" data-id="${d.id}"`);return;}
  if(a==='confirm-delete-exercise'){const day=state.plan.find(day=>day.id===d.day);day.exercises=day.exercises.filter(e=>e.id!==d.id);save();closeSheet();render();toast('Exercise removed from future sessions.');return;}
  if(a==='move-exercise'){const day=state.plan.find(day=>day.id===d.day),index=day.exercises.findIndex(e=>e.id===d.id),e=day.exercises[index],siblings=day.exercises.filter(x=>x.section===e.section);if(siblings.length<2){toast('Add another exercise to reorder this section.');return;}const target=siblings.indexOf(e)===0?siblings[1]:siblings[siblings.indexOf(e)-1],other=day.exercises.indexOf(target);[day.exercises[index],day.exercises[other]]=[day.exercises[other],day.exercises[index]];save();render();toast('Exercise order saved.');return;}
  if(a==='rename-split'){textForm('Rename your split','Split name',state.splitName,'rename-split');return;}
  if(a==='add-section'){textForm('Add a section','Section name','','add-section',{id:d.id,placeholder:'e.g. Accessories'});return;}
  if(a==='section-options'){showSheet(d.section,`<button class="option-row" data-action="rename-section" data-id="${d.id}" data-section="${esc(d.section)}">${icon('edit')} Rename section</button><button class="option-row danger" data-action="delete-section" data-id="${d.id}" data-section="${esc(d.section)}">${icon('trash')} Remove section and its exercises</button>`);return;}
  if(a==='rename-section'){textForm('Rename section','Section name',d.section,'rename-section',{id:d.id,section:d.section});return;}
  if(a==='delete-section'){confirmAction('Remove this section?','Its exercises will also be removed from future sessions. Historical records are preserved.','confirm-delete-section',`data-id="${d.id}" data-section="${esc(d.section)}"`);return;}
  if(a==='confirm-delete-section'){const day=state.plan.find(day=>day.id===d.id);day.sections=day.sections.filter(s=>s!==d.section);day.exercises=day.exercises.filter(e=>e.section!==d.section);save();closeSheet();render();return;}
  if(a==='add-day'){textForm('Add training day','Day name','','add-day',{placeholder:'e.g. Upper C'});return;}
  if(a==='day-options'){showSheet('Training day options',`<button class="option-row" data-action="rename-day" data-id="${d.id}">${icon('edit')} Rename day</button><button class="option-row danger" data-action="delete-day" data-id="${d.id}" ${state.plan.length===1?'disabled':''}>${icon('trash')} Remove day from plan</button>`);return;}
  if(a==='rename-day'){textForm('Rename training day','Day name',state.plan.find(day=>day.id===d.id).name,'rename-day',{id:d.id});return;}
  if(a==='delete-day'){confirmAction('Remove training day?','This removes the day from your plan. Saved session snapshots remain in Activity.','confirm-delete-day',`data-id="${d.id}"`);return;}
  if(a==='confirm-delete-day'){for(const rec of Object.values(state.records))if(rec.dayId===d.id&&rec.exercises.some(e=>e.done))upsertHistory(rec);state.plan=state.plan.filter(day=>day.id!==d.id);if(state.selected.dayId===d.id)state.selected.dayId=state.plan[0].id;save();closeSheet();render();return;}
  if(a==='split-options'){showSheet('Manage your split',`<button class="option-row" data-action="editor">${icon('edit')} Edit days and exercises</button><button class="option-row" data-action="rename-split">${icon('edit')} Rename split</button><button class="option-row" data-action="export-split">${icon('upload')} Export plan text</button>`);return;}
  if(a==='export-split'){const text=`Split: ${state.splitName}\n\n`+state.plan.map(day=>`Day: ${day.name} | ${day.name} | ${day.focus}\n`+day.sections.map(s=>`Section: ${s}\n`+day.exercises.filter(e=>e.section===s).map(e=>`Exercise: ${e.name} | ${e.sets} | ${e.reps}`).join('\n')).join('\n')).join('\n\n');showSheet('Your plan as text',`<p class="sheet-description">Copy this text to keep a portable version of your plan.</p><textarea class="import-area" readonly aria-label="Exported plan">${esc(text)}</textarea><button class="text-btn" data-action="copy-export">Copy to clipboard ${icon('upload')}</button>`);return;}
  if(a==='copy-export'){const area=overlay.querySelector('textarea');if(navigator.clipboard)navigator.clipboard.writeText(area.value).then(()=>toast('Plan copied.')).catch(()=>{area.select();toast('Select and copy the plan text.');});else{area.select();toast('Select and copy the plan text.');}return;}
  if(a==='create-split'){textForm('Build a new split','Split name','','create-split',{placeholder:'e.g. Full body'});return;}
  if(a==='import-split'){showSheet('Import your split',`<p class="sheet-description">Use the same structured format as your existing LIFT plans.</p><form id="import-form"><label class="form-field">Plan text<textarea class="import-area" name="plan" required placeholder="Split: Full body&#10;Day: Day 1 | Full body A | Strength&#10;Section: Main lifts&#10;Exercise: Back squat | 3 | 6–8"></textarea></label><p class="form-error" id="form-error"></p><button class="primary" type="submit">Import split ${icon('arrow')}</button></form>`);return;}
  if(a==='activate-split'){confirmAction('Use this split?','A new cycle will begin with this split. Your current results will remain in Activity.','confirm-activate-split',`data-id="${d.id}"`);return;}
  if(a==='confirm-activate-split'){const s=state.savedSplits.find(s=>s.id===d.id);for(const rec of Object.values(state.records))if(rec.exercises.some(e=>e.done))upsertHistory(rec);const old={id:uid(),name:state.splitName,plan:structuredClone(state.plan)};state.savedSplits=state.savedSplits.filter(s=>s.id!==d.id);state.savedSplits.push(old);state.plan=structuredClone(s.plan);state.splitName=s.name;state.records={};state.cycle++;state.selected={week:1,dayId:state.plan[0].id};save();closeSheet();navigate('cycle');toast('New split. Fresh cycle.');return;}
  if(a==='delete-split'){confirmAction('Remove saved split?','Your recorded sessions will stay in Activity.','confirm-delete-split',`data-id="${d.id}"`);return;}
  if(a==='confirm-delete-split'){state.savedSplits=state.savedSplits.filter(s=>s.id!==d.id);save();closeSheet();render();return;}
  if(a==='cycle-options'){showSheet('Your current cycle',`<p class="sheet-description">Cycle ${state.cycle} · ${completedCount()} of ${state.plan.length*4} sessions trained. Starting another cycle keeps your history and training split.</p><button class="option-row" data-action="cycle-summary">${icon('progress')} Review cycle so far</button><button class="option-row" data-action="new-cycle">${icon('reset')} Start next cycle</button>`);return;}
  if(a==='preview-complete'){completionPreview=true;page='cycle-summary';render(true);return;}
  if(a==='cycle-summary'){completionPreview=false;closeSheet();tab='cycle';page='cycle-summary';render(true);return;}
  if(a==='new-cycle'){confirmAction('Start your next cycle?',`${completionPreview?'You are viewing sample completion results. ':''}This starts Week 1 of Cycle ${state.cycle+1}. Your actual completed entries and history will be preserved.`,'confirm-new-cycle');return;}
  if(a==='confirm-new-cycle'){startNewCycle();return;}
  if(a==='reset-demo'){confirmAction('Reset this prototype?','This restores the original fictional data and clears edits made in this concept.','confirm-reset-demo');return;}
  if(a==='confirm-reset-demo'){state=initialState();save();completionPreview=false;openExercise='lb3';closeSheet();navigate('cycle');toast('Sample data restored.');}
});

document.addEventListener('submit',event=>{
  if(!['exercise-form','text-form','import-form'].includes(event.target.id))return;
  event.preventDefault();const form=event.target, data=new FormData(form),error=form.querySelector('#form-error');
  const fail=message=>{error.textContent=message;};
  if(form.id==='exercise-form'){
    const name=data.get('name').trim(),sets=Number(data.get('sets')),reps=data.get('reps').trim();
    if(!name||!reps||!Number.isInteger(sets)||sets<1||sets>12){fail('Enter a name, target reps, and 1–12 sets.');return;}
    const day=state.plan.find(d=>d.id===form.dataset.day),item=day.exercises.find(e=>e.id===form.dataset.id);
    if(item)Object.assign(item,{name,sets,reps});else day.exercises.push(ex(uid(),name,sets,reps,0,0,form.dataset.section));
  }
  if(form.id==='text-form'){
    const value=data.get('value').trim(),kind=form.dataset.kind;
    if(!value){fail('Please enter a name.');return;}
    const day=state.plan.find(day=>day.id===form.dataset.id);
    if(kind==='rename-split')state.splitName=value;
    if(kind==='rename-day')day.name=value;
    if(kind==='add-day'){const id=uid();state.plan.push({id,name:value,focus:'Custom training day',sections:['Main lifts'],exercises:[]});openDay=id;}
    if(kind==='add-section'){if(day.sections.includes(value)){fail('This section already exists in this day.');return;}day.sections.push(value);}
    if(kind==='rename-section'){if(value!==form.dataset.section&&day.sections.includes(value)){fail('This section name already exists.');return;}day.sections=day.sections.map(s=>s===form.dataset.section?value:s);day.exercises.forEach(e=>{if(e.section===form.dataset.section)e.section=value;});}
    if(kind==='create-split'){state.savedSplits=state.savedSplits||[];state.savedSplits.push({id:uid(),name:value,plan:[{id:uid(),name:'Day 1',focus:'Your first training day',sections:['Main lifts'],exercises:[]}]});}
  }
  if(form.id==='import-form'){
    const lines=data.get('plan').split('\n').map(s=>s.trim()).filter(Boolean);let name='',plan=[],day=null,section='';
    for(const line of lines){
      if(line.startsWith('Split:'))name=line.slice(6).trim();
      else if(line.startsWith('Day:')){const parts=line.slice(4).split('|').map(s=>s.trim());day={id:uid(),name:parts[1]||parts[0],focus:parts[2]||'',sections:[],exercises:[]};plan.push(day);section='';}
      else if(line.startsWith('Section:')&&day){section=line.slice(8).trim();if(!section){fail('Sections need a name.');return;}day.sections.push(section);}
      else if(line.startsWith('Exercise:')&&day&&section){const parts=line.slice(9).split('|').map(s=>s.trim()),sets=Number(parts[1]);if(!parts[0]||!Number.isInteger(sets)||sets<1||sets>12||!parts[2]){fail('Use Exercise: Name | Sets (1–12) | Reps.');return;}day.exercises.push(ex(uid(),parts[0],sets,parts[2],0,0,section));}
      else{fail(`Could not read: ${line}. Use Split, Day, Section, and Exercise lines in that order.`);return;}
    }
    if(!name||!plan.length||!plan.every(d=>d.name)){fail('Include a split name and at least one named training day.');return;}
    state.savedSplits=state.savedSplits||[];state.savedSplits.push({id:uid(),name,plan});
  }
  save();closeSheet();render();toast(form.id==='import-form'?'Split imported. Select Use split to begin.':'Changes saved to this prototype.');
});
document.addEventListener('keydown',event=>{
  if(!overlay.children.length)return;
  if(event.key==='Escape'){closeSheet();return;}
  if(event.key==='Tab'){
    const items=[...overlay.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]')];
    if(!items.length)return;
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay.querySelector('.sheet'))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
render();
