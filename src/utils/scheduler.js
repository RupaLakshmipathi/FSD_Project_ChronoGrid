import { demo } from '../data/demo.js';

const sameSlot=(a,b)=>a.day===b.day&&a.slot===b.slot;
const resourceKeys=(s)=>[`faculty:${s.facultyId}`,`room:${s.roomId}`,`class:${s.classId}`].map(k=>`${k}|${s.day}|${s.slot}`);

export function validateSchedule(sessions,data=demo){
 const issues=[];
 for(let i=0;i<sessions.length;i++)for(let j=i+1;j<sessions.length;j++){
  const a=sessions[i],b=sessions[j];if(!sameSlot(a,b))continue;
  if(a.facultyId===b.facultyId)issues.push({type:'faculty',message:`${a.day} period ${a.slot+1}: faculty clash`});
  if(a.roomId===b.roomId)issues.push({type:'room',message:`${a.day} period ${a.slot+1}: room clash`});
  if(a.classId===b.classId)issues.push({type:'class',message:`${a.day} period ${a.slot+1}: class clash`});
 }
 for(const s of sessions){
  const faculty=data.faculty.find(x=>x.id===s.facultyId),room=data.rooms.find(x=>x.id===s.roomId),course=data.classes.find(x=>x.id===s.classId);
  const facultyClasses=(faculty?.classes||[]).map(value=>String(value?._id||value));
  if(facultyClasses.length&&!facultyClasses.includes(String(s.classId)))issues.push({type:'faculty-class',message:`${faculty?.name||'Faculty'} is not assigned to teach ${course?.name||'this class'}`});
  const dayAllowed=faculty?.availability?.includes(s.day),slotAllowed=!faculty?.availabilitySlots||faculty.availabilitySlots.includes(`${s.day}|${s.slot}`);
  if(!dayAllowed||!slotAllowed)issues.push({type:'availability',message:`${faculty?.name||'Faculty'} unavailable on ${s.day}, period ${s.slot+1}`});
  if(room&&course&&room.capacity<course.size)issues.push({type:'capacity',message:`${room.name} is too small for ${course.name}`});
  if(s.practical&&!room?.facilities?.some(x=>String(x).toLowerCase().includes('lab')))issues.push({type:'facility',message:`${room?.name||'Room'} is not a laboratory`});
 }
 for(const faculty of data.faculty){const teaching=sessions.filter(s=>s.facultyId===faculty.id);if(teaching.length>Number(faculty.maxHours||Infinity))issues.push({type:'workload',message:`${faculty.name} exceeds the weekly teaching-hour limit`});for(const day of new Set(teaching.map(s=>s.day))){const daily=teaching.filter(s=>s.day===day).map(s=>s.slot).sort((a,b)=>a-b);if(daily.length>6)issues.push({type:'workload',message:`${faculty.name} exceeds the daily teaching limit on ${day}`});}}
 return issues;
}

