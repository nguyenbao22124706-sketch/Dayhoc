'use strict';
// Backend role-based administration. All permissions are verified on the server.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_VIDEO = 30 * 1024 * 1024;
function installAdmin(db, opts) {
  const {dataDir,json,parseJSON,originOkay} = opts;
  const uploadDir=path.join(dataDir,'uploads');
  fs.mkdirSync(uploadDir,{recursive:true});
  const names=db.prepare('PRAGMA table_info(users)').all().map(x=>x.name);
  if(!names.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
  db.exec(`CREATE TABLE IF NOT EXISTS content_courses(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS content_lessons(
    id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES content_courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_content_lessons_course ON content_lessons(course_id,position);
    CREATE TABLE IF NOT EXISTS course_enrollments(
      course_id INTEGER NOT NULL REFERENCES content_courses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      granted_at TEXT NOT NULL,
      PRIMARY KEY(course_id,user_id));
    CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_id);`);
  const q={
    courses:db.prepare('SELECT id,title,summary,published,created_at FROM content_courses ORDER BY id DESC'),
    course:db.prepare('SELECT id,title,summary,published,created_at FROM content_courses WHERE id=?'),
    lessons:db.prepare('SELECT id,course_id,title,content,video_url,position FROM content_lessons WHERE course_id=? ORDER BY position,id'),
    lesson:db.prepare('SELECT * FROM content_lessons WHERE id=?'),
    enrollment:db.prepare('SELECT 1 FROM course_enrollments WHERE course_id=? AND user_id=?'),
    grant:db.prepare('INSERT OR IGNORE INTO course_enrollments(course_id,user_id,granted_at) VALUES(?,?,?)'),
    revoke:db.prepare('DELETE FROM course_enrollments WHERE course_id=? AND user_id=?'),
    courseStudents:db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN course_enrollments e ON e.user_id=u.id WHERE e.course_id=? ORDER BY u.id'),
    user:db.prepare('SELECT id,role FROM users WHERE id=?'),
    mediaAccess:db.prepare('SELECT c.id,c.published FROM content_lessons l JOIN content_courses c ON l.course_id=c.id WHERE l.video_url=?'),
    addCourse:db.prepare('INSERT INTO content_courses(title,summary,published,created_at) VALUES(?,?,?,?)'),
    editCourse:db.prepare('UPDATE content_courses SET title=?,summary=?,published=? WHERE id=?'),
    removeCourse:db.prepare('DELETE FROM content_courses WHERE id=?'),
    addLesson:db.prepare('INSERT INTO content_lessons(course_id,title,content,video_url,position) VALUES(?,?,?,?,?)'),
    editLesson:db.prepare('UPDATE content_lessons SET title=?,content=?,video_url=?,position=? WHERE id=?'),
    removeLesson:db.prepare('DELETE FROM content_lessons WHERE id=?'),
    users:db.prepare(`SELECT u.id,u.name,u.email,u.role,u.created_at,
      (SELECT COUNT(*) FROM lesson_progress p WHERE p.user_id=u.id) AS completed_lessons,
      (SELECT COUNT(*) FROM battle_results b WHERE b.user_id=u.id AND b.correct=1) AS correct_answers
      FROM users u ORDER BY u.id DESC LIMIT 250`),
  };
  const idFrom=x=>/^\d+$/.test(x||'')&&Number(x)>0?Number(x):null;
  const isAdmin=user=>user?.role==='admin';
  const permitted=(course,user)=>Boolean(user&&(isAdmin(user)||(course.published===1&&q.enrollment.get(course.id,user.id))));
  const coursePreview=(course,user)=>({id:course.id,title:course.title,summary:course.summary,published:course.published,hasAccess:permitted(course,user),lessonCount:q.lessons.all(course.id).length});
  function cleanCourse(x){
    const title=typeof x.title==='string'?x.title.trim():'';
    const summary=typeof x.summary==='string'?x.summary.trim():'';
    if(title.length<3||title.length>120||summary.length>1500)throw Error('Tên khóa học 3–120 ký tự, mô tả tối đa 1500 ký tự.');
    return [title,summary,x.published===true?1:0];
  }
  function cleanLesson(x){
    const title=typeof x.title==='string'?x.title.trim():'';
    const content=typeof x.content==='string'?x.content.trim():'';
    const video=typeof x.videoUrl==='string'?x.videoUrl.trim():'';
    if(title.length<3||title.length>150||content.length>12000||video.length>500)throw Error('Tên bài học 3–150 ký tự, nội dung tối đa 12.000 ký tự.');
    if(video && !(video.startsWith('/api/media/') && /^\/api\/media\/[a-f0-9]{32}\.(mp4|webm)$/.test(video)) && !(url=>{try{const u=new URL(url);return u.protocol==='https:'&&!!u.hostname&&u.username===''&&u.password==='';}catch{return false}})(video))throw Error('Video chỉ nhận liên kết HTTPS hoặc video tải lên từ Admin.');
    const pos=Number.isInteger(x.position)?Math.max(0,Math.min(9999,x.position)):0;
    return [title,content,video,pos];
  }
  async function upload(req,res){
    const ct=String(req.headers['content-type']||'').split(';')[0].trim();
    const ext=ct==='video/mp4'?'mp4':ct==='video/webm'?'webm':null;
    if(!ext)return json(res,415,{error:'Chỉ hỗ trợ video MP4 hoặc WebM.'});
    const declared=Number(req.headers['content-length']);
    if(!Number.isInteger(declared)||declared<=0||declared>MAX_VIDEO)return json(res,413,{error:'Video phải nhỏ hơn 30 MB. Video lớn hãy lưu trên dịch vụ video riêng và dán URL HTTPS.'});
    const filename=crypto.randomBytes(16).toString('hex')+'.'+ext;
    const destination=path.join(uploadDir,filename);
    const out=fs.createWriteStream(destination,{flags:'wx',mode:0o600});
    let total=0,header=Buffer.alloc(0),stopped=false;
    try{
      for await(const chunk of req){
        total+=chunk.length;if(total>MAX_VIDEO||total>declared){stopped=true;break;}
        if(header.length<16)header=Buffer.concat([header,chunk]).subarray(0,16);
        if(!out.write(chunk)) await new Promise((resolve,reject)=>{out.once('drain',resolve);out.once('error',reject)});
      }
      out.end();await new Promise((resolve,reject)=>{out.once('finish',resolve);out.once('error',reject)});
      const valid=ext==='mp4'?header.subarray(4,8).toString()==='ftyp':header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
      if(stopped||total!==declared||!valid){await fsp.unlink(destination).catch(()=>{});return json(res,400,{error:'Tệp video không hợp lệ hoặc quá lớn.'});}
      return json(res,201,{url:'/api/media/'+filename});
    }catch(e){out.destroy();await fsp.unlink(destination).catch(()=>{});if(!res.headersSent)return json(res,400,{error:'Không thể nhận video.'});}
  }
  async function serveMedia(req,res,filename,user){
    if(!user)return json(res,401,{error:'Bạn cần đăng nhập.'});
    if(!/^[a-f0-9]{32}\.(mp4|webm)$/.test(filename))return json(res,404,{error:'Không tìm thấy video.'});
    const ref='/api/media/'+filename;
    const coursesUsing=q.mediaAccess.all(ref);
    if(!isAdmin(user)&&!coursesUsing.some(c=>permitted(c,user))) return json(res,403,{error:'Bạn chưa được cấp quyền xem video này.'});
    const mime=filename.endsWith('.mp4')?'video/mp4':'video/webm';
    const file=path.join(uploadDir,filename);
    let size;try{size=(await fsp.stat(file)).size;}catch{return json(res,404,{error:'Không tìm thấy video.'});}
    const range=String(req.headers.range||'');
    let start=0,end=size-1,status=200;
    if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return json(res,416,{error:'Khoảng byte không hợp lệ.'});start=Number(match[1]);end=match[2]?Number(match[2]):end;if(start>=size||end>=size||end<start)return json(res,416,{error:'Khoảng byte không hợp lệ.'});status=206;}
    const h={'Content-Type':mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    if(status===206)h['Content-Range']=`bytes ${start}-${end}/${size}`;
    res.writeHead(status,h);if(req.method==='HEAD')return res.end();fs.createReadStream(file,{start,end}).pipe(res);
  }
  async function handle(req,res,pathname,user){
    if(pathname.startsWith('/api/media/')){
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Phương thức không hỗ trợ.'});
      return serveMedia(req,res,pathname.slice('/api/media/'.length),user);
    }
    if(!user)return json(res,401,{error:'Vui lòng đăng nhập.'});
    if(pathname==='/api/catalog'&&req.method==='GET')return json(res,200,{courses:q.courses.all().filter(c=>c.published===1||isAdmin(user)).map(c=>coursePreview(c,user))});
    const detail=/^\/api\/catalog\/(\d+)$/.exec(pathname);
    if(detail&&req.method==='GET'){
      const course=q.course.get(Number(detail[1]));if(!course||(!course.published&&!isAdmin(user)))return json(res,404,{error:'Không tìm thấy khóa học.'});
      const hasAccess=permitted(course,user);
      return json(res,200,{course:coursePreview(course,user),lessons:hasAccess?q.lessons.all(course.id):[]});
    }
    if(!pathname.startsWith('/api/admin/'))return json(res,404,{error:'Không tìm thấy API.'});
    if(!isAdmin(user))return json(res,403,{error:'Tài khoản này không có quyền quản trị.'});
    if(req.method==='GET'){
      if(pathname==='/api/admin/overview')return json(res,200,{users:q.users.all().length,courses:q.courses.all().length,published:q.courses.all().filter(x=>x.published).length});
      if(pathname==='/api/admin/students')return json(res,200,{students:q.users.all().map(({id,name,email,role,created_at,completed_lessons,correct_answers})=>({id,name,email,role,createdAt:created_at,completedLessons:completed_lessons,correctAnswers:correct_answers}))});
      if(pathname==='/api/admin/courses')return json(res,200,{courses:q.courses.all().map(x=>({...x,lessons:q.lessons.all(x.id),students:q.courseStudents.all(x.id)}))});
      return json(res,404,{error:'API quản trị không tồn tại.'});
    }
    if(!originOkay(req))return json(res,403,{error:'Nguồn không hợp lệ.'});
    if(pathname==='/api/admin/media'&&req.method==='POST')return upload(req,res);
    if(!['POST','PUT','DELETE'].includes(req.method))return json(res,405,{error:'Phương thức không hỗ trợ.'});
    // Granting course access requires only IDs from the URL, not a JSON payload.
    // All other POST/PUT operations continue to validate JSON normally.
    const enrollmentPost=req.method==='POST' && /^\/api\/admin\/courses\/\d+\/students\/\d+$/.test(pathname);
    let body={};if(req.method!=='DELETE' && !enrollmentPost){try{body=await parseJSON(req);}catch(e){return json(res,400,{error:e.message});}}
    try{
      const grantMatch=/^\/api\/admin\/courses\/(\d+)\/students\/(\d+)$/.exec(pathname);
      if(grantMatch){
        const courseId=idFrom(grantMatch[1]),studentId=idFrom(grantMatch[2]);
        const course=q.course.get(courseId),student=q.user.get(studentId);
        if(!course||!student||student.role!=='student')return json(res,404,{error:'Khóa học hoặc học viên không hợp lệ.'});
        if(req.method==='POST'){q.grant.run(courseId,studentId,new Date().toISOString());return json(res,200,{ok:true,hasAccess:true});}
        if(req.method==='DELETE'){q.revoke.run(courseId,studentId);return json(res,200,{ok:true,hasAccess:false});}
        return json(res,405,{error:'Phương thức không hỗ trợ.'});
      }
      if(pathname==='/api/admin/courses'&&req.method==='POST'){
        const c=cleanCourse(body);const out=q.addCourse.run(...c,new Date().toISOString());return json(res,201,{id:Number(out.lastInsertRowid)});
      }
      const courseMatch=/^\/api\/admin\/courses\/(\d+)$/.exec(pathname);
      if(courseMatch){const id=idFrom(courseMatch[1]);if(!q.course.get(id))return json(res,404,{error:'Không tìm thấy khóa học.'});
        if(req.method==='DELETE'){q.removeCourse.run(id);return json(res,200,{ok:true});}
        if(req.method==='PUT'){q.editCourse.run(...cleanCourse(body),id);return json(res,200,{ok:true});}
      }
      if(pathname==='/api/admin/lessons'&&req.method==='POST'){
        const id=idFrom(String(body.courseId));if(!id||!q.course.get(id))return json(res,400,{error:'Khóa học không hợp lệ.'});
        const x=cleanLesson(body);const out=q.addLesson.run(id,...x);return json(res,201,{id:Number(out.lastInsertRowid)});
      }
      const lessonMatch=/^\/api\/admin\/lessons\/(\d+)$/.exec(pathname);
      if(lessonMatch){const id=idFrom(lessonMatch[1]);if(!q.lesson.get(id))return json(res,404,{error:'Không tìm thấy bài học.'});
        if(req.method==='DELETE'){q.removeLesson.run(id);return json(res,200,{ok:true});}
        if(req.method==='PUT'){q.editLesson.run(...cleanLesson(body),id);return json(res,200,{ok:true});}
      }
      return json(res,404,{error:'API quản trị không tồn tại.'});
    }catch(e){return json(res,400,{error:e.message});}
  }
  return {handle};
}
module.exports={installAdmin};
