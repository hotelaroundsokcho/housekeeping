const API = 'https://script.google.com/macros/s/AKfycbzEZj1UW3bejogNEuqmThCZNPlFdqXhq2zmlHI-D8cFgLFszs9G3Zcb4EFau1NyJl6D/exec';
let S = {role:null, name:'', rooms:[], filter:'all', room:null, status:null, chatSince:null};
let timer = null;
const $ = id => document.getElementById(id);
const KR = {uncleaned:'미정비', cleaning:'정비중', cleaned:'정비완료', inspection:'점검필요'};

function showLoad(m) { $('loadingOv').style.display='flex'; $('loadingMsg').textContent = m||'처리 중...'; }
function hideLoad() { $('loadingOv').style.display='none'; }
function toast(m) { const t=$('toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

async function api(p) {
  const r = await fetch(API, {method:'POST', redirect:'follow', body:JSON.stringify(p)});
  const txt = await r.text();
  try { return JSON.parse(txt); } catch(e) { return {ok:false, error:'parse: '+txt.substring(0,80)}; }
}

function switchTab(t) {
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', (t==='admin') === (i===0)));
  $('adminForm').style.display = t==='admin' ? 'block' : 'none';
  $('maidForm').style.display = t==='maid' ? 'block' : 'none';
  $('loginError').textContent = '';
}

async function login() {
  const p = $('pinInput').value.trim();
  if (!p) return;
  showLoad('인증 중...');
  try {
    const r = await api({action:'verifyPin', pin:p});
    hideLoad();
    if (r.ok) { S.role='admin'; S.name='관리자'; go(); }
    else $('loginError').textContent = 'PIN 오류: ' + (r.error||'');
  } catch(e) { hideLoad(); $('loginError').textContent = '연결 오류: '+e; }
}

function loginMaid() {
  const n = $('maidNameInput').value.trim();
  if (!n) { $('loginError').textContent = '이름 입력'; return; }
  S.role='maid'; S.name=n; go();
}

function logout() {
  clearInterval(timer);
  S = {role:null, name:'', rooms:[], filter:'all', room:null, status:null, chatSince:null};
  $('loginScreen').style.display='flex'; $('app').style.display='none';
  $('pinInput').value=''; $('maidNameInput').value='';
}

async function go() {
  $('loginScreen').style.display='none'; $('app').style.display='flex';
  $('headerSub').textContent = S.role==='admin' ? '관리자 모드' : S.name+' 님';
  $('resetBtn').style.display = S.role==='admin' ? 'block' : 'none';
  $('maidSec').style.display = S.role==='admin' ? 'block' : 'none';
  showLoad('로딩 중...');
  await loadRooms();
  hideLoad();
  clearInterval(timer);
  timer = setInterval(() => {
    const tab = document.querySelector('.nav-tab.active');
    if (tab && tab.textContent.includes('객실')) loadRooms(true);
    else loadChat(true);
  }, 8000);
}

async function loadRooms(s=false) {
  try {
    const r = await api({action:'getRooms'});
    if (r.ok) { S.rooms = r.rooms; render(); stats(); }
  } catch(e) { if (!s) toast('로드 실패: '+e); }
}

function stats() {
  const c = {uncleaned:0, cleaning:0, cleaned:0, inspection:0};
  S.rooms.forEach(r => c[r.status] = (c[r.status]||0)+1);
  ['uncleaned','cleaning','cleaned','inspection'].forEach((k,i) => $('cnt'+i).textContent = c[k]||0);
}

function setFilter(f) {
  S.filter = f;
  const map = {all:'전체', uncleaned:'미정비', cleaning:'정비중', cleaned:'완료', inspection:'점검'};
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.textContent.includes(map[f]||f)));
  render();
}

function render() {
  let rooms = S.rooms;
  if (S.filter !== 'all') rooms = rooms.filter(x => x.status === S.filter);
  if (S.role === 'maid') rooms = rooms.filter(x => !x.maidName || x.maidName === S.name);
  $('roomsGrid').innerHTML = rooms.map(x => {
    return '<div class="room-card ' + x.status + '" onclick="openRoom('' + x.roomNo + '')">' +
      '<div class="room-no">' + x.roomNo + '</div>' +
      '<div class="room-type">' + x.typeCode + '</div>' +
      '<div class="room-status status-' + x.status + '">' + (KR[x.status]||x.status) + '</div>' +
      (x.maidName ? '<div class="room-maid">👤 ' + x.maidName + '</div>' : '') +
      '</div>';
  }).join('');
}

