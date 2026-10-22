// UI/state regression tests with test-only DOM and API acknowledgements.
// No fixture, transport shim, or mock is loaded by the production app.
// Run: node --test tests/redesign/frontend.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(){
  const nodes=new Map(),events=new Map(),storage=new Map();
  let nextId=0;
  function element(){return {innerHTML:'',textContent:'',dataset:{},children:[],classList:{add(){},remove(){}},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},append(){},focus(){},insertAdjacentHTML(){},contains(){return false;}};}
  const document={documentElement:element(),getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},hidden:false,activeElement:{matches(){return false;}}};
  const context=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setInterval(){},setTimeout(){},clearTimeout(){},console,crypto:{randomUUID(){return `test-id-${++nextId}`;}},AbortSignal,AbortController,Date,structuredClone,FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name];}}});
  const source=fs.readFileSync(`${__dirname}/../../public/app.js`,'utf8').replace(/boot\(\);\s*$/,'');
  vm.runInContext(fs.readFileSync(`${__dirname}/../../public/trends.js`,'utf8'),context);
  vm.runInContext(source,context);
  vm.runInContext(`state={user:{id:'u',username:'test'},cycle:1,activeRoutineId:'r',planVersion:'version-1',splitName:'Test plan',theme:'light',plan:[{id:'d',name:'Test day',focus:'Test focus',sections:['Main'],exercises:[{id:'e',name:'Test exercise',sets:3,reps:'8–10',section:'Main',weight:null,lastReps:null}]}],records:{},history:[],savedSplits:[],selected:{week:1,dayId:'d'}};`,context);
  return {run:code=>vm.runInContext(code,context),nodes,events,context,storage,element};
}

test('view-only prescriptions have no timer, id, completed results, or invented previous values',()=>{
  const h=harness();
  assert.equal(h.run('createRecord(state.plan[0],1).id'),null);
  assert.equal(h.run('createRecord(state.plan[0],1).exercises[0].lastWeight'),null);
  assert.equal(h.run('createRecord(state.plan[0],1).exercises[0].weight'),'');
  assert.equal(h.run('createRecord(state.plan[0],1).startedAt'),undefined);
});
test('heatmap today uses New York day after UTC midnight, including month and year boundaries',()=>{
  const h=harness();
  h.context.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-01-01T01:00:00Z']));}};
  assert.equal(h.run('calendarDate()'),'2025-12-31');
  assert.equal(h.run("calendarDate(new Date('2026-07-01T04:30:00Z'))"),'2026-07-01');
  h.run("historyYear=2025;state.history=[{id:'s',date:'2025-12-31',week:1,cycle:1,exercises:[{done:true}]}]");
  const html=h.run('activityContent()');
  assert.match(html,/heat-cell recorded/);
  assert.match(html,/<strong>1<\/strong><span>workouts in Dec/);
  assert.match(html,/aria-label="Next year" disabled/);
});
test('a fully logged but unfinished session still has a timer and needs explicit finish',()=>{
  const h=harness();
  assert.equal(h.run("isFinished({status:'completed',finished:false})"),false);
  assert.equal(h.run("isFinished({status:'partial',finished:true})"),true);
});
test('last exercise stays behind Review, with session-only add above future plan editing',()=>{
  const h=harness();
  h.run("state.records['1:d']={...createRecord(state.plan[0],1),id:'s',startedAt:'2026-10-17T12:00:00Z'};Object.assign(getRecord().exercises[0],{done:true,weight:20,reps:10});page='train';render()");
  let html=h.nodes.get('screen').innerHTML;
  assert.match(html,/data-action="toggle-completed" aria-expanded="false"/);
  assert.doesNotMatch(html,/data-exercise="e"/);
  assert.match(h.nodes.get('workout-action').innerHTML,/class="primary" data-action="finish"/);
  assert.ok(html.indexOf('data-action="add-session-exercise"')<html.indexOf('data-action="edit-current-day"'));
  assert.match(html,/Edit plan for future workouts/);
  h.run('showCompletedExercises=true;render()');
  assert.match(h.nodes.get('screen').innerHTML,/data-exercise="e"/);
  h.run('getRecord().finished=true;render()');
  html=h.nodes.get('screen').innerHTML;
  assert.match(html,/data-exercise="e"/);
  assert.doesNotMatch(html,/data-action="add-session-exercise"/);
});
test('session add form uses existing UI components and leaves optional targets unspecified',()=>{
  const h=harness();
  h.nodes.get('overlay-root').querySelector=selector=>selector==='.sheet'?{focus(){},insertAdjacentHTML(){}}:null;
  h.run("state.records['1:d']={...createRecord(state.plan[0],1),id:'s',startedAt:'2026-10-17T12:00:00Z'};sessionExerciseForm()");
  const html=h.nodes.get('overlay-root').innerHTML;
  assert.match(html,/id="session-exercise-form"/);
  assert.match(html,/class="form-pair"/);
  assert.match(html,/Target reps \(optional\)/);
  assert.match(html,/Extra work for this workout only/);
  assert.doesNotMatch(h.run("exerciseCard({...getRecord().exercises[0],targetReps:''},getRecord())"),/8–10 reps/);
});
test('next workout advances past finished partial, prioritizing unfinished partial in the week',()=>{
  const h=harness();
  h.run("state.plan.push({...state.plan[0],id:'d2'});state.records['1:d2']={status:'partial',finished:false};");
  assert.equal(h.run('nextWorkout().day.id'),'d2');
  h.run("state.records['1:d2'].finished=true");
  assert.equal(h.run('nextWorkout().day.id'),'d');
});
test('progress uses real done values, excludes blanks, and keeps historical substituted exercise names',()=>{
  const h=harness();
  h.run(`state.history=[{id:'history',routineId:'r',cycle:1,week:1,status:'partial',exercises:[{id:'old',name:'Substituted',weight:20,reps:8,done:true,sets:3},{name:'Test exercise',weight:50,reps:10,done:false}]}];`);
  assert.equal(h.run("uniqueExercises().some(e=>e.name==='Substituted')"),true);
  assert.equal(h.run("progressEntries({name:'Substituted'}).length"),1);
  assert.equal(h.run("progressEntries({name:'Test exercise'}).length"),0);
});
test('Cycle renders real zero state and separate phase guidance',()=>{
  const h=harness();h.run('render()');
  const html=h.nodes.get('screen').innerHTML;
  assert.match(html,/<strong>0<\/strong> of 4/);
  assert.match(html,/<\/article>\s*<div class="phase-note">/);
  assert.doesNotMatch(html,/DEMO|fictional|Alex Jordan/);
});
test('Progress defaults to Activity, then trends; detail return retains trends',()=>{
  const h=harness();h.run("page='progress';render()");
  assert.match(h.nodes.get('screen').innerHTML,/data-view="activity">Activity<\/button><button/);
  assert.equal(h.run('progressView'),'activity');
  h.run("progressView='trends';page='exercise-detail';render();page='progress';render()");
  assert.equal(h.run('progressView'),'trends');
});
test('Train has explicit Start, null previous values are em dash, no view-only timer',()=>{
  const h=harness();h.run("page='train';render()");
  assert.match(h.nodes.get('screen').innerHTML,/— lb/);
  assert.match(h.nodes.get('workout-action').innerHTML,/Start workout/);
  assert.equal(h.run("timerMarkup({expiresAt:null,finished:false})"),'');
});
test('timer markup only exists for started unfinished sessions',()=>{
  const h=harness();
  assert.match(h.run("timerMarkup({startedAt:new Date(Date.now()).toISOString(),expiresAt:'2030-01-01',finished:false})"),/Time spent.*role="timer".*00:00.*\/ 90 min/);
  assert.equal(h.run("timerMarkup({expiresAt:'2030-01-01',finished:false})"),'');
  assert.equal(h.run("timerMarkup({startedAt:'not a timestamp',expiresAt:'2030-01-01',finished:false})"),'');
  assert.equal(h.run("timerMarkup({startedAt:'2026-10-17',expiresAt:'2030-01-01',finished:true})"),'');
});
test('settings uses actual identity and contains no demo controls',()=>{
  const h=harness();h.run("page='settings';render()");
  const html=h.nodes.get('screen').innerHTML;
  assert.match(html,/<strong>test<\/strong>/);
  assert.doesNotMatch(html,/reset-demo|preview-complete|Prototype controls/);
});
test('elapsed timer uses persisted start plus server clock correction, clamps negatives and caps at 90 minutes',()=>{
  const h=harness();
  h.context.Date=class extends Date{static now(){return Date.parse('2026-10-17T12:00:00Z');}};
  h.run("serverOffset=30000;state.records['1:d']={id:'s',startedAt:'2026-10-17T11:59:30Z',expiresAt:'2026-10-17T13:29:30Z',finished:false};tick()");
  assert.equal(h.nodes.get('countdown').textContent,'01:00');
  assert.match(h.run('timerMarkup(getRecord())'),/>01:00<\/strong>/);
  h.run('serverOffset=-60000;tick()');
  assert.equal(h.nodes.get('countdown').textContent,'00:00');
  h.run("serverOffset=0;state.records['1:d'].startedAt='2026-10-17T10:00:00Z';tick()");
  assert.equal(h.nodes.get('countdown').textContent,'90:00');
  h.run('serverOffset=Infinity;tick()');assert.equal(h.nodes.get('countdown').textContent,'90:00');
  assert.equal(h.run('getRecord().expiresAt'),'2026-10-17T13:29:30Z');
  assert.equal(h.run('getRecord().finished'),false);
  const parent={hidden:false};h.nodes.get('countdown').parentElement=parent;
  h.run('getRecord().finished=true;tick()');assert.equal(parent.hidden,true);
  h.run("getRecord().finished=false;getRecord().startedAt=null;tick()");assert.equal(parent.hidden,true);
  assert.equal(h.run('getRecord().startedAt'),null);
});
test('pending timeout recap does not overwrite the selected next session',()=>{
  const h=harness();
  h.run("state.records['1:d']={id:'expired',week:1,dayId:'d',dayName:'Test day',status:'partial',finished:true,finishReason:'timeout',exercises:[]};pendingTimeoutId='expired';state.selected={week:2,dayId:'d'};render()");
  assert.equal(h.run('page'),'recap');
  assert.equal(h.run('state.selected.week'),2);
  assert.equal(h.run('recapRecord().id'),'expired');
});
test('an empty plan offers configuration, not an invented cycle completion',()=>{
  const h=harness();h.run('state.plan=[];render()');
  assert.match(h.nodes.get('screen').innerHTML,/No training days yet/);
  assert.doesNotMatch(h.nodes.get('screen').innerHTML,/Cycle complete/);
});
test('write queue runs jobs serially without starting independent writes',async()=>{
  const h=harness();
  const result=await h.run("(async()=>{const order=[];const first=enqueue(async()=>{order.push('first-start');await Promise.resolve();order.push('first-end');});const second=enqueue(async()=>{order.push('second');});await Promise.all([first,second]);return order.join(',');})()");
  assert.equal(result,'first-start,first-end,second');
});

