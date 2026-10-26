'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');

function freePort(){return new Promise((ok,fail)=>{const s=net.createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});}
async function runServer(env,task){
 const port=await freePort();
 const childEnv={...process.env,...env,PORT:String(port),HOST:'127.0.0.1'};
 delete childEnv.RENDER;
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:childEnv,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',v=>logs+=v.toString());child.stderr.on('data',v=>logs+=v.toString());
 const url=`http://127.0.0.1:${port}`;
 try{
   let ok=false;
   for(let i=0;i<70;i++){
     if(child.exitCode!==null)throw Error(`Server exited early. ${logs}`);
     try{if((await fetch(url+'/api/health')).ok){ok=true;break;}}catch{}
     await new Promise(resolve=>setTimeout(resolve,90));
   }
   if(!ok)throw Error(`Server did not start. ${logs}`);
   return await task(url);
 }finally{child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2500).unref();});}
}
test('admin/admin chỉ đăng nhập ở localhost test, không lưu mật khẩu yếu và bị chặn ở production',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stanovant-demo-admin-'));
 const dbPath=path.join(dir,'test.sqlite');
 const payload=JSON.stringify({email:'admin',password:'admin'});
 try{
   await runServer({DB_PATH:dbPath,NODE_ENV:'development'},async(base)=>{
     const resp=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json','origin':base},body:payload});
     assert.equal(resp.status,200);
     assert.equal((await resp.json()).user.role,'admin');
   });
   const db=new DatabaseSync(dbPath);
   const row=db.prepare('SELECT role,password_hash FROM users WHERE email=?').get('admin@internal.stanovant.invalid');
   assert.equal(row.role,'admin');
   assert.ok(row.password_hash.includes(':'));
   db.close();
   await runServer({DB_PATH:dbPath,NODE_ENV:'production'},async(base)=>{
     const resp=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json','origin':base},body:payload});
     assert.notEqual(resp.status,200);
   });
   await runServer({DB_PATH:dbPath,NODE_ENV:'development',STANOVANT_DISABLE_TEST_ADMIN:'1'},async(base)=>{
     const resp=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json','origin':base},body:payload});
     assert.notEqual(resp.status,200);
   });
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
