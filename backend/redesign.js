const { randomUUID: uuid, createHash } = require('node:crypto');
const { inferCycle } = require('./redesign-migration');
// Deterministic object keys; array order is significant for plans and requests.
const canonical = value => JSON.stringify(value, function(key, item) {
  return item && typeof item==='object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])) : item;
});
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const text = (s, label = 'name') => typeof s === 'string' && s.trim() && s.length <= 500 ? s.trim() : fail(`Invalid ${label}`);
const week = w => Number.isInteger(w) && w >= 1 && w <= 4 ? w : fail('Invalid week');
const iso = s => s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').toISOString() : null;
const hashPlan = (name, plan) => createHash('sha256').update(canonical({name,plan})).digest('hex');
const groupBy = (rows, key) => {
  const map=new Map();
  for(const row of rows) {const id=row[key];if(!map.has(id))map.set(id,[]);map.get(id).push(row);}
  return map;
};

// Repository owns SQLite access. Transactions are synchronous (no awaits between reads/writes).
class Repository {
  constructor(db) { this.db = db; }
  all(sql, ...p) { return this.db.prepare(sql).all(...p); }
  get(sql, ...p) { return this.db.prepare(sql).get(...p); }
  run(sql, ...p) { return this.db.prepare(sql).run(...p); }
  atomic(fn) { return this.db.transaction(fn)(); }
  plansForUser(u,routines) {
    // Three tree reads, independent of the number of saved splits/days/sections.
    const days=this.all(`SELECT d.* FROM routine_days d JOIN routines r ON r.id=d.routine_id
      WHERE r.user_id=? AND d.archived=0 ORDER BY d.sort_order,d.rowid`,u);
    const sections=groupBy(this.all(`SELECT s.* FROM sections s JOIN routine_days d ON d.id=s.day_id
      JOIN routines r ON r.id=d.routine_id WHERE r.user_id=? AND d.archived=0 AND s.archived=0
      ORDER BY s.sort_order,s.rowid`,u),'day_id');
    const exercises=groupBy(this.all(`SELECT e.* FROM exercises e JOIN sections s ON s.id=e.section_id
      JOIN routine_days d ON d.id=s.day_id JOIN routines r ON r.id=d.routine_id
      WHERE r.user_id=? AND d.archived=0 AND s.archived=0 AND e.archived=0
      ORDER BY e.sort_order,e.rowid`,u),'section_id');
    const plans=new Map(routines.map(r=>[r.id,[]]));
    for(const d of days) {
      const ss=sections.get(d.id) || [];
      plans.get(d.routine_id).push({id:d.id,name:d.day_name || d.day_label,focus:d.focus,
        sections:ss.map(s=>s.name),sectionIds:Object.fromEntries(ss.map(s=>[s.name,s.id])),
        exercises:ss.flatMap(s=>(exercises.get(s.id) || []).map(e=>({id:e.id,name:e.name,sets:e.sets,reps:e.reps,
          section:s.name,sectionId:s.id,weight:null,lastReps:null})))});
    }
    return plans;
  }
  stateRows(u,now) {
    // SQLite computes both sides of prior-time comparisons. This preserves its
    // UTC/offset/fractional-second julianday semantics, including equal cutoffs.
    const sessions=this.all(`SELECT w.*,
      julianday(COALESCE(w.finished_at,w.completed_at,w.started_at,w.created_at)) _performedTime,
      julianday(COALESCE(w.started_at,w.finished_at,w.completed_at,w.created_at)) _cutoffTime,
      julianday(?) _nowTime FROM workout_sessions w WHERE w.user_id=? ORDER BY w.created_at DESC`,now,u);
    const logs=this.all(`SELECT l.*,l.rowid _rowid,e.id _exerciseId,e.name _exerciseName,
      e.sets _sets,e.reps _reps,s.id _sectionId,s.name _section FROM set_logs l
      JOIN workout_sessions w ON w.id=l.session_id LEFT JOIN exercises e ON e.id=l.exercise_id
      LEFT JOIN sections s ON s.id=e.section_id WHERE w.user_id=? ORDER BY l.set_index,l.rowid`,u);
    const entries=this.all(`SELECT q.* FROM session_entries q JOIN workout_sessions w ON w.id=q.session_id
      WHERE w.user_id=?`,u);
    return {sessions,logs,entries};
  }
  plan(id) {
    return this.all('SELECT * FROM routine_days WHERE routine_id=? AND archived=0 ORDER BY sort_order', id).map(d => {
      const sections = this.all('SELECT * FROM sections WHERE day_id=? AND archived=0 ORDER BY sort_order', d.id);
      return { id: d.id, name: d.day_name || d.day_label, focus: d.focus,
        sections: sections.map(s => s.name), sectionIds: Object.fromEntries(sections.map(s => [s.name,s.id])),
        exercises: sections.flatMap(s => this.all('SELECT * FROM exercises WHERE section_id=? AND archived=0 ORDER BY sort_order', s.id)
          .map(e => ({id:e.id,name:e.name,sets:e.sets,reps:e.reps,section:s.name,sectionId:s.id,weight:null,lastReps:null}))) };
    });
  }
}