function click(h,action,extra={}){
  const button={dataset:{action,...extra},disabled:false};
  return h.events.get('click')[0]({target:{closest:()=>button}});
}
function startedFixture(h){
  h.run("user={id:'u',username:'test'};state.records['1:d']={...createRecord(state.plan[0],1),id:'s',routineId:'r',cycle:1,startedAt:'2026-10-17T12:00:00Z'};");
}

test('main-nav Progress re-entry resets Activity, actual detail Back retains trends',async()=>{
  const h=harness();
  h.run("page='exercise-detail';tab='progress';progressView='trends'");
  await click(h,'back');assert.equal(h.run('progressView'),'trends');
  await click(h,'nav',{tab:'settings'});
  await click(h,'nav',{tab:'progress'});
  assert.equal(h.run('progressView'),'activity');
  assert.match(h.nodes.get('screen').innerHTML,/class="active" data-action="progress-view" data-view="activity"/);
});

test('missing completed results stay em dash in compact rows, recap and exact history',()=>{
  const h=harness();startedFixture(h);
  h.run("Object.assign(getSelectedExercise('e'),{done:true,weight:'',reps:null});");
  assert.match(h.run("exerciseCard(getSelectedExercise('e'),getRecord())"),/— lb × —/);
  h.run("page='recap';render()");assert.match(h.nodes.get('screen').innerHTML,/— lb × —/);
  h.run("state.history=[{...getRecord(),date:'2026-10-17',status:'completed'}];historyId='s';page='history-detail';render()");
  assert.match(h.nodes.get('screen').innerHTML,/— lb × —/);
  assert.equal(h.run("performanceText({weight:0,reps:8})"),'0 lb × 8');
  assert.equal(h.run("hasRecordedResult({weight:null,reps:8})"),false);
});

