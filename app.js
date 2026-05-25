const API = 'https://script.google.com/macros/s/AKfycbzEZj1UW3bejogNEuqmThCZNPlFdqXhq2zmlHI-D8cFgLFszs9G3Zcb4EFau1NyJl6D/exec';
let S = {role:null,name:'',rooms:[],filter:'all',room:null,status:null,chatSince:null};
let timer = null;
const $ = id => document.getElementById(id);
const KR = {uncleaned:'미정비',cleaning:'정비중',cleaned:'정비완료',inspection:'점검필요'};

function showLoad(m){$('loadingOv').style.display='flex';$('loadingMsg').textContent=m||'처리 중...';}
function hideLoad(){$('loadingOv').style.display='none';}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}

async function api(p){
  try{
    const r=await fetch(API,{method:'POST',redirect:'follow',body:JSON.stringify(p)});
    return JSON.parse(await r.text());
  }catch(e){return{ok:false,error:String(e)};}
}

function switchTab(t){
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',(t==='admin')===(i===0)));
  $('adminForm').style.display=t==='admin'?'block':'none';
  $('maidForm').style.display=t==='maid'?'block':'none';
  $('loginError').textContent='';
}

async function login(){
  const p=$('pinInput').value.trim();
  if(!p)return;
  showLoad('인증 중...');
  const r=await api({action:'verifyPin',pin:p});
  hideLoad();
  if(r.ok){S.role='admin';S.name='관리자';go();}
  else $('loginError').textContent='PIN 오류';
}

function loginMaid(){
  const n=$('maidNameInput').value.trim();
  if(!n){$('loginError').textContent='이름 입력';return;}
  S.role='maid';S.name=n;go();
}

function logout(){
  clearInterval(timer);
  S={role:null,name:'',rooms:[],filter:'all',room:null,status:null,chatSince:null};
  $('loginScreen').style.display='flex';$('app').style.display='none';
  $('pinInput').value='';$('maidNameInput').value='';
}

async function go(){
  $('loginScreen').style.display='none';$('app').style.display='flex';
  $('headerSub').textContent=S.role==='admin'?'관리자 모드':S.name+' 님';
  $('resetBtn').style.display=S.role==='admin'?'block':'none';
  $('maidSec').style.display=S.role==='admin'?'block':'none';
  showLoad('로딩 중...');
  await loadRooms();
  hideLoad();
  clearInterval(timer);
  timer=setInterval(()=>{
    const tab=document.querySelector('.nav-tab.active');
    if(tab&&tab.textContent.includes('객실'))loadRooms(true);
    else loadChat(true);
  },8000);
}

async function loadRooms(silent=false){
  try{
    const r=await api({action:'getRooms'});
    if(r.ok){S.rooms=r.rooms;render();stats();}
    else if(!silent)toast('로드실패');
  }catch(e){if(!silent)toast('오류');}
}

function stats(){
  const c={uncleaned:0,cleaning:0,cleaned:0,inspection:0};
  S.rooms.forEach(r=>{if(c[r.status]!==undefined)c[r.status]++;});
  ['uncleaned','cleaning','cleaned','inspection'].forEach((k,i)=>$('cnt'+i).textContent=c[k]);
}

function setFilter(f){
  S.filter=f;
  const lbl={all:'전체',uncleaned:'미정비',cleaning:'정비중',cleaned:'완료',inspection:'점검'};
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.textContent.includes(lbl[f]||f)));
  render();
}

function render(){
  let rooms=S.rooms;
  if(S.filter!=='all')rooms=rooms.filter(x=>x.status===S.filter);
  if(S.role==='maid')rooms=rooms.filter(x=>!x.maidName||x.maidName===S.name);
  const grid=$('roomsGrid');
  grid.innerHTML='';
  rooms.forEach(function(room){
    const no=String(room.roomNo);
    const card=document.createElement('div');
    card.className='room-card '+room.status;
    card.innerHTML=
      '<div class="room-no">'+no+'</div>'+
      '<div class="room-type">'+room.typeCode+'</div>'+
      '<div class="room-status status-'+room.status+'">'+KR[room.status]+'</div>'+
      (room.maidName?'<div class="room-maid">👤 '+room.maidName+'</div>':'');
    card.onclick=function(){openRoom(no);};
    grid.appendChild(card);
  });
}

