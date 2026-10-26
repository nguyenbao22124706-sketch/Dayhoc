'use strict';
/** StaNovant: independent Node.js + SQLite MVP. Node.js >=22.13.0. */
const http = require('node:http');
const fs = require('node:fs');
const fsP = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {DatabaseSync} = require('node:sqlite');
const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const PROD = process.env.NODE_ENV === 'production';
// Password admin/admin is accepted for testing ONLY on a loopback-bound server.
// It is never stored as a password hash, and is unavailable on public hosts.
const LOCAL_TEST_ADMIN = !PROD && HOST === '127.0.0.1' && !process.env.RENDER && process.env.STANOVANT_DISABLE_TEST_ADMIN !== '1';
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname,'data','stanovant.sqlite'));
fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS lesson_progress(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, completed_at TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id));
 CREATE TABLE IF NOT EXISTS battle_results(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_id INTEGER NOT NULL, correct INTEGER NOT NULL, answered_at TEXT NOT NULL, PRIMARY KEY(user_id,question_id));
 CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);`);
const lessons = [
 ['chem','c1','Nguyên tử và nguyên tố'],['chem','c2','Phân tử và hợp chất'],['chem','c3','Phản ứng hóa học'],
 ['physics','p1','Lực và chuyển động'],['physics','p2','Năng lượng quanh ta'],['physics','p3','Định luật Newton'],
 ['biology','b1','Tế bào'],['biology','b2','Quang hợp'],['biology','b3','Hệ sinh thái'],
 ['math','m1','Tư duy quy luật'],['math','m2','Số và phép tính'],['math','m3','Hình học căn bản']
];
const lessonIds = new Set(lessons.map(x=>x[1]));
const quizBank = [
 {id:1, q:'Nguyên tố nào có ký hiệu hóa học O?',choices:['Vàng','Oxygen (Oxi)','Sắt','Carbon'],answer:1,explanation:'O là ký hiệu của Oxygen (oxi), số hiệu nguyên tử 8.'},
 {id:2, q:'Số hiệu nguyên tử của Hydrogen (H) là bao nhiêu?',choices:['1','2','8','10'],answer:0,explanation:'Hydrogen đứng đầu bảng tuần hoàn với số hiệu nguyên tử 1.'},
 {id:3, q:'Công thức hóa học của nước là gì?',choices:['CO₂','O₂','H₂O','NaCl'],answer:2,explanation:'Phân tử nước gồm 2 nguyên tử hydrogen và 1 nguyên tử oxygen.'},
 {id:4, q:'Chất nào sau đây là đơn chất?',choices:['NaCl','H₂O','CO₂','O₂'],answer:3,explanation:'O₂ chỉ gồm một nguyên tố hóa học là oxygen.'},
 {id:5, q:'Đơn vị đo lực trong hệ SI là gì?',choices:['Newton (N)','Joule (J)','Watt (W)','Kelvin (K)'],answer:0,explanation:'Đơn vị của lực là newton, ký hiệu N.'},
 {id:6, q:'Năng lượng của vật đang chuyển động gọi là gì?',choices:['Nhiệt năng','Động năng','Thế năng','Hóa năng'],answer:1,explanation:'Vật có chuyển động thì có động năng.'},
 {id:7, q:'Bộ phận nào là đơn vị cơ bản cấu tạo nên cơ thể sống?',choices:['Mô','Cơ quan','Tế bào','Hệ cơ quan'],answer:2,explanation:'Tế bào là đơn vị cấu trúc và chức năng cơ bản của cơ thể sống.'},
 {id:8, q:'Thực vật xanh thường hấp thụ khí nào khi quang hợp?',choices:['CO₂','N₂','H₂','He'],answer:0,explanation:'Trong quang hợp, thực vật sử dụng CO₂ và nước để tạo chất hữu cơ.'},
 {id:9, q:'Số tiếp theo của dãy 2, 4, 6, 8, ... là?',choices:['9','10','12','14'],answer:1,explanation:'Dãy số tăng đều thêm 2, nên số tiếp theo là 10.'},
 {id:10,q:'Tổng các góc trong một tam giác phẳng bằng bao nhiêu?',choices:['90°','120°','180°','360°'],answer:2,explanation:'Tổng ba góc trong một tam giác là 180°.'},
 {id:11,q:'Nguyên tố nào có ký hiệu Fe?',choices:['Sắt','Kẽm','Đồng','Bạc'],answer:0,explanation:'Fe là ký hiệu của sắt (iron), số hiệu nguyên tử 26.'},
 {id:12,q:'Khí hiếm nào có số hiệu nguyên tử 2?',choices:['Neon','Argon','Helium','Krypton'],answer:2,explanation:'Helium có ký hiệu He và số hiệu nguyên tử 2.'}
];
const {installAdmin}=require('./admin-service');
const adminService=installAdmin(db,{dataDir:path.dirname(DB_PATH),json,parseJSON,originOkay});
// Development-only bootstrap. Existing strong admin password stays unchanged.
// A random, unusable-as-known default is stored in SQLite; the local-only login
// handler below recognizes admin/admin only when accessed via loopback.
function ensureLocalTestAdmin(){
 if(!LOCAL_TEST_ADMIN)return;
 const email='admin@internal.stanovant.invalid';
 const existing=db.prepare('SELECT id,role FROM users WHERE email=?').get(email);
 if(existing){if(existing.role!=='admin')throw Error('Reserved admin user has an invalid role.');return;}
 const salt=crypto.randomBytes(16).toString('hex');
 const randomPassword=crypto.randomBytes(32).toString('base64url');
 const passwordHash=salt+':'+crypto.scryptSync(randomPassword,salt,64).toString('hex');
 db.prepare('INSERT INTO users(name,email,password_hash,created_at,role) VALUES(?,?,?,?,?)')
   .run('Quản trị StaNovant',email,passwordHash,new Date().toISOString(),'admin');
}

const prepared={
 findUser:db.prepare('SELECT * FROM users WHERE email=?'), insertUser:db.prepare('INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)'),
 putSession:db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)'), findSession:db.prepare('SELECT u.id,u.name,u.email,u.role,u.created_at FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?'),
 removeSession:db.prepare('DELETE FROM sessions WHERE token_hash=?'), purgeSessions:db.prepare('DELETE FROM sessions WHERE expires_at<?'),
 progress:db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id=?'), mark:db.prepare('INSERT OR IGNORE INTO lesson_progress(user_id,lesson_id,completed_at) VALUES(?,?,?)'),
 battleCount:db.prepare('SELECT COUNT(*) AS n FROM battle_results WHERE user_id=? AND correct=1'), battleAll:db.prepare('SELECT COUNT(*) AS n FROM battle_results WHERE user_id=?'),
 recordAnswer:db.prepare('INSERT OR IGNORE INTO battle_results(user_id,question_id,correct,answered_at) VALUES(?,?,?,?)')
};
const b64sha = val => crypto.createHash('sha256').update(val).digest('hex');
const TOKEN_TTL=7*86400;
const passwordHash=async pw=>{const salt=crypto.randomBytes(16).toString('hex');return `${salt}:${(await scrypt(pw,salt,64)).toString('hex')}`;};
const dummyPassword='0123456789abcdef0123456789abcdef:'+('00'.repeat(64));
async function comparePw(pw,encoded){const [salt,hex]=encoded.split(':');const digest=await scrypt(pw,salt,64);return crypto.timingSafeEqual(digest,Buffer.from(hex,'hex'));}
function cookie(res,token){const flags=[`sv_session=${token}`,'Path=/','HttpOnly','SameSite=Lax',`Max-Age=${token?TOKEN_TTL:0}`];if(PROD)flags.push('Secure');res.setHeader('Set-Cookie',flags.join('; '));}
function startSession(res,id){prepared.purgeSessions.run(Date.now());const token=crypto.randomBytes(32).toString('base64url');prepared.putSession.run(b64sha(token),id,Date.now()+TOKEN_TTL*1000);cookie(res,token);}
function tokenFrom(req){const match=/(?:^|;\s*)sv_session=([a-zA-Z0-9_-]+)/.exec(req.headers.cookie||'');return match&&match[1];}
function sessionUser(req){const t=tokenFrom(req);return t?prepared.findSession.get(b64sha(t),Date.now()):null;}
const publicUser=u=>({id:u.id,name:u.name,email:u.email,createdAt:u.created_at,role:u.role||'student'});
function json(res,code,payload){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
function headers(res){Object.entries({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}).forEach(([k,v])=>res.setHeader(k,v));if(PROD)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');}
function originOkay(req){const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host && new URL(origin).protocol===(PROD?'https:':'http:')}catch{return false}}
async function parseJSON(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new Error('Chỉ nhận JSON.');let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>15000)throw new Error('Dữ liệu quá lớn.');chunks.push(chunk)}try{const x=JSON.parse(Buffer.concat(chunks).toString());if(!x||Array.isArray(x)||typeof x!=='object')throw 0;return x}catch{throw new Error('JSON không hợp lệ.')}}
const rateBuckets=new Map();function rate(req,action,max,ms){const k=action+':'+(req.socket.remoteAddress||'unknown');const now=Date.now();let b=rateBuckets.get(k);if(!b||now>b.until)b={count:0,until:now+ms};b.count++;rateBuckets.set(k,b);return b.count<=max;}
function resultStats(user){const done=prepared.progress.all(user.id).map(row=>row.lesson_id);const won=prepared.battleCount.get(user.id).n;const attempts=prepared.battleAll.get(user.id).n;return {completed:done,completedCount:done.length,totalLessons:lessons.length,battleCorrect:won,battleAttempts:attempts,xp:done.length*20+won*5};}
async function api(req,res,pathname){
 if(pathname==='/api/health'&&req.method==='GET')return json(res,200,{status:'ok',brand:'StaNovant'});
 if(pathname==='/api/me'&&req.method==='GET'){const user=sessionUser(req);return json(res,200,{user:user?publicUser(user):null});}
 const user=sessionUser(req);
 if(pathname.startsWith('/api/admin/')||pathname.startsWith('/api/catalog')||pathname.startsWith('/api/media/'))return adminService.handle(req,res,pathname,user);
 if(req.method==='GET'){
  if(!user)return json(res,401,{error:'Bạn cần đăng nhập trước.'});
  if(pathname==='/api/progress')return json(res,200,{user:publicUser(user),...resultStats(user)});
  if(pathname==='/api/questions')return json(res,200,{questions:quizBank.map(({id,q,choices})=>({id,q,choices}))});
  return json(res,404,{error:'Không tìm thấy API.'});
 }
 if(req.method!=='POST')return json(res,405,{error:'Phương thức không được hỗ trợ.'});
 if(!originOkay(req))return json(res,403,{error:'Nguồn yêu cầu không hợp lệ.'});
 if(pathname==='/api/logout'){const tok=tokenFrom(req);if(tok)prepared.removeSession.run(b64sha(tok));cookie(res,'');return json(res,200,{ok:true});}
 if(pathname==='/api/register'||pathname==='/api/login'){
  if(!rate(req,pathname,pathname.endsWith('register')?8:25,10*60*1000))return json(res,429,{error:'Quá nhiều lần thử. Hãy thử lại sau.'});
  let body;try{body=await parseJSON(req)}catch(e){return json(res,400,{error:e.message})}
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const loginAsAdmin=pathname==='/api/login'&&email==='admin';
  const lookupEmail=loginAsAdmin?'admin@internal.stanovant.invalid':email;
  const password=typeof body.password==='string'?body.password:'';
  const localDemoLogin = LOCAL_TEST_ADMIN && loginAsAdmin && password === 'admin' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if((!loginAsAdmin&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||email.length>254||(password.length<8&&!localDemoLogin)||password.length>128)return json(res,400,{error:'Email hoặc mật khẩu chưa hợp lệ (8–128 ký tự).'});
  if(pathname==='/api/register'){
   if(email.endsWith('.invalid')||email==='admin')return json(res,400,{error:'Email này không được sử dụng.'});
   const name=typeof body.name==='string'?body.name.trim().replace(/\s+/g,' '):'';
   if(name.length<2||name.length>80||body.acceptTerms!==true)return json(res,400,{error:'Họ tên hoặc điều khoản chưa hợp lệ.'});
   if(prepared.findUser.get(email))return json(res,409,{error:'Email này đã được đăng ký.'});
   let inserted;try{inserted=prepared.insertUser.run(name,email,await passwordHash(password),new Date().toISOString())}catch(e){if(e.message.includes('UNIQUE'))return json(res,409,{error:'Email này đã được đăng ký.'});throw e}
   startSession(res,Number(inserted.lastInsertRowid));return json(res,201,{user:{id:Number(inserted.lastInsertRowid),name,email,createdAt:new Date().toISOString()}});
  }
  const record=prepared.findUser.get(lookupEmail);
  const ok=Boolean(localDemoLogin && record?.role==='admin') || await comparePw(password,record?.password_hash||dummyPassword);
  if(!record||!ok)return json(res,401,{error:'Email hoặc mật khẩu không chính xác.'});
  startSession(res,record.id);return json(res,200,{user:publicUser(record)});
 }
 if(!user)return json(res,401,{error:'Phiên đăng nhập đã hết hạn.'});
 if(pathname==='/api/lesson/complete'){
  let body;try{body=await parseJSON(req)}catch(e){return json(res,400,{error:e.message})}
  if(typeof body.lessonId!=='string'||!lessonIds.has(body.lessonId))return json(res,400,{error:'Bài học không hợp lệ.'});
  const out=prepared.mark.run(user.id,body.lessonId,new Date().toISOString());return json(res,200,{ok:true,firstTime:out.changes>0,...resultStats(user)});
 }
 if(pathname==='/api/battle/answer'){
  let body;try{body=await parseJSON(req)}catch(e){return json(res,400,{error:e.message})}
  if(!Number.isInteger(body.questionId)||!Number.isInteger(body.answerIndex))return json(res,400,{error:'Câu trả lời không hợp lệ.'});
  const q=quizBank.find(q=>q.id===body.questionId);if(!q||body.answerIndex<0||body.answerIndex>=q.choices.length)return json(res,400,{error:'Không tìm thấy đáp án.'});
  const correct=body.answerIndex===q.answer;
  const out=prepared.recordAnswer.run(user.id,q.id,correct?1:0,new Date().toISOString());
  return json(res,200,{correct,answerIndex:q.answer,explanation:q.explanation,firstAttempt:out.changes>0,xp:resultStats(user).xp});
 }
 return json(res,404,{error:'API không tồn tại.'});
}
// Các địa chỉ đều là các trang HTML thật, không còn redirect như bản SPA cũ.
const LEGACY_PATHS = Object.freeze({});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const PUBLIC_FILES=new Set(['index.html','dangky.html','dangnhap.html','hocvien.html','khoahoc.html','baihoc.html','thidau.html','bangtuanhoan.html','ontap.html','tiendo.html','taikhoan.html','dieukhoan.html','baomat.html','gioithieu.html','index.css','dangky.css','dangnhap.css','hocvien.css','khoahoc.css','baihoc.css','thidau.css','bangtuanhoan.css','ontap.css','tiendo.css','taikhoan.css','dieukhoan.css','baomat.css','gioithieu.css','index.js','dangky.js','dangnhap.js','hocvien.js','khoahoc.js','baihoc.js','thidau.js','bangtuanhoan.js','ontap.js','tiendo.js','taikhoan.js','dieukhoan.js','baomat.js','gioithieu.js','style.css','theme.css','app.js','elements.js','admin.html','admin.css','admin.js','lop.html','lop.css','lop.js'].map(x=>'/'+x));
const PUBLIC_ASSETS=new Set(['hero-study.webp','chemistry.webp','physics.webp','biology.webp','math.webp','favicon.svg','battle-hero.svg','battle-monster.svg','battle-hero.webp','battle-monster.webp','auth-sky.svg','auth-sky-night.svg'].map(x=>'/assets/'+x));
async function serve(res,pathname,head){let file=pathname==='/'?'/index.html':pathname;
 if(!PUBLIC_FILES.has(file) && !PUBLIC_ASSETS.has(file))return json(res,404,{error:'Không tìm thấy trang hoặc tệp.'});try{file=decodeURIComponent(file)}catch{return json(res,400,{error:'Đường dẫn sai.'})};const full=path.resolve(ROOT,'.'+file);if(!full.startsWith(ROOT+path.sep))return json(res,403,{error:'Tệp không được phép truy cập.'});if(!mime[path.extname(full)])return json(res,404,{error:'Không tìm thấy.'});try{const data=await fsP.readFile(full);res.writeHead(200,{'Content-Type':mime[path.extname(full)],'Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=300'});res.end(head?undefined:data)}catch{return json(res,404,{error:'Không tìm thấy trang.'})}}
const server=http.createServer(async(req,res)=>{headers(res);let pathname;try{pathname=new URL(req.url,'http://localhost').pathname}catch{return json(res,400,{error:'URL không hợp lệ.'})}try{if(pathname.startsWith('/api/'))return await api(req,res,pathname);if(req.method==='GET'||req.method==='HEAD'){if(Object.hasOwn(LEGACY_PATHS,pathname)){res.writeHead(302,{'Location':LEGACY_PATHS[pathname],'Cache-Control':'no-store'});return res.end();}return await serve(res,pathname,req.method==='HEAD');}return json(res,405,{error:'Không hỗ trợ phương thức.'})}catch(err){console.error('[server]',err);if(!res.headersSent)json(res,500,{error:'Lỗi máy chủ. Thử lại sau.'});else res.end()}});
if(require.main===module){
 ensureLocalTestAdmin();
 server.listen(PORT,HOST,()=>{
   console.log(`StaNovant đang chạy tại http://${HOST}:${PORT}\nCơ sở dữ liệu: ${DB_PATH}`);
   if(LOCAL_TEST_ADMIN)console.log('LOCAL TEST ONLY: tài khoản admin / mật khẩu admin. KHÔNG công khai localhost qua tunnel hoặc port forwarding.');
 });
}
module.exports={server,db,quizBank,lessons};