test('same-numbered cycles are isolated by routine; removed exercise history remains selectable',()=>{
  const h=harness();
  h.run(`state.history=[
    {id:'a',routineId:'r',cycle:1,splitName:'Active',week:1,exercises:[{name:'Removed',done:true,weight:20,reps:8,sets:3}]},
    {id:'b',routineId:'other',cycle:1,splitName:'Other split',week:1,exercises:[{name:'Removed',done:true,weight:200,reps:8,sets:3}]},
    {id:'c',routineId:'r',cycle:1,splitName:'Active',week:2,exercises:[{name:'Removed',done:true,weight:null,reps:8,sets:3}]},
    {id:'unknown',cycle:1,week:3,exercises:[{name:'Removed',done:true,weight:900,reps:8,sets:3}]}
  ];`);
  assert.equal(h.run("progressEntries({name:'Removed'},'current')[0].weight"),20);
  assert.equal(h.run("progressEntries({name:'Removed'},'current').length"),1);
  assert.equal(h.run("progressEntries({name:'Removed'},cycleKey('other',1))[0].weight"),200);
  assert.equal(h.run('trendCycleChoices().length'),3);
  assert.match(h.run("cycleLabel(selectedCycle(cycleKey('other',1)))"),/Cycle 01 · Other split/);
  assert.equal(h.run("uniqueExercises().some(e=>e.name==='Removed')"),true);
  assert.equal(h.run("progressEntries({name:'Removed'},'1').length"),0);
});

test('current record overrides its duplicate historical snapshot without fabricating a chart point',()=>{
  const h=harness();
  h.run("state.history=[{id:'s',routineId:'r',cycle:1,week:1,exercises:[{name:'Test exercise',weight:80,reps:8,done:true}]}];state.records['1:d']={id:'s',routineId:'r',cycle:1,week:1,exercises:[{name:'Test exercise',weight:null,reps:null,done:true}]};");
  assert.equal(h.run("progressEntries({name:'Test exercise'}).length"),0);
});

test('draft saves keep inputs editable; newer versions drain before main-nav navigation',async()=>{
  const h=harness();startedFixture(h);
  const inputs=['weight','reps'].map((field,index)=>({dataset:{log:field,id:'e'},value:index?'8':'25',disabled:false,readOnly:false}));
  h.context.testInputs=inputs;
  h.run("screen.querySelectorAll=selector=>selector==='[data-log]'?testInputs:[];app.querySelectorAll=selector=>selector==='input,textarea'?testInputs:[];");
  const writes=[];let releaseFirst,firstSeen;
  const barrier=new Promise(resolve=>{releaseFirst=resolve;});
  const seen=new Promise(resolve=>{firstSeen=resolve;});
  h.context.testApi=async(method,path,body)=>{
    writes.push({method,path,body:structuredClone(body)});
    if(writes.length===1){firstSeen();await barrier;}
    return {ok:true};
  };
  h.run('api=testApi');
  // Values are in the real input nodes, but their input events have not fired yet.
  const navigation=click(h,'nav',{tab:'progress'});
  await seen;
  assert.equal(inputs[0].readOnly,false);
  assert.equal(h.run('busy'),false);
  assert.equal(h.run('page'),'cycle');
  inputs[0].value='30';inputs[1].value='12';
  h.run("writeDraft(getSelectedExercise('e'),'weight','30');writeDraft(getSelectedExercise('e'),'reps','12');");
  releaseFirst();await navigation;
  assert.deepEqual(writes.map(write=>write.body),[{weight:25,reps:8},{weight:30,reps:12}]);
  assert.equal(h.run('drafts.size'),0);
  assert.equal(h.run('getSelectedExercise("e").weight'),'30');
  assert.equal(h.run('page'),'progress');
  assert.equal(inputs[0].readOnly,false);
});

test('session navigation waits for the last typed value before changing its selection',async()=>{
  const h=harness();startedFixture(h);
  h.run("writeDraft(getSelectedExercise('e'),'weight','42');writeDraft(getSelectedExercise('e'),'reps','9');");
  const writes=[];
  const snapshot=JSON.parse(h.run('JSON.stringify(state)'));
  h.context.testApi=async(method,path,body)=>{writes.push({method,path,body:structuredClone(body)});if(method==='PUT'&&path.includes('/exercises/'))Object.assign(snapshot.records['1:d'].exercises[0],body);return method==='GET'?structuredClone({...snapshot,serverNow:new Date().toISOString()}):{ok:true};};
  h.run('api=testApi');
  await h.run("openSession(2,'d')");
  assert.match(writes[0].path,/sessions\/s\/exercises\/e$/);
  assert.deepEqual(writes[0].body,{weight:42,reps:9});
  assert.match(writes[1].path,/navigation$/);
  assert.equal(h.run('state.selected.week'),2);
});

test('actual sign-in submit and boot both open latest timeout recap, preserving next selection',async()=>{
  for(const mode of ['login','boot']){
    const h=harness();
    const snapshot=JSON.parse(h.run("JSON.stringify({...state,serverNow:new Date().toISOString(),history:[{id:'timeout',routineId:'r',cycle:1,week:1,dayId:'d',dayName:'Test day',finished:true,status:'partial',finishReason:'timeout',finishedAt:'2026-10-17T14:00:00Z',date:'2026-10-17',exercises:[]}]})"));
    h.context.testApi=async(method,path)=>path==='/api/auth/login'?{id:'u',username:'test'}:structuredClone(snapshot);
    h.run('api=testApi;state=null');
    if(mode==='boot'){h.storage.set('lift-user',JSON.stringify({id:'u',username:'test'}));await h.run('boot()');}
    else{const form={id:'login-form',values:{username:'test'},querySelector(){return null;}};await h.events.get('submit')[0]({target:form,preventDefault(){}});}
    assert.equal(h.run('page'),'recap',mode);
    assert.equal(h.run('recapId'),'timeout',mode);
    assert.equal(h.run('state.selected.dayId'),'d',mode);
  }
});

test('logout clears transient state safely; null state and null selected empty-plan routes do not crash',async()=>{
  const h=harness();
  h.run("state.plan=[];state.selected=null;page='train';render();page='recap';recapId=null;render()");
  assert.match(h.nodes.get('screen').innerHTML,/No training days yet/);
  assert.equal(h.run('getRecord()'),undefined);
  await click(h,'logout');
  assert.equal(h.run('state'),null);
  assert.equal(h.run('getRecord()'),undefined);
  assert.equal(h.run('nextWorkout()'),null);
  h.run('render();tick()');
  assert.match(h.nodes.get('screen').innerHTML,/id="login-form"/);
  await h.run('signOut()');
});

