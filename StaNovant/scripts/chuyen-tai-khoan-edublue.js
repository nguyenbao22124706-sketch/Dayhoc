#!/usr/bin/env node
'use strict';
/* Chuyển tài khoản từ SQLite EduBlue cũ sang StaNovant mới (tùy chọn).
 * Không tự chạy. Không ghi đè dữ liệu, không chuyển phiên đăng nhập.
 * Dừng cả hai server trước khi thực hiện; KHÔNG đưa cơ sở dữ liệu lên GitHub.
 */
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync, backup} = require('node:sqlite');

async function main() {
  const oldArg = process.argv[2];
  if (!oldArg) {
    console.error('Cách dùng: node scripts/chuyen-tai-khoan-edublue.js "C:\\duong-dan\\edublue.sqlite"');
    process.exitCode = 1;
    return;
  }
  const oldPath = path.resolve(oldArg);
  const newPath = path.resolve(process.env.DB_PATH || path.join(__dirname,'..','data','stanovant.sqlite'));
  if (!fs.existsSync(oldPath)) throw new Error('Không thấy cơ sở dữ liệu cũ: ' + oldPath);
  if (oldPath === newPath) throw new Error('Cơ sở dữ liệu cũ và mới phải là hai file khác nhau.');
  fs.mkdirSync(path.dirname(newPath), {recursive:true});
  const previous = new DatabaseSync(oldPath,{readOnly:true});
  let next;
  try {
    const columns = previous.prepare('PRAGMA table_info(users)').all().map(item=>item.name);
    if (!['full_name','email','password_hash','created_at'].every(name=>columns.includes(name))) {
      throw new Error('Định dạng SQLite cũ không khớp bản EduBlue đã tạo. Không có dữ liệu nào được chuyển.');
    }
    const oldUsers = previous.prepare('SELECT full_name,email,password_hash,created_at FROM users ORDER BY id').all();
    const exists = fs.existsSync(newPath);
    next = new DatabaseSync(newPath);
    next.exec('PRAGMA busy_timeout=5000');
    next.exec(`CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
    if (exists) {
      const backupName = path.join(path.dirname(newPath),`stanovant-truoc-khi-chuyen-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
      await backup(next,backupName);
      console.log('Đã sao lưu dữ liệu StaNovant hiện tại tại:',backupName);
    }
    const add = next.prepare('INSERT OR IGNORE INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)');
    let added = 0, skipped = 0;
    next.exec('BEGIN IMMEDIATE');
    try {
      for (const u of oldUsers) {
        const email = String(u.email||'').trim().toLowerCase();
        const pw = String(u.password_hash||'');
        if (!email || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(pw)) {
          skipped++;continue;
        }
        const info = add.run(String(u.full_name),email,pw,String(u.created_at));
        if (info.changes) added++;else skipped++;
      }
      next.exec('COMMIT');
    } catch (error) { next.exec('ROLLBACK'); throw error; }
    console.log(`Hoàn thành! Đã chuyển ${added} tài khoản; bỏ qua ${skipped} tài khoản đã có hoặc không hợp lệ.`);
    console.log('Mật khẩu băm tương thích được giữ lại. Phiên đăng nhập cũ không chuyển; người dùng đăng nhập lại.');
    console.log('Không tải file .sqlite hoặc bản sao lưu lên repository công khai.');
  } finally {
    try { next?.close(); } catch {}
    previous.close();
  }
}
main().catch(error=>{console.error('Chuyển tài khoản thất bại:',error.message);process.exitCode=1});