async function openRoom(no) {
  S.room = S.rooms.find(r => r.roomNo === no);
  if (!S.room) return;
  S.status = S.room.status;
  $('mRoomNo').textContent = no + '호';
  $('mRoomType').textContent = S.room.typeName;
  $('maidInput').value = S.room.maidName||'';
  $('noteInput').value = '';
  updBtns();
  $('notesList').innerHTML = '<div style="color:var(--text2);font-size:12px">로딩중...</div>';
  $('roomModal').classList.add('open');
  try {
    const r = await api({action:'getRoomNotes', roomNo:no});
    $('notesList').innerHTML = r.notes && r.notes.length
      ? r.notes.slice().reverse().map(n =>
          '<div class="note-item"><div class="note-meta">' + n.sender + ' · ' + fmt(n.timestamp) + '</div>' + n.note + '</div>'
        ).join('')
      : '<div style="color:var(--text2);font-size:12px">없음</div>';
  } catch(e) {}
}

function closeModal(e) {
  if (e.target.id === 'roomModal') { $('roomModal').classList.remove('open'); S.room=null; }
}

function selStatus(s) { S.status=s; updBtns(); }

function updBtns() {
  const map = {uncleaned:0, cleaning:1, cleaned:2, inspection:3};
  const btns = document.querySelectorAll('.status-btn');
  btns.forEach(b => b.className='status-btn');
  if (S.status !== null && map[S.status] !== undefined) btns[map[S.status]].className = 'status-btn sel-'+S.status;
}

async function saveRoom() {
  if (!S.room) return;
  showLoad('저장 중...');
  try {
    const calls = [];
    if (S.status && S.status !== S.room.status)
      calls.push(api({action:'updateRoom', roomNo:S.room.roomNo, status:S.status, updaterName:S.name, updaterRole:S.role}));
    if (S.role === 'admin') {
      const m = $('maidInput').value.trim();
      if (m !== (S.room.maidName||'')) calls.push(api({action:'assignMaid', roomNo:S.room.roomNo, maidName:m}));
    }
    const n = $('noteInput').value.trim();
    if (n) calls.push(api({action:'addRoomNote', roomNo:S.room.roomNo, sender:S.name, role:S.role, note:n}));
    await Promise.all(calls);
    await loadRooms(true);
    hideLoad();
    $('roomModal').classList.remove('open');
    toast('✅ 저장완료');
  } catch(e) { hideLoad(); toast('실패: '+e); }
}

async function confirmReset() {
  if (!confirm('전체 객실을 미정비로 초기화합니다. 계속하시겠습니까?')) return;
  showLoad('초기화...');
  try { await api({action:'resetRooms'}); await loadRooms(true); hideLoad(); toast('✅ 초기화완료'); }
  catch(e) { hideLoad(); toast('실패'); }
}

async function loadChat(s=false) {
  try {
    const r = await api({action:'getChat', since:S.chatSince});
    if (r.ok && r.messages && r.messages.length) {
      S.chatSince = r.messages[r.messages.length-1].timestamp;
      addMsgs(r.messages);
    }
  } catch(e) {}
}

function addMsgs(msgs) {
  const box = $('chatMsgs');
  msgs.forEach(m => {
    const mine = m.sender === S.name;
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-direction:column;align-items:' + (mine?'flex-end':'flex-start');
    d.innerHTML = (!mine ? '<div class="chat-sender">' + m.sender + ' (' + (m.role==='admin'?'관리자':'메이드') + ')</div>' : '') +
      '<div class="chat-bubble ' + (mine?'mine':'other') + '">' + esc(m.message) +
      '<div class="chat-time">' + fmt(m.timestamp) + '</div></div>';
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
}

async function sendMsg() {
  const inp = $('chatInput');
  const m = inp.value.trim();
  if (!m) return;
  inp.value = '';
  try { await api({action:'sendChat', sender:S.name, role:S.role, message:m}); await loadChat(true); }
  catch(e) { toast('전송실패'); }
}

function showTab(tab) {
  document.querySelectorAll('.nav-tab').forEach((t,i) => t.classList.toggle('active', (tab==='rooms') === (i===0)));
  $('tabRooms').style.display = tab==='rooms' ? 'block' : 'none';
  $('tabChat').style.display = tab==='chat' ? 'block' : 'none';
  if (tab === 'chat') { S.chatSince=null; $('chatMsgs').innerHTML=''; loadChat(); }
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