test('substitution groups use only actual performed history for last used, deduplicate names and escape labels',()=>{
  const h=harness();startedFixture(h);
  h.run("state.history=[{date:'2026-10-01',exercises:[{id:'e',originalName:'Test exercise',name:'Prior substitute',done:true,weight:25,reps:8,setLogs:[{name:'Older substitute',done:true,weight:20,reps:10},{name:'Never performed',done:false,weight:99,reps:10}]}]}];");
  assert.equal(h.run("substitutionGroups([{name:'Library exercise'},{name:'Prior substitute'}],[{name:'Prior substitute'}],getSelectedExercise('e')).lastUsed[0].name"),'Prior substitute');
  assert.equal(h.run("substitutionGroups([],[],getSelectedExercise('e')).previousUsed.map(e=>e.name).join('|')"),'Older substitute');
  assert.equal(h.run("substitutionGroups([{name:'Prior substitute'},{name:' prior SUBSTITUTE '}],[],getSelectedExercise('e')).other.length"),0);
  assert.match(h.run("substitutionOptionRows(['<unsafe>'], 'e')"),/&lt;unsafe&gt;/);
  assert.doesNotMatch(h.run("substitutionOptionsMarkup([],[],getSelectedExercise('e'))"),/Never performed/);
});

test('409 substitution rejection retains original performance and shows the actual explanation',async()=>{
  const h=harness();startedFixture(h);
  const errorNode=h.element(),snapshot=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})'));
  h.nodes.get('overlay-root').querySelector=selector=>selector==='.form-error'?errorNode:null;
  let accepted=false;
  h.context.testApi=async(method)=>{if(method==='PUT'){const error=new Error('Cannot substitute completed performance; keep the recorded exercise');error.status=409;throw error;}return structuredClone(snapshot);};
  h.context.accepted=()=>{accepted=true;};h.run('api=testApi');
  const result=await h.run("mutation('PUT','/sessions/s/exercises/e/substitute',{name:'New name'},{after:accepted})");
  assert.equal(result,null);assert.equal(accepted,false);
  assert.match(errorNode.textContent,/Cannot substitute completed performance/);
  assert.equal(h.run("getSelectedExercise('e').name"),'Test exercise');
  assert.equal(h.run('pendingRetry'),null);
});

test('library and prior-substitution requests populate options without replacing typed freeform text',async()=>{
  const h=harness();startedFixture(h);
  const root=h.element(),sheet=h.element(),input={value:'Initially typed',readOnly:false};
  h.nodes.get('overlay-root').querySelector=selector=>selector==='#substitution-options'?root:selector==='.sheet'?sheet:null;
  let resolveLibrary,markRequested;const gate=new Promise(resolve=>{resolveLibrary=resolve;});const requested=new Promise(resolve=>{markRequested=resolve;});
  const paths=[];
  h.context.testApi=async(method,path)=>{paths.push(path);if(path.endsWith('/library')){markRequested();await gate;return [{name:'Saved library exercise'}];}return [{name:'Previously used exercise'}];};
  h.run('api=testApi');
  const request=h.run("showSubstitution('e')");await requested;
  input.value='Still typing a freeform exercise';
  resolveLibrary();await request;
  assert.match(root.innerHTML,/Saved library exercise/);
  assert.match(root.innerHTML,/Previously used exercise/);
  assert.equal(input.value,'Still typing a freeform exercise');
  assert.equal(input.readOnly,false);
  assert.deepEqual(paths,['/api/users/u/library','/api/users/u/exercises/e/substitution-history']);
});

test('library failure keeps previous alternatives and provides retry; closing suppresses late results',async()=>{
  const h=harness();startedFixture(h);const root=h.element();
  h.nodes.get('overlay-root').querySelector=selector=>selector==='#substitution-options'?root:null;
  h.context.testApi=async(method,path)=>{if(path.endsWith('/library'))throw new Error('Offline');return [{name:'Real previous alternative'}];};h.run('api=testApi');
  await h.run("loadSubstitutionOptions('e')");
  assert.match(root.innerHTML,/Real previous alternative/);assert.match(root.innerHTML,/retry-library/);
  let release,markRequested;const gate=new Promise(resolve=>{release=resolve;});const seen=new Promise(resolve=>{markRequested=resolve;});
  h.context.testApi=async()=>{markRequested();await gate;return [{name:'Late result'}];};
  h.run('api=testApi');
  const request=h.run("loadSubstitutionOptions('e')");await seen;h.run('closeSheet()');release();await request;
  assert.doesNotMatch(root.innerHTML,/Late result/);
});

test('retrying failed completion uses the latest typed values, not the stale original body',async()=>{
  const h=harness();startedFixture(h);
  h.run("Object.assign(getSelectedExercise('e'),{weight:25,reps:8});");
  const snapshot=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})'));
  const writes=[];
  h.context.testApi=async(method,path,body)=>{
    if(method==='PUT'){writes.push(structuredClone(body));if(writes.length===1)throw new Error('Connection lost');Object.assign(snapshot.records['1:d'].exercises[0],body);return {ok:true};}
    return structuredClone(snapshot);
  };h.run('api=testApi');
  await h.run("mutation('PUT','/sessions/s/exercises/e',{weight:25,reps:8,done:true})");
  h.run("writeDraft(getSelectedExercise('e'),'weight','35');writeDraft(getSelectedExercise('e'),'reps','12');");
  await h.run('pendingRetry.run()');await h.run('flushDrafts()');
  assert.deepEqual(writes[1],{weight:35,reps:12,done:true});
  assert.equal(h.run("Number(getSelectedExercise('e').weight)"),35);
  assert.equal(h.run('drafts.size'),0);
});

test('logical cycle/create mutations retain operation IDs and captured targets across repeated network failures',async()=>{
  for(const path of ['/cycles','/routines']){
    const h=harness();startedFixture(h);
    const writes=[],snapshot=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})'));
    h.context.testApi=async(method,url,body)=>{
      if(method==='POST'){
        writes.push(structuredClone(body));
        if(writes.length<=2)throw new Error('Response lost after server commit');
        return {ok:true,routineId:'created'};
      }
      return structuredClone(snapshot);
    };h.run('api=testApi');
    await h.run(`mutation('POST','${path}',${path==='/cycles'?"{}":"{name:'Saved split',plan:[]}"})`);
    h.run("state.activeRoutineId='different-routine';state.cycle=99");
    await h.run('pendingRetry.run()');await h.run('pendingRetry.run()');
    assert.equal(writes.length,3);
    assert.ok(writes[0].operationId);
    assert.deepEqual(writes[1],writes[0]);assert.deepEqual(writes[2],writes[0]);
    if(path==='/cycles'){assert.equal(writes[0].routineId,'r');assert.equal(writes[0].expectedCycle,1);}
    await h.run(`mutation('POST','${path}',${path==='/cycles'?"{}":"{name:'Another split',plan:[]}"})`);
    assert.notEqual(writes[3].operationId,writes[0].operationId);
  }
});

