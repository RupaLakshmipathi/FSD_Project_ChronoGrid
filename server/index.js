import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User,Faculty,Subject,Classroom,AcademicClass,Availability,Timetable,TimetableVersion,Notification,Scenario } from './models/index.js';
import { requireAuth,requireRole } from './middleware/auth.js';
import { generateAlternatives,validateSchedule } from '../src/utils/scheduler.js';

const app=express(),port=process.env.PORT||5000,host=process.env.HOST||'0.0.0.0';
const allowedOrigins=(process.env.CLIENT_ORIGIN||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value=>value.trim()).filter(Boolean);
if(process.env.VERCEL_URL)allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
app.use(cors({origin:(origin,callback)=>callback(null,!origin||allowedOrigins.includes(origin))}));
app.use(express.json({limit:'1mb'}));
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const facultyOnly=requireRole('faculty');
const noStudent=requireRole('faculty');
let mongoConnection;
function connectToDatabase(){
 if(mongoose.connection.readyState===1)return Promise.resolve();
 if(!process.env.MONGODB_URI)return Promise.reject(new Error('MONGODB_URI is not configured'));
 if(!mongoConnection)mongoConnection=mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,connectTimeoutMS:8000}).catch(error=>{mongoConnection=undefined;throw error});
 return mongoConnection;
}
const ensureDb=async(req,res,next)=>{try{await connectToDatabase();next()}catch(error){console.error('MongoDB connection failed:',error.message);res.status(503).json({error:process.env.MONGODB_URI?'MongoDB is unreachable. Check Atlas Network Access and the Vercel MONGODB_URI value.':'MONGODB_URI is missing from the Vercel environment.'})}};
app.get('/api/health',asyncRoute(async(req,res)=>{
 try{await connectToDatabase();res.json({status:'ok',database:'connected'})}
 catch(error){console.error('MongoDB health check failed:',error.message);res.status(503).json({status:'degraded',database:'disconnected',mongoUriConfigured:Boolean(process.env.MONGODB_URI),reason:process.env.MONGODB_URI?'MongoDB could not be reached; check Atlas Network Access and the Vercel MONGODB_URI value.':'MONGODB_URI is missing from the Vercel environment.'})}
}));
app.use('/api',ensureDb);

app.post('/api/auth/register',asyncRoute(async(req,res)=>{
 const{name,email,password,role,classId,facultyId,department}=req.body;
 if(!process.env.REGISTRATION_KEY||req.get('x-registration-key')!==process.env.REGISTRATION_KEY)return res.status(403).json({error:'Account provisioning is closed. Ask the ChronoGrid workspace owner to provision your account.'});
 if(!name||!email||!password||password.length<10)return res.status(400).json({error:'Name, email, and password (10+ characters) are required'});
 if(!['faculty','student'].includes(role))return res.status(400).json({error:'Choose Faculty or Student'});
 if(role==='student'&&!classId)return res.status(400).json({error:'A class and section assignment is required for student accounts'});
 if(role==='student'&&!await AcademicClass.exists({_id:classId}))return res.status(400).json({error:'The selected class or section does not exist'});
 if(role==='faculty'&&facultyId&&!await Faculty.exists({_id:facultyId}))return res.status(400).json({error:'The selected faculty profile does not exist'});
 const user=await User.create({name,email,passwordHash:await bcrypt.hash(password,12),role,classId:role==='student'?classId:undefined,facultyId:role==='faculty'?facultyId:undefined,department});
 res.status(201).json({id:user.id,name:user.name,email:user.email,role:user.role});
}));
app.post('/api/auth/login',asyncRoute(async(req,res)=>{
 const{email,password,role}=req.body;
 if(!['faculty','student'].includes(role))return res.status(400).json({error:'Select Student Login or Faculty Login'});
 const user=await User.findOne({email,role}).select('+passwordHash');
 if(!user||!await bcrypt.compare(password||'',user.passwordHash))return res.status(401).json({error:'Email or password is incorrect for the selected role'});
 const token=jwt.sign({sub:user.id,role:user.role,name:user.name,classId:user.classId?.toString(),facultyId:user.facultyId?.toString()},process.env.JWT_SECRET,{expiresIn:'8h'});
 res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role,classId:user.classId,facultyId:user.facultyId,department:user.department}});
}));
app.get('/api/auth/me',requireAuth,asyncRoute(async(req,res)=>{const user=await User.findById(req.user.sub).select('name email role department classId facultyId');if(!user)return res.status(401).json({error:'Account no longer exists'});res.json(user)}));

