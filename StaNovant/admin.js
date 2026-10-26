'use strict';
const $=s=>document.querySelector(s);
let courses=[];let students=[];
function announce(message){const el=$('#feedback');el.hidden=false;el.textContent=message;clearTimeout(announce.timer);announce.timer=setTimeout(()=>el.hidden=true,5000);}
async function request(path,{method='GET',body}={}){
 const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let data={};try{data=await response.json();}catch{}if(!response.ok)throw Error(data.error||`Máy chủ gặp lỗi ${response.status}`);return data;
}
function theme(next){document.documentElement.dataset.theme=next;localStorage.setItem('sv-theme',next);$('#theme-button').textContent=next==='dark'?'☀️ Nền sáng':'🌙 Nền tối';}
$('#theme-button').addEventListener('click',()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
theme(localStorage.getItem('sv-theme')==='dark'?'dark':'light');
function switchTab(tab){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));document.querySelectorAll('.tab-section').forEach(s=>s.hidden=s.id!==`section-${tab}`);}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
function tag(parent,tagName,text,className){const node=document.createElement(tagName);node.textContent=text;if(className)node.className=className;parent.appendChild(node);return node;}
function btn(parent,text,handler,danger=false){const b=tag(parent,'button',text,danger?'danger':'');b.type='button';b.addEventListener('click',handler);return b;}
function courseReset(){ $('#course-id').value='';$('#course-title').value='';$('#course-summary').value='';$('#course-published').checked=false;$('#course-form-title').textContent='Thêm khóa học';}
function lessonReset(){ $('#lesson-id').value='';$('#lesson-title').value='';$('#lesson-content').value='';$('#lesson-video').value='';$('#lesson-position').value='0';$('#lesson-file').value='';$('#upload-status').textContent='';$('#lesson-form-title').textContent='Thêm bài học';}
$('#course-reset').addEventListener('click',courseReset);$('#lesson-reset').addEventListener('click',lessonReset);
async function refresh(){
 const [overview,result,people]=await Promise.all([request('/api/admin/overview'),request('/api/admin/courses'),request('/api/admin/students')]);
 courses=result.courses;students=people.students.filter(u=>u.role==='student');$('#metric-students').textContent=overview.users;$('#metric-courses').textContent=overview.courses;$('#metric-published').textContent=overview.published;
 const courseList=$('#courses-list');courseList.replaceChildren();const lessonList=$('#lessons-list');lessonList.replaceChildren();
 const select=$('#lesson-course');const selected=select.value;select.replaceChildren();
 for(const c of courses){
  const option=new Option(c.title,String(c.id));select.appendChild(option);
  const row=tag(courseList,'div','','entry');const main=tag(row,'div','','entry-main');tag(main,'strong',c.title);tag(main,'small',`${c.published?'🟢 Công khai':'⚪ Bản nháp'} · ${c.lessons.length} bài · ${c.summary.slice(0,130)}`);
  const actions=tag(row,'div','','entry-controls');
  btn(actions,'Sửa',()=>{$('#course-id').value=c.id;$('#course-title').value=c.title;$('#course-summary').value=c.summary;$('#course-published').checked=!!c.published;$('#course-form-title').textContent='Chỉnh sửa khóa học';window.scrollTo({top:0,behavior:'smooth'});});
  btn(actions,'Bài học',()=>{select.value=String(c.id);switchTab('lessons');});
  btn(actions,'Xóa',async()=>{if(!confirm(`Xóa khóa học "${c.title}" và tất cả bài học của nó?`))return;try{await request(`/api/admin/courses/${c.id}`,{method:'DELETE'});announce('Đã xóa khóa học.');await refresh();}catch(e){announce(e.message);}},true);
  for(const lesson of c.lessons){const lr=tag(lessonList,'div','','entry');const details=tag(lr,'div','','entry-main');tag(details,'strong',`${c.title} · ${lesson.title}`);tag(details,'small',`${lesson.video_url?'🎬 Có video':'📖 Chưa có video'} · Thứ tự ${lesson.position}`);
   const controls=tag(lr,'div','','entry-controls');btn(controls,'Sửa',()=>{switchTab('lessons');$('#lesson-id').value=lesson.id;select.value=String(c.id);$('#lesson-title').value=lesson.title;$('#lesson-content').value=lesson.content;$('#lesson-video').value=lesson.video_url;$('#lesson-position').value=lesson.position;$('#lesson-form-title').textContent='Chỉnh sửa bài học';window.scrollTo({top:0,behavior:'smooth'});});
   btn(controls,'Xóa',async()=>{if(!confirm(`Xóa bài "${lesson.title}"?`))return;try{await request(`/api/admin/lessons/${lesson.id}`,{method:'DELETE'});announce('Đã xóa bài học.');await refresh();}catch(e){announce(e.message);}},true);
  }
 }
 if(!courses.length){tag(courseList,'p','Chưa có khóa học. Hãy tạo khóa học đầu tiên.');tag(lessonList,'p','Chưa có bài học.');}
 if(selected&&courses.some(c=>String(c.id)===selected))select.value=selected;
 populateAccessSelect();renderAccess();
 const body=$('#students-body');body.replaceChildren();
 for(const u of people.students){const tr=document.createElement('tr');[u.name,u.email,u.role==='admin'?'Quản trị':'Học viên',String(u.completedLessons),String(u.correctAnswers)].forEach(v=>tag(tr,'td',v));body.append(tr);}
}

