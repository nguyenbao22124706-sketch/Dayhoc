'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');

test('chuyển tài khoản EduBlue cũ vào StaNovant, không trùng và sao lưu',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sv-migrate-'));
  try {
    const oldFile=path.join(temp,'edublue.sqlite');
    const newFile=path.join(temp,'stanovant.sqlite');
    const old=new DatabaseSync(oldFile);
    old.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,full_name TEXT,email TEXT,password_hash TEXT,created_at TEXT)');
    const passwordHash='0123456789abcdef0123456789abcdef:'+('ab'.repeat(64));
    old.prepare('INSERT INTO users(full_name,email,password_hash,created_at) VALUES (?,?,?,?)').run('Bạn Học EduBlue','old@example.com',passwordHash,'2025-01-01T00:00:00Z');
    old.close();
    const cmd=path.resolve(__dirname,'..','scripts','chuyen-tai-khoan-edublue.js');
    const run=()=>execFileSync(process.execPath,[cmd,oldFile],{env:{...process.env,DB_PATH:newFile},encoding:'utf8'});
    assert.match(run(),/Đã chuyển 1 tài khoản/);
    assert.match(run(),/Đã chuyển 0 tài khoản/);
    const migrated=new DatabaseSync(newFile,{readOnly:true});
    const user=migrated.prepare('SELECT name,email,password_hash FROM users').get();
    assert.equal(user.name,'Bạn Học EduBlue');
    assert.equal(user.email,'old@example.com');
    assert.equal(user.password_hash,passwordHash);
    migrated.close();
    assert.ok(fs.readdirSync(temp).some(name=>name.startsWith('stanovant-truoc-khi-chuyen-')&&name.endsWith('.sqlite')));
  } finally {fs.rmSync(temp,{recursive:true,force:true})}
});