const resources={faculty:Faculty,subjects:Subject,classrooms:Classroom,classes:AcademicClass,availability:Availability};
for(const[path,Model]of Object.entries(resources)){
 app.get(`/api/${path}`,requireAuth,noStudent,asyncRoute(async(req,res)=>{
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||100)),filter={};
  if(path==='faculty'&&req.query.active!=='all')filter.active={$ne:false};
  if(req.query.semester)filter.semester=req.query.semester;if(req.query.department)filter.department=req.query.department;
  if(req.query.search){const escaped=String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter.$or=['name','code','facultyId','roomNumber','department'].map(k=>({[k]:{$regex:escaped,$options:'i'}}));}
  const[items,total]=await Promise.all([Model.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),Model.countDocuments(filter)]);res.json({items,total,page,pages:Math.ceil(total/limit)});
 }));
 app.post(`/api/${path}`,requireAuth,facultyOnly,asyncRoute(async(req,res)=>{const item=await Model.create(req.body);res.status(201).json(item)}));
 app.patch(`/api/${path}/:id`,requireAuth,facultyOnly,asyncRoute(async(req,res)=>{const item=await Model.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true});if(!item)return res.status(404).json({error:'Record not found'});res.json(item)}));
 app.delete(`/api/${path}/:id`,requireAuth,facultyOnly,asyncRoute(async(req,res)=>{
  const item=await Model.findById(req.params.id);if(!item)return res.status(404).json({error:'Record not found'});
  if(path==='faculty'&&await Timetable.exists({'sessions.facultyId':String(item._id)})){item.active=false;await item.save();return res.json({deactivated:true,message:'Faculty profile deactivated. Existing schedules are preserved.'});}
  const refKey={subjects:'subjectId',classrooms:'roomId',classes:'classId'}[path];
  if(refKey&&await Timetable.exists({[`sessions.${refKey}`]:String(item._id)}))return res.status(409).json({error:'This record is used by a timetable. Archive or update the schedule before deleting it.'});
  await item.deleteOne();res.status(204).end();
 }));
}
app.get('/api/notifications',requireAuth,asyncRoute(async(req,res)=>res.json(await Notification.find({user:req.user.sub}).sort({createdAt:-1}).limit(50))));
app.patch('/api/notifications/:id/read',requireAuth,asyncRoute(async(req,res)=>{const n=await Notification.findOneAndUpdate({_id:req.params.id,user:req.user.sub},{read:true},{new:true});if(!n)return res.status(404).json({error:'Notification not found'});res.json(n)}));