test('acknowledged create/cycle mutations never replay POST when only the state refresh fails',async()=>{
  for(const path of ['/cycles','/routines']){
    const h=harness();startedFixture(h);let posts=0,reads=0;
    const snapshot=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})'));
    h.context.testApi=async(method)=>{if(method==='POST'){posts++;return {ok:true,routineId:'created'};}if(++reads===1)throw new Error('State unavailable');return structuredClone(snapshot);};h.run('api=testApi');
    await h.run(`mutation('POST','${path}',{})`);await h.run('pendingRetry.run()');
    assert.equal(posts,1);assert.equal(reads,2);
  }
});

test('cycle confirmation captures its displayed routine/cycle before queued input work changes state',async()=>{
  const h=harness();startedFixture(h);
  const snapshot=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})')),writes=[];
  h.context.testApi=async(method,path,body)=>{if(method==='POST'){writes.push(structuredClone(body));return {ok:true};}return structuredClone(snapshot);};
  h.run("api=testApi;flushDrafts=async()=>{state.activeRoutineId='other';state.cycle=20;return true;}");
  await click(h,'confirm-new-cycle',{routine:'r',cycle:'1'});
  assert.equal(writes[0].routineId,'r');assert.equal(writes[0].expectedCycle,1);
  assert.ok(writes[0].operationId);
});

test('periodic refresh freezes editor tree, name and original version while updating unrelated real state',async()=>{
  const h=harness();startedFixture(h);
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString(),planVersion:"version-2",splitName:"Remote name",cycle:2})'));
  remote.plan[0].name='Remote day';
  h.context.testApi=async()=>structuredClone(remote);
  h.run("api=testApi;page='editor';state.plan[0].name='Unsaved local day';state.splitName='Unsaved local name';globalThis.originalTree=state.plan");
  h.run('updateSaveStatus()');
  await h.run('refresh()');
  assert.equal(h.run('state.plan===originalTree'),true);
  assert.equal(h.run('state.plan[0].name'),'Unsaved local day');
  assert.equal(h.run('state.splitName'),'Unsaved local name');
  assert.equal(h.run('state.planVersion'),'version-1');
  assert.equal(h.run('state.cycle'),2);
  assert.equal(h.run('planConflict'),null);
  assert.doesNotMatch(h.nodes.get('save-status').innerHTML,/Reload latest plan/);
});

test('a plan form outside the editor also freezes its original plan/version during background state loads',async()=>{
  const h=harness();startedFixture(h);
  const form={id:'text-form',dataset:{kind:'rename-split'},values:{value:'Still typing'}};
  h.nodes.get('overlay-root').querySelector=selector=>selector==='form'?form:null;
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString(),planVersion:"version-2",splitName:"Remote name"})'));
  remote.plan[0].exercises=[];h.context.testApi=async()=>structuredClone(remote);
  h.run("api=testApi;page='splits'");await h.run('loadState({preserveSelection:true})');
  assert.equal(h.run('state.planVersion'),'version-1');
  assert.equal(h.run('state.splitName'),'Test plan');
  assert.equal(h.run('state.plan[0].exercises.length'),1);
  assert.equal(form.values.value,'Still typing');
});

test('successful plan save sends original planVersion then adopts the acknowledged new tree/version',async()=>{
  const h=harness();startedFixture(h);
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString(),planVersion:"version-2",splitName:"Acknowledged name"})'));
  remote.plan[0].name='Acknowledged day';const bodies=[];
  h.context.testApi=async(method,path,body)=>{if(method==='PUT'){bodies.push(structuredClone(body));return {ok:true};}return structuredClone(remote);};
  h.run("api=testApi;page='editor';state.plan[0].name='Local edit'");await h.run('savePlan()');
  assert.equal(bodies[0].planVersion,'version-1');assert.equal(bodies[0].plan[0].name,'Local edit');
  assert.equal(h.run('state.planVersion'),'version-2');assert.equal(h.run('state.plan[0].name'),'Acknowledged day');
  assert.equal(h.run('state.splitName'),'Acknowledged name');
  await h.run('savePlan()');assert.equal(bodies[1].planVersion,'version-2');
});

test('stale plan 409 preserves editor and typed form, blocks resubmission, and requires explicit reload',async()=>{
  const h=harness();startedFixture(h);
  const form={id:'exercise-form',dataset:{day:'d',section:'Main',id:'e'},values:{name:'Unsaved typed exercise',sets:'4',reps:'9'},querySelector:()=>h.element()};
  const sheet=h.element();
  h.nodes.get('overlay-root').querySelector=selector=>selector==='form'?form:selector==='.sheet'?sheet:null;
  let writes=0,reads=0;
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString(),planVersion:"version-2",splitName:"Remote name"})'));
  remote.plan[0].name='Remote day';
  h.context.testApi=async(method)=>{if(method==='PUT'){writes++;const error=new Error('Plan changed since it was loaded');error.status=409;throw error;}reads++;return structuredClone(remote);};
  h.run("api=testApi;page='editor';state.plan[0].name='Unsaved local day';state.splitName='Unsaved local name'");
  assert.equal(await h.run('savePlan()'),null);
  assert.equal(reads,0);assert.equal(writes,1);
  assert.equal(h.run('state.planVersion'),'version-1');
  assert.equal(h.run('state.plan[0].name'),'Unsaved local day');
  assert.equal(h.run('state.splitName'),'Unsaved local name');
  assert.equal(form.values.name,'Unsaved typed exercise');
  assert.match(h.nodes.get('save-status').innerHTML,/Reload latest plan/);
  assert.match(h.nodes.get('save-status').innerHTML,/discard/);
  await h.events.get('submit')[0]({target:form,preventDefault(){}});
  await h.run('savePlan()');assert.equal(writes,1);
  await h.run('loadState({preserveSelection:true})');
  assert.equal(h.run('state.planVersion'),'version-1');assert.equal(h.run('state.plan[0].name'),'Unsaved local day');
  await click(h,'reload-plan');
  assert.equal(h.run('planConflict'),null);
  assert.equal(h.run('state.planVersion'),'version-2');assert.equal(h.run('state.plan[0].name'),'Remote day');
  assert.equal(h.nodes.get('overlay-root').innerHTML,'');
});

