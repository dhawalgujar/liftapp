const test=require('node:test');
const assert=require('node:assert/strict');
const {sessionPoints,chartLayout}=require('../../public/trends');
const scope={routineId:'upper-lower',cycle:3};
const entry=(id,day,date,weight,extra={})=>({id,routineId:'upper-lower',splitName:'Upper / Lower',cycle:3,week:2,
  dayName:day,date,exercises:[{id:`${id}-press`,name:'Bench press',weight,reps:10,sets:3,done:true}],...extra});

test('same exercise on different training days in the same week remains separate',()=>{
  const points=sessionPoints([entry('mon','Upper A','2026-10-12',100),entry('fri','Upper B','2026-10-16',105)],'Bench press',scope);
  assert.equal(points.length,2);assert.deepEqual(points.map(p=>[p.dayName,p.week,p.weight]),[['Upper A',2,100],['Upper B',2,105]]);
});
test('continuous history crosses cycles and splits; cycle scope never mixes their ordinals',()=>{
  const source=[entry('old','Upper A','2026-09-12',90,{cycle:2}),entry('now','Upper A','2026-10-12',100),
    entry('other','Push','2026-10-14',110,{routineId:'ppl',splitName:'PPL'})];
  assert.deepEqual(sessionPoints(source,'Bench press').map(p=>p.weight),[90,100,110]);
  assert.deepEqual(sessionPoints(source,'Bench press',scope).map(p=>p.weight),[100]);
});
test('dates order results rather than weight, week number, or insertion order',()=>{
  const points=sessionPoints([entry('fri','Upper B','2026-10-16',95),entry('mon','Upper A','2026-10-12',100)],'Bench press');
  assert.deepEqual(points.map(p=>p.weight),[100,95]);
});
test('current session replaces its history duplicate before undo is evaluated',()=>{
  const old=entry('same','Upper A','2026-10-12',100),current=structuredClone(old);current.exercises[0].done=false;
  assert.equal(sessionPoints([old,current],'Bench press').length,0);
  current.exercises[0].done=true;current.exercises[0].weight=102;
  assert.equal(sessionPoints([old,current],'Bench press').length,1);
  assert.equal(sessionPoints([old,current],'Bench press')[0].weight,102);
});
test('zero load is real; missing, invalid, unfinished, and substituted-away results are excluded',()=>{
  const source=[entry('zero','Upper','2026-10-01',0),entry('blank','Upper','2026-10-02',''),entry('null','Upper','2026-10-03',null),
    entry('negative','Upper','2026-10-04',-1),entry('invalid','Upper','2026-10-05','x')];
  const different=entry('different','Upper','2026-10-06',50);different.exercises[0].name='Dumbbell press';source.push(different);
  assert.deepEqual(sessionPoints(source,'bench PRESS').map(p=>p.weight),[0]);
});
test('same-day sessions and repeated entries retain distinct points and X coordinates',()=>{
  const a=entry('am','Upper A','2026-10-12',100),b=entry('pm','Upper B','2026-10-12',105);
  a.exercises.push({...a.exercises[0],id:'extra',weight:95});
  const points=sessionPoints([a,b],'Bench press'),layout=chartLayout(points);
  assert.equal(points.length,3);assert.equal(new Set(layout.points.map(p=>p.x)).size,3);
});
test('undated legacy results are retained without inventing a timestamp',()=>{
  const old=entry('undated','Upper',null,50),points=sessionPoints([old,entry('dated','Upper','2026-10-12',60)],'Bench press');
  assert.equal(points[0].time,null);assert.equal(points[0].date,null);assert.equal(points.length,2);
});
test('SQLite timestamps and offset timestamps sort as actual instants',()=>{
  const earlier=entry('a','Upper',null,50,{finishedAt:'2026-10-12 12:00:00'});
  const later=entry('b','Upper',null,60,{finishedAt:'2026-10-12T09:00:00-04:00'});
  assert.deepEqual(sessionPoints([later,earlier],'Bench press').map(p=>p.weight),[50,60]);
});
test('chart keeps long history scrollable and identifies cycle/split boundaries',()=>{
  const records=Array.from({length:40},(_,i)=>entry(`s${i}`,'Upper',`2026-10-${String(i%28+1).padStart(2,'0')}`,50+i,{cycle:i<20?2:3}));
  const points=sessionPoints(records,'Bench press'),layout=chartLayout(points);
  assert.equal(layout.points.length,40);assert(layout.width>1000);assert(layout.boundaries.length>0);
  assert(layout.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
test('single, constant, and empty graphs have finite geometry without fake results',()=>{
  for(const points of [[],[{weight:0}],[{weight:100},{weight:100}]]){
    const layout=chartLayout(points);assert(layout.max>layout.min);
    assert.equal(layout.points.length,points.length);assert(layout.points.every(p=>Number.isFinite(p.y)));
  }
});
