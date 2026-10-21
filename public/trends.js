(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LiftTrends=api;
})(globalThis,function(){
  'use strict';
  const nameKey=name=>typeof name==='string'?name.trim().toLocaleLowerCase():'';
  const validResult=e=>e.done&&[e.weight,e.reps].every(v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v)))
    &&Number(e.weight)>=0&&Number.isInteger(Number(e.reps))&&Number(e.reps)>0;
  function timestamp(record){
    for(const value of [record.finishedAt,record.startedAt,record.date]){
      if(typeof value!=='string'||!value.trim())continue;
      const utc=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value;
      const time=Date.parse(utc);if(Number.isFinite(time))return time;
    }
    return null;
  }
  /** Keep every real entry, not just one weekly maximum. Current records override
      their history copy, including undo and edits, before any filters run. */
  function sessionPoints(records,name,scope={all:true}){
    const unique=new Map();
    for(const record of records||[])if(record?.id)unique.set(record.id,record);
    const result=[];
    for(const record of unique.values()){
      if(!scope.all&&(record.routineId!==scope.routineId||Number(record.cycle)!==scope.cycle))continue;
      (record.exercises||[]).forEach((e,index)=>{
        if(nameKey(e.name)!==nameKey(name)||!validResult(e))return;
        result.push({key:`${record.id}:${e.id??index}`,sessionId:record.id,exerciseId:e.id??null,
          routineId:record.routineId??null,splitName:record.splitName||'Unknown split',
          cycle:Number(record.cycle),week:Number(record.week),dayId:record.dayId??null,
          dayName:record.dayName||'Workout',date:record.date||null,time:timestamp(record),
          weight:Number(e.weight),reps:Number(e.reps),sets:e.sets??null});
      });
    }
    return result.sort((a,b)=>(a.time??-Infinity)-(b.time??-Infinity)||a.cycle-b.cycle||a.week-b.week
      ||a.dayName.localeCompare(b.dayName)||a.key.localeCompare(b.key));
  }
  /** Equal chronological session spacing leaves same-day entries distinct. A wide
      canvas scrolls rather than squeezing or downsampling a long history. */
  function chartLayout(points){
    const width=Math.max(360,points.length*100+120),height=196,left=60,right=60,top=28,bottom=62;
    const values=points.map(p=>p.weight),high=Math.max(...values,0);
    const actualMin=values.length?Math.min(...values):0;
    const padding=Math.max(2,(high-actualMin)*.15);
    const min=Math.max(0,Math.floor(actualMin-padding)),max=Math.max(min+1,Math.ceil(high+padding));
    const plotHeight=height-top-bottom;
    const positioned=points.map((point,index)=>({...point,
      x:points.length===1?left+(width-left-right)/2:left+index*(width-left-right)/Math.max(1,points.length-1),
      y:top+(max-point.weight)/(max-min)*plotHeight}));
    const boundaries=positioned.flatMap((point,index)=>index&&
      (point.cycle!==positioned[index-1].cycle||point.routineId!==positioned[index-1].routineId)
      ?[{x:(point.x+positioned[index-1].x)/2,cycle:point.cycle,routineId:point.routineId}]:[]);
    return {width,height,left,right,top,bottom,min,max,points:positioned,boundaries,
      ticks:[max,(max+min)/2,min].map((value,index)=>({value,y:top+index*plotHeight/2}))};
  }
  return {sessionPoints,chartLayout};
});
