const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lift-redesign-'));
process.env.DB_PATH=path.join(dir,'test.db');process.env.SKIP_SEED_SYNC='1';
const {app,db,redesign}=require('../server');
let now=Date.parse('2026-10-17T12:00:00Z');redesign.service.clock=()=>now;
const server=app.listen(0,'127.0.0.1');
after(()=>{redesign.close();server.close();db.close();fs.rmSync(dir,{recursive:true,force:true});});
async function api(method,url,body,status=200){
  const res=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;
}
const plan=(prefix='a')=>[{id:`${prefix}-day`,name:'Upper',focus:'Strength',sections:['Main'],sectionIds:{Main:`${prefix}-sec`},exercises:[{id:`${prefix}-ex`,name:'Press',sets:3,reps:'8–10',section:'Main'},{id:`${prefix}-ex2`,name:'Row',sets:2,reps:'10',section:'Main'}]}];
function legacyDatabase(filename) {
  const old=new (require('better-sqlite3'))(path.join(dir,filename));
  // Explicit pre-v2 schema: no archive flags on plan parents, no per-split
  // cycle column, lifecycle/snapshot/status columns, or session_entries table.
  old.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,active_routine_id TEXT,current_cycle INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE routines(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,is_default INTEGER DEFAULT 0,created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE routine_days(id TEXT PRIMARY KEY,routine_id TEXT NOT NULL REFERENCES routines(id),day_key TEXT,day_label TEXT,day_name TEXT,focus TEXT,sort_order INTEGER DEFAULT 0);
    CREATE TABLE sections(id TEXT PRIMARY KEY,day_id TEXT NOT NULL REFERENCES routine_days(id),name TEXT,sort_order INTEGER DEFAULT 0);
    CREATE TABLE exercises(id TEXT PRIMARY KEY,section_id TEXT NOT NULL REFERENCES sections(id),name TEXT,sets INTEGER,reps TEXT,sort_order INTEGER DEFAULT 0,archived INTEGER DEFAULT 0);
    CREATE TABLE workout_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),routine_id TEXT REFERENCES routines(id),day_id TEXT REFERENCES routine_days(id),
      week_num INTEGER,cycle_num INTEGER DEFAULT 1,completed INTEGER DEFAULT 0,manually_completed INTEGER DEFAULT 0,completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),archived INTEGER DEFAULT 0,session_day_key TEXT,session_day_label TEXT,session_focus TEXT,session_sets_done INTEGER,session_sets_total INTEGER);
    CREATE TABLE set_logs(id TEXT PRIMARY KEY,session_id TEXT REFERENCES workout_sessions(id),exercise_id TEXT REFERENCES exercises(id),set_index INTEGER,
      weight_lbs REAL,reps INTEGER,done INTEGER DEFAULT 0,substituted_exercise_name TEXT,substituted_library_id TEXT);
    CREATE TABLE routine_state(user_id TEXT REFERENCES users(id),routine_id TEXT REFERENCES routines(id),last_week INTEGER DEFAULT 1,last_day_id TEXT,updated_at TEXT DEFAULT (datetime('now')),PRIMARY KEY(user_id,routine_id));
    CREATE TABLE seed_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  `);
  return old;
}
test('contract integration, snapshots, timer, splits, validation and v1',async()=>{
  const user=await api('POST','/api/auth/login',{username:'fixture'}),u=user.id,p=`/api/v2/users/${u}`;
  const create=await api('POST',`${p}/routines`,{name:'Fixture split',plan:plan()});
  await api('POST',`${p}/active-routine`,{routineId:create.routineId});
  let state=await api('GET',`${p}/state`);assert.equal(Object.keys(state.records).length,0);assert.equal(state.history.length,0);
  const start=await api('POST',`${p}/sessions/start`,{dayId:'a-day',week:1});
  assert.equal(Date.parse(start.expiresAt)-Date.parse(start.startedAt),5400000);
  now+=60000;assert.deepEqual((await api('POST',`${p}/sessions/start`,{dayId:'a-day',week:1})).expiresAt,start.expiresAt);
  const sid=start.sessionId;
  await api('PUT',`${p}/sessions/${sid}/exercises/a-ex`,{done:true},400);
  await api('PUT',`${p}/sessions/${sid}/exercises/a-ex`,{weight:0,reps:10,done:true});
  await api('PUT',`${p}/sessions/${sid}/exercises/a-ex/substitute`,{name:'Other'},409);
  await api('PUT',`${p}/sessions/${sid}/exercises/a-ex2/substitute`,{name:'Cable row'});
  await api('PUT',`${p}/routines/${create.routineId}/plan`,{name:'Edited',plan:[{...plan()[0],exercises:[{...plan()[0].exercises[0],name:'New press',sets:5}]}]});
  state=await api('GET',`${p}/state`);assert.equal(state.records['1:a-day'].exercises[0].originalName,'Press');assert.equal(state.records['1:a-day'].exercises.length,2);
  // Simulate process catch-up with a new service using the same persisted DB.
  now=Date.parse(start.expiresAt)+1000;
  const {Service,Repository}=require('../redesign');const restarted=new Service(new Repository(db),()=>now);restarted.expire();restarted.expire();
  state=await api('GET',`${p}/state`);let rec=state.records['1:a-day'];
  assert.equal(rec.finishedAt,start.expiresAt);assert.equal(rec.finishReason,'timeout');assert.equal(rec.status,'partial');assert.equal(rec.exercises[1].done,false);assert.equal(state.selected.week,2);
  await api('POST',`${p}/sessions/${sid}/finish`,{});assert.equal((await api('GET',`${p}/state`)).records['1:a-day'].finishReason,'timeout');
  await api('PUT',`${p}/sessions/${sid}/exercises/a-ex`,{reps:12});
  assert.equal((await api('POST',`${p}/sessions/start`,{dayId:'a-day',week:1})).expiresAt,start.expiresAt);
  const s2=await api('POST',`${p}/sessions/start`,{dayId:'a-day',week:2});
  await api('POST',`${p}/sessions/${s2.sessionId}/skip`,{});state=await api('GET',`${p}/state`);assert.equal(state.records['2:a-day'].status,'skipped');
  const s3=await api('POST',`${p}/sessions/start`,{dayId:'a-day',week:3});await api('POST',`${p}/sessions/${s3.sessionId}/finish`,{});
  assert.equal((await api('GET',`${p}/state`)).records['3:a-day'].status,'partial');
  const split2=await api('POST',`${p}/routines`,{name:'Second',plan:plan('b')});
  await api('PUT',`${p}/navigation`,{week:4,dayId:'a-day'});
  await api('POST',`${p}/active-routine`,{routineId:split2.routineId});
  await api('PUT',`${p}/navigation`,{week:2,dayId:'b-day'});
  await api('POST',`${p}/cycles`,{});assert.equal((await api('GET',`${p}/state`)).cycle,2);
  await api('POST',`${p}/active-routine`,{routineId:create.routineId});state=await api('GET',`${p}/state`);assert.equal(state.selected.week,4);assert.equal(state.cycle,1);
  await api('DELETE',`${p}/routines/${create.routineId}`,undefined,409);
  await api('POST',`${p}/active-routine`,{routineId:split2.routineId});await api('DELETE',`${p}/routines/${create.routineId}`);
  state=await api('GET',`${p}/state`);assert.ok(state.history.some(r=>r.id===sid && r.exercises[0].reps===12));
  const other=await api('POST','/api/auth/login',{username:'other'});
  await api('POST',`${p}/active-routine`,{routineId:(await api('GET',`/api/v2/users/${other.id}/state`)).activeRoutineId},404);
  await api('PUT',`/api/v2/users/${other.id}/sessions/${sid}/exercises/a-ex`,{reps:8},404);
  await api('POST',`${p}/sessions/start`,{dayId:'b-day',week:5},400);
  await api('POST',`${p}/sessions/start`,{dayId:'a-day',week:1},404);
  await api('GET','/api/v2/users/missing/state',undefined,404);
  const bad=plan('b');bad[0].exercises[0].id='a-ex';await api('PUT',`${p}/routines/${split2.routineId}/plan`,{name:'Bad',plan:bad},404);
  assert.equal((await api('GET',`${p}/state`)).splitName,'Second');
  const legacy=await api('GET',`/api/users/${u}/session?dayId=b-day&week=1`);
  assert.equal(legacy.session.routine_id,split2.routineId);assert.equal(legacy.session.started_at,null);
  await api('PUT',`/api/sessions/${legacy.session.id}/sets`,{exerciseId:'b-ex',setIndex:0,weightLbs:20,reps:8,done:true});
  const history=await api('GET',`/api/users/${u}/history`);assert.ok(history.find(s=>s.id===sid).logs.some(l=>l.reps===12));
  assert.ok((await api('GET',`${p}/state`)).history.some(s=>s.id===legacy.session.id));
  // Untouched legacy future session follows edits; logged sessions do not.
  const future=await api('GET',`/api/users/${u}/session?dayId=b-day&week=4`);
  const changed=plan('b');changed[0].exercises[0].name='Future press';
  await api('PUT',`${p}/routines/${split2.routineId}/plan`,{name:'Second',plan:changed});
  state=await api('GET',`${p}/state`);assert.equal(state.records['4:b-day'].exercises[0].name,'Future press');assert.equal(state.records['1:b-day'].exercises[0].name,'Press');
  assert.equal(state.history.some(s=>s.id===future.session.id),false);
  // Migration rerun preserves logs and finalized deadline.
  const before=db.prepare('SELECT COUNT(*) n FROM set_logs').get().n;require('../redesign-migration')(db);restarted.backfill();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM set_logs').get().n,before);
  assert.equal(db.prepare('SELECT finished_at FROM workout_sessions WHERE id=?').get(sid).finished_at,start.expiresAt);
});

test('legacy completion backfill preserves recorded flags and logs',()=>{
  const u=db.prepare('SELECT id FROM users WHERE username=?').get('fixture').id;
  const r=db.prepare('SELECT id FROM routines WHERE user_id=? AND archived=0').get(u).id;
  db.prepare(`INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,completed,manually_completed,completed_at) VALUES('legacy-fixture',?,?,NULL,1,1,1,'2025-01-02 03:04:05')`).run(u,r);
  require('../redesign-migration')(db);redesign.service.backfill();
  const s=db.prepare('SELECT * FROM workout_sessions WHERE id=?').get('legacy-fixture');
  const rec=redesign.service.record(s);assert.equal(rec.status,'completed');assert.equal(rec.finishReason,'legacy');assert.equal(rec.finishedAt,'2025-01-02T03:04:05.000Z');assert.equal(rec.exercises.length,0);
  assert.equal(s.manually_completed,1);
});

test('genuine pre-v2 schema migrates transactionally and preserves per-set results',()=>{
  const old=legacyDatabase('legacy.db');
  for(const table of ['routines','routine_days','sections']) assert.equal(old.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='archived'),false);
  assert.equal(old.prepare('PRAGMA table_info(routine_state)').all().some(c=>c.name==='cycle_num'),false);
  const preColumns=old.prepare('PRAGMA table_info(workout_sessions)').all().map(c=>c.name);
  for(const c of ['started_at','expires_at','finished_at','finish_reason','snapshot_json','status']) assert.equal(preColumns.includes(c),false);
  assert.equal(old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_entries'").get(),undefined);
  old.prepare('INSERT INTO users(id,username) VALUES(?,?)').run('u','legacy');
  old.prepare('INSERT INTO routines(id,user_id,name) VALUES(?,?,?)').run('r','u','Legacy');
  old.prepare('INSERT INTO routine_days(id,routine_id,day_key,day_label,day_name,focus) VALUES(?,?,?,?,?,?)').run('d','r','day1','Day 1','Upper','Strength');
  old.prepare('INSERT INTO sections(id,day_id,name) VALUES(?,?,?)').run('s','d','Main');
  old.prepare('INSERT INTO exercises(id,section_id,name,sets,reps) VALUES(?,?,?,?,?)').run('e','s','Original',3,'8');
  old.prepare('INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num) VALUES(?,?,?,?,?)').run('w','u','r','d',2);
  old.prepare('INSERT INTO set_logs(id,session_id,exercise_id,set_index,weight_lbs,reps,done,substituted_exercise_name) VALUES(?,?,?,?,?,?,?,?)').run('l','w','e',0,25,9,1,'Actual');
  const migration=require('../redesign-migration');migration(old);migration(old);
  const {Service,Repository}=require('../redesign'),svc=new Service(new Repository(old));svc.backfill();
  const rec=svc.record(old.prepare('SELECT * FROM workout_sessions WHERE id=?').get('w'));
  assert.equal(rec.exercises[0].originalName,'Original');assert.equal(rec.exercises[0].name,'Actual');assert.equal(rec.exercises[0].done,false);
  assert.equal(rec.exercises[0].setLogs[0].weight,25);assert.equal(old.prepare('SELECT COUNT(*) n FROM set_logs').get().n,1);
  assert.equal(rec.startedAt,null);old.close();
});

test('internal failures use contract error without leaking internals',async()=>{
  const original=redesign.service.state;
  redesign.service.state=()=>{throw new Error('private database detail');};
  try {
    const u=db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const result=await api('GET',`/api/v2/users/${u}/state`,undefined,500);
    assert.deepEqual(result,{error:'Internal server error'});
  } finally {redesign.service.state=original;}
});

test('paired representative and chronological prior preserve blank and heterogeneous legacy sets',()=>{
  const old=legacyDatabase('representatives.db');
  try {
    old.exec(`INSERT INTO users(id,username) VALUES('u','representative');
      INSERT INTO routines(id,user_id,name) VALUES('r','u','Split');
      INSERT INTO routine_days(id,routine_id,day_name,focus) VALUES('d','r','Upper','Strength');
      INSERT INTO sections(id,day_id,name) VALUES('s','d','Main');
      INSERT INTO exercises(id,section_id,name,sets,reps) VALUES('e','s','Press',3,'10');`);
    const addSession=(id,w,created,performed)=>old.prepare(`INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,cycle_num,created_at,completed_at)
      VALUES(?,'u','r','d',?,1,?,?)`).run(id,w,created,performed);
    addSession('blank',1,'2025-01-01 00:00:00','2025-01-03 10:00:00');
    addSession('hetero',2,'2024-12-01 00:00:00','2025-01-10 10:00:00');
    addSession('current',3,'2024-11-01 00:00:00','2025-01-17 10:00:00');
    // Exclude future numbered week even if it was completed earlier in real time.
    addSession('future',4,'2025-01-16 00:00:00','2025-01-16 10:00:00');
    addSession('later',1,'2025-01-18 00:00:00','2025-01-18 10:00:00');
    const addLog=(sid,i,w,r,done=1)=>old.prepare('INSERT INTO set_logs(id,session_id,exercise_id,set_index,weight_lbs,reps,done) VALUES(?,?,\'e\',?,?,?,?)').run(`${sid}-${i}`,sid,i,w,r,done);
    addLog('blank',0,45,10);addLog('blank',1,null,null);addLog('blank',2,null,null);
    addLog('hetero',0,50,8);addLog('hetero',1,55,7);addLog('hetero',2,60,6);
    addLog('future',0,999,99);addLog('later',0,888,88);addLog('current',0,777,77);
    require('../redesign-migration')(old);
    const {Service,Repository}=require('../redesign'),svc=new Service(new Repository(old));svc.backfill();
    const record=id=>svc.record(old.prepare('SELECT * FROM workout_sessions WHERE id=?').get(id));
    let e=record('blank').exercises[0];assert.equal(e.weight,45);assert.equal(e.reps,10);assert.equal(e.done,true);
    assert.deepEqual(e.setLogs.map(l=>[l.weight,l.reps]),[[45,10],[null,null],[null,null]]);
    e=record('hetero').exercises[0];assert.equal(e.weight,50);assert.equal(e.reps,8);assert.equal(e.lastWeight,45);assert.equal(e.lastReps,10);
    assert.deepEqual(e.setLogs.map(l=>[l.weight,l.reps]),[[50,8],[55,7],[60,6]]);
    e=record('current').exercises[0];assert.equal(e.lastWeight,50);assert.equal(e.lastReps,8);
    assert.equal(record('current').routineId,'r');
    assert.equal(old.prepare('SELECT COUNT(*) n FROM set_logs').get().n,9);
    // The batched state path must agree with the retained SQL record fallback.
    const state=svc.state('u');
    for(const rec of state.history) assert.deepEqual(rec,record(rec.id));
  } finally {old.close();}
});

test('routine ownership repair precedes snapshots and cycle inference and survives restart',()=>{
  const old=legacyDatabase('repair.db');
  try {
    old.exec(`INSERT INTO users(id,username) VALUES('u','repair'),('foreign','foreign');
      INSERT INTO routines(id,user_id,name) VALUES('wrong','u','First'),('actual','u','Actual'),('foreign-r','foreign','Foreign');
      INSERT INTO routine_days(id,routine_id,day_name,focus) VALUES('d','actual','Actual day','Strength'),('wrong-d','wrong','First day','Strength'),('foreign-d','foreign-r','Foreign day','');
      INSERT INTO sections(id,day_id,name) VALUES('s','d','Main');
      INSERT INTO exercises(id,section_id,name,sets,reps) VALUES('e','s','Press',3,'10');
      INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,cycle_num) VALUES
        ('mismatch','u','wrong','d',2,4),('valid','u','wrong','wrong-d',1,2),
        ('unsafe','u','wrong','foreign-d',1,1),('missing','u','wrong',NULL,1,1);
      INSERT INTO set_logs(id,session_id,exercise_id,set_index,weight_lbs,reps,done) VALUES('l','mismatch','e',0,45,10,1);
      INSERT INTO routine_state(user_id,routine_id,last_week,last_day_id) VALUES('u','wrong',2,'d');
      UPDATE users SET active_routine_id='actual',current_cycle=9 WHERE id='u';`);
    const migration=require('../redesign-migration');migration(old);
    assert.equal(old.prepare("SELECT routine_id FROM workout_sessions WHERE id='mismatch'").get().routine_id,'actual');
    assert.equal(old.prepare("SELECT routine_id FROM workout_sessions WHERE id='unsafe'").get().routine_id,'wrong');
    assert.equal(old.prepare("SELECT routine_id FROM workout_sessions WHERE id='missing'").get().routine_id,'wrong');
    assert.equal(old.prepare("SELECT cycle_num FROM routine_state WHERE routine_id='actual'").get().cycle_num,4);
    assert.equal(old.prepare("SELECT cycle_num FROM routine_state WHERE routine_id='wrong'").get().cycle_num,2);
    assert.deepEqual(old.prepare("SELECT last_week,last_day_id FROM routine_state WHERE routine_id='actual'").get(),{last_week:2,last_day_id:'d'});
    assert.deepEqual(old.prepare("SELECT last_week,last_day_id FROM routine_state WHERE routine_id='wrong'").get(),{last_week:1,last_day_id:null});
    assert.equal(old.prepare("SELECT current_cycle FROM users WHERE id='u'").get().current_cycle,4);
    const {Service,Repository}=require('../redesign'),svc=new Service(new Repository(old));svc.backfill();
    const rec=svc.record(old.prepare("SELECT * FROM workout_sessions WHERE id='mismatch'").get());
    assert.equal(rec.splitName,'Actual');assert.equal(rec.routineId,'actual');assert.equal(rec.exercises[0].weight,45);
    const logs=old.prepare('SELECT * FROM set_logs').all(),sessions=old.prepare('SELECT * FROM workout_sessions ORDER BY id').all();
    migration(old);svc.backfill();assert.deepEqual(old.prepare('SELECT * FROM set_logs').all(),logs);
    assert.deepEqual(old.prepare('SELECT * FROM workout_sessions ORDER BY id').all(),sessions);
    // Already-v2 repair also fixes polluted inferred navigation, once only.
    old.prepare("UPDATE workout_sessions SET routine_id='wrong' WHERE id='mismatch'").run();
    old.prepare("UPDATE routine_state SET cycle_num=4 WHERE routine_id='wrong'").run();
    migration(old);assert.equal(old.prepare("SELECT cycle_num FROM routine_state WHERE routine_id='wrong'").get().cycle_num,2);
    assert.equal(JSON.parse(old.prepare("SELECT snapshot_json FROM workout_sessions WHERE id='mismatch'").get().snapshot_json).splitName,'Actual');
  } finally {old.close();}
});

test('removed-day blank legacy placeholder logs do not fabricate activity',()=>{
  const old=legacyDatabase('placeholders.db');
  try {
    old.exec(`INSERT INTO users(id,username) VALUES('u','placeholder');
      INSERT INTO routines(id,user_id,name) VALUES('r','u','Split');
      INSERT INTO routine_days(id,routine_id,day_name,focus) VALUES('d','r','Removed','');
      INSERT INTO sections(id,day_id,name) VALUES('s','d','Main');
      INSERT INTO exercises(id,section_id,name,sets,reps) VALUES('e','s','Press',3,'10');
      INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num) VALUES('w','u','r','d',1);
      INSERT INTO set_logs(id,session_id,exercise_id,set_index,done) VALUES('empty','w','e',0,0);`);
    require('../redesign-migration')(old);old.prepare("UPDATE routine_days SET archived=1 WHERE id='d'").run();
    const {Service,Repository}=require('../redesign'),svc=new Service(new Repository(old));svc.backfill();
    const rec=svc.record(old.prepare("SELECT * FROM workout_sessions WHERE id='w'").get());
    assert.equal(rec.status,'pending');assert.deepEqual(rec.exercises,[]);assert.equal(svc.state('u').history.length,0);
    assert.equal(old.prepare('SELECT COUNT(*) n FROM set_logs').get().n,1);
  } finally {old.close();}
});

test('review undo retains legacy finish time without latching completion; v1 excludes representative sets',async()=>{
  const {id:u}=await api('POST','/api/auth/login',{username:'review-regression'}),p=`/api/v2/users/${u}`;
  const single=plan('review');single[0].exercises=single[0].exercises.slice(0,1);
  const {routineId}=await api('POST',`${p}/routines`,{name:'Review',plan:single});
  await api('POST',`${p}/active-routine`,{routineId});
  const {session}=await api('GET',`/api/users/${u}/session?dayId=review-day&week=1`);
  for(let i=0;i<3;i++) await api('PUT',`/api/sessions/${session.id}/sets`,{exerciseId:'review-ex',setIndex:i,weightLbs:i===0?45:null,reps:i===0?10:null,done:true});
  let state=await api('GET',`${p}/state`),rec=state.records['1:review-day'];
  assert.equal(rec.status,'completed');assert.equal(rec.finishReason,'legacy');const at=rec.finishedAt;
  await api('PUT',`${p}/sessions/${session.id}/exercises/review-ex`,{done:false});
  rec=(await api('GET',`${p}/state`)).records['1:review-day'];
  assert.equal(rec.status,'partial');assert.equal(rec.exercises[0].done,false);assert.equal(rec.finishedAt,at);assert.equal(rec.finished,true);
  assert.equal(db.prepare('SELECT completed FROM workout_sessions WHERE id=?').get(session.id).completed,0);
  require('../redesign-migration')(db);assert.equal((await api('GET',`${p}/state`)).records['1:review-day'].status,'partial');
  const heat=await api('GET',`/api/users/${u}/heatmap/${new Date(at).getUTCFullYear()}`);assert.equal(heat.yearTotal,0);
  const started=await api('POST',`${p}/sessions/start`,{dayId:'review-day',week:2});
  await api('PUT',`${p}/sessions/${started.sessionId}/exercises/review-ex`,{weight:45,reps:10,done:true});
  await api('POST',`/api/sessions/${started.sessionId}/reset`,{});
  for(let i=0;i<2;i++) await api('PUT',`/api/sessions/${started.sessionId}/sets`,{exerciseId:'review-ex',setIndex:i,weightLbs:45,reps:10,done:true});
  assert.equal(db.prepare('SELECT completed FROM workout_sessions WHERE id=?').get(started.sessionId).completed,0);
  await api('PUT',`/api/sessions/${started.sessionId}/sets`,{exerciseId:'review-ex',setIndex:2,weightLbs:45,reps:10,done:true});
  assert.equal(db.prepare('SELECT completed FROM workout_sessions WHERE id=?').get(started.sessionId).completed,1);
  state=await api('GET',`${p}/state`);assert.equal(state.records['2:review-day'].routineId,routineId);
  assert.equal(state.history.find(r=>r.id===session.id).routineId,routineId);
});

test('repair failure rolls back additive migration and leaves original associations intact',()=>{
  const old=legacyDatabase('rollback.db');
  try {
    old.exec(`INSERT INTO users(id,username) VALUES('u','rollback');
      INSERT INTO routines(id,user_id,name) VALUES('wrong','u','First'),('actual','u','Actual');
      INSERT INTO routine_days(id,routine_id,day_name) VALUES('d','actual','Day');
      INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num) VALUES('w','u','wrong','d',1);
      CREATE TRIGGER prevent_repair BEFORE UPDATE OF routine_id ON workout_sessions
      BEGIN SELECT RAISE(ABORT,'fixture repair failure'); END;`);
    const migrate=require('../redesign-migration');assert.throws(()=>migrate(old),/fixture repair failure/);
    assert.equal(old.prepare("SELECT routine_id FROM workout_sessions WHERE id='w'").get().routine_id,'wrong');
    assert.equal(old.prepare('PRAGMA table_info(routines)').all().some(c=>c.name==='archived'),false);
    assert.equal(old.prepare('PRAGMA table_info(workout_sessions)').all().some(c=>c.name==='snapshot_json'),false);
    old.exec('DROP TRIGGER prevent_repair');migrate(old);
    assert.equal(old.prepare("SELECT routine_id FROM workout_sessions WHERE id='w'").get().routine_id,'actual');
  } finally {old.close();}
});

test('legacy fresh active cycle survives archived-only history, repeat migration and mismatch repair',()=>{
  const old=legacyDatabase('fresh-cycle.db');
  try {
    old.exec(`INSERT INTO users(id,username,active_routine_id,current_cycle) VALUES('u','fresh','actual',4);
      INSERT INTO routines(id,user_id,name) VALUES('first','u','First'),('actual','u','Active'),('inactive','u','Inactive');
      INSERT INTO routine_days(id,routine_id,day_name,focus) VALUES('d','actual','Upper','Strength'),('other','inactive','Other','');
      INSERT INTO sections(id,day_id,name) VALUES('s','d','Main');
      INSERT INTO exercises(id,section_id,name,sets,reps) VALUES('e','s','Press',3,'10');
      INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,cycle_num,archived) VALUES
        ('mismatch','u','first','d',1,3,1),('previous','u','actual','d',2,3,1),('inactive-old','u','inactive','other',1,2,1);
      INSERT INTO routine_state(user_id,routine_id) VALUES('u','first'),('u','actual'),('u','inactive');`);
    const migrate=require('../redesign-migration');migrate(old);migrate(old);
    const {Service,Repository}=require('../redesign'),svc=new Service(new Repository(old));svc.backfill();
    assert.equal(svc.state('u').cycle,4);assert.equal(old.prepare("SELECT current_cycle FROM users WHERE id='u'").get().current_cycle,4);
    assert.equal(old.prepare("SELECT routine_id FROM workout_sessions WHERE id='mismatch'").get().routine_id,'actual');
    assert.equal(old.prepare("SELECT cycle_num FROM routine_state WHERE routine_id='inactive'").get().cycle_num,2);
    assert.equal(old.prepare("SELECT cycle_num FROM routine_state WHERE routine_id='first'").get().cycle_num,1);
    // A missing state row must infer the same fresh active cycle, without a migration.
    old.prepare("DELETE FROM routine_state WHERE routine_id='actual'").run();
    assert.equal(svc.state('u').cycle,4);
    const started=svc.r.atomic(()=>svc.start('u',{dayId:'d',week:1}));
    assert.equal(old.prepare('SELECT cycle_num,archived FROM workout_sessions WHERE id=?').get(started.sessionId).cycle_num,4);
    migrate(old);assert.equal(svc.state('u').cycle,4);
    // Upgrade from an already-run buggy v2 inference is corrected as well.
    old.prepare('DELETE FROM workout_sessions WHERE id=?').run(started.sessionId);
    old.prepare("UPDATE routine_state SET cycle_num=3 WHERE routine_id='actual'").run();
    migrate(old);assert.equal(svc.state('u').cycle,4);
  } finally {old.close();}
});

test('operation IDs replay committed mutations before guards and reject unsafe reuse',async()=>{
  const {id:u}=await api('POST','/api/auth/login',{username:'operations'}),p=`/api/v2/users/${u}`;
  const body={operationId:'create-once',name:'Idempotent',plan:plan('ops')};
  const first=await api('POST',`${p}/routines`,body);
  assert.deepEqual(await api('POST',`${p}/routines`,{plan:body.plan,name:body.name,operationId:body.operationId}),first);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM routines WHERE user_id=? AND name='Idempotent'").get(u).n,1);
  await api('POST',`${p}/routines`,{...body,name:'Different'},409);
  await api('POST',`${p}/active-routine`,{routineId:first.routineId});
  const cycle={operationId:'advance-once',routineId:first.routineId,expectedCycle:1};
  const result=await api('POST',`${p}/cycles`,cycle);
  const session=await api('POST',`${p}/sessions/start`,{dayId:'ops-day',week:1});
  // Equivalent to response loss: replay after a new session was saved in cycle 2.
  assert.deepEqual(await api('POST',`${p}/cycles`,cycle),result);
  assert.equal((await api('GET',`${p}/state`)).cycle,2);
  assert.deepEqual(db.prepare('SELECT cycle_num,archived,finished_at FROM workout_sessions WHERE id=?').get(session.sessionId),{cycle_num:2,archived:0,finished_at:null});
  await api('POST',`${p}/cycles`,{...cycle,expectedCycle:2},409);
  await api('POST',`${p}/routines`,{operationId:cycle.operationId,name:'Cross-kind'},409);
  await api('POST',`${p}/cycles`,{...cycle,operationId:body.operationId},409);
  await api('POST',`${p}/cycles`,{...cycle,operationId:'stale-cycle'},409);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mutation_operations WHERE user_id=? AND operation_id='stale-cycle'").get(u).n,0);
  const other=await api('POST',`${p}/routines`,{operationId:'other-split',name:'Other',plan:plan('ops-other')});
  // Legacy-created inactive routines can have no state row: switching must not
  // inherit the previous active routine's user.current_cycle alias.
  db.prepare('DELETE FROM routine_state WHERE user_id=? AND routine_id=?').run(u,other.routineId);
  await api('POST',`${p}/active-routine`,{routineId:other.routineId});
  assert.deepEqual(await api('POST',`${p}/cycles`,cycle),result); // Replay precedes active guard.
  await api('POST',`${p}/cycles`,{operationId:'wrong-active',routineId:first.routineId,expectedCycle:2},409);
  assert.equal((await api('GET',`${p}/state`)).cycle,1);
  await api('POST',`${p}/cycles`,{operationId:'missing-guards'},400);
  await api('POST',`${p}/routines`,{operationId:'',name:'Bad'},400);
  await api('POST',`${p}/routines`,{operationId:'retry-failed',name:'Invalid',plan:[{}]},400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM routines WHERE user_id=? AND name='Invalid'").get(u).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mutation_operations WHERE user_id=? AND operation_id='retry-failed'").get(u).n,0);
  await api('POST',`${p}/routines`,{operationId:'retry-failed',name:'Valid retry'});
  // Persistence rather than an in-memory cache: a fresh service replays the result.
  const {Service,Repository}=require('../redesign'),restarted=new Service(new Repository(db),()=>now);
  assert.deepEqual(restarted.r.atomic(()=>restarted.advanceCycle(u,cycle)),result);
  assert.deepEqual(restarted.r.atomic(()=>restarted.createRoutine(u,body)),first);
  const {id:secondUser}=await api('POST','/api/auth/login',{username:'operations-second'});
  await api('POST',`/api/v2/users/${secondUser}/routines`,{operationId:body.operationId,name:'Independent user'});
});

test('planVersion detects v2 and v1 edits and stale saves leave the entire tree unchanged',async()=>{
  const {id:u}=await api('POST','/api/auth/login',{username:'plan-versions'}),p=`/api/v2/users/${u}`;
  const original=plan('version');
  const {routineId}=await api('POST',`${p}/routines`,{name:'Versioned',plan:original});
  await api('POST',`${p}/active-routine`,{routineId});
  const initial=await api('GET',`${p}/state`);assert.match(initial.planVersion,/^[a-f0-9]{64}$/);
  assert.equal((await api('GET',`${p}/state`)).planVersion,initial.planVersion);
  // Winning tab removes one exercise and renames the split.
  const edited=structuredClone(original);edited[0].exercises.pop();
  await api('PUT',`${p}/routines/${routineId}/plan`,{name:'Winning tab',plan:edited,planVersion:initial.planVersion});
  const won=await api('GET',`${p}/state`);assert.notEqual(won.planVersion,initial.planVersion);
  const tree=()=>({
    routine:db.prepare('SELECT * FROM routines WHERE id=?').get(routineId),
    days:db.prepare('SELECT * FROM routine_days WHERE routine_id=? ORDER BY id').all(routineId),
    sections:db.prepare('SELECT s.* FROM sections s JOIN routine_days d ON d.id=s.day_id WHERE d.routine_id=? ORDER BY s.id').all(routineId),
    exercises:db.prepare('SELECT e.* FROM exercises e JOIN sections s ON s.id=e.section_id JOIN routine_days d ON d.id=s.day_id WHERE d.routine_id=? ORDER BY e.id').all(routineId)
  });
  const before=tree();
  const conflict=await api('PUT',`${p}/routines/${routineId}/plan`,{name:'Losing tab',plan:original,planVersion:initial.planVersion},409);
  assert.match(conflict.error,/reload/i);assert.deepEqual(tree(),before);
  assert.equal(before.exercises.find(e=>e.id==='version-ex2').archived,1);
  await api('PATCH','/api/exercises/version-ex',{name:'Legacy rename'});
  const afterLegacy=await api('GET',`${p}/state`);assert.notEqual(afterLegacy.planVersion,won.planVersion);
  const legacyTree=tree();
  await api('PUT',`${p}/routines/${routineId}/plan`,{name:'Stale again',plan:[],planVersion:won.planVersion},409);
  assert.deepEqual(tree(),legacyTree);
  await api('PUT',`${p}/routines/${routineId}/plan`,{name:afterLegacy.splitName,plan:afterLegacy.plan,planVersion:afterLegacy.planVersion});
  assert.equal((await api('GET',`${p}/state`)).planVersion,afterLegacy.planVersion);
});

test('operation result persistence and mutations commit or roll back together',async()=>{
  const {id:u}=await api('POST','/api/auth/login',{username:'operation-atomicity'}),p=`/api/v2/users/${u}`;
  const {routineId}=await api('POST',`${p}/routines`,{name:'Atomic',plan:plan('atomic')});
  await api('POST',`${p}/active-routine`,{routineId});
  const session=await api('POST',`${p}/sessions/start`,{dayId:'atomic-day',week:1});
  db.exec(`CREATE TRIGGER fail_operation_insert BEFORE INSERT ON mutation_operations
    WHEN NEW.operation_id IN ('atomic-cycle','atomic-create')
    BEGIN SELECT RAISE(ABORT,'fixture operation failure'); END;`);
  const cycle={operationId:'atomic-cycle',routineId,expectedCycle:1};
  const create={operationId:'atomic-create',name:'Must roll back',plan:plan('atomic-create')};
  try {
    await api('POST',`${p}/cycles`,cycle,500);
    assert.equal((await api('GET',`${p}/state`)).cycle,1);
    assert.deepEqual(db.prepare('SELECT archived,finished_at FROM workout_sessions WHERE id=?').get(session.sessionId),{archived:0,finished_at:null});
    await api('POST',`${p}/routines`,create,500);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM routines WHERE user_id=? AND name='Must roll back'").get(u).n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM routine_days WHERE id='atomic-create-day'").get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mutation_operations WHERE user_id=?').get(u).n,0);
  } finally {db.exec('DROP TRIGGER fail_operation_insert');}
  const result=await api('POST',`${p}/cycles`,cycle);
  assert.deepEqual(await api('POST',`${p}/cycles`,cycle),result);
  const created=await api('POST',`${p}/routines`,create);
  assert.deepEqual(await api('POST',`${p}/routines`,create),created);
});

test('batched prior lookup matches SQL UTC cutoff, split/cycle guards and equal-index tie semantics',()=>{
  const old=legacyDatabase('batch-parity.db');
  try {
    require('../redesign-migration')(old);
    old.exec(`INSERT INTO users(id,username,active_routine_id) VALUES('u','batch-parity','r');
      INSERT INTO routines(id,user_id,name) VALUES('r','u','Main'),('other','u','Other');
      INSERT INTO routine_days(id,routine_id,day_name,focus) VALUES('d','r','Upper',''),('d2','other','Other','');
      INSERT INTO sections(id,day_id,name) VALUES('s','d','Main'),('s2','d2','Main');
      INSERT INTO exercises(id,section_id,name,sets,reps) VALUES('e','s','Renamed plan exercise',3,'10'),('e2','s2','Other plan name',3,'10');
      INSERT INTO routine_state(user_id,routine_id,cycle_num) VALUES('u','r',2);`);
    const snap=e=>JSON.stringify({dayName:'Frozen',focus:'',splitName:'Frozen split',exercises:[{id:e,name:'Press',sets:3,reps:'10',section:'Main'}]});
    const add=(id,cycle,w,created,performed,{routine='r',started=null,finished=null}={})=>{
      old.prepare(`INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,cycle_num,created_at,completed_at,started_at,finished_at,snapshot_json)
        VALUES(?,'u',?,?,?,?,?,?,?,?,?)`).run(id,routine,routine==='r'?'d':'d2',w,cycle,created,performed,started,finished,snap(routine==='r'?'e':'e2'));
    };
    add('early',1,1,'2025-01-01 09:00:00','2025-01-01 10:00:00');
    add('tie-a',1,2,'2024-12-01 00:00:00','2025-01-02T10:00:00.125Z');
    add('tie-b',1,2,'2025-01-02 00:00:00','2025-01-02T11:00:00.125+01:00');
    add('tie-review',1,3,'2025-01-02 00:00:00',null,{started:'2025-01-02T10:00:00.126Z'});
    add('future-week',1,4,'2025-01-02 00:00:00','2025-01-02T10:00:00.1255Z');
    add('future-cycle',2,1,'2025-01-02 00:00:00','2025-01-02T10:00:00.125Z');
    add('other-split',99,4,'2025-01-02 00:00:00','2025-01-02T13:00:00Z',{routine:'other'});
    add('current',1,3,'2024-12-01 00:00:00',null,{started:'2025-01-03T10:00:00Z'});
    add('equal-cutoff',1,1,'2025-01-03 00:00:00','2025-01-03T12:00:00+02:00');
    add('later',1,1,'2025-01-03 00:00:00','2025-01-03T10:00:00.001Z');
    const log=(id,sid,index,weight,reps,name=null,eid='e')=>old.prepare(`INSERT INTO set_logs(id,session_id,exercise_id,set_index,weight_lbs,reps,done,substituted_exercise_name)
      VALUES(?,?,?,?,?,?,1,?)`).run(id,sid,eid,index,weight,reps,name);
    log('first','early',0,45,10);log('blank','early',1,null,null);log('blank2','early',2,null,null);
    log('tie-first','tie-a',0,51,8);log('tie-duplicate','tie-a',0,52,7);log('tie-last','tie-a',1,53,6);
    log('tie-b-first','tie-b',0,99,9);log('future-w','future-week',0,999,9);log('future-c','future-cycle',0,998,9);
    log('other','other-split',-1,70,10,'Cable Press','e2');
    log('own','current',0,777,10,'Cable Press');log('equal','equal-cutoff',0,888,10,'Cable Press');log('later-log','later',0,889,10,'Cable Press');
    old.prepare("INSERT INTO session_entries(session_id,exercise_id,name,weight,reps,done) VALUES('current','e','Cable Press',777,10,1)").run();
    const {Service,Repository}=require('../redesign'),svc=new Service(new Repository(old),()=>Date.parse('2025-01-04T00:00:00Z'));
    const before=old.prepare('SELECT * FROM set_logs ORDER BY rowid').all();
    const state=svc.state('u');
    for(const rec of [...Object.values(state.records),...state.history]) {
      assert.deepEqual(rec,svc.record(old.prepare('SELECT * FROM workout_sessions WHERE id=?').get(rec.id)),rec.id);
    }
    assert.equal(state.history.find(r=>r.id==='tie-review').exercises[0].lastWeight,51);
    assert.equal(state.history.find(r=>r.id==='current').exercises[0].lastWeight,70);
    assert.deepEqual(old.prepare('SELECT * FROM set_logs ORDER BY rowid').all(),before);
  } finally {old.close();}
});

test('state scales to 360 sessions / 1400 logs with bounded SQL and no empty-archive hydration',async t=>{
  const {performance}=require('node:perf_hooks');
  const fixture=legacyDatabase('state-scale.db');
  require('../redesign-migration')(fixture);
  let queries=[];
  const measured=new Proxy(fixture,{get(target,key){
    if(key==='prepare')return sql=>{queries.push(sql);return target.prepare(sql);};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const express=require('express'),app=express();
  const mounted=require('../redesign')(app,measured,{clock:()=>Date.parse('2026-10-17T12:00:00Z')});
  const listener=app.listen(0,'127.0.0.1');
  try {
    await require('node:events').once(listener,'listening');
    const prescriptions=[];
    fixture.transaction(()=>{
      fixture.exec(`INSERT INTO users(id,username,active_routine_id,current_cycle) VALUES('scale','Synthetic scale','r',30);
        INSERT INTO routines(id,user_id,name) VALUES('r','scale','Synthetic split');
        INSERT INTO routine_state(user_id,routine_id,cycle_num) VALUES('scale','r',30);`);
      for(let d=0;d<3;d++) {
        fixture.prepare('INSERT INTO routine_days(id,routine_id,day_name,focus,sort_order) VALUES(?,\'r\',?,?,?)').run(`d${d}`,`Day ${d}`,'Synthetic',d);
        fixture.prepare('INSERT INTO sections(id,day_id,name) VALUES(?,?,\'Main\')').run(`sec${d}`,`d${d}`);
        const ex=[];
        for(let e=0;e<40;e++) {
          const item={id:`e${d}-${e}`,name:`Synthetic lift ${e}`,sets:3,reps:'8–10',section:'Main',sectionId:`sec${d}`};ex.push(item);
          fixture.prepare('INSERT INTO exercises(id,section_id,name,sets,reps,sort_order) VALUES(?,?,?,?,?,?)').run(item.id,`sec${d}`,item.name,3,item.reps,e);
        }
        prescriptions.push({dayName:`Day ${d}`,focus:'Synthetic',splitName:'Synthetic split',exercises:ex});
      }
      const session=fixture.prepare(`INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,cycle_num,archived,created_at,finished_at,finish_reason,status,snapshot_json)
        VALUES(?,'scale','r',?,?,?,?,?,?,?,?,?)`);
      const log=fixture.prepare('INSERT INTO set_logs(id,session_id,exercise_id,set_index,weight_lbs,reps,done,substituted_exercise_name) VALUES(?,?,?,?,?,?,?,?)');
      for(let i=0;i<360;i++) {
        const d=i%3,c=Math.floor(i/12)+1,w=Math.floor((i%12)/3)+1,id=`session-${String(i).padStart(3,'0')}`;
        const at=new Date(Date.UTC(2025,0,1+i,10)).toISOString();
        session.run(id,`d${d}`,w,c,c<30?1:0,at,i<55?at:null,i<55?'legacy':null,i<55?'partial':'pending',i<56?JSON.stringify(prescriptions[d]):null);
        if(i<56)for(let j=0;j<25;j++)log.run(`log-${i}-${j}`,id,`e${d}-${Math.floor(j/3)}`,j%3,j%3===0?45+i:null,j%3===0?10:null,1,j<3 && i%10===0?'Synthetic substitution':null);
      }
    })();
    assert.equal(fixture.prepare('SELECT COUNT(*) n FROM workout_sessions').get().n,360);
    assert.equal(fixture.prepare('SELECT COUNT(*) n FROM set_logs').get().n,1400);
    let hydrated=0;
    const original=mounted.service.record.bind(mounted.service);
    mounted.service.record=(...args)=>{hydrated++;return original(...args);};
    queries=[];const coldStart=performance.now();
    const state=mounted.service.r.atomic(()=>mounted.service.state('scale'));
    const payload=JSON.stringify(state),coldMs=performance.now()-coldStart,coldQueries=queries.length;
    assert.equal(state.history.length,56);assert.equal(Object.keys(state.records).length,12);
    assert.equal(hydrated,68);assert.ok(coldQueries<=40,`Cold SQL budget exceeded: ${coldQueries}`);
    assert.equal(queries.some(sql=>sql.includes('json_each')),false,'State must never execute per-exercise JSON prior queries');
    assert.equal(fixture.prepare('SELECT COUNT(*) n FROM workout_sessions WHERE archived=1 AND snapshot_json IS NULL').get().n,292);
    const samples=[];let warmQueries;
    for(let n=0;n<3;n++) {
      queries=[];const started=performance.now();
      assert.equal(JSON.stringify(mounted.service.r.atomic(()=>mounted.service.state('scale'))),payload);
      samples.push(performance.now()-started);warmQueries=queries.length;
      assert.ok(warmQueries<=25,`Warm SQL budget exceeded: ${warmQueries}`);
    }
    queries=[];const started=performance.now();
    const response=await fetch(`http://127.0.0.1:${listener.address().port}/api/v2/users/scale/state`);
    assert.equal(response.status,200);assert.deepEqual(await response.json(),state);
    const httpMs=performance.now()-started;
    t.diagnostic(`Synthetic fixture: 360 sessions, 1400 logs, 40 prescriptions/session; cold state+JSON ${coldMs.toFixed(1)}ms (${coldQueries} SQL), warm ${samples.map(ms=>ms.toFixed(1)).join('/')}ms (${warmQueries} SQL), HTTP ${httpMs.toFixed(1)}ms; ${Buffer.byteLength(payload)} response bytes`);
    // Query-count and hydration assertions are deterministic; timings are reported
    // rather than a brittle sub-second wall-clock assertion on shared CI hardware.
  } finally {mounted.close();await new Promise(resolve=>listener.close(resolve));fixture.close();}
});