// Request-local only: no stale cross-request cache and no per-exercise SQL.
// Logs retain their complete heterogeneous set history; the prior index contains
// only actual completed paired results, keyed by their recorded exercise name.
class RecordContext {
  constructor(rows,plans,routines,persistSnapshot) {
    this.sessions=rows.sessions;
    this.logs=groupBy(rows.logs,'session_id');
    this.entries=groupBy(rows.entries,'session_id');
    this.logsByExercise=new Map();this.entriesByExercise=new Map();this.snapshots=new Map();
    this.plans=plans;this.routines=new Map(routines.map(r=>[r.id,r]));this.persistSnapshot=persistSnapshot;
    this.priors=new Map();
    const sessions=new Map(rows.sessions.map(s=>[s.id,s]));
    for(const [id,logs] of this.logs)this.logsByExercise.set(id,groupBy(logs,'exercise_id'));
    for(const [id,entries] of this.entries)this.entriesByExercise.set(id,new Map(entries.map(e=>[e.exercise_id,e])));
    const names=new Map();
    for(const l of rows.logs) {
      if(l.done!==1 || l.weight_lbs===null || l.reps===null || l.reps<=0 || l._exerciseId===null)continue;
      const s=sessions.get(l.session_id);if(s._performedTime===null)continue;
      if(!names.has(s.id))names.set(s.id,new Map(this.snapshot(s).exercises.map(e=>[e.id,e.name])));
      // SQL COALESCE treats an empty substitution as a name, not as null.
      const name=l.substituted_exercise_name ?? names.get(s.id).get(l.exercise_id) ?? l._exerciseName;
      if(!this.priors.has(name))this.priors.set(name,[]);
      this.priors.get(name).push({session:s,log:l,time:s._performedTime,idBytes:Buffer.from(s.id)});
    }
    for(const list of this.priors.values())list.sort((a,b)=>b.time-a.time || Buffer.compare(a.idBytes,b.idBytes)
      || (a.log.set_index===b.log.set_index?0:a.log.set_index===null?-1:b.log.set_index===null?1:a.log.set_index-b.log.set_index)
      || a.log._rowid-b.log._rowid);
  }
  snapshot(s) {
    if(this.snapshots.has(s.id))return this.snapshots.get(s.id);
    let snap;
    if(s.snapshot_json)snap=JSON.parse(s.snapshot_json);
    else {
      const day=(this.plans.get(s.routine_id) || []).find(d=>d.id===s.day_id);
      snap={dayName:day?.name || s.session_day_label || '',focus:s.session_focus ?? day?.focus ?? '',
        splitName:this.routines.get(s.routine_id)?.name || '',exercises:[...(day?.exercises || [])]};
      const ids=new Set(snap.exercises.map(e=>e.id));
      for(const l of this.logs.get(s.id) || []) {
        if(l._exerciseId!==null && l._sectionId!==null && !ids.has(l.exercise_id) && (l.done===1 || l.weight_lbs!==null || l.reps!==null)) {
          ids.add(l.exercise_id);snap.exercises.push({id:l.exercise_id,name:l._exerciseName,sets:l._sets,reps:l._reps,section:l._section});
        }
      }
      this.persistSnapshot(s.id,snap);
    }
    this.snapshots.set(s.id,snap);return snap;
  }
  prior(s,name) {
    const cutoff=(s.started_at || s.finished_at || s.completed_at || this.logs.get(s.id)?.length) ? s._cutoffTime : s._nowTime;
    if(cutoff===null)return undefined;
    const list=this.priors.get(name) || [];
    // First strictly older result. Equal timestamps must not become "previous".
    let lo=0,hi=list.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(list[mid].time>=cutoff)lo=mid+1;else hi=mid;}
    for(let i=lo;i<list.length;i++) {
      const candidate=list[i],w=candidate.session;
      if(w.id!==s.id && (w.routine_id!==s.routine_id || w.cycle_num<s.cycle_num || (w.cycle_num===s.cycle_num && w.week_num<=s.week_num)))return candidate.log;
    }
    return undefined;
  }
}

