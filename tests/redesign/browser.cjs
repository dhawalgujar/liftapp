/* Synthetic-only integration runner. Never connects to the development server. */
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const dir=fs.mkdtempSync(path.join('/tmp/opencode','lift-redesign-qa-'));
const dbPath=path.join(dir,'synthetic.db');
const results=[];let child,browser,db,base,user,prefix;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 let logs='';
 child=spawn(process.execPath,['-e',`const {app}=require('./backend/server');const s=app.listen(0,'127.0.0.1',()=>console.log('QA_PORT='+s.address().port));`],{cwd:root,env:{...process.env,DB_PATH:dbPath,SKIP_SEED_SYNC:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<300;i++){const m=logs.match(/QA_PORT=(\d+)/);if(m){base=`http://127.0.0.1:${m[1]}`;assert.equal((await fetch(base)).status,200);return;}if(child.exitCode!==null)throw Error(logs);await delay(100);}throw Error('Isolated startup timeout: '+logs);
}
async function stop(){if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
async function api(method,url,body,status=200){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
const state=()=>api('GET',prefix+'/state');
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e.message);}}
async function login(page){await page.goto(base);await page.locator('[name=username]').fill('qa-synthetic');await page.locator('#login-form button[type=submit]').click();await page.locator('[data-tab=cycle][aria-current=page]').waitFor();}
async function click(page,action){await page.locator(`[data-action="${action}"]`).first().click();await delay(250);}
(async()=>{try{
 await start();console.log('STARTUP PROBE PASSED',base,'EVIDENCE',dir);
 db=new(require(path.join(root,'backend/node_modules/better-sqlite3')))(dbPath);
 browser=await chromium.launch({headless:!process.env.QA_HEADED});let page=await browser.newPage({viewport:{width:390,height:844}});
 await check('new and existing login; real API identity',async()=>{await login(page);user=JSON.parse(await page.evaluate(()=>localStorage.getItem('lift-user')));prefix=`/api/v2/users/${user.id}`;assert.equal((await api('POST','/api/auth/login',{username:'qa-synthetic'})).id,user.id);});
 let original,split,day,exercise,session,deadline;
 await check('true empty split/activity; UI create and activate',async()=>{
 original=(await state()).activeRoutineId;await click(page,'nav');
 await page.locator('[data-tab=settings]').last().click();await click(page,'splits');await click(page,'create-split');await page.locator('#text-form input').fill('Empty synthetic');await page.locator('#text-form button[type=submit]').click();await delay(300);
 const s=await state();split=s.savedSplits.find(x=>x.name==='Empty synthetic').id;await page.locator(`[data-action=activate-split][data-id="${split}"]`).click();await click(page,'confirm-activate-split');await page.getByText('No training days yet.',{exact:true}).waitFor();await page.locator('[data-tab=progress]').click();await page.getByText(/No sessions in this period/).waitFor();assert.equal((await state()).history.length,0);
 });
 await check('UI import structured split and activate',async()=>{
 await page.locator('[data-tab=settings]').last().click();await click(page,'splits');await click(page,'import-split');await page.locator('[name=plan]').fill('Split: Synthetic strength\nDay: A | A very long synthetic upper body workout title for narrow screens | Strength and controlled movement\nSection: Main lifts\nExercise: Synthetic press | 3 | 8–10\nExercise: Synthetic row | 2 | 10–12\nDay: B | Lower | Legs\nSection: Main lifts\nExercise: Synthetic squat | 3 | 5–8');await page.locator('#import-form button[type=submit]').click();await delay(400);
 const s=await state();const saved=s.savedSplits.find(x=>x.name==='Synthetic strength');assert(saved);split=saved.id;await page.locator(`[data-action=activate-split][data-id="${split}"]`).click();await click(page,'confirm-activate-split');day=(await state()).plan[0];exercise=day.exercises[0];
 });
 await check('fresh phase spacing and exact reference icons/font/tokens',async()=>{
 const prod=fs.readFileSync(path.join(root,'public/styles.css'),'utf8'),ref=fs.readFileSync(path.join(root,'designs/lift-redesign/styles.css'),'utf8');assert.equal(prod.split('\n')[0],ref.split('\n')[0]);
 const psrc=fs.readFileSync(path.join(root,'public/app.js'),'utf8'),rsrc=fs.readFileSync(path.join(root,'designs/lift-redesign/app.js'),'utf8');assert.equal(psrc.match(/const icons = \{[\s\S]*?\n\};/)[0],rsrc.match(/const icons = \{[\s\S]*?\n\};/)[0]);
 for(const width of [320,375,390,768,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.getElementById('app').dataset.theme=t,theme);const a=await page.locator('.next-card').boundingBox(),b=await page.locator('.phase-note').boundingBox();assert(b.y>=a.y+a.height,'phase overlaps');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');await page.screenshot({path:path.join(dir,`cycle-${width}-${theme}.png`),fullPage:true});}
 });
 await check('explicit start exact 90 minutes; reload resume idempotent',async()=>{
 await page.setViewportSize({width:390,height:844});await click(page,'resume');await page.locator('#countdown').waitFor();const s=await state();session=s.records[`1:${day.id}`];deadline=session.expiresAt;assert.equal(Date.parse(deadline)-Date.parse(session.startedAt),5400000);await page.reload();await page.locator('[data-tab=train]').click();await api('POST',prefix+'/sessions/start',{dayId:day.id,week:1});assert.equal((await state()).records[`1:${day.id}`].expiresAt,deadline);
 });
 await check('UI substitution before logging; accessible modal focus/Escape',async()=>{
 await click(page,'substitute');await page.locator('[role=dialog]').waitFor();assert(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);await click(page,'substitute');await page.locator('#substitute-form [name=name]').fill('Synthetic alternate press');await page.locator('#substitute-form button[type=submit]').click();await delay(300);assert.equal((await state()).records[`1:${day.id}`].exercises[0].name,'Synthetic alternate press');
 });
 await check('real autosave, complete, undo, invalid completion and 409 substitution',async()=>{
 await page.locator('[data-log=weight]').first().fill('0');await page.locator('[data-log=reps]').first().fill('8');await page.locator('[data-log=reps]').first().blur();await delay(1000);assert.equal((await state()).records[`1:${day.id}`].exercises[0].reps,8);
 await click(page,'complete-exercise');assert.equal((await state()).records[`1:${day.id}`].exercises[0].done,true);
 await api('PUT',prefix+`/sessions/${session.id}/exercises/${exercise.id}/substitute`,{name:'Disallowed rename'},409);
 await api('PUT',prefix+`/sessions/${session.id}/exercises/${exercise.id}`,{done:true,reps:0},400);
 await click(page,'toggle-completed');await page.locator(`[data-action=toggle-exercise][data-id="${exercise.id}"]`).click();await click(page,'exercise-options');await click(page,'undo-exercise');assert.equal((await state()).records[`1:${day.id}`].exercises[0].done,false);
 });
 await check('timer right/long-title layout at five widths and both themes',async()=>{for(const width of [320,375,390,768,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.getElementById('app').dataset.theme=t,theme);const timer=await page.locator('.workout-timer').boundingBox(),title=await page.locator('.training-title h2').boundingBox();assert(timer.x>=title.x+title.width-1,'timer not right of title');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(dir,`timer-${width}-${theme}.png`),fullPage:true});}});
 await check('started snapshot immutable after real editor rename',async()=>{
 await click(page,'edit-current-day');await page.locator(`[data-action=edit-exercise][data-id="${exercise.id}"]`).click();await page.locator('#exercise-form [name=name]').fill('Future renamed press');await page.locator('#exercise-form button[type=submit]').click();await delay(400);const s=await state();assert.equal(s.plan[0].exercises[0].name,'Future renamed press');assert.equal(s.records[`1:${day.id}`].exercises[0].originalName,'Synthetic press');
 });
 await check('editor add/rename/remove section, exercise and day round trips',async()=>{
 const text=async value=>{await page.locator('#text-form input').fill(value);await page.locator('#text-form button[type=submit]').click();await delay(350);};
 await click(page,'add-section');await text('Temporary section');assert((await state()).plan[0].sections.includes('Temporary section'));
 await page.locator('[data-action=section-options][data-section="Temporary section"]').click();await click(page,'rename-section');await text('Renamed section');assert((await state()).plan[0].sections.includes('Renamed section'));
 await page.locator('[data-action=add-exercise][data-section="Renamed section"]').click();await page.locator('#exercise-form [name=name]').fill('Temporary curl');await page.locator('#exercise-form button[type=submit]').click();await delay(350);const added=(await state()).plan[0].exercises.find(e=>e.name==='Temporary curl');assert(added);
 await page.locator(`[data-action=edit-exercise][data-id="${added.id}"]`).click();await click(page,'delete-exercise');await click(page,'confirm-delete-exercise');await delay(350);assert(!(await state()).plan[0].exercises.some(e=>e.id===added.id));
 await page.locator('[data-action=section-options][data-section="Renamed section"]').click();await click(page,'delete-section');await click(page,'confirm-delete-section');assert(!(await state()).plan[0].sections.includes('Renamed section'));
 await click(page,'add-day');await text('Temporary day');let addedDay=(await state()).plan.find(d=>d.name==='Temporary day');assert(addedDay);
 await page.locator(`[data-action=day-options][data-id="${addedDay.id}"]`).click();await click(page,'rename-day');await text('Renamed day');assert((await state()).plan.some(d=>d.name==='Renamed day'));
 await page.locator(`[data-action=day-options][data-id="${addedDay.id}"]`).click();await click(page,'delete-day');await click(page,'confirm-delete-day');assert(!(await state()).plan.some(d=>d.id===addedDay.id));
 });
 await check('deliberate network save failure has retry and real persisted recovery',async()=>{
 await page.locator('[data-tab=train]').click();if(!await page.locator(`[data-log=reps][data-id="${exercise.id}"]`).count())await page.locator(`[data-action=toggle-exercise][data-id="${exercise.id}"]`).click();let blocked=true;
 await page.route('**/api/v2/**/sessions/*/exercises/*',route=>blocked&&route.request().method()==='PUT'?route.abort('failed'):route.continue());
 await page.locator('[data-log=reps]').first().fill('9');await page.locator('[data-log=reps]').first().blur();await page.locator('[data-action=retry-save]').first().waitFor();blocked=false;await page.locator('[data-action=retry-save]').first().click();await delay(700);await page.unroute('**/api/v2/**/sessions/*/exercises/*');assert.equal((await state()).records[`1:${day.id}`].exercises[0].reps,9);
 });
 await check('manual partial finish stops timer and advances without filling',async()=>{await api('POST',prefix+`/sessions/${session.id}/finish`,{});const s=await state(),r=s.records[`1:${day.id}`];assert.equal(r.status,'partial');assert(r.finished);assert.equal(r.finishReason,'manual');assert(r.exercises.every(e=>!e.done));assert.notEqual(s.selected.dayId,day.id);});
 await check('split restore preserves session/cycle and navigation',async()=>{await api('POST',prefix+'/active-routine',{routineId:original});await api('POST',prefix+'/active-routine',{routineId:split});assert.equal((await state()).records[`1:${day.id}`].id,session.id);});
 await check('browser closed; backend periodic expiry persists exact deadline',async()=>{const t=await api('POST',prefix+'/sessions/start',{dayId:day.id,week:2});const expiry=new Date(Date.now()+400).toISOString();db.prepare('UPDATE workout_sessions SET expires_at=? WHERE id=?').run(expiry,t.sessionId);await browser.close();browser=null;await delay(16000);const row=db.prepare('SELECT finished_at,finish_reason,status FROM workout_sessions WHERE id=?').get(t.sessionId);assert.equal(row.finished_at,expiry);assert.equal(row.finish_reason,'timeout');assert.equal(row.status,'partial');});
 await check('restart catchup and resumed deadlines unchanged',async()=>{const t=await api('POST',prefix+'/sessions/start',{dayId:day.id,week:3});await stop();const expiry=new Date(Date.now()-1000).toISOString();db.prepare('UPDATE workout_sessions SET expires_at=? WHERE id=?').run(expiry,t.sessionId);await start();const row=db.prepare('SELECT finished_at,finish_reason FROM workout_sessions WHERE id=?').get(t.sessionId);assert.equal(row.finished_at,expiry);assert.equal(row.finish_reason,'timeout');await api('POST',prefix+'/sessions/start',{dayId:day.id,week:3});assert.equal(db.prepare('SELECT expires_at FROM workout_sessions WHERE id=?').get(t.sessionId).expires_at,expiry);});
 await check('history IDs/timeout copy, Activity first, trend back',async()=>{browser=await chromium.launch({headless:!process.env.QA_HEADED});page=await browser.newPage();await login(page);await page.locator('[data-tab=progress]').click();assert.equal(await page.locator('[data-view=activity]').getAttribute('class'),'active');const r=(await state()).history.find(r=>r.finishReason==='timeout');await page.locator(`[data-action=history-detail][data-id="${r.id}"]`).click();await page.getByText('Automatically finished after 90 minutes.',{exact:true}).waitFor();assert((await page.locator('#screen').innerText()).includes(`Week ${r.week}`));await click(page,'back');await page.locator('[data-view=trends]').click();await click(page,'trend-detail');await click(page,'back');assert.equal(await page.locator('[data-view=trends]').getAttribute('class'),'active');});
 await check('theme persists after refresh and real state reload',async()=>{await page.locator('[data-tab=settings]').last().click();await page.locator('[data-action=theme][data-theme=dark]').click();await page.reload();await page.locator('[data-tab=cycle]').last().waitFor();assert.equal(await page.locator('#app').getAttribute('data-theme'),'dark');});
 await check('new cycle retains immutable historical snapshots',async()=>{const before=await state();await api('POST',prefix+'/cycles',{});const s=await state();assert.equal(s.cycle,before.cycle+1);assert.equal(s.selected.week,1);assert(s.history.some(r=>r.id===session.id));assert.equal(s.history.find(r=>r.id===session.id).exercises[0].originalName,'Synthetic press');});
 await check('lost acknowledgement: UI routine retry reuses operationId and creates exactly once',async()=>{
 const url=base+prefix+'/routines',attempts=[],commits=[];
 const handler=async route=>{
   if(route.request().method()!=='POST')return route.continue();
   attempts.push(route.request().postDataJSON());
   const response=await route.fetch();assert.equal(response.status(),200);commits.push(await response.json());
   if(attempts.length===1)return route.abort('failed');
   return route.fulfill({response});
 };
 await page.route(url,handler);
 try{
   const before=db.prepare('SELECT COUNT(*) AS n FROM routines WHERE user_id=?').get(user.id).n;
   await page.locator('[data-tab=settings]').last().click();await click(page,'splits');await click(page,'create-split');
   await page.locator('#text-form input').fill('Lost acknowledgement synthetic split');await page.locator('#text-form button[type=submit]').click();
   await page.locator('[data-action=retry-save]:visible').waitFor();
   assert.equal(attempts.length,1);assert.equal(commits.length,1);assert.equal(typeof attempts[0].operationId,'string');assert(attempts[0].operationId.length>0);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM routines WHERE user_id=?').get(user.id).n,before+1,'first request really committed');
   const replay=page.waitForResponse(r=>r.url()===url&&r.request().method()==='POST');
   await page.locator('[data-action=retry-save]:visible').click();assert.equal((await replay).status(),200);
   await page.locator('#text-form').waitFor({state:'detached'});
   assert.equal(attempts.length,2);assert.deepEqual(attempts[1],attempts[0]);assert.equal(commits[1].routineId,commits[0].routineId);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM routines WHERE user_id=?').get(user.id).n,before+1);
   assert.equal((await state()).savedSplits.filter(r=>r.name==='Lost acknowledgement synthetic split').length,1);
 }finally{await page.unroute(url,handler);}
 });
 await check('lost acknowledgement: cycle retry preserves captured target and intermediate new-cycle session',async()=>{
 const url=base+prefix+'/cycles',attempts=[],commits=[];
 const handler=async route=>{
   if(route.request().method()!=='POST')return route.continue();
   attempts.push(route.request().postDataJSON());
   const response=await route.fetch();assert.equal(response.status(),200);commits.push(await response.json());
   if(attempts.length===1)return route.abort('failed');
   return route.fulfill({response});
 };
 await page.route(url,handler);
 try{
   const before=await state();await page.locator('[data-tab=settings]').last().click();await click(page,'cycle-options');await click(page,'new-cycle');await click(page,'confirm-new-cycle');
   await page.locator('[data-action=retry-save]:visible').waitFor();assert.equal(attempts.length,1);assert.equal(commits.length,1);
   assert.equal(attempts[0].routineId,before.activeRoutineId);assert.equal(attempts[0].expectedCycle,before.cycle);assert.equal(typeof attempts[0].operationId,'string');assert(attempts[0].operationId.length>0);
   const committed=await state();assert.equal(committed.cycle,before.cycle+1);
   const started=await api('POST',prefix+'/sessions/start',{dayId:committed.plan[0].id,week:1});
   const persisted=db.prepare('SELECT * FROM workout_sessions WHERE id=?').get(started.sessionId);
   assert.equal(persisted.cycle_num,before.cycle+1);assert.equal(persisted.archived,0);assert.equal(persisted.finished_at,null);
   const replay=page.waitForResponse(r=>r.url()===url&&r.request().method()==='POST');
   await page.locator('[data-action=retry-save]:visible').click();assert.equal((await replay).status(),200);
   await page.locator('[data-action=confirm-new-cycle]').waitFor({state:'detached'});
   assert.equal(attempts.length,2);assert.deepEqual(attempts[1],attempts[0]);assert.deepEqual(commits[1],commits[0]);
   const after=await state();assert.equal(after.cycle,before.cycle+1);assert.equal(after.records[`1:${committed.plan[0].id}`].id,started.sessionId);
   assert.deepEqual(db.prepare('SELECT * FROM workout_sessions WHERE id=?').get(started.sessionId),persisted,'retry must not archive, finish, or otherwise mutate intermediate session');
 }finally{await page.unroute(url,handler);}
 });
 await check('two-tab plan conflict: refresh freezes editor version and 409 retains typed draft until explicit reload',async()=>{
 const context=await browser.newContext(),page=await context.newPage();await login(page);
 const other=await context.newPage();
 try{
   const initial=await state(),targetDay=initial.plan[0],target=targetDay.exercises[0],version=initial.planVersion;
   assert.equal(typeof version,'string');
   const edit=async tab=>{
     await tab.locator('[data-tab=settings]').last().click();await click(tab,'edit-current-day');
     const button=tab.locator(`[data-action=edit-exercise][data-id="${target.id}"]`);
     if(!await button.count())await tab.locator(`[data-action=toggle-day][data-id="${targetDay.id}"]`).click();
     await button.click();await tab.locator('#exercise-form').waitFor();
   };
   await edit(page);await page.locator('#exercise-form [name=reps]').fill('17–19');
   await other.goto(base);await other.locator('[data-tab=settings]').last().waitFor();await edit(other);
   await other.locator('#exercise-form [name=name]').fill('Concurrent tab B renamed press');
   const saveUrl=base+prefix+`/routines/${initial.activeRoutineId}/plan`;
   const saved=other.waitForResponse(r=>r.url()===saveUrl&&r.request().method()==='PUT');
   await other.locator('#exercise-form button[type=submit]').click();assert.equal((await saved).status(),200);await other.locator('#exercise-form').waitFor({state:'detached'});
   const newer=await state();assert.notEqual(newer.planVersion,version);assert.equal(newer.plan[0].exercises[0].name,'Concurrent tab B renamed press');
   await page.bringToFront();
   const refreshed=page.waitForResponse(r=>r.url()===base+prefix+'/state'&&r.request().method()==='GET');
   await page.evaluate(()=>refresh());assert.equal((await refreshed).status(),200);
   assert.equal(await page.evaluate(()=>state.planVersion),version,'background refresh must not rebase stale typed edits');
   assert.equal(await page.locator('#exercise-form [name=reps]').inputValue(),'17–19');assert.equal(await page.locator('#exercise-form [name=name]').inputValue(),target.name);
   const rejected=page.waitForResponse(r=>r.url()===saveUrl&&r.request().method()==='PUT');
   await page.locator('#exercise-form button[type=submit]').click();const response=await rejected;assert.equal(response.status(),409);assert.equal(response.request().postDataJSON().planVersion,version);
   await page.locator('[data-action=reload-plan]').first().waitFor();
   assert.equal(await page.locator('#exercise-form [name=reps]').inputValue(),'17–19');assert.equal(await page.locator('#exercise-form [name=name]').inputValue(),target.name);
   const unchanged=await state();assert.equal(unchanged.planVersion,newer.planVersion);assert.equal(unchanged.plan[0].exercises[0].name,'Concurrent tab B renamed press');assert.equal(unchanged.plan[0].exercises[0].reps,target.reps);
   await page.screenshot({path:path.join(dir,'plan-conflict-before-reload.png'),fullPage:true});
   const hit=await page.locator('[role=dialog] [data-action=reload-plan]').evaluate(button=>{
     const r=button.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
     return {button:{x:r.x,y:r.y,width:r.width,height:r.height},hit:top?.outerHTML,clickable:top===button||button.contains(top)};
   });
   fs.writeFileSync(path.join(dir,'plan-conflict-reload-hit.json'),JSON.stringify(hit,null,2));
    assert(hit.clickable,'Dialog Reload latest plan must be unobstructed');
    assert(await page.locator('#save-status').isHidden(),'Background recovery banner must not overlap an open dialog');
    await page.locator('[role=dialog] [data-action=reload-plan]').click();await page.locator('#exercise-form').waitFor({state:'detached'});
   await page.locator('.editor-item strong').filter({hasText:'Concurrent tab B renamed press'}).waitFor();
   assert.equal(await page.evaluate(()=>state.planVersion),newer.planVersion);assert.equal(await page.locator('[data-action=reload-plan]').count(),0);
 }finally{await context.close();}
 });
 }catch(e){results.push({name:'runner',status:'FAIL',error:e.stack});console.error(e);}finally{if(browser)await browser.close();if(db)db.close();await stop();for(const name of ['synthetic.db','synthetic.db-wal','synthetic.db-shm'])fs.rmSync(path.join(dir,name),{force:true});fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,evidence:dir}));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;}})();