function populateAccessSelect(){
 const sel=$('#access-course'),value=sel.value;
 sel.replaceChildren();
 for(const course of courses) sel.append(new Option(course.title,String(course.id)));
 if(courses.some(c=>String(c.id)===value))sel.value=value;
}
function renderAccess(){
 const course=courses.find(c=>String(c.id)===$('#access-course').value);
 const tbody=$('#access-body');tbody.replaceChildren();
 if(!course){$('#access-summary').textContent='Tạo một khóa học trước khi cấp quyền.';return;}
 const enrolled=new Set(course.students.map(u=>u.id));
 const term=$('#access-search').value.trim().toLowerCase();
 $('#access-summary').textContent=`${enrolled.size} học viên được cấp quyền · ${course.published?'Đã công khai phần giới thiệu':'Bản nháp'}`;
 let shown=0;
 for(const student of students.filter(u=>(u.name+' '+u.email).toLowerCase().includes(term))){
  shown++;const tr=document.createElement('tr');
  tag(tr,'td',student.name);tag(tr,'td',student.email);
  const td=document.createElement('td');tag(td,'strong',enrolled.has(student.id)?'✅ Được học':'🔒 Chưa được học');tr.append(td);
  const action=document.createElement('td');
  const b=btn(action,enrolled.has(student.id)?'Thu hồi quyền':'Cấp quyền',async()=>{
   b.disabled=true;
   try{await request(`/api/admin/courses/${course.id}/students/${student.id}`,enrolled.has(student.id)?{method:'DELETE'}:{method:'POST',body:{}});await refresh();announce(`Đã cập nhật quyền học cho ${student.name}.`)}catch(err){announce(err.message);b.disabled=false;}
  },enrolled.has(student.id));tr.append(action);tbody.append(tr);
 }
 if(!shown){const tr=document.createElement('tr');const td=tag(tr,'td','Không tìm thấy học viên phù hợp.');td.colSpan=4;tbody.append(tr);}
}
$('#access-course').addEventListener('change',renderAccess);
$('#access-search').addEventListener('input',renderAccess);

$('#course-form').addEventListener('submit',async e=>{e.preventDefault();const id=$('#course-id').value;const body={title:$('#course-title').value,summary:$('#course-summary').value,published:$('#course-published').checked};try{await request(id?`/api/admin/courses/${id}`:'/api/admin/courses',{method:id?'PUT':'POST',body});courseReset();await refresh();announce('Đã lưu khóa học.');}catch(err){announce(err.message);}});
$('#lesson-form').addEventListener('submit',async e=>{
 e.preventDefault();const id=$('#lesson-id').value;const file=$('#lesson-file').files[0];let url=$('#lesson-video').value.trim();
 try{
  if(file){if(file.size>30*1024*1024)throw Error('Video tối đa 30 MB. Video lớn dùng đường dẫn HTTPS.');if(!['video/mp4','video/webm'].includes(file.type))throw Error('Chỉ hỗ trợ MP4 và WebM.');
   $('#upload-status').textContent='Đang tải video lên server...';
   const res=await fetch('/api/admin/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});const data=await res.json();if(!res.ok)throw Error(data.error||'Lỗi tải video');url=data.url;$('#upload-status').textContent='Tải lên thành công.';
  }
  const body={courseId:Number($('#lesson-course').value),title:$('#lesson-title').value,content:$('#lesson-content').value,videoUrl:url,position:Number($('#lesson-position').value)||0};
  await request(id?`/api/admin/lessons/${id}`:'/api/admin/lessons',{method:id?'PUT':'POST',body});lessonReset();await refresh();announce('Đã lưu bài học.');
 }catch(err){announce(err.message);$('#upload-status').textContent='Không thể lưu bài học.';}
});
(async()=>{
 try{const me=await request('/api/me');if(!me.user||me.user.role!=='admin'){ $('#access-message').textContent='Bạn không có quyền quản trị. Chỉ tài khoản admin mới có thể sử dụng trang này.';return;}
 $('#main').hidden=false;$('#access-message').hidden=true;await refresh();
 }catch(err){$('#access-message').textContent='Không thể vào trang quản trị: '+err.message;}
})();
