'use strict';
// Run once locally: node scripts/tao-admin.js
// Creates username "admin" with a randomly generated password printed only once.
const crypto=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const dbPath=path.resolve(process.env.DB_PATH||path.join(__dirname,'..','data','stanovant.sqlite'));
 fs.mkdirSync(path.dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);
 db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);`);
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='role'))db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
 const email='admin@internal.stanovant.invalid';
 const existing=db.prepare('SELECT id,role FROM users WHERE email=?').get(email);
 if(existing){console.log('Admin đã tồn tại. Không tự đặt lại mật khẩu. ID:',existing.id);db.close();return;}
 const supplied=process.env.STANOVANT_ADMIN_PASSWORD;
 const pw=supplied||crypto.randomBytes(20).toString('base64url');
 if(pw.length<16||pw.toLowerCase()==='admin'||pw.length>128)throw Error('Mật khẩu quản trị phải từ 16 đến 128 ký tự, không dùng admin.');
 const salt=crypto.randomBytes(16).toString('hex');
 const hash=(await new Promise((ok,fail)=>crypto.scrypt(pw,salt,64,(e,data)=>e?fail(e):ok(data)))).toString('hex');
 db.prepare('INSERT INTO users(name,email,password_hash,created_at,role) VALUES(?,?,?,?,?)').run('Quản trị StaNovant',email,`${salt}:${hash}`,new Date().toISOString(),'admin');
 db.close();
 console.log('\nTÀI KHOẢN QUẢN TRỊ ĐÃ TẠO');
 console.log('Tên đăng nhập: admin');
 if(!supplied)console.log('Mật khẩu khởi tạo (ghi lại ngay):',pw);
 else console.log('Mật khẩu: sử dụng giá trị STANOVANT_ADMIN_PASSWORD mà bạn đã tự đặt.');
 console.log('Lưu mật khẩu riêng, không gửi lên GitHub. admin/admin chỉ dành cho server test tại localhost.');
})().catch(e=>{console.error('Lỗi tạo admin:',e.message);process.exitCode=1});
