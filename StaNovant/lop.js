'use strict';
const $=s=>document.querySelector(s);
const apply=t=>{document.documentElement.dataset.theme=t;localStorage.setItem('sv-theme',t);$('#dark-switch').textContent=t==='dark'?'☀️ Nền sáng':'🌙 Nền tối'};
apply(localStorage.getItem('sv-theme')==='dark'?'dark':'light');$('#dark-switch').onclick=()=>apply(document.documentElement.dataset.theme==='dark'?'light':'dark');
(async()=>{
 try{const id=new URLSearchParams(location.search).get('id');if(!/^\d+$/.test(id||''))throw Error('Mã khóa học không hợp lệ.');
  const res=await fetch('/api/catalog/'+id,{credentials:'same-origin'});const data=await res.json();if(!res.ok)throw Error(data.error||'Không thể tải khóa học.');
  $('#title').textContent=data.course.title;$('#summary').textContent=data.course.summary;
  if(!data.course.hasAccess){
   $('#course-section').hidden=false;$('#message').hidden=true;
   $('#lesson-list').replaceChildren();
   const card=document.createElement('div');card.className='locked-course';
   const icon=document.createElement('div');icon.className='lock-icon';icon.textContent='🔒';
   const title=document.createElement('h2');title.textContent='Bạn chưa được cấp quyền vào khóa học này';
   const text=document.createElement('p');text.textContent='Bạn có thể đọc phần giới thiệu ở trên. Chỉ tài khoản được Admin cấp quyền mới xem được bài học và video.';
   const link=document.createElement('a');link.href='/khoahoc.html';link.textContent='← Trở về thư viện khóa học';
   card.append(icon,title,text,link);$('#lesson-list').append(card);return;
  }
  const holder=$('#lesson-list');
  for(const l of data.lessons){const wrap=document.createElement('article');wrap.className='lesson-card';const h=document.createElement('h3');h.textContent=l.title;wrap.append(h);
   const p=document.createElement('p');p.textContent=l.content;p.className='lesson-body';wrap.append(p);
   if(l.video_url){const url=l.video_url;
    if(url.startsWith('/api/media/')||/\.(mp4|webm)(\?.*)?$/i.test(url)){
      const vid=document.createElement('video');vid.controls=true;vid.preload='metadata';vid.playsInline=true;vid.src=url;vid.setAttribute('aria-label','Video bài học: '+l.title);wrap.append(vid);
    }else{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='🎬 Mở video bài học (trang ngoài)';wrap.append(a);}
   }
   holder.append(wrap);
  }
  if(!data.lessons.length){const p=document.createElement('p');p.textContent='Khóa học này chưa có bài giảng.';holder.append(p)}
  $('#message').hidden=true;$('#course-section').hidden=false;
 }catch(e){$('#message').textContent=e.message+(e.message.includes('đăng nhập')?' Vào trang đăng nhập để tiếp tục.':'');}
})();
