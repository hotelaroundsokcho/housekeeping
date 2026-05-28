const API = 'https://script.google.com/macros/s/AKfycbzEZj1UW3bejogNEuqmThCZNPlFdqXhq2zmlHI-D8cFgLFszs9G3Zcb4EFau1NyJl6D/exec';
let S = {
  role:null, name:'', rooms:[], filter:'all',
  room:null, status:null, chatSince:null,
  selectMode:false, selected:new Set()
};
let timer = null;
const $ = id => document.getElementById(id);

// 한글 + 영어 병기 / 점검필요 → 인스펙션필요
const KR = {
  occupied:'재실 / Occupied',
  uncleaned:'미정비 / Uncleaned',
  cleaning:'정비중 / Cleaning',
  inspection:'인스펙션필요 / Inspection',
  vacant:'공실완료 / Vacant',
  ,
  broken:'고장 / Broken'cleaned:'인스펙션필요 / Inspection'
};

// 채팅 자동발송용 한글 전용 라벨 (KR과 별도)
const KR_CHAT = {
  occupied:'재실', uncleaned:'미정비', cleaning:'정비중',
  inspection:'인스펙션필요', vacant:'공실완료', broken:'고장'
};

// 타입코드 세 번째 글자 → 침대타입 배지
function bedBadge(typeCode) {
  if (!typeCode || typeCode.length < 3) return '';
  const c = typeCode[2].toUpperCase();
  if (c === 'T') return '<span class="bed-badge bed-twin">Twin</span>';
  if (c === 'D') return '<span class="bed-badge bed-double">Double</span>';
  return '';
}

function showLoad(m){$('loadingOv').style.display='flex';$('loadingMsg').textContent=m||'처리 중...';}
function hideLoad(){$('loadingOv').style.display='none';}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

async function api(p){
  try{
    const r=await fetch(API,{method:'POST',redirect:'follow',body:JSON.stringify(p)});
    return JSON.parse(await r.text());
  }catch(e){return{ok:false,error:String(e)};}
}

async function sha256(str){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
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
  const hash=await sha256(p);
  const r=await api({action:'verifyPin',pin:hash});
  hideLoad();
  if(r.ok){S.role='admin';S.name='관리자';sessionStorage.setItem('hk_role','admin');sessionStorage.setItem('hk_name','관리자');go();}
  else $('loginError').textContent='PIN 오류';
}

async function loginMaid(){
  const n=$('maidNameInput').value.trim();
  if(!n){$('loginError').textContent='이름을 입력하세요';return;}
  showLoad('인증 중...');
  const r=await api({action:'verifyMaid',name:n});
  hideLoad();
  if(r.ok){S.role='maid';S.name=n;sessionStorage.setItem('hk_role','maid');sessionStorage.setItem('hk_name',n);go();}
  else $('loginError').textContent=r.error||'등록되지 않은 이름입니다';
}

function logout(){
  clearInterval(timer);
  sessionStorage.removeItem('hk_role');
  sessionStorage.removeItem('hk_name');
  switchTab('admin');
  S={role:null,name:'',rooms:[],filter:'all',room:null,status:null,chatSince:null,selectMode:false,selected:new Set()};
  $('loginScreen').style.display='flex';$('app').style.display='none';
  $('pinInput').value='';$('maidNameInput').value='';
}

async function go(){
  $('loginScreen').style.display='none';$('app').style.display='flex';
  $('headerSub').textContent=S.role==='admin'?'관리자 모드':S.name+' 님';
  ['resetBtn','maidSec','changePinBtn','maidMgmtBtn','maidStatsSection','selectModeBtn'].forEach(id=>{
    const el=$(id);if(el)el.style.display=S.role==='admin'?'block':'none';
  });
  showLoad('로딩 중...');
  await loadRooms();
  hideLoad();
  clearInterval(timer);
  timer=setInterval(()=>{
    const tab=document.querySelector('.nav-tab.active');
    if(tab&&tab.textContent.includes('객실'))loadRooms(true);
    else loadChat(true);
  },15000);
}

async function loadRooms(silent=false){
  try{
    const r=await api({action:'getRooms'});
    if(r.ok){S.rooms=r.rooms;render();stats();maidStats();}
    else if(!silent)toast('로드실패');
  }catch(e){if(!silent)toast('오류');}
}