class Service {
  constructor(repo, clock = () => Date.now()) { this.r = repo; this.clock = clock; }
  now() { return new Date(this.clock()).toISOString(); }
  user(id) { return this.r.get('SELECT id,username,active_routine_id,current_cycle FROM users WHERE id=?', id) || fail('User not found',404); }
  routine(u,id) { return this.r.get('SELECT id,name FROM routines WHERE id=? AND user_id=? AND archived=0',id,u) || fail('Routine not found',404); }
  ensureRoutineState(u,id,allowGlobal=true) {
    const cycle=inferCycle(this.r.db,u,id,allowGlobal);
    this.r.run('INSERT OR IGNORE INTO routine_state(user_id,routine_id,cycle_num) VALUES(?,?,?)',u,id,cycle);
    this.r.run('UPDATE routine_state SET cycle_num=MAX(cycle_num,?) WHERE user_id=? AND routine_id=?',cycle,u,id);
  }
  planVersion(u,id) {
    const routine=this.routine(u,id);
    return hashPlan(routine.name,this.r.plan(id));
  }
  // Called within the route transaction: replay precedes active/expected guards.
  // The primary key is user+operationId, not user+kind+ID, to reject cross-kind reuse.
  operation(u,kind,body,mutate) {
    if(body.operationId===undefined) return mutate(); // Legacy callers remain supported.
    const id=body.operationId;
    if(typeof id!=='string' || !id.trim() || id.length>200) fail('Invalid operationId');
    const {operationId,...payload}=body, encoded=canonical(payload);
    const previous=this.r.get('SELECT kind,payload_json,result_json FROM mutation_operations WHERE user_id=? AND operation_id=?',u,id);
    if(previous) {
      if(previous.kind!==kind || previous.payload_json!==encoded) fail('operationId was already used for a different request',409);
      return JSON.parse(previous.result_json);
    }
    const result=mutate();
    this.r.run('INSERT INTO mutation_operations(user_id,operation_id,kind,payload_json,result_json,created_at) VALUES(?,?,?,?,?,?)',u,id,kind,encoded,JSON.stringify(result),this.now());
    return result;
  }
  createRoutine(u,b) {
    return this.operation(u,'routines',b,()=>{
      const id=uuid();this.r.run('INSERT INTO routines(id,user_id,name) VALUES(?,?,?)',id,u,text(b.name));
      this.r.run('INSERT INTO routine_state(user_id,routine_id,cycle_num) VALUES(?,?,1)',u,id);
      if(b.plan!==undefined)this.savePlan(u,id,b);
      return {routineId:id};
    });
  }
  advanceCycle(u,b) {
    return this.operation(u,'cycles',b,()=>{
      const a=this.active(u);if(!a)fail('No routine',404);
      if(b.operationId!==undefined && (typeof b.routineId!=='string' || !Number.isSafeInteger(b.expectedCycle) || b.expectedCycle<1)) fail('routineId and positive integer expectedCycle required');
      if(b.routineId!==undefined && b.routineId!==a.id) fail('Active split changed. Reload before starting a new cycle.',409);
      const current=this.r.get('SELECT cycle_num FROM routine_state WHERE user_id=? AND routine_id=?',u,a.id).cycle_num;
      if(b.expectedCycle!==undefined && b.expectedCycle!==current) fail('Cycle changed. Reload before starting a new cycle.',409);
      for(const s of this.r.all('SELECT * FROM workout_sessions WHERE user_id=? AND routine_id=? AND archived=0',u,a.id)) {
        if(s.started_at&&!s.finished_at)this.finish(s,'manual');
      }
      this.r.run('UPDATE workout_sessions SET archived=1 WHERE user_id=? AND routine_id=?',u,a.id);
      this.r.run('UPDATE routine_state SET cycle_num=cycle_num+1,last_week=1,last_day_id=NULL WHERE user_id=? AND routine_id=?',u,a.id);
      this.r.run('UPDATE users SET current_cycle=? WHERE id=?',current+1,u);
      return {ok:true};
    });
  }
  active(u) {
    const user = this.user(u);
    const routine = this.r.get('SELECT id,name FROM routines WHERE user_id=? AND archived=0 ORDER BY (id=?) DESC,is_default DESC,created_at,id',u,user.active_routine_id || '') || null;
    if (routine) {
      this.r.run('UPDATE users SET active_routine_id=? WHERE id=?',routine.id,u);
      this.ensureRoutineState(u,routine.id);
    }
    return routine;
  }
  session(u,id) { this.user(u); return this.r.get('SELECT * FROM workout_sessions WHERE id=? AND user_id=?',id,u) || fail('Session not found',404); }
  snapshot(s) {
    if (s.snapshot_json) return JSON.parse(s.snapshot_json);
    const day = this.r.plan(s.routine_id).find(d => d.id === s.day_id);
    // Missing deleted legacy prescriptions cannot be reconstructed honestly.
    const snap = { dayName:day?.name || s.session_day_label || '',focus:s.session_focus ?? day?.focus ?? '',
      splitName:this.r.get('SELECT name FROM routines WHERE id=?',s.routine_id)?.name || '',
      exercises:day?.exercises || [] };
    // Include archived exercises with surviving logs, even if reseeding removed them.
    for (const e of this.r.all(`SELECT DISTINCT e.id,e.name,e.sets,e.reps,sec.name section FROM set_logs l
      JOIN exercises e ON e.id=l.exercise_id JOIN sections sec ON sec.id=e.section_id WHERE l.session_id=?
      AND (l.done=1 OR l.weight_lbs IS NOT NULL OR l.reps IS NOT NULL)`,s.id))
      if (!snap.exercises.some(x => x.id===e.id)) snap.exercises.push(e);
    this.r.run('UPDATE workout_sessions SET snapshot_json=? WHERE id=?',JSON.stringify(snap),s.id);
    return snap;
  }
  record(s,context) {
    const snap = context ? context.snapshot(s) : this.snapshot(s);
    const logs = context ? context.logs.get(s.id) || [] : this.r.all('SELECT * FROM set_logs WHERE session_id=? ORDER BY set_index,rowid',s.id);
    const entries = context ? context.entries.get(s.id) || [] : this.r.all('SELECT * FROM session_entries WHERE session_id=?',s.id);
    const exercises = snap.exercises.map(e => {
      const ls = context ? context.logsByExercise.get(s.id)?.get(e.id) || [] : logs.filter(l=>l.exercise_id===e.id);
      const q = context ? context.entriesByExercise.get(s.id)?.get(e.id) : entries.find(x=>x.exercise_id===e.id);
      // The original UI recorded load/reps on set zero and only toggled done on
      // later sets. Prefer an actual paired result, never a later blank done row.
      const specified = l => l.weight_lbs !== null && l.reps !== null;
      const last = ls.find(l=>l.done && specified(l)) || ls.find(specified) || ls[0];
      const name=q?.name || last?.substituted_exercise_name || e.name;
      const prior = context ? context.prior(s,name) : this.r.get(`SELECT l.weight_lbs,l.reps FROM set_logs l JOIN workout_sessions w ON w.id=l.session_id
        JOIN exercises e ON e.id=l.exercise_id WHERE w.user_id=? AND w.id<>? AND l.done=1
        AND l.weight_lbs IS NOT NULL AND l.reps IS NOT NULL AND l.reps>0
        AND julianday(COALESCE(w.finished_at,w.completed_at,w.started_at,w.created_at)) < julianday(?)
        AND (w.routine_id IS NOT ? OR w.cycle_num < ? OR (w.cycle_num=? AND w.week_num<=?))
        AND COALESCE(l.substituted_exercise_name,
          (SELECT json_extract(j.value,'$.name') FROM json_each(w.snapshot_json,'$.exercises') j
           WHERE json_extract(j.value,'$.id')=l.exercise_id LIMIT 1),e.name)=?
        ORDER BY julianday(COALESCE(w.finished_at,w.completed_at,w.started_at,w.created_at)) DESC,
          w.id,l.set_index ASC,l.rowid ASC LIMIT 1`,s.user_id,s.id,
          s.started_at || s.finished_at || s.completed_at || (logs.length ? s.created_at : this.now()),
           s.routine_id,s.cycle_num,s.cycle_num,s.week_num,name);
      return {id:e.id,name:q?.name || last?.substituted_exercise_name || e.name,originalName:e.name,section:e.section,
        sets:e.sets,targetReps:e.reps,weight:q ? q.weight ?? '' : last?.weight_lbs ?? '',reps:q ? q.reps ?? '' : last?.reps ?? '',
        lastWeight:prior?.weight_lbs ?? null,lastReps:prior?.reps ?? null,
        done:q ? !!q.done : new Set(ls.filter(l=>l.done && l.set_index>=0 && l.set_index<e.sets).map(l=>l.set_index)).size>=e.sets,
        // Preserve per-set substitutions/results for consumers that need finer-grained history.
        setLogs:ls.map(l=>({setIndex:l.set_index,weight:l.weight_lbs,reps:l.reps,done:!!l.done,name:l.substituted_exercise_name || e.name}))};
    });
    const any = exercises.some(e=>e.done || e.weight!=='' || e.reps!=='');
    const status = s.status==='skipped' ? 'skipped' : s.finish_reason==='legacy' && s.completed && !entries.length ? 'completed' :
      exercises.length && exercises.every(e=>e.done) ? 'completed' : (s.finished_at || any || s.started_at ? 'partial':'pending');
    return {id:s.id,routineId:s.routine_id,week:s.week_num,dayId:s.day_id,dayName:snap.dayName,focus:snap.focus,status,
      startedAt:iso(s.started_at),expiresAt:iso(s.expires_at),finishedAt:iso(s.finished_at),finishReason:s.finish_reason,
      finished:!!s.finished_at,date:iso(s.finished_at || s.started_at || (any ? s.created_at:null))?.slice(0,10) || null,
      exercises,cycle:s.cycle_num,splitName:snap.splitName,
      legacyStats:{done:s.session_sets_done,total:s.session_sets_total}};
  }
  finish(s, reason, at=this.now()) {
    if (s.finished_at) return;
    const rec=this.record(s), status=reason==='skipped'?'skipped':rec.exercises.length && rec.exercises.every(e=>e.done)?'completed':'partial';
    this.r.run(`UPDATE workout_sessions SET finished_at=?,finish_reason=?,status=?,completed=?,manually_completed=?,completed_at=? WHERE id=? AND finished_at IS NULL`,
      at,reason,status,status==='completed'?1:0,reason==='manual'?1:0,at,s.id);
  }
  expire() { this.r.atomic(()=>{
    for(const s of this.r.all('SELECT * FROM workout_sessions WHERE finished_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?',this.now())) this.finish(s,'timeout',s.expires_at);
  }); }
  backfill() { this.r.atomic(()=>{for(const s of this.r.all('SELECT * FROM workout_sessions WHERE snapshot_json IS NULL')) this.snapshot(s);}); }
  state(u) {
    const user=this.user(u), active=this.active(u);
    const routines=this.r.all('SELECT id,name,archived FROM routines WHERE user_id=? ORDER BY created_at',u);
    const plans=this.r.plansForUser(u,routines);
    const savedSplits=routines.filter(r=>!r.archived).map(r=>({id:r.id,name:r.name,plan:plans.get(r.id)}));
    const nav=active && this.r.get('SELECT * FROM routine_state WHERE user_id=? AND routine_id=?',u,active.id);
    const cycle=nav?.cycle_num || 1, plan=savedSplits.find(r=>r.id===active?.id)?.plan || [];
    const rows=this.r.stateRows(u,this.now()),sessions=rows.sessions;
    const context=new RecordContext(rows,plans,routines,(id,snap)=>this.r.run('UPDATE workout_sessions SET snapshot_json=? WHERE id=?',JSON.stringify(snap),id));
    const records={}, history=[];
    for(const s of sessions) {
      const current=s.routine_id===active?.id && s.cycle_num===cycle && !s.archived;
      // Empty archived/future legacy placeholders cannot be Activity. Do not
      // hydrate their prescription or create snapshots simply to discard them.
      if(!current && !s.finished_at && !s.started_at
        && !(context.logs.get(s.id) || []).some(l=>l.done || l.weight_lbs!==null || l.reps!==null)
        && !(context.entries.get(s.id) || []).some(e=>e.done || e.weight!==null || e.reps!==null))continue;
      const rec=this.record(s,context);
      if(s.routine_id===active?.id && s.cycle_num===cycle && !s.archived && !records[`${s.week_num}:${s.day_id}`]) records[`${s.week_num}:${s.day_id}`]=rec;
      if(rec.finished || rec.startedAt || rec.exercises.some(e=>e.done || e.weight!=='' || e.reps!=='')) history.push(rec);
    }
    let selected={week:nav?.last_week || 1,dayId:nav?.last_day_id || plan[0]?.id || null};
    const choices=[]; for(let w=1;w<=4;w++) for(const d of plan) choices.push({week:w,dayId:d.id});
    if(!plan.some(d=>d.id===selected.dayId) || records[`${selected.week}:${selected.dayId}`]?.finished) selected=choices.find(c=>!records[`${c.week}:${c.dayId}`]?.finished) || choices.at(-1) || selected;
    const partial=choices.find(c=>c.week===selected.week && records[`${c.week}:${c.dayId}`]?.status==='partial' && !records[`${c.week}:${c.dayId}`]?.finished);
    selected=partial || selected;
    return {user:{id:user.id,username:user.username},cycle,activeRoutineId:active?.id || null,splitName:active?.name || '',planVersion:active?hashPlan(active.name,plan):null,plan,records,history,savedSplits,selected,serverNow:this.now()};
  }
  start(u,b) { week(b.week); const active=this.active(u); if(!active) fail('No routine',404);
    const day=this.r.plan(active.id).find(d=>d.id===b.dayId) || fail('Day not found',404);
    const nav=this.r.get('SELECT cycle_num FROM routine_state WHERE user_id=? AND routine_id=?',u,active.id);
    let s=this.r.get('SELECT * FROM workout_sessions WHERE user_id=? AND routine_id=? AND day_id=? AND week_num=? AND cycle_num=? AND archived=0',u,active.id,day.id,b.week,nav.cycle_num);
    if(!s) {const id=uuid(); this.r.run('INSERT INTO workout_sessions(id,user_id,routine_id,day_id,week_num,cycle_num) VALUES(?,?,?,?,?,?)',id,u,active.id,day.id,b.week,nav.cycle_num);s=this.session(u,id);}
    this.snapshot(s);
    if(!s.started_at && !s.finished_at) this.r.run('UPDATE workout_sessions SET started_at=?,expires_at=? WHERE id=?',this.now(),new Date(this.clock()+90*60*1000).toISOString(),s.id);
    s=this.session(u,s.id); return {sessionId:s.id,startedAt:iso(s.started_at),expiresAt:iso(s.expires_at),serverNow:this.now()};
  }
  entry(u,sid,eid,b,sub=false) {
    const s=this.session(u,sid), rec=this.record(s), e=rec.exercises.find(e=>e.id===eid) || fail('Exercise not found',404);
    if(sub) {
      const name=text(b.name);
      // Do not relabel completed historical performance as a different exercise.
      if(name!==e.name && (e.done || e.setLogs.some(l=>l.done))) fail('Cannot substitute completed performance; keep the recorded exercise',409);
      e.name=name;
    } else {
      if(!['weight','reps','done'].some(k=>Object.hasOwn(b,k))) fail('No fields supplied');
      for(const k of ['weight','reps']) if(Object.hasOwn(b,k)) {
        const v=b[k]; if(v!=='' && (typeof v!=='number' || !Number.isFinite(v) || v<0 || (k==='reps' && (!Number.isInteger(v)||v===0)))) fail(`Invalid ${k}`);
        e[k]=v;
      }
      if(Object.hasOwn(b,'done')) {if(typeof b.done!=='boolean') fail('Invalid done');e.done=b.done;}
      if(e.done && (e.weight==='' || e.reps==='' || !Number.isInteger(e.reps) || e.reps<=0)) fail('Completion requires weight and positive integer reps');
    }
    this.r.run(`INSERT INTO session_entries(session_id,exercise_id,name,weight,reps,done) VALUES(?,?,?,?,?,?)
      ON CONFLICT(session_id,exercise_id) DO UPDATE SET name=excluded.name,weight=excluded.weight,reps=excluded.reps,done=excluded.done`,sid,eid,e.name,e.weight===''?null:e.weight,e.reps===''?null:e.reps,e.done?1:0);
    // Representative entry uses reserved index -1, never overwriting legacy per-set logs.
    this.r.run('DELETE FROM set_logs WHERE session_id=? AND exercise_id=? AND set_index=-1',sid,eid);
    this.r.run('INSERT INTO set_logs(id,session_id,exercise_id,set_index,weight_lbs,reps,done,substituted_exercise_name) VALUES(?,?,?,-1,?,?,?,?)',uuid(),sid,eid,e.weight===''?null:e.weight,e.reps===''?null:e.reps,e.done?1:0,e.name===e.originalName?null:e.name);
    const updated=this.record(this.session(u,sid));
    this.r.run('UPDATE workout_sessions SET status=?,completed=? WHERE id=?',updated.status,updated.status==='completed'?1:0,sid);
    return {ok:true};
  }
  savePlan(u,rid,b) {
    this.routine(u,rid);
    if(b.planVersion!==undefined && b.planVersion!==this.planVersion(u,rid)) fail('This plan changed in another tab. Reload the plan before saving again.',409);
    const name=text(b.name);
    if(!Array.isArray(b.plan)||b.plan.length>100) fail('Invalid plan');
    const seen=new Set();
    const stable=(table,id,parentCol,parent)=>{
      if(id!==undefined && (typeof id!=='string'||!id||id.length>200)) fail('Invalid ID');
      id=id||uuid();if(seen.has(id)) fail('Duplicate ID');seen.add(id);
      const old=this.r.get(`SELECT ${parentCol} parent FROM ${table} WHERE id=?`,id);
      if(old && old.parent!==parent) fail('Foreign ID',404);return id;
    };
    // Capture before any edits. Untouched pre-created v1 sessions adopt the future plan.
    for(const s of this.r.all('SELECT * FROM workout_sessions WHERE routine_id=?',rid)) this.snapshot(s);
    const days=b.plan.map((d,i)=>{
      if(!d || typeof d!=='object' || Array.isArray(d)) fail('Invalid day');
      const id=stable('routine_days',d.id,'routine_id',rid),dn=text(d.name),focus=typeof d.focus==='string'?d.focus:'';
      if(!Array.isArray(d.exercises)||d.exercises.length>500||!Array.isArray(d.sections)) fail('Invalid day');
      if(d.exercises.some(e=>!e || typeof e!=='object' || Array.isArray(e))) fail('Invalid exercise');
      const names=[...new Set([...d.sections,...d.exercises.map(e=>e.section || 'Main lifts')])];
      const sections=names.map(n=>({name:text(n),id:stable('sections',d.sectionIds?.[n],'day_id',id)}));
      const exercises=d.exercises.map((e,j)=>{
        if(!e || typeof e!=='object' || Array.isArray(e)) fail('Invalid exercise');
        const sec=sections.find(s=>s.name===(e.section || 'Main lifts'));
        if(!Number.isInteger(e.sets)||e.sets<1||e.sets>100) fail('Invalid sets');
        return {id:stable('exercises',e.id,'section_id',sec.id),name:text(e.name),sets:e.sets,reps:text(String(e.reps || '8–10')),sec:sec.id,order:j};
      });return {id,name:dn,focus,sections,exercises,order:i};
    });
    this.r.run('UPDATE routines SET name=? WHERE id=?',name,rid);
    this.r.run('UPDATE exercises SET archived=1 WHERE section_id IN (SELECT s.id FROM sections s JOIN routine_days d ON d.id=s.day_id WHERE d.routine_id=?)',rid);
    this.r.run('UPDATE sections SET archived=1 WHERE day_id IN (SELECT id FROM routine_days WHERE routine_id=?)',rid);
    this.r.run('UPDATE routine_days SET archived=1 WHERE routine_id=?',rid);
    for(const d of days) {
      this.r.run(`INSERT INTO routine_days(id,routine_id,day_key,day_label,day_name,focus,sort_order) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET day_name=excluded.day_name,day_label=excluded.day_label,focus=excluded.focus,sort_order=excluded.sort_order,archived=0`,d.id,rid,`day${d.order+1}`,d.name,d.name,d.focus,d.order);
      d.sections.forEach((s,i)=>this.r.run(`INSERT INTO sections(id,day_id,name,sort_order) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,archived=0`,s.id,d.id,s.name,i));
      for(const e of d.exercises) this.r.run(`INSERT INTO exercises(id,section_id,name,sets,reps,sort_order) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sets=excluded.sets,reps=excluded.reps,sort_order=excluded.sort_order,archived=0`,e.id,e.sec,e.name,e.sets,e.reps,e.order);
    }
    this.r.run(`UPDATE workout_sessions SET snapshot_json=NULL WHERE routine_id=? AND started_at IS NULL AND finished_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM set_logs WHERE session_id=workout_sessions.id) AND NOT EXISTS(SELECT 1 FROM session_entries WHERE session_id=workout_sessions.id)`,rid);
    return {ok:true};
  }
  remove(u,id) { const active=this.active(u);this.routine(u,id);
    if(active?.id===id || this.r.get('SELECT COUNT(*) n FROM routines WHERE user_id=? AND archived=0',u).n<=1) fail('Cannot delete active or last split',409);
    for(const s of this.r.all('SELECT * FROM workout_sessions WHERE routine_id=?',id)) this.snapshot(s);
    this.r.run('UPDATE routines SET archived=1 WHERE id=?',id);return {ok:true};
  }
}