app.get('/api/timetables',requireAuth,asyncRoute(async(req,res)=>{
 const filter={};if(req.query.status)filter.status=req.query.status;
 if(req.user.role==='student'){
  if(!req.user.classId)return res.json({items:[]});filter.status='published';filter.classId=req.user.classId;
 }
 if(req.query.classId&&req.user.role==='faculty')filter.classId=req.query.classId;
 if(req.query.academicYear)filter.academicYear=req.query.academicYear;if(req.query.semester)filter.semester=req.query.semester;
 if(req.query.history==='true'&&req.user.role==='faculty'){delete filter.status;delete filter.effectiveFrom;delete filter.effectiveTo;}else if(req.query.month){const [y,m]=String(req.query.month).split('-').map(Number);if(!y||m<1||m>12)return res.status(400).json({error:'Month must use YYYY-MM format'});const from=new Date(Date.UTC(y,m-1,1)),to=new Date(Date.UTC(y,m,0,23,59,59,999));filter.effectiveFrom={$lte:to};filter.effectiveTo={$gte:from};}
 const items=await Timetable.find(filter).populate('classId','name section department year semester').sort({effectiveFrom:-1,updatedAt:-1}).limit(100).lean();res.json({items:await hydrateSessions(items)});
}));
app.post('/api/timetables',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{
 const body={...req.body,status:'draft',createdBy:req.user.sub};const issues=await checkSessions(body.sessions||[],body);if(issues.length)return res.status(422).json({error:'Timetable has hard constraint violations',issues});
 const item=await Timetable.create(body);res.status(201).json(item);
}));
app.patch('/api/timetables/:id',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{
 const item=await Timetable.findById(req.params.id);if(!item)return res.status(404).json({error:'Timetable not found'});
 if(item.status==='published'&&('sessions'in req.body||'effectiveFrom'in req.body||'effectiveTo'in req.body))return res.status(409).json({error:'Published schedules are immutable. Save a new draft version and publish it to preserve historical dates.'});
 const next={...item.toObject(),...req.body};const issues=await checkSessions(next.sessions||[],next);if(issues.length)return res.status(422).json({error:'Timetable has hard constraint violations',issues});
 if(req.body.status==='published'&&item.status!=='published')return res.status(409).json({error:'Set effective dates and publish through the publish endpoint.'});
 if(item.status==='published')await TimetableVersion.create({timetable:item._id,version:item.version,sessions:item.sessions,createdBy:req.user.sub,note:'Previous published version'});
 Object.assign(item,req.body);if(item.status==='published')item.version++;await item.save();res.json(item);
}));
app.post('/api/timetables/:id/publish',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{
 const item=await Timetable.findById(req.params.id);if(!item)return res.status(404).json({error:'Timetable not found'});
 if(!item.effectiveFrom||!item.effectiveTo||item.effectiveTo<item.effectiveFrom)return res.status(400).json({error:'Set a valid effective date range before publishing'});
 if(!item.classId)return res.status(400).json({error:'Assign a class or section before publishing'});
 const issues=await checkSessions(item.sessions,item);if(issues.length)return res.status(422).json({error:'Resolve all hard constraints before publishing',issues});
 const overlaps=await Timetable.find({classId:item.classId,status:'published',effectiveFrom:{$lte:item.effectiveTo},effectiveTo:{$gte:item.effectiveFrom},_id:{$ne:item._id}});
 for(const old of overlaps){await saveVersion(old,req.user.sub,'Replaced schedule snapshot');const oldStart=new Date(old.effectiveFrom),oldEnd=new Date(old.effectiveTo),newStart=new Date(item.effectiveFrom),newEnd=new Date(item.effectiveTo);
  if(oldStart<newStart){const prior=old.toObject();delete prior._id;delete prior.__v;delete prior.createdAt;delete prior.updatedAt;prior.effectiveTo=new Date(newStart.getTime()-86400000);prior.status='published';await Timetable.create(prior);}
  if(oldEnd>newEnd){const future=old.toObject();delete future._id;delete future.__v;delete future.createdAt;delete future.updatedAt;future.effectiveFrom=new Date(newEnd.getTime()+86400000);future.status='published';await Timetable.create(future);}
  old.status='archived';await old.save();
 }
 item.status='published';item.publishedAt=new Date();await item.save();
 const recipients=await User.find(item.classId?{classId:item.classId,role:'student'}:{role:'student'}).select('_id');if(recipients.length)await Notification.insertMany(recipients.map(user=>({user:user._id,title:'Timetable published',message:`${item.name} · Version ${item.version}`,type:'timetable'})));
 res.json(item);
}));
app.get('/api/timetables/:id/versions',requireAuth,facultyOnly,asyncRoute(async(req,res)=>res.json(await TimetableVersion.find({timetable:req.params.id}).sort({version:-1}).lean())));
app.post('/api/timetables/:id/restore/:version',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{
 const item=await Timetable.findById(req.params.id),v=await TimetableVersion.findOne({timetable:req.params.id,version:req.params.version});if(!item||!v)return res.status(404).json({error:'Timetable version not found'});
 const issues=await checkSessions(v.sessions,item);if(issues.length)return res.status(422).json({error:'This version is no longer valid with current resources',issues});
 await saveVersion(item,req.user.sub,'Snapshot before restore');item.sessions=v.sessions;item.version++;await item.save();res.json(item);
}));
app.post('/api/timetables/validate',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{const issues=await checkSessions(req.body.sessions||[],req.body);res.json({valid:issues.length===0,issues})}));
app.post('/api/timetables/generate',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{
 const {classId,days=['Monday','Tuesday','Wednesday','Thursday','Friday'],slots=[{start:'09:00',end:'10:00'},{start:'10:00',end:'11:00'},{start:'11:15',end:'12:15'},{start:'12:15',end:'13:15'},{start:'14:00',end:'15:00'},{start:'15:00',end:'16:00'}],limit=25000,academicYear,semester,department}=req.body;
 const classes=await AcademicClass.find(classId?{_id:classId}:{}).lean();if(!classes.length)return res.status(400).json({error:'Add a class or section before generating a timetable'});
 const[faculty,allSubjects,rooms]=await Promise.all([Faculty.find({active:{$ne:false}}).lean(),Subject.find().lean(),Classroom.find().lean()]);const subjects=semester?allSubjects.filter(s=>normalizeSemester(s.semester)===normalizeSemester(semester)):allSubjects;
 const normalized={days,slots,classes:classes.map(x=>({...x,id:String(x._id)})),faculty:faculty.map(x=>normalizeFaculty(x,days)),subjects:subjects.map(x=>({...x,id:String(x._id),facultyId:String(x.faculty),weekly:x.weekly,practical:x.type==='lab'||x.practical})),rooms:rooms.map(x=>({...x,id:String(x._id),capacity:x.capacity,facilities:x.facilities||[]}))};
 if(normalized.subjects.some(s=>!s.facultyId||s.facultyId==='undefined'))return res.status(422).json({error:'Assign a faculty member to every subject before generation'});
 const result=generateAlternatives(normalized,{days,slots,limit:Math.min(25000,Math.max(1000,Number(limit)||25000)),maxAlternatives:2});
 res.json({...result,configuration:{classId,academicYear,semester,department,days,slots}});
}));
app.get('/api/analytics',requireAuth,asyncRoute(async(req,res)=>{
 const today=new Date(),filter=req.user.role==='student'?{status:'published',classId:req.user.classId,effectiveFrom:{$lte:today},effectiveTo:{$gte:today}}:{status:'published',effectiveFrom:{$lte:today},effectiveTo:{$gte:today}},[faculty,rooms,subjects,classes,timetables]=await Promise.all([req.user.role==='faculty'?Faculty.countDocuments({active:{$ne:false}}):0,req.user.role==='faculty'?Classroom.countDocuments():0,req.user.role==='faculty'?Subject.countDocuments():0,req.user.role==='faculty'?AcademicClass.countDocuments():0,Timetable.find(filter).lean()]);const sessions=timetables.flatMap(t=>t.sessions||[]);res.json({faculty,rooms,subjects,classes,timetables:timetables.length,sessions:sessions.length,byDay:sessions.reduce((o,s)=>(o[s.day]=(o[s.day]||0)+1,o),{})});
}));
app.post('/api/simulations',requireAuth,facultyOnly,asyncRoute(async(req,res)=>{const item=await Scenario.create({...req.body,createdBy:req.user.sub});res.status(201).json(item)}));