function stats(){
  const c={occupied:0,uncleaned:0,cleaning:0,inspection:0,vacant:0,broken:0};
  S.rooms.forEach(r=>{
    const st=r.status==='cleaned'?'inspection':r.status;
    if(c[st]!==undefined)c[st]++;
  });
  ['occupied','uncleaned','cleaning','inspection','vacant','broken'].forEach((k,i)=>$('cnt'+i).textContent=c[k]);
}

function maidStats(){
  if(S.role!=='admin')return;
  const box=$('maidStatsGrid');if(!box)return;
  const tally={};
  S.rooms.forEach(r=>{
    if(!r.maidName)return;
    if(!tally[r.maidName])tally[r.maidName]={done:0,wip:0,total:0};
    if(['uncleaned','cleaning','inspection','vacant','cleaned'].includes(r.status)){
      tally[r.maidName].total++;
      if(r.status==='inspection'||r.status==='vacant'||r.status==='cleaned')tally[r.maidName].done++;
      if(r.status==='cleaning')tally[r.maidName].wip++;
    }
  });
  const names=Object.keys(tally);
  if(!names.length){box.innerHTML='<div style="color:var(--text2);font-size:12px;padding:8px">배정된 메이드 없음</div>';return;}
  box.innerHTML='';
  names.forEach(function(name){
    const d=tally[name];
    const pct=d.total?Math.round(d.done/d.total*100):0;
    const card=document.createElement('div');card.className='maid-stat-card';
    card.innerHTML='<div class="maid-stat-name">👤 '+esc(name)+'</div>'+
      '<div class="maid-stat-numbers"><span class="maid-stat-done">✅ '+d.done+'</span><span class="maid-stat-wip">🔄 '+d.wip+'</span><span class="maid-stat-total">/ '+d.total+'객실</span></div>'+
      '<div class="maid-stat-bar-wrap"><div class="maid-stat-bar" style="width:'+pct+'%"></div></div>'+
      '<div class="maid-stat-pct">'+pct+'% 완료</div>';
    box.appendChild(card);
  });
}

function toggleSelectMode(){
  S.selectMode=!S.selectMode;
  S.selected=new Set();
  const btn=$('selectModeBtn');
  if(S.selectMode){
    btn.textContent='✖ 선택 취소';
    btn.style.background='rgba(245,158,11,.15)';
    btn.style.borderColor='rgba(245,158,11,.4)';
    btn.style.color='var(--cleaning)';
    $('bulkBar').style.display='flex';
  }else{
    btn.textContent='☑ 객실 선택 (일괄 체크아웃)';
    btn.style.background='rgba(59,130,246,.1)';
    btn.style.borderColor='rgba(59,130,246,.3)';
    btn.style.color='var(--occupied)';
    $('bulkBar').style.display='none';
  }
  updateBulkBar();render();
}

function toggleSelect(no){
  if(S.selected.has(no))S.selected.delete(no);
  else S.selected.add(no);
  updateBulkBar();render();
}

function updateBulkBar(){
  const cnt=S.selected.size;
  $('bulkCount').textContent=cnt+'개 선택됨';
  $('bulkBtn').disabled=cnt===0;
  $('bulkBtn').style.opacity=cnt===0?'0.4':'1';
}

async function bulkCheckout(){
  const cnt=S.selected.size;if(!cnt)return;
  if(!confirm(cnt+'개 객실을 미정비(체크아웃)로 등록합니다.\n계속하시겠습니까?'))return;
  toggleSelectMode();
  showLoad('0 / '+cnt+' 처리 중...');
  const rooms=[...S.selected];let done=0;
  for(const roomNo of rooms){
    await api({action:'updateRoom',roomNo,status:'uncleaned',updaterName:S.name,updaterRole:S.role});
    done++;
    $('loadingMsg').textContent=done+' / '+cnt+' 처리 중...';
  }
  await loadRooms(true);hideLoad();
  toast('✅ '+cnt+'개 객실 미정비 등록 완료');
}

function setFilter(f){
  S.filter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  render();
}