async function openRoom(no){
  no=String(no);
  S.room=S.rooms.find(r=>String(r.roomNo)===no);
  if(!S.room){toast('오류: 객실 없음 '+no);return;}
  S.status=S.room.status;
  $('mRoomNo').textContent=no+'호';
  $('mRoomType').textContent=S.room.typeName||'';
  $('maidInput').value=S.room.maidName||'';
  $('noteInput').value='';
  updBtns();
  $('notesList').innerHTML='<div style="color:var(--text2);font-size:12px">로딩중...</div>';
  $('roomModal').classList.add('open');
  try{
    const r=await api({action:'getRoomNotes',roomNo:no});
    if(r.ok&&r.notes&&r.notes.length){
      $('notesList').innerHTML=r.notes.slice().reverse().map(n=>
        '<div class="note-item"><div class="note-meta">'+n.sender+' · '+fmt(n.timestamp)+'</div>'+esc(n.note)+'</div>'
      ).join('');
    }else{
      $('notesList').innerHTML='<div style="color:var(--text2);font-size:12px">메모 없음</div>';
    }
  }catch(e){}
}

function closeModal(e){
  if(e.target.id==='roomModal'){$('roomModal').classList.remove('open');S.room=null;}
}

function selStatus(s){S.status=s;updBtns();}

function updBtns(){
  const map={uncleaned:0,cleaning:1,cleaned:2,inspection:3};
  document.querySelectorAll('.status-btn').forEach(b=>b.className='status-btn');
  if(S.status&&map[S.status]!==undefined)
    document.querySelectorAll('.status-btn')[map[S.status]].className='status-btn sel-'+S.status;
}

async function saveRoom(){
  if(!S.room)return;
  showLoad('저장 중...');
  try{
    const calls=[];
    if(S.status&&S.status!==S.room.status)
      calls.push(api({action:'updateRoom',roomNo:S.room.roomNo,status:S.status,updaterName:S.name,updaterRole:S.role}));
    if(S.role==='admin'){
      const m=$('maidInput').value.trim();
      if(m!==(S.room.maidName||''))calls.push(api({action:'assignMaid',roomNo:S.room.roomNo,maidName:m}));
    }
    const n=$('noteInput').value.trim();
    if(n)calls.push(api({action:'addRoomNote',roomNo:S.room.roomNo,sender:S.name,role:S.role,note:n}));
    await Promise.all(calls);
    await loadRooms(true);
    hideLoad();
    $('roomModal').classList.remove('open');
    toast('✅ 저장완료');
  }catch(e){hideLoad();toast('저장실패');}
}

async function confirmReset(){
  if(!confirm('전체 객실을 미정비로 초기화합니다. 계속?'))return;
  showLoad('초기화...');
  try{await api({action:'resetRooms'});await loadRooms(true);hideLoad();toast('✅ 초기화완료');}
  catch(e){hideLoad();toast('실패');}
}

async function loadChat(silent=false){
  try{
    const r=await api({action:'getChat',since:S.chatSince});
    if(r.ok&&r.messages&&r.messages.length){
      S.chatSince=r.messages[r.messages.length-1].timestamp;
      addMsgs(r.messages);
    }
  }catch(e){}
}

function addMsgs(msgs){
  const box=$('chatMsgs');
  msgs.forEach(function(m){
    const mine=m.sender===S.name;
    const d=document.createElement('div');
    d.style.cssText='display:flex;flex-direction:column;align-items:'+(mine?'flex-end':'flex-start');
    d.innerHTML=(!mine?'<div class="chat-sender">'+m.sender+' ('+(m.role==='admin'?'관리자':'메이드')+')</div>':'')+
      '<div class="chat-bubble '+(mine?'mine':'other')+'">'+esc(m.message)+
      '<div class="chat-time">'+fmt(m.timestamp)+'</div></div>';
    box.appendChild(d);
  });
  box.scrollTop=box.scrollHeight;
}

async function sendMsg(){
  const inp=$('chatInput');
  const m=inp.value.trim();
  if(!m)return;
  inp.value='';
  try{await api({action:'sendChat',sender:S.name,role:S.role,message:m});await loadChat(true);}
  catch(e){toast('전송실패');}
}

function showTab(tab){
  document.querySelectorAll('.nav-tab').forEach((t,i)=>t.classList.toggle('active',(tab==='rooms')===(i===0)));
  $('tabRooms').style.display=tab==='rooms'?'block':'none';
  $('tabChat').style.display=tab==='chat'?'block':'none';
  if(tab==='chat'){S.chatSince=null;$('chatMsgs').innerHTML='';loadChat();}
}

function fmt(iso){
  if(!iso)return'';
  return new Date(iso).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
