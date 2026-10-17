#!/usr/bin/env node
/* Targeted synthetic real-API integration. Never use port 7701 or a working DB.
 * Run from any directory: node tests/redesign/refinements-browser.cjs
 * Optional: QA_HEADED=1 (use xvfb-run on a display-less Linux host).
 */
'use strict';
const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const dir=fs.mkdtempSync('/tmp/opencode/lift-refinements-qa-');
const dbPath=path.join(dir,'synthetic.db');
const results=[],screenshots=[],runtimeErrors=[];
const year=new Date().getFullYear()-1;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let child,browser,db,base,logs='';

async function start(){
  child=spawn(process.execPath,['-e',`const {app}=require('./backend/server');const server=app.listen(0,'127.0.0.1',()=>console.log('QA_PORT='+server.address().port));`],{
    cwd:root,env:{...process.env,DB_PATH:dbPath,SKIP_SEED_SYNC:'1'},stdio:['ignore','pipe','pipe']
  });
  child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
  for(let i=0;i<300;i++){
    const match=logs.match(/QA_PORT=(\d+)/);
    if(match){base=`http://127.0.0.1:${match[1]}`;assert.equal((await fetch(base)).status,200);return;}
    if(child.exitCode!==null)throw Error('P0: isolated startup failed: '+logs);
    await delay(100);
  }
  throw Error('P0: isolated startup timed out: '+logs);
}
async function api(method,url,body,status=200){
  const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(data)}`);return data;
}
async function check(name,run){
  try{await run();results.push({name,status:'PASS'});console.log('PASS',name);}
  catch(error){results.push({name,status:'FAIL',error:error.stack});console.error('FAIL',name,error.message);}
}
async function actor(label){
  const user=await api('POST','/api/auth/login',{username:'qa-refinements-'+label});
  const prefix=`/api/v2/users/${user.id}`;
  const context=await browser.newContext({viewport:{width:390,height:1000},locale:'en-US',timezoneId:'UTC'});
  const page=await context.newPage();
  page.on('pageerror',error=>runtimeErrors.push({actor:label,error:error.message}));
  await page.goto(base);await page.locator('[name=username]').fill(user.username);
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('[data-tab=cycle][aria-current=page]').waitFor();
  return {user,prefix,context,page,state:()=>api('GET',prefix+'/state'),call:(method,url,body,status)=>api(method,prefix+url,body,status)};
}
async function click(page,action){await page.locator(`[data-action="${action}"]`).first().click();}
async function reload(page){await page.reload();await page.locator('[data-tab=cycle][aria-current=page]').waitFor();}
async function overflow(page){
  const size=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(size.document<=size.width&&size.body<=size.width,'Document horizontal overflow: '+JSON.stringify(size));
}
async function shot(page,name){
  await overflow(page);await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});screenshots.push(name+'.png');
}
async function theme(page,value){
  // Use the actual Settings control and storage, not a CSS-only attribute mutation.
  await page.locator('[data-tab=settings]').last().click();
  await page.locator(`[data-action=theme][data-theme=${value}]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-theme',value);
}
function planDay(name,target='QA Session Press'){
  return {id:randomUUID(),name,focus:'Synthetic controlled training',sections:['Main lifts'],exercises:[
    {id:randomUUID(),name:target,sets:1,reps:'6–10',section:'Main lifts'},
    {id:randomUUID(),name:'QA Accessory',sets:1,reps:'10–12',section:'Main lifts'}
  ]};
}
async function routine(a,name,days){
  const {routineId}=await a.call('POST','/routines',{name,plan:days});
  await a.call('POST','/active-routine',{routineId});return routineId;
}
async function startSession(a,day,week=1){return a.call('POST','/sessions/start',{dayId:day.id,week});}
async function entry(a,session,exercise,data){return a.call('PUT',`/sessions/${session.sessionId}/exercises/${exercise.id}`,data);}
async function finish(a,session,reason='finish'){await a.call('POST',`/sessions/${session.sessionId}/${reason}`,{});}
function stamp(session,day){
  // The only direct DB writes: move already-finished synthetic session timestamps.
  // No log/result/plan writes, and never any non-disposable database.
  const date=`${year}-01-${String(day).padStart(2,'0')}`;
  db.prepare('UPDATE workout_sessions SET started_at=?,expires_at=?,finished_at=?,completed_at=? WHERE id=?')
    .run(date+'T10:00:00.000Z',date+'T11:30:00.000Z',date+'T10:20:00.000Z',date+'T10:20:00.000Z',session.sessionId);
  return date;
}
async function train(a){await reload(a.page);await a.page.locator('[data-tab=train]').click();await a.page.locator('#countdown').waitFor();}
async function importSheet(page){await page.locator('[data-tab=settings]').last().click();await click(page,'splits');await click(page,'import-split');await page.locator('#import-form').waitFor();}
async function graph(page){
  await reload(page);await page.locator('[data-tab=progress]').click();await page.locator('[data-view=trends]').click();
  await page.locator('[data-action=trend-detail]').filter({hasText:'QA Session Press'}).click();
  await page.locator('.trend-chart').waitFor();
}
async function markerIds(page){return page.locator('.trend-chart .trend-point').evaluateAll(nodes=>nodes.map(node=>node.dataset.sessionId));}
async function sameMarkers(page,expected){assert.deepEqual((await markerIds(page)).sort(),expected.map(item=>item.sessionId).sort());}