function render(){
  let rooms=S.rooms.map(r=>r.status==='cleaned'?{...r,status:'inspection'}:r);
  if(S.filter!=='all')rooms=rooms.filter(x=>x.status===S.filter);
  if(S.role==='maid'){
    rooms=rooms.filter(x=>x.status!=='occupied'&&x.status!=='vacant'&&x.status!=='broken');
    rooms=rooms.filter(x=>!x.maidName||x.maidName===S.name);
  }
  const grid=$('roomsGrid');grid.innerHTML='';
  rooms.forEach(function(room){
    const no=String(room.roomNo);
    const isSel=S.selected.has(no);
    const card=document.createElement('div');
    card.className='room-card '+room.status+(isSel?' card-selected':'');
    const badge=bedBadge(room.typeCode);
    if(S.selectMode&&S.role==='admin'){
      card.innerHTML='<div class="card-check">'+(isSel?'☑':'☐')+'</div>'+
        '<div class="room-no">'+no+'</div>'+
        '<div class="room-type-row"><span class="room-type">'+room.typeCode+'</span>'+badge+'</div>'+
        '<div class="room-status status-'+room.status+'">'+KR[room.status]+'</div>'+
        (room.maidName?'<div class="room-maid">👤 '+room.maidName+'</div>':'');
      card.onclick=function(){toggleSelect(no);};
    }else{
      card.innerHTML='<div class="room-no">'+no+'</div>'+
        '<div class="room-type-row"><span class="room-type">'+room.typeCode+'</span>'+badge+'</div>'+
        '<div class="room-status status-'+room.status+'">'+KR[room.status]+'</div>'+
        (room.maidName?'<div class="room-maid">👤 '+room.maidName+'</div>':'');
      card.onclick=function(){openRoom(no);};
    }
    grid.appendChild(card);
  });
}

