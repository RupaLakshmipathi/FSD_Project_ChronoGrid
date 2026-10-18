export const demo = {
  faculty: [
    { id: 'f1', name: 'Dr. Maya Chen', department: 'Computer Science', subjects: ['Algorithms', 'Data Structures'], availability: ['Mon','Tue','Wed','Thu','Fri'], maxHours: 16 },
    { id: 'f2', name: 'Prof. Elias Moore', department: 'Computer Science', subjects: ['Database Systems', 'Web Development'], availability: ['Mon','Tue','Wed','Thu','Fri'], maxHours: 16 },
    { id: 'f3', name: 'Dr. Priya Nair', department: 'Computer Science', subjects: ['Computer Networks', 'Algorithms'], availability: ['Mon','Tue','Wed','Thu'], maxHours: 14 },
    { id: 'f4', name: 'Prof. Noah Williams', department: 'Computer Science', subjects: ['Web Development', 'Database Systems'], availability: ['Tue','Wed','Thu','Fri'], maxHours: 14 },
    { id: 'f5', name: 'Dr. Sofia Patel', department: 'Computer Science', subjects: ['Data Structures', 'Computer Networks'], availability: ['Mon','Tue','Wed','Thu','Fri'], maxHours: 14 }
  ],
  subjects: [
    { id:'s1', name:'Algorithms', code:'CS 301', color:'violet', facultyId:'f1', weekly:3, practical:false },
    { id:'s2', name:'Database Systems', code:'CS 315', color:'mint', facultyId:'f2', weekly:3, practical:false },
    { id:'s3', name:'Web Development', code:'CS 322', color:'coral', facultyId:'f2', weekly:2, practical:true },
    { id:'s4', name:'Data Structures', code:'CS 210', color:'blue', facultyId:'f5', weekly:3, practical:false },
    { id:'s5', name:'Computer Networks', code:'CS 340', color:'gold', facultyId:'f3', weekly:2, practical:false }
  ],
  rooms: [
    { id:'r1', name:'Room 204', capacity:60, facilities:[] }, { id:'r2', name:'Room 208', capacity:45, facilities:[] },
    { id:'r3', name:'Lab A', capacity:32, facilities:['lab','computers'] }, { id:'r4', name:'Lab B', capacity:30, facilities:['lab','computers'] }
  ],
  classes: [
    { id:'c1', name:'CS · Year 2', section:'A', size:28, department:'Computer Science' },
    { id:'c2', name:'CS · Year 3', section:'A', size:32, department:'Computer Science' }
  ],
  days:['Mon','Tue','Wed','Thu','Fri'],
  slots:[
    {start:'09:00',end:'10:00'}, {start:'10:00',end:'11:00'}, {start:'11:15',end:'12:15'},
    {start:'12:15',end:'13:15'}, {start:'14:00',end:'15:00'}, {start:'15:00',end:'16:00'}
  ],
  sessions: [
    {id:'a1',subjectId:'s1',facultyId:'f1',roomId:'r1',classId:'c2',day:'Mon',slot:0},
    {id:'a2',subjectId:'s4',facultyId:'f5',roomId:'r2',classId:'c1',day:'Mon',slot:1},
    {id:'a3',subjectId:'s2',facultyId:'f2',roomId:'r1',classId:'c2',day:'Mon',slot:2},
    {id:'a4',subjectId:'s3',facultyId:'f2',roomId:'r3',classId:'c1',day:'Mon',slot:4,practical:true},
    {id:'a5',subjectId:'s5',facultyId:'f3',roomId:'r2',classId:'c1',day:'Tue',slot:0},
    {id:'a6',subjectId:'s1',facultyId:'f1',roomId:'r1',classId:'c2',day:'Tue',slot:1},
    {id:'a7',subjectId:'s4',facultyId:'f5',roomId:'r1',classId:'c1',day:'Tue',slot:2},
    {id:'a8',subjectId:'s2',facultyId:'f2',roomId:'r2',classId:'c2',day:'Tue',slot:4},
    {id:'a9',subjectId:'s3',facultyId:'f4',roomId:'r3',classId:'c1',day:'Wed',slot:0,practical:true},
    {id:'a10',subjectId:'s1',facultyId:'f1',roomId:'r1',classId:'c2',day:'Wed',slot:1},
    {id:'a11',subjectId:'s5',facultyId:'f3',roomId:'r2',classId:'c1',day:'Wed',slot:2},
    {id:'a12',subjectId:'s4',facultyId:'f5',roomId:'r1',classId:'c1',day:'Thu',slot:0},
    {id:'a13',subjectId:'s2',facultyId:'f2',roomId:'r2',classId:'c2',day:'Thu',slot:1},
    {id:'a14',subjectId:'s3',facultyId:'f4',roomId:'r3',classId:'c1',day:'Thu',slot:4,practical:true}
  ]
};

export const hydrate = (session, data=demo) => ({...session, subject:data.subjects.find(x=>x.id===session.subjectId), faculty:data.faculty.find(x=>x.id===session.facultyId), room:data.rooms.find(x=>x.id===session.roomId), course:data.classes.find(x=>x.id===session.classId)});