(async()=>{
  try{
    // Startup is deliberately first; do not continue with static-only checks if it fails.
    await start();console.log('STARTUP PROBE PASSED',base,'EVIDENCE',dir);
    db=new(require(path.join(root,'backend/node_modules/better-sqlite3')))(dbPath);
    browser=await chromium.launch({headless:!process.env.QA_HEADED});

    const heat=await actor('heatmap'),heatDays=['Partial','Complete','Skipped','Empty finish'].map(name=>planDay(name));
    await routine(heat,'Heatmap fixture',heatDays);
    for(let i=0;i<heatDays.length;i++){
      const s=await startSession(heat,heatDays[i]);
      if(i<2)await entry(heat,s,heatDays[i].exercises[0],{weight:40,reps:8,done:true});
      if(i===1)await entry(heat,s,heatDays[i].exercises[1],{weight:10,reps:12,done:true});
      await finish(heat,s,i===2?'skip':'finish');stamp(s,i+2);
    }
    await reload(heat.page);
    for(const mode of ['light','dark'])await check(`heatmap: ${mode} partial/full are one strong accent; skipped/empty/no activity neutral`,async()=>{
      await theme(heat.page,mode);await heat.page.locator('[data-tab=progress]').click();
      const controls=heat.page.locator('.year-controls');
      while((await controls.innerText()).includes(String(year+1)))await heat.page.getByRole('button',{name:'Previous year',exact:true}).click();
      const cells=heat.page.locator('[data-action=filter-month][data-month="0"] .heat-cell');
      const colors=await cells.evaluateAll(nodes=>nodes.slice(0,6).map(node=>({class:node.className,color:getComputedStyle(node).backgroundColor,opacity:getComputedStyle(node).opacity})));
      const accent=await heat.page.locator('.heat-legend i').evaluate(node=>getComputedStyle(node).backgroundColor);
      assert.equal(await heat.page.locator('.heat-cell.recorded').count(),2);
      for(const index of [1,2]){assert.match(colors[index].class,/recorded/);assert.equal(colors[index].color,accent);assert.equal(colors[index].opacity,'1');}
      for(const index of [0,3,4,5]){assert.doesNotMatch(colors[index].class,/recorded/);assert.notEqual(colors[index].color,accent);}
      await shot(heat.page,`heatmap-390-${mode}`);
    });

    const timer=await actor('timer'),timerDay=planDay('Long synthetic workout title for narrow screen timer alignment');
    await routine(timer,'Elapsed time fixture',[timerDay]);const clockSession=await startSession(timer,timerDay);
    const deadline=clockSession.expiresAt,started=clockSession.startedAt;
    assert.equal(Date.parse(deadline)-Date.parse(started),90*60*1000);
    await train(timer);
    await check('timer: actual DOM 00:00, positive server offset, negative clamp, 90:00 cap without backend clock changes',async()=>{
      for(const [seconds,expected] of [[0,'00:00'],[75,'01:15'],[-20,'00:00'],[5400,'90:00'],[6500,'90:00']]){
        const text=await timer.page.evaluate(({seconds,started})=>{
          serverOffset=Date.parse(started)+seconds*1000+100-Date.now();tick();return document.getElementById('countdown').textContent;
        },{seconds,started});assert.equal(text,expected);
      }
      const persisted=(await timer.state()).records[`1:${timerDay.id}`];
      assert.equal(persisted.startedAt,started);assert.equal(persisted.expiresAt,deadline);assert.equal(persisted.finished,false);
    });
    await check('timer: reload derives elapsed from persisted startedAt; resume never changes original expiresAt',async()=>{
      await delay(2100);await train(timer);
      const text=await timer.page.locator('#countdown').innerText(),[minutes,seconds]=text.split(':').map(Number);
      const data=await timer.state(),elapsed=(Date.parse(data.serverNow)-Date.parse(started))/1000;
      assert(Math.abs(minutes*60+seconds-elapsed)<3&&minutes*60+seconds>=2,`Reload elapsed ${text}; backend age ${elapsed}`);
      const resumed=await startSession(timer,timerDay);assert.equal(resumed.startedAt,started);assert.equal(resumed.expiresAt,deadline);
      assert.equal(data.records[`1:${timerDay.id}`].expiresAt,deadline);
    });
    for(const width of [320,390,768])for(const mode of ['light','dark'])await check(`timer layout: ${width}px ${mode}`,async()=>{
      await timer.page.setViewportSize({width,height:1000});await theme(timer.page,mode);await timer.page.locator('[data-tab=train]').click();
      const title=await timer.page.locator('.training-title h2').boundingBox(),box=await timer.page.locator('.workout-timer').boundingBox();
      assert(box.x>=title.x+title.width-1,'Timer overlaps workout title');await expect(timer.page.getByRole('timer')).toBeVisible();
      await shot(timer.page,`timer-${width}-${mode}`);
    });

    const imports=await actor('imports'),p=imports.page;
    const modern='Split: New AI shape\nDay: A | AI Upper | Controlled strength\nSection: Main lifts\nExercise: AI Press | 3 | 8-10\nExercise: AI Row | 2 | 10-12';
    const legacy='Day: Day 1 | Legacy Lower | Legs\nSection: Main lifts\nExercise: Legacy Squat | 4 | 5-8';
    await check('AI import: readonly supported prompt; keyboard copy uses real clipboard and retains pasted output/name',async()=>{
      await importSheet(p);await p.locator('[name=plan]').fill(modern);await p.locator('#import-form [name=name]').fill('Keep this optional name');
      const prompt=p.locator('#ai-import-prompt');assert.equal(await prompt.getAttribute('readonly'),'');
      const value=await prompt.inputValue();for(const term of ['Split:','Day:','Section:','Exercise:','[your routine here]'])assert(value.includes(term));
      await imports.context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
      await p.locator('[data-action=copy-ai-prompt]').focus();await p.keyboard.press('Enter');
      await expect(p.locator('#ai-prompt-status')).toContainText('AI prompt copied');
      assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),value);
      assert.equal(await p.locator('[name=plan]').inputValue(),modern);assert.equal(await p.locator('#import-form [name=name]').inputValue(),'Keep this optional name');
      await prompt.focus();await p.keyboard.press('Control+A');await p.keyboard.type('cannot edit');assert.equal(await prompt.inputValue(),value);
      await p.keyboard.press('Tab');assert(await p.locator('[role=dialog]').evaluate(node=>node.contains(document.activeElement)),'Focus escaped sheet');
    });
    await check('AI import: denied clipboard selects readonly prompt for keyboard copy without losing draft',async()=>{
      await p.evaluate(()=>{
        window.qaOriginalClipboard=Object.getOwnPropertyDescriptor(navigator.clipboard,'writeText');
        window.qaOriginalExec=document.execCommand;
        Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('Synthetic permission denial'))});document.execCommand=()=>false;
      });
      try{
        await p.locator('[data-action=copy-ai-prompt]').focus();await p.keyboard.press('Enter');
        await expect(p.locator('#ai-prompt-status')).toContainText('prompt is selected');
        assert(await p.locator('#ai-import-prompt').evaluate(node=>document.activeElement===node&&node.selectionStart===0&&node.selectionEnd===node.value.length));
        assert.equal(await p.locator('[name=plan]').inputValue(),modern);assert.equal(await p.locator('#import-form [name=name]').inputValue(),'Keep this optional name');
      }finally{await p.evaluate(()=>{if(window.qaOriginalClipboard)Object.defineProperty(navigator.clipboard,'writeText',window.qaOriginalClipboard);else delete navigator.clipboard.writeText;document.execCommand=window.qaOriginalExec;delete window.qaOriginalClipboard;delete window.qaOriginalExec;});}
    });
    await check('AI import: actual new-shape import uses Split line with optional name blank',async()=>{
      await p.locator('#import-form [name=name]').fill('');await p.locator('#import-form button[type=submit]').click();await p.locator('#import-form').waitFor({state:'detached'});
      const split=(await imports.state()).savedSplits.find(split=>split.name==='New AI shape');assert(split);
      assert.equal(split.plan[0].name,'AI Upper');assert.equal(split.plan[0].exercises.length,2);assert.equal(split.plan[0].exercises[0].sets,3);assert.equal(split.plan[0].exercises[0].reps,'8-10');
    });
    await check('AI import: actual legacy shape accepts optional name and persists original targets',async()=>{
      await click(p,'import-split');await p.locator('[name=plan]').fill(legacy);await p.locator('#import-form [name=name]').fill('Legacy AI shape');
      await p.locator('#import-form button[type=submit]').click();await p.locator('#import-form').waitFor({state:'detached'});
      const split=(await imports.state()).savedSplits.find(split=>split.name==='Legacy AI shape');assert(split);assert.equal(split.plan[0].name,'Legacy Lower');
      assert.equal(split.plan[0].exercises[0].name,'Legacy Squat');assert.equal(split.plan[0].exercises[0].sets,4);assert.equal(split.plan[0].exercises[0].reps,'5-8');
    });
    for(const width of [320,390,768])for(const mode of ['light','dark'])await check(`AI import layout: ${width}px ${mode}`,async()=>{
      await p.setViewportSize({width,height:1000});await theme(p,mode);await importSheet(p);await p.locator('[name=plan]').fill(modern);
      await shot(p,`import-${width}-${mode}`);await p.locator('#ai-import-prompt').scrollIntoViewIfNeeded();
      await expect(p.locator('#ai-import-prompt')).toBeVisible();await shot(p,`import-prompt-${width}-${mode}`);await p.keyboard.press('Escape');
    });

    const sub=await actor('substitution'),subDay=planDay('Original planned day','QA Original Press');
    await routine(sub,'Substitution fixture',[subDay]);
    const old=await startSession(sub,subDay);await sub.call('PUT',`/sessions/${old.sessionId}/exercises/${subDay.exercises[0].id}/substitute`,{name:'QA Older Alternate'});
    await entry(sub,old,subDay.exercises[0],{weight:25,reps:9,done:true});await finish(sub,old);stamp(old,2);
    const recent=await startSession(sub,subDay,2);await sub.call('PUT',`/sessions/${recent.sessionId}/exercises/${subDay.exercises[0].id}/substitute`,{name:'QA Recent Alternate'});
    await entry(sub,recent,subDay.exercises[0],{weight:47.5,reps:7,done:true});await finish(sub,recent);stamp(recent,3);
    // Merely typed/saved but never completed must not displace the last actual use.
    const unused=await startSession(sub,subDay,3);await sub.call('PUT',`/sessions/${unused.sessionId}/exercises/${subDay.exercises[0].id}/substitute`,{name:'QA Uncompleted Alternate'});
    await entry(sub,unused,subDay.exercises[0],{weight:99,reps:3,done:false});await finish(sub,unused);stamp(unused,4);
    await sub.call('POST','/cycles',{});const fresh=await startSession(sub,subDay);await train(sub);
    await check('substitute: new workout keeps original plan; Last used completed alternate is first above input',async()=>{
      const data=await sub.state();assert.equal(data.plan[0].exercises[0].name,'QA Original Press');assert.equal(data.records[`1:${subDay.id}`].exercises[0].name,'QA Original Press');
      await expect(sub.page.locator('.exercise-label strong').first()).toHaveText('QA Original Press');await click(sub.page,'substitute');
      const first=sub.page.locator('#substitution-options [data-action=apply-substitute]').first();await expect(first).toContainText('QA Recent Alternate');await expect(first).toContainText('47.5 lb × 7');
      assert.equal(await sub.page.locator('#substitution-options .eyebrow').first().innerText(),'LAST USED');
      const option=await first.boundingBox(),input=await sub.page.locator('#substitute-form input').boundingBox();assert(option.y+option.height<=input.y,'Last used must be above free text input');
      assert.doesNotMatch(await first.innerText(),/Uncompleted/);
    });
    await check('substitute: one-tap choice uses actual prior substitute performance, not original; persists only to session',async()=>{
      await sub.page.locator('#substitution-options [data-action=apply-substitute]').first().click();await sub.page.locator('#substitute-form').waitFor({state:'detached'});
      await expect(sub.page.locator('.exercise-label strong').first()).toHaveText('QA Recent Alternate');await expect(sub.page.locator('.last-entry').first()).toContainText('Last time · substitute');
      await expect(sub.page.locator('.last-entry').first()).toContainText('47.5 lb × 7');
      const data=await sub.state();assert.equal(data.records[`1:${subDay.id}`].exercises[0].name,'QA Recent Alternate');assert.equal(data.plan[0].exercises[0].name,'QA Original Press');
      await click(sub.page,'use-last');await expect(sub.page.locator('[data-log=weight]').first()).toHaveValue('47.5');await expect(sub.page.locator('[data-log=reps]').first()).toHaveValue('7');
      await expect.poll(async()=>{const e=(await sub.state()).records[`1:${subDay.id}`].exercises[0];return [e.weight,e.reps];}).toEqual([47.5,7]);
      await train(sub);await expect(sub.page.locator('.exercise-label strong').first()).toHaveText('QA Recent Alternate');
    });
    for(const width of [320,390,768])for(const mode of ['light','dark'])await check(`substitute layout: ${width}px ${mode}`,async()=>{
      await sub.page.setViewportSize({width,height:1000});await theme(sub.page,mode);await sub.page.locator('[data-tab=train]').click();await click(sub.page,'substitute');
      await expect(sub.page.locator('#substitution-options [data-action=apply-substitute]').first()).toContainText('QA Recent Alternate');
      await shot(sub.page,`substitute-${width}-${mode}`);await sub.page.keyboard.press('Escape');
    });
    await check('substitute: completed performance rename returns real 409 and keeps plan/record unchanged',async()=>{
      await sub.page.locator('[data-tab=train]').click();await click(sub.page,'complete-exercise');
      await expect(sub.page.locator('.completed-review')).toBeVisible();
      const before=(await sub.state()).records[`1:${subDay.id}`].exercises[0];assert.equal(before.done,true);
      const rejected=await sub.call('PUT',`/sessions/${fresh.sessionId}/exercises/${subDay.exercises[0].id}/substitute`,{name:'Forbidden renamed performance'},409);assert.match(rejected.error,/completed performance/i);
      const after=await sub.state();assert.deepEqual(after.records[`1:${subDay.id}`].exercises[0],before);assert.equal(after.plan[0].exercises[0].name,'QA Original Press');
    });

    const trends=await actor('trends'),days=['Monday Upper','Thursday Upper','Missing result','Zero reps','Negative load','Undone result','Undo after save'].map(name=>planDay(name));
    const mainSplit=await routine(trends,'Session split A',days),expected=[];
    for(const cycle of [1,2]){
      if(cycle===2)await trends.call('POST','/cycles',{});
      for(let week=1;week<=4;week++)for(let d=0;d<2;d++){
        const s=await startSession(trends,days[d],week),weight=cycle*40+week*2+d,reps=6+d;
        await entry(trends,s,days[d].exercises[0],{weight,reps,done:true});await finish(trends,s);
        const date=stamp(s,(cycle-1)*8+(week-1)*2+d+1);expected.push({...s,cycle,week,dayName:days[d].name,splitName:'Session split A',routineId:mainSplit,weight,reps,date});
      }
    }
    const excluded=[];
    for(const [index,payload] of [[2,{weightLbs:'',reps:'',done:true}],[3,{weightLbs:20,reps:0,done:true}],[4,{weightLbs:-10,reps:8,done:true}]]){
      const s=await startSession(trends,days[index]);
      await api('PUT',`/api/sessions/${s.sessionId}/sets`,{exerciseId:days[index].exercises[0].id,setIndex:0,...payload});
      await finish(trends,s);stamp(s,19+index);excluded.push(s.sessionId);
    }
    for(const index of [5,6]){
      const s=await startSession(trends,days[index]);await entry(trends,s,days[index].exercises[0],{weight:333,reps:9,done:index===6});
      if(index===6)await entry(trends,s,days[index].exercises[0],{done:false});
      await finish(trends,s);stamp(s,19+index);excluded.push(s.sessionId);
    }
    const otherDays=['Other Monday','Other Friday'].map(name=>planDay(name));
    const otherSplit=await routine(trends,'Session split B',otherDays);
    for(let d=0;d<2;d++){
      const s=await startSession(trends,otherDays[d]),weight=d?0:120,reps=8;
      await entry(trends,s,otherDays[d].exercises[0],{weight,reps,done:true});await finish(trends,s);
      const date=stamp(s,28+d);expected.push({...s,cycle:1,week:1,dayName:otherDays[d].name,splitName:'Session split B',routineId:otherSplit,weight,reps,date});
    }
    await trends.call('POST','/active-routine',{routineId:mainSplit});await graph(trends.page);
    await check('graph: default All sessions is global across splits; 18 actual SVG markers, not weekly maxima',async()=>{
      await expect(trends.page.locator('[data-action=trend-cycle]')).toContainText('All sessions · Continuous');
      await sameMarkers(trends.page,expected);assert.equal(await trends.page.locator('.session-results tbody tr').count(),18);
      const positions=await trends.page.locator('.trend-chart .trend-point').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('cx')));assert.equal(new Set(positions).size,18);
      assert.equal(await trends.page.locator('.trend-cycle-boundary').count(),2);
      for(const item of expected){
        const point=trends.page.locator(`.trend-chart .trend-point[data-session-id="${item.sessionId}"]`),label=await point.locator('title').textContent();
        const date=new Date(item.date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
        for(const text of [date,item.dayName,item.splitName,`Cycle ${item.cycle} Week ${item.week}`,`${item.weight} lb × ${item.reps}`])assert(label.includes(text),`Missing ${text} in ${label}`);
        const row=trends.page.locator(`.session-results tbody tr[data-session-id="${item.sessionId}"]`);await expect(row).toContainText(item.dayName);await expect(row).toContainText(item.splitName);await expect(row).toContainText(date);await expect(row).toContainText(`C${item.cycle} / W${item.week}`);
      }
      assert.deepEqual(await markerIds(trends.page),expected.map(item=>item.sessionId),'Chronological markers must not merge or reorder same-week training days');
    });
    await check('graph: invalid legacy done results and valid-but-undone/undone-again entries are excluded; zero load retained',async()=>{
      const data=await trends.state();
      for(const id of excluded){assert(data.history.some(record=>record.id===id),'Fixture missing from real API history');assert(!(await markerIds(trends.page)).includes(id));}
      const legacy=data.history.filter(record=>excluded.slice(0,3).includes(record.id));assert(legacy.every(record=>record.exercises[0].done),'Legacy invalid completed fixtures not exercised');
      assert.equal(await trends.page.locator('.trend-point').count(),expected.length);assert(expected.some(item=>item.weight===0));
      const otherId=expected.find(item=>item.weight===0).sessionId;await expect(trends.page.locator(`.session-results tr[data-session-id="${otherId}"]`)).toContainText('0 lb');
    });
    await check('graph: cycle picker scopes split AND cycle; same-week days remain separate and All sessions restores all',async()=>{
      await click(trends.page,'trend-cycle');
      const picker=trends.page.locator('[data-action=select-trend-cycle]');assert.equal(await picker.count(),4);
      for(const name of ['All sessions · Continuous','Cycle 02 · Session split A · Current','Cycle 01 · Session split A','Cycle 01 · Session split B'])await expect(picker.filter({hasText:name})).toBeVisible();
      await picker.filter({hasText:'Cycle 01 · Session split A'}).click();await sameMarkers(trends.page,expected.filter(item=>item.routineId===mainSplit&&item.cycle===1));
      assert.equal(await trends.page.locator('.session-results tbody tr').count(),8);
      await click(trends.page,'trend-cycle');await trends.page.locator('[data-action=select-trend-cycle][data-value=current]').click();
      await sameMarkers(trends.page,expected.filter(item=>item.routineId===mainSplit&&item.cycle===2));
      await click(trends.page,'trend-cycle');await trends.page.locator('[data-action=select-trend-cycle]').filter({hasText:'Cycle 01 · Session split B'}).click();
      await sameMarkers(trends.page,expected.filter(item=>item.routineId===otherSplit));
      await click(trends.page,'trend-cycle');await trends.page.locator('[data-action=select-trend-cycle][data-value=all]').click();await sameMarkers(trends.page,expected);
    });
    for(const width of [320,390,768])for(const mode of ['light','dark'])await check(`graph layout: ${width}px ${mode}, internal scrolling only, full marker count`,async()=>{
      await trends.page.setViewportSize({width,height:1000});await theme(trends.page,mode);await graph(trends.page);await sameMarkers(trends.page,expected);
      const scroll=trends.page.locator('.trend-chart-scroll');
      assert(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth),'Long session graph must scroll internally');
      await scroll.focus();const end=await scroll.evaluate(node=>{node.scrollLeft=node.scrollWidth;return node.scrollLeft;});await trends.page.keyboard.press('Home');
      // Arrow keys verify that the named focusable graph region, not the document, scrolls.
      await scroll.evaluate(node=>node.scrollLeft=0);await trends.page.keyboard.press('ArrowRight');
      await expect.poll(()=>scroll.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);assert(end>0);
      await shot(trends.page,`graph-${width}-${mode}`);
    });
    await check('browser: no uncaught runtime errors during targeted flows',async()=>assert.deepEqual(runtimeErrors,[]));
  }catch(error){results.push({name:base?'fixture/runner':'P0 isolated startup',status:'FAIL',error:error.stack});console.error(error);}
  finally{
    if(browser)await browser.close();if(db)db.close();
    if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    // Evidence persists; the disposable DB and all synthetic identities are removed.
    for(const name of ['synthetic.db','synthetic.db-wal','synthetic.db-shm'])fs.rmSync(path.join(dir,name),{force:true});
    const summary={passed:results.filter(result=>result.status==='PASS').length,failed:results.filter(result=>result.status==='FAIL').length,screenshots:screenshots.length,evidence:dir};
    fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({summary,results,screenshots,runtimeErrors},null,2));
    fs.writeFileSync(path.join(dir,'server.log'),logs);console.log(JSON.stringify(summary));if(summary.failed)process.exitCode=1;
  }
})();
