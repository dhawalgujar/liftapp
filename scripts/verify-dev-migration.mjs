import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'backend','package.json'));
const Database=require('better-sqlite3');
const baseline=new Database(path.join(root,'.dev/backups/baseline.db'),{readonly:true,fileMustExist:true});
const dev=new Database(path.join(root,'.dev/data/lift.db'),{readonly:true,fileMustExist:true});
const allowAdditions=process.argv.includes('--allow-additions');
const summary={};
const addedRecords={};
try {
  for(const database of [baseline,dev])assert.equal(database.pragma('integrity_check',{simple:true}),'ok');
  for(const table of ['users','routines','routine_days','sections','exercises','exercise_library','workout_sessions','set_logs']){
    const columns=baseline.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
    const source=baseline.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const target=dev.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    if(allowAdditions)assert(target.length>=source.length,`${table}: original records were removed`);
    else assert.equal(target.length,source.length,`${table}: record count changed before development testing (use --allow-additions after creating separate test data)`);
    if(target.length>source.length)addedRecords[table]=target.length-source.length;
    const byId=new Map(target.map(row=>[row.id,row]));
    for(const original of source){
      const migrated=byId.get(original.id);assert(migrated,`${table}: original record missing`);
      for(const column of columns){
        // These are deliberately normalized to each split's actual ownership/state.
        if(table==='workout_sessions'&&column==='routine_id'){
          const owner=baseline.prepare(`SELECT d.routine_id FROM routine_days d JOIN routines actual ON actual.id=d.routine_id
            JOIN routines previous ON previous.id=? WHERE d.id=? AND actual.user_id=? AND previous.user_id=?`)
            .get(original.routine_id,original.day_id,original.user_id,original.user_id);
          assert.equal(migrated.routine_id,owner?.routine_id??original.routine_id,'Session ownership repair differs from unambiguous day owner');
          continue;
        }
        if(table==='users'&&['active_routine_id','current_cycle'].includes(column))continue;
        assert.deepEqual(migrated[column],original[column],`${table}: an original ${column} value changed`);
      }
    }
    summary[table]=source.length;
  }
  const originalViolations=baseline.pragma('foreign_key_check');
  const migratedViolations=dev.pragma('foreign_key_check');
  assert.deepEqual(migratedViolations,originalViolations,'Migration introduced foreign-key violations');
  const originalMismatch=baseline.prepare('SELECT COUNT(*) n FROM workout_sessions w JOIN routine_days d ON d.id=w.day_id WHERE w.routine_id IS NOT d.routine_id').get().n;
  const remainingMismatch=dev.prepare('SELECT COUNT(*) n FROM workout_sessions w JOIN routine_days d ON d.id=w.day_id WHERE w.routine_id IS NOT d.routine_id').get().n;
  const snapshots=dev.prepare('SELECT COUNT(*) n FROM workout_sessions WHERE snapshot_json IS NOT NULL').get().n;
  if(allowAdditions)assert(snapshots>=summary.workout_sessions,'Not every existing session has a snapshot');
  else assert.equal(snapshots,summary.workout_sessions,'Not every existing session has a snapshot');
  console.log(JSON.stringify({passed:true,preservedRecordCounts:summary,originalSetLogsUnchanged:true,
    sessionSnapshots:snapshots,routineAssociationsRepaired:originalMismatch-remainingMismatch,
    remainingRoutineMismatches:remainingMismatch,foreignKeyViolations:migratedViolations.length,
    additionalDevelopmentRecords:addedRecords,integrity:'ok'},null,2));
} finally {baseline.close();dev.close();}