test('failed explicit conflict reload keeps unsaved tree, form and conflict until a successful user retry',async()=>{
  const h=harness();startedFixture(h);
  h.run("page='editor';planConflict={routineId:'r',message:'Plan changed elsewhere'};state.plan[0].name='Keep local';");
  const form={id:'text-form',dataset:{kind:'rename-day'},values:{value:'Keep typed'}};
  h.nodes.get('overlay-root').querySelector=selector=>selector==='form'?form:null;
  h.context.testApi=async()=>{throw new Error('Offline');};h.run('api=testApi');
  assert.equal(await h.run('reloadLatestPlan()'),false);
  assert.equal(h.run('state.plan[0].name'),'Keep local');assert.equal(h.run('state.planVersion'),'version-1');
  assert.ok(h.run('planConflict'));assert.equal(form.values.value,'Keep typed');
});

test('plan-save retry refreshes an acknowledged save without replaying PUT or leaving its old form open',async()=>{
  const h=harness();startedFixture(h);
  const form={id:'text-form',dataset:{kind:'add-day'},values:{value:'Added day'}};
  let formOpen=true;
  const root=h.nodes.get('overlay-root');
  root.innerHTML='<form id="text-form">Saved form</form>';
  root.querySelector=selector=>selector==='form'&&formOpen?form:null;
  h.context.formClosed=()=>{formOpen=false;};
  h.run("const originalCloseSheet=closeSheet;closeSheet=()=>{originalCloseSheet();formClosed();};page='editor';state.plan.push({id:'added',name:'Added day',focus:'',sections:[],exercises:[]});");
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString(),planVersion:"version-2"})'));
  let puts=0,reads=0;
  h.context.testApi=async(method)=>{if(method==='PUT'){puts++;return {ok:true};}if(++reads===1)throw new Error('Read failed after acknowledgement');return structuredClone(remote);};h.run('api=testApi');
  assert.equal(await h.run('savePlan()'),null);
  assert.equal(formOpen,true);assert.equal(h.run('state.planVersion'),'version-1');
  await h.run('pendingRetry.run()');
  assert.equal(puts,1);assert.equal(reads,2);assert.equal(formOpen,false);
  assert.equal(root.innerHTML,'');assert.equal(h.run('state.planVersion'),'version-2');
  assert.equal(h.run("state.plan.filter(day=>day.id==='added').length"),1);
});

test('network retries keep the original plan body/version; a later stale 409 never rebases or refreshes it',async()=>{
  const h=harness();startedFixture(h);
  h.run("page='editor';state.plan[0].name='Original draft'");
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString(),planVersion:"version-2",splitName:"Changed remotely"})'));
  remote.plan[0].name='Changed remotely';const puts=[];let reads=0;
  h.context.testApi=async(method,path,body)=>{
    if(method==='PUT'){
      puts.push(structuredClone(body));
      if(puts.length===1)throw new Error('Connection interrupted');
      const error=new Error('Stale plan version');error.status=409;throw error;
    }
    reads++;return structuredClone(remote);
  };h.run('api=testApi');
  await h.run('savePlan()');
  await h.run('loadState({preserveSelection:true})');
  assert.equal(h.run('state.planVersion'),'version-1');
  await h.run('pendingRetry.run()');
  assert.deepEqual(puts[0],puts[1]);assert.equal(puts[1].planVersion,'version-1');
  assert.equal(reads,1);assert.equal(h.run('state.plan[0].name'),'Original draft');
  assert.ok(h.run('planConflict'));assert.equal(h.run('pendingRetry'),null);
});

test('idempotency metadata is limited to cycle/routine creation, not unrelated mutations',async()=>{
  const h=harness();startedFixture(h);
  const remote=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})')),writes=[];
  h.context.testApi=async(method,path,body)=>{if(method!=='GET')writes.push(structuredClone(body));return method==='GET'?structuredClone(remote):{ok:true};};h.run('api=testApi');
  await h.run("mutation('POST','/sessions/start',{week:1,dayId:'d'})");
  await h.run('savePlan()');
  assert.equal(Object.hasOwn(writes[0],'operationId'),false);
  assert.equal(Object.hasOwn(writes[1],'operationId'),false);
  assert.equal(writes[1].planVersion,'version-1');
});