async function checkSessions(sessions,timetable={}){
 const ids={faculty:[...new Set(sessions.map(s=>s.facultyId).filter(Boolean))],rooms:[...new Set(sessions.map(s=>s.roomId).filter(Boolean))],classes:[...new Set(sessions.map(s=>s.classId).filter(Boolean))],subjects:[...new Set(sessions.map(s=>s.subjectId).filter(Boolean))]};
 const[faculty,rooms,classes,subjects]=await Promise.all([Faculty.find({_id:{$in:ids.faculty}}).lean(),Classroom.find({_id:{$in:ids.rooms}}).lean(),AcademicClass.find({_id:{$in:ids.classes}}).lean(),Subject.find({_id:{$in:ids.subjects}}).lean()]);
 const map=a=>new Map(a.map(x=>[String(x._id),x]));const data={faculty:faculty.map(x=>normalizeFaculty(x,timetable.days||['Monday','Tuesday','Wednesday','Thursday','Friday'])),rooms:rooms.map(x=>({...x,id:String(x._id)})),classes:classes.map(x=>({...x,id:String(x._id)})),subjects:subjects.map(x=>({...x,id:String(x._id)}))};
 const hydrated=sessions.map((s,i)=>({...s,id:s.id||String(i),facultyId:String(s.facultyId||''),roomId:String(s.roomId||''),classId:String(s.classId||timetable.classId||''),subjectId:String(s.subjectId||'')}));const issues=validateSchedule(hydrated,data);
 for(const s of hydrated){if(timetable.days?.length&&!timetable.days.includes(s.day))issues.push({type:'hours',message:`${s.day} is outside the configured working week`});if(timetable.slots?.length&&!timetable.slots[s.slot])issues.push({type:'hours',message:`Period ${Number(s.slot)+1} is outside the configured timetable`});}
 for(const s of hydrated){if(!map(faculty).has(s.facultyId))issues.push({type:'faculty',message:'A scheduled faculty profile no longer exists'});if(!map(rooms).has(s.roomId))issues.push({type:'room',message:'A scheduled classroom no longer exists'});if(!map(classes).has(s.classId))issues.push({type:'class',message:'A scheduled class or section no longer exists'});if(!map(subjects).has(s.subjectId))issues.push({type:'subject',message:'A scheduled subject no longer exists'});}
 return issues;
}
async function saveVersion(item,userId,note){return TimetableVersion.create({timetable:item._id,version:item.version,name:item.name,status:item.status,academicYear:item.academicYear,semester:item.semester,department:item.department,classId:item.classId,effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo,days:item.days,slots:item.slots,sessions:item.sessions,createdBy:userId,note});}
function normalizeSemester(value){return String(value||'').trim().toLowerCase().replace(/\b(semester|sem)\b/g,'').trim().replace(/(\d+)(st|nd|rd|th)\b/g,'$1').replace(/[^a-z0-9]/g,'');}
function normalizeFaculty(x,defaultDays){const entries=x.availability||[],configured=x.availabilityConfigured||entries.length>0,available=entries.filter(a=>a.available!==false),dayNames={mon:'Monday',monday:'Monday',tue:'Tuesday',tues:'Tuesday',tuesday:'Tuesday',wed:'Wednesday',wednesday:'Wednesday',thu:'Thursday',thur:'Thursday',thurs:'Thursday',thursday:'Thursday',fri:'Friday',friday:'Friday',sat:'Saturday',saturday:'Saturday',sun:'Sunday',sunday:'Sunday'},canonicalDay=value=>dayNames[String(value||'').trim().toLowerCase()]||String(value||'').trim(),hasSlots=entries.some(a=>Number.isInteger(Number(a.slot)));return{...x,id:String(x._id),availability:configured?Array.from(new Set(available.map(a=>canonicalDay(a.day)).filter(Boolean))):defaultDays,availabilitySlots:configured?(hasSlots?available.filter(a=>Number.isInteger(Number(a.slot))).map(a=>`${canonicalDay(a.day)}|${Number(a.slot)}`):undefined):undefined};}

