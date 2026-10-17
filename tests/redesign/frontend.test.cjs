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
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},hidden:false,activeElement:{matches(){return false;}}};
  const context=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setInterval(){},setTimeout(){},clearTimeout(){},console,crypto:{randomUUID(){return `test-id-${++nextId}`;}},AbortSignal,AbortController,Date,structuredClone,FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name];}}});
  const source=fs.readFileSync(`${__dirname}/../../public/app.js`,'utf8').replace(/boot\(\);\s*$/,'');
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
test('a fully logged but unfinished session still has a timer and needs explicit finish',()=>{
  const h=harness();
  assert.equal(h.run("isFinished({status:'completed',finished:false})"),false);
  assert.equal(h.run("isFinished({status:'partial',finished:true})"),true);
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
  assert.match(h.run("timerMarkup({expiresAt:'2030-01-01',finished:false})"),/role="timer"/);
  assert.equal(h.run("timerMarkup({expiresAt:'2030-01-01',finished:true})"),'');
});
test('settings uses actual identity and contains no demo controls',()=>{
  const h=harness();h.run("page='settings';render()");
  const html=h.nodes.get('screen').innerHTML;
  assert.match(html,/<strong>test<\/strong>/);
  assert.doesNotMatch(html,/reset-demo|preview-complete|Prototype controls/);
});
test('countdown is derived from the absolute backend deadline with server clock correction',()=>{
  const h=harness();
  h.run("serverOffset=30000;state.records['1:d']={id:'s',expiresAt:new Date(Date.now()+5430000).toISOString(),finished:false};tick()");
  assert.equal(h.nodes.get('countdown').textContent,'90:00');
  h.run("state.records['1:d'].expiresAt=new Date(Date.now()+90000).toISOString();tick()");
  assert.equal(h.nodes.get('countdown').textContent,'01:00');
  h.run("state.records['1:d'].expiresAt=new Date(Date.now()-1).toISOString();tick()");
  assert.equal(h.nodes.get('countdown').textContent,'00:00');
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
  assert.equal(h.run('trendCycleChoices().length'),2);
  assert.match(h.run("cycleLabel(selectedCycle(cycleKey('other',1)))"),/Cycle 01 · Other split/);
  assert.equal(h.run("uniqueExercises().some(e=>e.name==='Removed')"),true);
  assert.equal(h.run("progressEntries({name:'Removed'},'1').length"),0);
});

test('current record overrides its duplicate historical snapshot without fabricating a chart point',()=>{
  const h=harness();
  h.run("state.history=[{id:'s',routineId:'r',cycle:1,week:1,exercises:[{name:'Test exercise',weight:80,reps:8,done:true}]}];state.records['1:d']={id:'s',routineId:'r',cycle:1,week:1,exercises:[{name:'Test exercise',weight:null,reps:null,done:true}]};");
  assert.equal(h.run("progressEntries({name:'Test exercise'}).length"),0);
});

test('rapid log values are captured before readonly; newer versions drain before main-nav navigation',async()=>{
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
  assert.equal(inputs[0].readOnly,true);
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

test('substitution options use real library and recorded history, deduplicate and escape labels',()=>{
  const h=harness();startedFixture(h);
  h.run("state.history=[{exercises:[{id:'e',originalName:'Test exercise',name:'Prior substitute',setLogs:[{name:'Older substitute'}]}]}];");
  assert.equal(h.run("substitutionNames([{name:'Library exercise'},{name:'Prior substitute'}],[{name:'Prior substitute'}],getSelectedExercise('e')).join('|')"),'Library exercise|Older substitute|Prior substitute');
  assert.match(h.run("substitutionOptionRows(['<unsafe>'], 'e')"),/&lt;unsafe&gt;/);
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