// Bounded CSP search. Each recursion selects the most constrained remaining
// lecture (MRV), then backtracks as needed while tracking occupied resources.
export function generateAlternatives(data=demo,{days=data.days,slots=data.slots,limit=25000,maxAlternatives=2}={}){
 const required=[];
 for(const course of data.classes)for(const subject of data.subjects){
  const assignedClasses=(subject.classes||[]).map(value=>String(value?._id||value));
  if(assignedClasses.length&&!assignedClasses.includes(String(course.id)))continue;
  const facultyId=subject.facultyId||subject.faculty;
  for(let n=0;n<Number(subject.weekly||0);n++)required.push({id:`${course.id}-${subject.id}-${n}`,subjectId:subject.id,facultyId:String(facultyId||''),classId:course.id,practical:!!(subject.practical||subject.type==='lab')});
 }
 const alternatives=[],solutions=new Set();let nodes=0,limitHit=false;
 if(!required.length)return{alternatives,required:0,unscheduled:0,nodes,limit,issues:[{message:'No subjects with weekly periods were found for this class and semester. Check the semester filter and each subject weekly-period value.'}]};
 const maxDailySessions=slots.length-Math.floor(slots.length/4),weeklyCapacity=days.length*maxDailySessions;
 const overloaded=data.classes.map(course=>({course,count:required.filter(session=>session.classId===course.id).length})).find(entry=>entry.count>weeklyCapacity);
 if(overloaded)return{alternatives,required:required.length,unscheduled:required.length,nodes,limit,issues:[{message:`${overloaded.course.name}${overloaded.course.section?`-${overloaded.course.section}`:''} requires ${overloaded.count} sessions per week, but ${days.length} days with ${slots.length} periods can fit at most ${weeklyCapacity} while keeping periods to 3 in a row. Remove any accidental duplicate subject or reduce weekly periods.`}]};
 const choiceMap=new Map();
 for(const s of required){
  const faculty=data.faculty.find(x=>x.id===s.facultyId),subject=data.subjects.find(x=>x.id===s.subjectId),course=data.classes.find(x=>x.id===s.classId);
  let choices=[];
  const facultyClasses=(faculty?.classes||[]).map(value=>String(value?._id||value));
  if(faculty&&course&&(!facultyClasses.length||facultyClasses.includes(String(course.id)))){for(const day of days)for(let slot=0;slot<slots.length;slot++){
   const dayAllowed=faculty.availability?.includes(day),slotAllowed=!faculty.availabilitySlots||faculty.availabilitySlots.includes(`${day}|${slot}`);
   if(!dayAllowed||!slotAllowed)continue;
   for(const room of data.rooms){if(room.capacity<course.size)continue;if(s.practical&&!room.facilities?.some(x=>String(x).toLowerCase().includes('lab')))continue;choices.push({day,slot,roomId:room.id});}
  }}
  choiceMap.set(s.id,choices);
 }
 const blocked=required.filter(s=>!choiceMap.get(s.id)?.length);
 if(blocked.length){
  const details=[...new Set(blocked.map(s=>{
   const subject=data.subjects.find(x=>x.id===s.subjectId),faculty=data.faculty.find(x=>x.id===s.facultyId),course=data.classes.find(x=>x.id===s.classId);
   if(!faculty)return `${subject?.name||'A subject'} has no assigned active faculty member`;
   if(!course)return `${subject?.name||'A subject'} has no selected class`;
   const facultyClasses=(faculty.classes||[]).map(value=>String(value?._id||value));
   if(facultyClasses.length&&!facultyClasses.includes(String(course.id)))return `${faculty.name} is not assigned to teach ${course.name}`;
   const availableDays=days.filter(day=>faculty.availability?.includes(day));
   if(!availableDays.length)return `${subject?.name||'A subject'} (${faculty.name}) has no availability on the selected working days`;
   if(faculty.availabilitySlots&&availableDays.every(day=>!slots.some((_,slot)=>faculty.availabilitySlots.includes(`${day}|${slot}`))))return `${subject?.name||'A subject'} (${faculty.name}) has no available periods in the selected timetable`;
   const suitableRooms=data.rooms.filter(room=>room.capacity>=course.size);
   if(!suitableRooms.length)return `${subject?.name||'A subject'} needs a classroom with capacity for ${course.size} students`;
   if(s.practical&&!suitableRooms.some(room=>room.facilities?.some(x=>String(x).toLowerCase().includes('lab'))))return `${subject?.name||'A subject'} requires a laboratory with capacity for ${course.size} students`;
   return `${subject?.name||'A subject'} has no compatible faculty, room, or period assignment`;
  }))];
  return{alternatives,required:required.length,unscheduled:blocked.length,nodes,limit,issues:details.map(message=>({message}))};
 }
 const occupied=new Set(),assignment=new Map(),facultyLoads=new Map(),facultyDayLoads=new Map(),facultyDaySlots=new Map(),classDaySlots=new Map(),classSubjectDayLoads=new Map();
 const state={facultyDaySlots,classSubjectDayLoads};
 const facultyById=new Map(data.faculty.map(f=>[f.id,f]));
 const validChoice=(session,choice)=>{
  if(!resourceKeys({...session,...choice}).every(key=>!occupied.has(key)))return false;
  const faculty=facultyById.get(session.facultyId),facultyDay=`${session.facultyId}|${choice.day}`,classDay=`${session.classId}|${choice.day}`;
  if((facultyLoads.get(session.facultyId)||0)>=Number(faculty?.maxHours||Infinity))return false;
  if((facultyDayLoads.get(facultyDay)||0)>=6)return false;
  const used=classDaySlots.get(classDay);
  let consecutive=1;for(let slot=choice.slot-1;used?.has(slot);slot--)consecutive++;for(let slot=choice.slot+1;used?.has(slot);slot++)consecutive++;
  return consecutive<=3;
 };
 const addState=(session,choice,delta)=>{
  const facultyDay=`${session.facultyId}|${choice.day}`,classDay=`${session.classId}|${choice.day}`,subjectDay=`${session.classId}|${session.subjectId}|${choice.day}`;
  const update=(map,key)=>{const next=(map.get(key)||0)+delta;if(next)map.set(key,next);else map.delete(key);};
  update(facultyLoads,session.facultyId);update(facultyDayLoads,facultyDay);update(classSubjectDayLoads,subjectDay);
  let slotsForFaculty=facultyDaySlots.get(facultyDay);if(!slotsForFaculty){slotsForFaculty=new Map();facultyDaySlots.set(facultyDay,slotsForFaculty);}const slotCount=(slotsForFaculty.get(choice.slot)||0)+delta;if(slotCount)slotsForFaculty.set(choice.slot,slotCount);else slotsForFaculty.delete(choice.slot);if(!slotsForFaculty.size)facultyDaySlots.delete(facultyDay);
  let slotsForClass=classDaySlots.get(classDay);if(!slotsForClass){slotsForClass=new Set();classDaySlots.set(classDay,slotsForClass);}if(delta>0)slotsForClass.add(choice.slot);else{slotsForClass.delete(choice.slot);if(!slotsForClass.size)classDaySlots.delete(classDay);}
 };
 const search=(alternativeIndex)=>{
  if(nodes>=limit){limitHit=true;return null;}nodes++;
  if(assignment.size===required.length){
   const schedule=required.map(s=>({...s,...assignment.get(s.id)}));
   const signature=schedule.map(s=>`${s.id}@${s.day}:${s.slot}:${s.roomId}`).sort().join(';');
   if(solutions.has(signature))return null;
   solutions.add(signature);return schedule;
  }
  let picked=null,pickedChoices=null;
  for(const s of required){if(assignment.has(s.id))continue;const choices=choiceMap.get(s.id).filter(c=>validChoice(s,c));
   if(!pickedChoices||choices.length<pickedChoices.length){picked=s;pickedChoices=choices;if(!choices.length)break;}
  }
  if(!pickedChoices?.length)return null;
  const choices=[...pickedChoices].sort((a,b)=>preference(a,picked,state,alternativeIndex)-preference(b,picked,state,alternativeIndex));
  for(const c of choices){
   const keys=resourceKeys({...picked,...c});keys.forEach(k=>occupied.add(k));assignment.set(picked.id,{...picked,...c});addState(picked,c,1);
   const result=search(alternativeIndex);
   if(result)return result;
   assignment.delete(picked.id);addState(picked,c,-1);keys.forEach(k=>occupied.delete(k));
   if(limitHit)return null;
  }
  return null;
 };
 for(let n=0;n<maxAlternatives&&nodes<limit;n++){
  assignment.clear();occupied.clear();const solved=search(n);if(!solved)break;
  const index=alternatives.length,issues=validateSchedule(solved,data);
  if(!issues.length)alternatives.push({id:String.fromCharCode(65+index),name:['Balanced Schedule','Faculty-Friendly Schedule','Room-Efficient Schedule'][index],sessions:solved,score:scoreSchedule(solved,data),issues});
 }
 const scheduled=alternatives[0]?.sessions.length||0;
 return{alternatives,required:required.length,unscheduled:required.length-scheduled,nodes,limit,issues:alternatives.length?[]:[{message:limitHit?'Search limit reached before a complete conflict-free schedule was found. Increase the limit or relax resource constraints.':'Could not assign every session. Add faculty availability, classrooms, or lab capacity, or reduce weekly requirements.'}]};
}
function preference(choice,session,state,index){
 let penalty=state.classSubjectDayLoads.has(`${session.classId}|${session.subjectId}|${choice.day}`)?8:0;
 for(const [slot,count] of state.facultyDaySlots.get(`${session.facultyId}|${choice.day}`)||[])if(Math.abs(slot-choice.slot)>1)penalty+=2*count;
 return penalty*10+((choice.day.charCodeAt(0)*7+choice.slot*13+(index*11))%29);
}
export function scoreSchedule(sessions,data=demo){
 const counts=new Map();for(const s of sessions)counts.set(`${s.subjectId}|${s.day}`,(counts.get(`${s.subjectId}|${s.day}`)||0)+1);
 const repeats=[...counts.values()].filter(n=>n>1).length,load=new Map();sessions.forEach(s=>load.set(s.facultyId,(load.get(s.facultyId)||0)+1));
 const loads=[...load.values()],spread=loads.length?Math.max(...loads)-Math.min(...loads):0;return Math.max(0,Math.round(100-repeats*3-spread*2));
}
