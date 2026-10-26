'use strict';
// Bản sao SQLite đồng nhất; sao chép cả uploads để giữ video khi thay đổi máy chủ.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
const dbPath=path.resolve(process.env.DB_PATH||path.join(root,'data','stanovant.sqlite'));
if(!fs.existsSync(dbPath)){console.error('Chưa có cơ sở dữ liệu:',dbPath);process.exit(1)}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupDir=path.join(root,'backups','backup-'+stamp);
fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
const snapshot=path.join(backupDir,'stanovant.sqlite');
const db=new DatabaseSync(dbPath,{readOnly:true});
try{db.exec(`VACUUM INTO '${snapshot.replace(/'/g,"''")}'`);}finally{db.close();}
const uploads=path.join(path.dirname(dbPath),'uploads');
if(fs.existsSync(uploads))fs.cpSync(uploads,path.join(backupDir,'uploads'),{recursive:true});
console.log('Đã tạo bản sao dữ liệu và video tại:',backupDir);
console.log('Không tải thư mục backups lên GitHub. Kiểm tra khôi phục định kỳ.');