async function openRoom(no){
  if(S.selectMode)return;
  no=String(no);
  S.room=S.rooms.find(r=>String(r.roomNo)===no);
  if(!S.room){toast('오류: 객실 없음 '+no);return;}
  if(S.room.status==='cleaned')S.room={...S.room,status:'inspection'};
  S.status=S.room.status;
  $('mRoomNo').textContent=no+'호';
  $('mRoomType').textContent=S.room.typeName||'';
  $('maidInput').value=S.room.maidName||'';
  $('noteInput').value='';
  updBtns();
  document.querySelectorAll('.status-btn-admin').forEach(b=>{
    b.style.display=S.role==='admin'?'':'none';
  });
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

function closeModal(e){if(e.target.id==='roomModal'){$('roomModal').classList.remove('open');S.room=null;}}
function selStatus(s){S.status=s;updBtns();}

function updBtns(){
  const map={occupied:0,uncleaned:1,cleaning:2,inspection:3,vacant:4,broken:5};
  document.querySelectorAll('.status-btn').forEach(b=>b.className=b.className.replace(/\bsel-\S+/g,'').trim());
  if(S.status&&map[S.status]!==undefined){
    const btns=document.querySelectorAll('.status-btn');
    if(btns[map[S.status]])btns[map[S.status]].classList.add('sel-'+S.status);
  }
}

async function saveRoom(){
  if(!S.room)return;
  const prevStatus=S.room.status;
  showLoad('저장 중...');
  try{
    const calls=[];
    if(S.status&&S.status!==prevStatus)
      calls.push(api({action:'updateRoom',roomNo:S.room.roomNo,status:S.status,updaterName:S.name,updaterRole:S.role}));
    if(S.role==='admin'){
      const m=$('maidInput').value.trim();
      if(m!==(S.room.maidName||''))calls.push(api({action:'assignMaid',roomNo:S.room.roomNo,maidName:m}));
    }
    const n=$('noteInput').value.trim();
    if(n)calls.push(api({action:'addRoomNote',roomNo:S.room.roomNo,sender:S.name,role:S.role,note:n}));
    await Promise.all(calls);
    if(S.role==='admin'&&prevStatus==='inspection'&&S.status==='vacant'&&S.room.maidName){
      await api({action:'sendChat',sender:'관리자',role:'admin',
        message:'✅ '+S.room.roomNo+'호 점검 통과! 공실완료 처리되었습니다. ('+S.room.maidName+' 님 수고하셨습니다 👍)'});
    }
    await loadRooms(true);hideLoad();
    $('roomModal').classList.remove('open');toast('✅ 저장완료');
  }catch(e){hideLoad();toast('저장실패');}
}

async function confirmReset(){
  if(!confirm('⚠️ 전체 객실을 미정비로 초기화합니다.\n재실·공실완료 포함 모든 상태가 초기화됩니다.\n정말 계속하시겠습니까?'))return;
  if(!confirm('🔴 재확인: 정말로 전체 초기화하시겠습니까?'))return;
  showLoad('초기화...');
  try{await api({action:'resetRooms'});await loadRooms(true);hideLoad();toast('✅ 초기화완료');}
  catch(e){hideLoad();toast('실패');}
}

async function openMaidMgmtModal(){$('maidMgmtList').innerHTML='<div style="color:var(--text2);font-size:12px">로딩중...</div>';$('maidMgmtModal').classList.add('open');await refreshMaidList();}
async function refreshMaidList(){const r=await api({action:'getMaids'});const box=$('maidMgmtList');if(!r.ok){box.innerHTML='<div style="color:var(--uncleaned)">로드 실패</div>';return;}const maids=r.maids||[];if(!maids.length){box.innerHTML='<div style="color:var(--text2);font-size:12px">등록된 메이드 없음</div>';return;}box.innerHTML='';maids.forEach(function(name){const row=document.createElement('div');row.className='maid-row';row.innerHTML='<span class="maid-row-name">👤 '+esc(name)+'</span>';const btn=document.createElement('button');btn.className='maid-del-btn';btn.textContent='삭제';btn.onclick=function(){removeMaid(name);};row.appendChild(btn);box.appendChild(row);});}
async function addMaid(){const inp=$('newMaidInput');const name=inp.value.trim();if(!name)return;showLoad('추가 중...');const r=await api({action:'addMaid',name});hideLoad();if(r.ok){inp.value='';toast('✅ '+name+' 추가완료');await refreshMaidList();}else toast('추가 실패: '+(r.error||''));}
async function removeMaid(name){if(!confirm(name+' 님을 명단에서 삭제하시겠습니까?'))return;showLoad('삭제 중...');const r=await api({action:'removeMaid',name});hideLoad();if(r.ok){toast('✅ '+name+' 삭제완료');await refreshMaidList();}else toast('삭제 실패: '+(r.error||''));}
function closeMaidMgmtModal(e){if(!e||e.target.id==='maidMgmtModal')$('maidMgmtModal').classList.remove('open');}
function openChangePinModal(){$('cpCurrent').value='';$('cpNew').value='';$('cpConfirm').value='';$('cpError').textContent='';$('changePinModal').classList.add('open');}
function closeChangePinModal(e){if(!e||e.target.id==='changePinModal')$('changePinModal').classList.remove('open');}
async function savePin(){const cur=$('cpCurrent').value.trim(),nw=$('cpNew').value.trim(),cf=$('cpConfirm').value.trim();if(!cur||!nw||!cf){$('cpError').textContent='모든 항목을 입력하세요';return;}if(nw.length<4||!/^\d+$/.test(nw)){$('cpError').textContent='새 PIN은 숫자 4자리 이상';return;}if(nw!==cf){$('cpError').textContent='새 PIN이 일치하지 않습니다';return;}showLoad('PIN 변경 중...');const curHash=await sha256(cur),newHash=await sha256(nw);const r=await api({action:'changePin',currentHash:curHash,newHash:newHash});hideLoad();if(r.ok){$('changePinModal').classList.remove('open');toast('✅ PIN 변경 완료');}else $('cpError').textContent=r.error||'변경 실패';}

async function loadChat(silent=false){
  try{
    const r=await api({action:'getChat',since:S.chatSince});
    if(r.ok&&r.messages&&r.messages.length){
      S.chatSince=r.messages[r.messages.length-1].timestamp;addMsgs(r.messages);
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
      '<div class="chat-bubble '+(mine?'mine':'other')+'">'+esc(m.message)+'<div class="chat-time">'+fmt(m.timestamp)+'</div></div>';
    box.appendChild(d);
  });
  box.scrollTop=box.scrollHeight;
}
async function sendMsg(){const inp=$('chatInput');const m=inp.value.trim();if(!m)return;inp.value='';try{await api({action:'sendChat',sender:S.name,role:S.role,message:m});await loadChat(true);}catch(e){toast('전송실패');}}
function showTab(tab){document.querySelectorAll('.nav-tab').forEach((t,i)=>t.classList.toggle('active',(tab==='rooms')===(i===0)));$('tabRooms').style.display=tab==='rooms'?'block':'none';$('tabChat').style.display=tab==='chat'?'block':'none';if(tab==='chat'){S.chatSince=null;$('chatMsgs').innerHTML='';loadChat();}}
function fmt(iso){if(!iso)return'';return new Date(iso).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

(function restoreSession(){
  const role=sessionStorage.getItem('hk_role');
  const name=sessionStorage.getItem('hk_name');
  if(role&&name){S.role=role;S.name=name;go();}
})();