test('heatmap uses a single solid accent for any done exercise, not session status or completion ratio',()=>{
  const h=harness();
  h.run(`historyYear=2020;state.history=[
    {id:'partial',date:'2020-01-01',status:'partial',exercises:[{done:true},{done:false},{done:false},{done:false}]},
    {id:'full',date:'2020-01-02',status:'completed',exercises:[{done:true},{done:true}]},
    {id:'no-work',date:'2020-01-03',status:'completed',exercises:[{done:false}]},
    {id:'same-date',date:'2020-01-01',status:'partial',exercises:[{done:true}]}
  ];`);
  const html=h.run('activityContent()');
  assert.equal((html.match(/class="heat-cell recorded"/g)||[]).length,2);
  assert.match(html,/Workout recorded\./);
  assert.doesNotMatch(html,/level[123]|More exercises|>Less</);
  h.run("historyYear=new Date().getFullYear()+1;state.history=[{date:historyYear+'-01-01',exercises:[{done:true}]}]");
  assert.doesNotMatch(h.run('activityContent()'),/class="heat-cell recorded"/);
  assert.match(h.run('activityContent()'),/class="heat-cell future"/);
  const css=fs.readFileSync(`${__dirname}/../../public/styles.css`,'utf8');
  assert.match(css,/#app \.heat-cell\.recorded,#app \.heat-legend i\.recorded\{background:var\(--blue\)\}/);
});

test('last-used substitute follows actual session time and original identity, never highest load or unrelated names',()=>{
  const h=harness();startedFixture(h);
  h.run(`state.history=[
    {id:'old',finishedAt:'2026-09-20T12:00:00Z',exercises:[{id:'e',name:'Old heavy substitute',originalName:'Test exercise',done:true,weight:200,reps:5}]},
    {id:'new',finishedAt:'invalid',startedAt:'2026-10-10T12:00:00Z',exercises:[{id:'changed-id',name:'Recent substitute',originalName:'Test exercise',done:true,weight:30,reps:12}]},
    {id:'unrelated',finishedAt:'2026-10-16T12:00:00Z',exercises:[{id:'other',name:'Unrelated substitute',originalName:'Another original',done:true,weight:99,reps:6}]},
    {id:'original',finishedAt:'2026-10-16T14:00:00Z',exercises:[{id:'e',name:'Test exercise',originalName:'Test exercise',done:true,weight:90,reps:8}]},
    {id:'unfinished',finishedAt:'2026-10-16T15:00:00Z',exercises:[{id:'e',name:'Not done',originalName:'Test exercise',done:false,weight:90,reps:8}]}
  ];`);
  const html=h.run("substitutionOptionsMarkup([{name:'Z library'},{name:'Recent substitute'},{name:'Test exercise'}],[{name:'API name without performance'}],getSelectedExercise('e'))");
  assert.ok(html.indexOf('Last used')<html.indexOf('Recent substitute'));
  assert.ok(html.indexOf('Recent substitute')<html.indexOf('Previously used'));
  assert.ok(html.indexOf('Previously used')<html.indexOf('Old heavy substitute'));
  assert.ok(html.indexOf('Old heavy substitute')<html.indexOf('Other library choices'));
  assert.match(html,/Last performance · 30 lb × 12/);
  assert.equal((html.match(/data-name="Recent substitute"/g)||[]).length,1);
  assert.doesNotMatch(html,/Unrelated substitute|Not done|data-name="Test exercise"/);
  assert.equal(h.run("getSelectedExercise('e').name"),'Test exercise');
});

test('duplicate history is overridden by current record; undated history cannot invent last used',()=>{
  const h=harness();startedFixture(h);
  h.run(`state.history=[{id:'duplicate',date:'2026-10-01',exercises:[{id:'e',name:'Stale completed',done:true,weight:50,reps:10}]},
    {id:'undated',exercises:[{id:'e',name:'Undated actual',done:true,weight:25,reps:8}]}];
    state.records['2:d']={id:'duplicate',date:'2026-10-01',exercises:[{id:'e',name:'Stale completed',done:false,weight:'',reps:''}]};`);
  const html=h.run("substitutionOptionsMarkup([],[{name:'Bare API choice'},{name:'Blank results',done:false,date:'2026-10-15',weight:null,reps:10}],getSelectedExercise('e'))");
  assert.doesNotMatch(html,/Last used|Stale completed/);
  assert.match(html,/Previously used.*Undated actual/);
  assert.match(html,/Bare API choice/);
  assert.doesNotMatch(html,/Last performance · —/);
});

test('a dated completed substitute with missing values proves last use without inventing performance',()=>{
  const h=harness();startedFixture(h);
  h.run("state.history=[{id:'prior',date:'2026-10-01',exercises:[{id:'e',name:'Known used alternative',done:true,weight:null,reps:''}]}]");
  const html=h.run("substitutionOptionsMarkup([],[],getSelectedExercise('e'))");
  assert.match(html,/Last used.*Known used alternative/);
  assert.doesNotMatch(html,/Last performance|lb ×/);
  assert.equal(h.run("lastPerformedExercise('Known used alternative')"),null);
});

test('substitute sheet places reuse choices above freeform and only offers restore when currently substituted',async()=>{
  const h=harness();startedFixture(h);const root=h.element(),sheet=h.element();
  h.nodes.get('overlay-root').querySelector=selector=>selector==='#substitution-options'?root:selector==='.sheet'?sheet:null;
  h.context.testApi=async()=>[];h.run('api=testApi');
  await h.run("showSubstitution('e')");
  let html=h.nodes.get('overlay-root').innerHTML;
  assert.ok(html.indexOf('id="substitution-options"')<html.indexOf('id="substitute-form"'));
  assert.doesNotMatch(html,/Restore Test exercise/);
  h.run("getSelectedExercise('e').name='Current substitute'");await h.run("showSubstitution('e')");
  html=h.nodes.get('overlay-root').innerHTML;assert.match(html,/Restore Test exercise/);
  assert.equal(h.run("getSelectedExercise('e').name"),'Current substitute');
});

test('substituted logger shows and copies actual substitute performance, never attributes original results to it',async()=>{
  const h=harness();startedFixture(h);
  h.run(`openExercise='e';Object.assign(getSelectedExercise('e'),{name:'Cable alternative',lastWeight:100,lastReps:5});
    state.history=[{id:'previous',date:'2026-10-01',exercises:[{id:'e',originalName:'Test exercise',name:'Cable alternative',done:true,weight:30,reps:12}]}];`);
  let html=h.run("exerciseCard(getSelectedExercise('e'),getRecord())");
  assert.match(html,/Last time · substitute/);assert.match(html,/30 lb/);assert.doesNotMatch(html,/100 lb/);
  await click(h,'use-last',{id:'e'});
  assert.equal(h.run("getSelectedExercise('e').weight"),30);assert.equal(h.run("getSelectedExercise('e').reps"),12);
  h.run('state.history=[]');html=h.run("exerciseCard(getSelectedExercise('e'),getRecord())");
  assert.match(html,/Last time · original exercise/);assert.match(html,/Use original’s last values/);
  assert.doesNotMatch(html,/Last time · substitute/);
});

function importSheetFixture(h){
  const area={value:h.run('aiImportPrompt'),focus(){this.focused=true;},select(){this.selected=true;}},status=h.element(),sheet=h.element();
  const typed={value:'Keep this pasted plan'},name={value:'Keep this split name'};
  const root=h.nodes.get('overlay-root');
  root.querySelector=selector=>selector==='#ai-import-prompt'?area:selector==='#ai-prompt-status'?status:selector==='.sheet'?sheet:selector==='textarea[name="plan"]'?typed:null;
  return {area,status,root,typed,name};
}

test('AI import shows a copyable supported prompt, instructions, optional name and a non-submit copy button',async()=>{
  const h=harness(),{root}=importSheetFixture(h);
  await click(h,'import-split');
  assert.match(root.innerHTML,/Copy the AI prompt.*Paste the AI output.*review its days/s);
  assert.match(root.innerHTML,/Split name \(optional\)/);
  assert.match(root.innerHTML,/type="button" data-action="copy-ai-prompt">Copy AI prompt/);
  assert.match(root.innerHTML,/id="ai-import-prompt"[^>]*readonly/);
  const prompt=h.run('aiImportPrompt');
  for(const line of ['Split:','Day:','Section:','Exercise:','[your routine here]'])assert.ok(prompt.includes(line));
  assert.match(root.innerHTML,/role="status" aria-live="polite"/);
});

test('AI prompt clipboard success leaves typed output, split name and form DOM intact',async()=>{
  const h=harness(),fixture=importSheetFixture(h);let copied;
  h.context.navigator={clipboard:{writeText:async text=>{copied=text;}}};
  await click(h,'import-split');const before=fixture.root.innerHTML;
  await click(h,'copy-ai-prompt');
  assert.equal(copied,h.run('aiImportPrompt'));assert.match(fixture.status.textContent,/AI prompt copied/);
  assert.equal(fixture.root.innerHTML,before);assert.equal(fixture.typed.value,'Keep this pasted plan');assert.equal(fixture.name.value,'Keep this split name');
  assert.equal(fixture.area.selected,undefined);
});

test('AI prompt clipboard unavailable or rejected explicitly selects fallback without losing pasted text',async()=>{
  for(const mode of ['missing','rejected','legacy-copy','selection-failed']){
    const h=harness(),fixture=importSheetFixture(h);
    h.context.navigator=mode==='missing'?{}:{clipboard:{writeText:async()=>{throw new Error('Permission denied');}}};
    if(mode==='legacy-copy')h.context.document.execCommand=command=>command==='copy';
    if(mode==='selection-failed')fixture.area.select=()=>{throw new Error('Selection failed');};
    await click(h,'import-split');const before=fixture.root.innerHTML;await click(h,'copy-ai-prompt');
    assert.equal(fixture.root.innerHTML,before);assert.equal(fixture.typed.value,'Keep this pasted plan');
    if(mode==='selection-failed')assert.match(fixture.status.textContent,/Copy failed.*manually/);
    else{assert.equal(fixture.area.selected,true);assert.match(fixture.status.textContent,mode==='legacy-copy'?/AI prompt copied/:/Could not copy automatically.*selected/);}
  }
});

test('AI import parser accepts new prompt Split line and legacy output with optional split name',async()=>{
  for(const legacy of [false,true]){
    const h=harness();startedFixture(h);const error=h.element(),writes=[];
    h.context.testApi=async(method,path,body)=>{if(method==='POST'){writes.push(structuredClone(body));return {ok:true};}return JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})'));};h.run('api=testApi');
    const plan=`${legacy?'':'Split: Prompt split\n'}Day: Day 1 | Push | Chest\nSection: Main\nExercise: Bench Press | 3 | 8-10`;
    const form={id:'import-form',values:{name:legacy?'Legacy split':'Optional fallback',plan},querySelector:()=>error};
    await h.events.get('submit')[0]({target:form,preventDefault(){}});
    assert.equal(writes.length,1);assert.equal(writes[0].name,legacy?'Legacy split':'Prompt split');
    assert.equal(writes[0].plan[0].exercises[0].name,'Bench Press');assert.equal(error.textContent,'');
  }
});