module.exports = function mount(app,db,options={}) {
  const service=new Service(new Repository(db),options.clock);
  service.backfill();service.expire();
  const timer=setInterval(()=>{try{service.expire();}catch(e){console.error('session.expiry.failed',{message:e.message});}},options.intervalMs || 15000);timer.unref();
  const router=require('express').Router({mergeParams:true});
  router.use((req,res,next)=>{try{service.expire();service.user(req.params.userId);
    if (['POST','PUT'].includes(req.method) && (!req.body || typeof req.body!=='object' || Array.isArray(req.body))) fail('JSON object required');
    next();}catch(e){next(e);}});
  const route=(method,path,fn)=>router[method](path,(req,res,next)=>{try{res.json(service.r.atomic(()=>fn(req.params.userId,req)));}catch(e){next(e);}});
  route('get','/state',u=>service.state(u));
  route('post','/sessions/start',(u,q)=>service.start(u,q.body));
  route('put','/sessions/:sessionId/exercises/:exerciseId',(u,q)=>service.entry(u,q.params.sessionId,q.params.exerciseId,q.body));
  route('put','/sessions/:sessionId/exercises/:exerciseId/substitute',(u,q)=>service.entry(u,q.params.sessionId,q.params.exerciseId,q.body,true));
  for(const [path,reason] of [['finish','manual'],['skip','skipped']]) route('post',`/sessions/:sessionId/${path}`,(u,q)=>{service.finish(service.session(u,q.params.sessionId),reason);return {ok:true};});
  route('put','/routines/:routineId/plan',(u,q)=>service.savePlan(u,q.params.routineId,q.body));
  route('post','/routines',(u,q)=>service.createRoutine(u,q.body));
  route('delete','/routines/:routineId',(u,q)=>service.remove(u,q.params.routineId));
  route('post','/active-routine',(u,q)=>{service.routine(u,q.body.routineId);const old=service.active(u);service.ensureRoutineState(u,q.body.routineId,old?.id===q.body.routineId);const n=service.r.get('SELECT cycle_num FROM routine_state WHERE user_id=? AND routine_id=?',u,q.body.routineId);service.r.run('UPDATE users SET active_routine_id=?,current_cycle=? WHERE id=?',q.body.routineId,n.cycle_num,u);return {ok:true};});
  route('put','/navigation',(u,q)=>{week(q.body.week);const a=service.active(u);if(!a || !service.r.plan(a.id).some(d=>d.id===q.body.dayId))fail('Day not found',404);service.r.run('UPDATE routine_state SET last_week=?,last_day_id=? WHERE user_id=? AND routine_id=?',q.body.week,q.body.dayId,u,a.id);return {ok:true};});
  route('post','/cycles',(u,q)=>service.advanceCycle(u,q.body));
  router.use((e,req,res,next)=>{if(!e.status)console.error('v2.request.failed',{method:req.method,path:req.route?.path});res.status(e.status || 500).json({error:e.status?e.message:'Internal server error'});});
  app.use('/api/v2/users/:userId',router);
  return {service,close:()=>clearInterval(timer)};
};
module.exports.Repository=Repository;
module.exports.Service=Service;