async function hydrateSessions(items){
 const sessions=items.flatMap(t=>t.sessions||[]),collect=field=>[...new Set(sessions.map(s=>String(s[field]||'')).filter(x=>mongoose.isValidObjectId(x)))];
 const[faculty,subjects,rooms,classes]=await Promise.all([Faculty.find({_id:{$in:collect('facultyId')}}).select('name').lean(),Subject.find({_id:{$in:collect('subjectId')}}).select('name code').lean(),Classroom.find({_id:{$in:collect('roomId')}}).select('name').lean(),AcademicClass.find({_id:{$in:collect('classId')}}).select('name section').lean()]);
 const map=rows=>new Map(rows.map(x=>[String(x._id),x]));const fm=map(faculty),sm=map(subjects),rm=map(rooms),cm=map(classes);
 return items.map(t=>({...t,sessions:(t.sessions||[]).map(s=>{const c=cm.get(String(s.classId||t.classId?._id||t.classId||''));return{...s,subjectName:s.subjectName||sm.get(String(s.subjectId))?.name||'Subject',subjectCode:sm.get(String(s.subjectId))?.code||'',facultyName:s.facultyName||fm.get(String(s.facultyId))?.name||'Faculty',roomName:s.roomName||rm.get(String(s.roomId))?.name||'Room',className:s.className||c?.name||'',section:s.section||c?.section||''}})}));
}

app.use((err,req,res,next)=>{if(err.name==='ValidationError')return res.status(400).json({error:err.message});if(err.code===11000)return res.status(409).json({error:'A record with that value already exists'});if(err.name==='CastError')return res.status(400).json({error:'Invalid record id'});console.error(err);res.status(500).json({error:'Something went wrong'});});
if(!process.env.JWT_SECRET)console.warn('JWT_SECRET is missing. Authentication routes will fail until configured.');
if(!process.env.MONGODB_URI)console.warn('MONGODB_URI is not set.');
if(!process.env.VERCEL)app.listen(port,host,()=>console.log(`ChronoGrid API listening on http://${host}:${port}`));
export default app;