test('AI import validation retains invalid pasted output and makes no routine write',async()=>{
  const h=harness();startedFixture(h);const error=h.element();let requests=0;
  h.context.testApi=async()=>{requests++;};h.run('api=testApi');
  const form={id:'import-form',values:{name:'',plan:'Day: Day 1 | Push | Chest\nSection: Main\nExercise: Bench | 3 | 8'},querySelector:()=>error};
  await h.events.get('submit')[0]({target:form,preventDefault(){}});
  assert.match(error.textContent,/split name/);assert.equal(requests,0);assert.match(form.values.plan,/Exercise: Bench/);
});

test('AI prompt remains keyboard-selectable and sheet focus trap wraps it without clearing import output',async()=>{
  const h=harness(),fixture=importSheetFixture(h);await click(h,'import-split');
  const first={focus(){this.focused=true;}};
  fixture.root.children=[{}];fixture.root.contains=()=>true;
  fixture.root.querySelectorAll=()=>[first,fixture.area];
  h.context.document.activeElement=fixture.area;let prevented=false;
  h.events.get('keydown')[0]({key:'Tab',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(first.focused,true);
  h.context.document.activeElement=first;prevented=false;
  h.events.get('keydown')[0]({key:'Tab',shiftKey:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(fixture.area.focused,true);assert.equal(fixture.typed.value,'Keep this pasted plan');
});

test('last performance chooses newest actual result across history and scoped previous API, not first API item',()=>{
  const h=harness();startedFixture(h);
  h.run("state.history=[{id:'old',date:'2026-09-01',exercises:[{id:'e',name:'Alternative',done:true,weight:100,reps:6}]}]");
  const html=h.run("substitutionOptionsMarkup([],[{name:'Alternative',done:true,weight:25,reps:10,date:'2026-10-01'},{name:'Alternative',done:true,weight:30,reps:12,finishedAt:'2026-10-10T12:00:00Z'}],getSelectedExercise('e'))");
  assert.match(html,/Last used/);assert.match(html,/Last performance · 30 lb × 12/);
  assert.doesNotMatch(html,/100 lb|25 lb/);
});

test('both library APIs failing retain dated state-history reuse above freeform with retry feedback',async()=>{
  const h=harness();startedFixture(h);const root=h.element(),sheet=h.element();
  h.nodes.get('overlay-root').querySelector=selector=>selector==='#substitution-options'?root:selector==='.sheet'?sheet:null;
  h.run("state.history=[{id:'prior',date:'2026-10-01',exercises:[{id:'e',name:'History fallback',done:true,weight:25,reps:8}]}]");
  h.context.testApi=async()=>{throw new Error('Offline');};h.run('api=testApi');
  await h.run("showSubstitution('e')");
  assert.match(root.innerHTML,/Last used.*History fallback/);assert.match(root.innerHTML,/retry-library/);
  assert.equal(h.run("getSelectedExercise('e').name"),'Test exercise');
});

test('one-tap substitution sends only the explicitly chosen name and keeps completed-performance 409 explanation',async()=>{
  const h=harness();startedFixture(h);const errorNode=h.element(),writes=[];
  h.nodes.get('overlay-root').querySelector=selector=>selector==='.form-error'?errorNode:null;
  h.run("Object.assign(getSelectedExercise('e'),{done:true,weight:45,reps:10})");
  const snapshot=JSON.parse(h.run('JSON.stringify({...state,serverNow:new Date().toISOString()})'));
  h.context.testApi=async(method,path,body)=>{
    if(method==='PUT'){writes.push({path,body:structuredClone(body)});const error=new Error('Cannot substitute completed performance; recorded results are kept');error.status=409;throw error;}
    return structuredClone(snapshot);
  };h.run('api=testApi');
  const html=h.run("substitutionOptionsMarkup([],[{name:'Chosen alternative'}],getSelectedExercise('e'))");
  assert.match(html,/type="button"[^>]*data-action="apply-substitute"/);assert.equal(writes.length,0);
  await click(h,'apply-substitute',{id:'e',name:'Chosen alternative'});
  assert.deepEqual(writes,[{path:'/api/v2/users/u/sessions/s/exercises/e/substitute',body:{name:'Chosen alternative'}}]);
  assert.match(errorNode.textContent,/Cannot substitute completed performance/);
  assert.equal(h.run("getSelectedExercise('e').name"),'Test exercise');
  assert.equal(h.run("getSelectedExercise('e').weight"),45);assert.equal(h.run("getSelectedExercise('e').reps"),10);
});
