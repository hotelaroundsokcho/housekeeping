const API = 'https://script.google.com/macros/s/AKfycbzEZj1UW3bejogNEuqmThCZNPlFdqXhq2zmlHI-D8cFgLFszs9G3Zcb4EFau1NyJl6D/exec';
let S = {
role:null, name:'', rooms:[], filter:'all',
room:null, status:null, chatSince:null,
selectMode:false, selected:new Set(),
assignMode:false, assignSelected:new Set()
};
let timer = null;
const MAID_COLOR_MAP = {};
let _maidColorIdx = 0;
function getMaidColorIdx(name){
if(!name) return -1;
if(MAID_COLOR_MAP[name] === undefined) MAID_COLOR_MAP[name] = _maidColorIdx++ % 5;
return MAID_COLOR_MAP[name];
}
const $ = id => document.getElementById(id);

const KR = {
occupied:'재실 / Occupied',
uncleaned:'미정비 / Uncleaned',
cleaning:'정비중 / Cleaning',
inspection:'인스펙션필요 / Inspection',
vacant:'공실완료 / Vacant',
broken:'고장 / Broken',
cleaned:'인스펙션필요 / Inspection'
};

const KR_CHAT = {
occupied:'재실', uncleaned:'미정비', cleaning:'정비중',
inspection:'인스펙션필요', vacant:'공실완료', broken:'고장'
};

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
const nameSelect=$('adminNameSelect');
if(nameSelect && nameSelect.style.display==='block'){
if(!S.name){$('loginError').textContent='이름을 선택하세요';return;}
sessionStorage.setItem('hk_role','admin');sessionStorage.setItem('hk_name',S.name);go();return;
}
showLoad('인증 중...');
const hash=await sha256(p);
const r=await api({action:'verifyPin',pin:hash});
hideLoad();
if(r.ok){
if(nameSelect) nameSelect.style.display='block';
$('loginError').textContent='';
}else $('loginError').textContent='PIN 오류';
}

function selectAdminName(idx){
const names=['장경순','박지연'];
S.role='admin'; S.name=names[idx];
document.querySelectorAll('.admin-name-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));
sessionStorage.setItem('hk_role','admin');
sessionStorage.setItem('hk_name',S.name);
go();
}
async function loginMaid(){
const n=$('maidNameInput').value.trim();
if(!n){$('loginError').textContent='이름을 입력하세요';return;}
showLoad('인증 중...');
const r=await api({action:'verifyMaid',name:n});
hideLoad();
if(r.ok){
const canonName=r.name||n;
S.role='maid';S.name=canonName;
sessionStorage.setItem('hk_role','maid');sessionStorage.setItem('hk_name',canonName);go();
}else $('loginError').textContent=r.error||'등록되지 않은 이름입니다';
}

function logout(){
clearInterval(timer);
sessionStorage.removeItem('hk_role');
sessionStorage.removeItem('hk_name');
const ns=$('adminNameSelect');if(ns){ns.style.display='none';}
switchTab('admin');
S={role:null,name:'',rooms:[],filter:'all',room:null,status:null,chatSince:null,selectMode:false,selected:new Set(),assignMode:false,assignSelected:new Set()};
$('loginScreen').style.display='flex';$('app').style.display='none';
$('pinInput').value='';$('maidNameInput').value='';
document.querySelectorAll('.admin-name-btn').forEach(b=>b.classList.remove('active'));
}
async function go(){
$('loginScreen').style.display='none';$('app').style.display='flex';
$('headerSub').textContent=S.role==='admin'?'관리자 모드':S.name+' 님';
['resetBtn','maidSec','changePinBtn','maidMgmtBtn','reportBtn','maidStatsSection','selectModeBtn','assignModeBtn'].forEach(id=>{
const el=$(id);if(el)el.style.display=S.role==='admin'?'block':'none';
});
showLoad('로딩 중...');
await loadRooms();
hideLoad();
maybeShowNotifBar();
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
const maids=r.maidName.split(',').map(n=>n.trim()).filter(Boolean);
maids.forEach(function(name){
if(!tally[name])tally[name]={done:0,wip:0,total:0};
if(['uncleaned','cleaning','inspection','vacant','cleaned'].includes(r.status)){
tally[name].total++;
if(r.status==='inspection'||r.status==='vacant'||r.status==='cleaned')tally[name].done++;
if(r.status==='cleaning')tally[name].wip++;
}
});
});
const names=Object.keys(tally);
if(!names.length){box.innerHTML='<div style="color:var(--text2);font-size:12px;padding:8px">배정된 메이드 없음</div>';return;}
box.innerHTML='';
names.forEach(function(name){
const d=tally[name];
const pct=d.total?Math.round(d.done/d.total*100):0;
const card=document.createElement('div');card.className='maid-stat-card';
card.innerHTML='<div class="maid-stat-name">'+esc(name)+'</div>'+
'<div class="maid-stat-numbers"><span class="maid-stat-done">완료 '+d.done+'</span><span class="maid-stat-wip">정비중 '+d.wip+'</span><span class="maid-stat-total">/ '+d.total+'객실</span></div>'+
'<div class="maid-stat-bar-wrap"><div class="maid-stat-bar" style="width:'+pct+'%"></div></div>'+
'<div class="maid-stat-pct">'+pct+'% 완료</div>';
box.appendChild(card);
});
}
// ───────── 일괄 상태변경 선택 모드 ─────────
function toggleSelectMode(){
if(S.assignMode) toggleAssignMode();
S.selectMode=!S.selectMode;
S.selected=new Set();
const btn=$('selectModeBtn');
if(S.selectMode){
btn.textContent='✖ 선택 취소';
btn.style.background='rgba(245,158,11,.15)';
btn.style.borderColor='rgba(245,158,11,.4)';
btn.style.color='var(--cleaning)';
$('bulkBar').style.display='flex';const sab=$('selectAllBtn');if(sab)sab.style.display='inline-block';
}else{
btn.textContent='☑ 객실 선택 (일괄 상태변경)';
btn.style.background='rgba(59,130,246,.1)';
btn.style.borderColor='rgba(59,130,246,.3)';
btn.style.color='var(--occupied)';
$('bulkBar').style.display='none';
}const sab2=$('selectAllBtn');if(sab2)sab2.style.display='none';
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
document.querySelectorAll('.bulk-status-btn').forEach(function(b){
b.disabled=cnt===0;
b.style.opacity=cnt===0?'0.35':'1';
});
}
function selectAllVisible(){
  let rooms=S.rooms;
  if(S.filter!=='all')rooms=rooms.filter(x=>x.status===S.filter);
  if(S.role==='maid')rooms=rooms.filter(x=>!x.maidName||x.maidName===S.name);
  rooms.forEach(r=>S.selected.add(String(r.roomNo)));
  updateBulkBar();
  render();
}

async function bulkSetStatus(status){
const KR_LABEL={occupied:'재실',uncleaned:'미정비',cleaning:'정비중',inspection:'인스펙션필요',vacant:'공실완료',broken:'고장'};
const cnt=S.selected.size;if(!cnt)return;
const label=KR_LABEL[status]||status;
if(!confirm(cnt+'개 객실을 ['+label+']로 변경합니다.\n계속하시겠습니까?'))return;
const rooms=[...S.selected];
toggleSelectMode();
showLoad('0 / '+cnt+' 처리 중...');
let done=0;
for(const roomNo of rooms){
await api({action:'updateRoom',roomNo,status,updaterName:S.name,updaterRole:S.role});
done++;
$('loadingMsg').textContent=done+' / '+cnt+' 처리 중...';
}
await loadRooms(true);hideLoad();
toast('✅ '+cnt+'개 객실 → '+label+' 일괄 적용 완료');
}

// ───────── 메이드 일괄 배정 모드 ─────────
async function toggleAssignMode(){
if(S.selectMode) toggleSelectMode();
S.assignMode=!S.assignMode;
S.assignSelected=new Set();
const btn=$('assignModeBtn');
if(S.assignMode){
btn.textContent='✖ 배정 취소';
btn.style.background='rgba(74,222,128,.1)';
btn.style.borderColor='rgba(74,222,128,.3)';
btn.style.color='var(--vacant)';
await loadAssignBar();
$('bulkAssignBar').style.display='flex';
}else{
btn.textContent='👤 메이드 일괄 배정';
btn.style.background='rgba(167,139,250,.1)';
btn.style.borderColor='rgba(167,139,250,.3)';
btn.style.color='#a78bfa';
$('bulkAssignBar').style.display='none';
}
updateAssignBar();render();
}

function toggleAssignSelect(no){
if(S.assignSelected.has(no))S.assignSelected.delete(no);
else S.assignSelected.add(no);
updateAssignBar();render();
}

async function loadAssignBar(){
const r=await api({action:'getMaids'});
const maids=(r.ok&&r.maids&&r.maids.length)?r.maids:[];
const btnWrap=$('assignMaidBtns');
if(!btnWrap)return;
btnWrap.innerHTML='';
if(!maids.length){
btnWrap.innerHTML='<span style="color:var(--text2);font-size:12px">등록된 메이드 없음</span>';
return;
}
maids.forEach(function(name,idx){
const btn=document.createElement('button');
btn.className='assign-maid-btn';
const color=MAID_COLORS[idx%5];
btn.style.cssText='background:'+color+'22;border:1px solid '+color+'66;color:'+color+';padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;';
btn.textContent='👤 '+name;
btn.onclick=function(){execBulkAssign(name);};
btnWrap.appendChild(btn);
});
if(maids.length>=2){
for(let i=0;i<maids.length-1;i++){
for(let j=i+1;j<maids.length;j++){
const btn=document.createElement('button');
btn.className='assign-maid-btn';
const c1=MAID_COLORS[i%5],c2=MAID_COLORS[j%5];
btn.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);color:var(--text);padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;';
const combinedName=maids[i]+','+maids[j];
btn.innerHTML='<span style="color:'+c1+'">'+maids[i]+'</span> + <span style="color:'+c2+'">'+maids[j]+'</span>';
btn.onclick=function(){execBulkAssign(combinedName);};
btnWrap.appendChild(btn);
}
}
}
const clearBtn=document.createElement('button');
clearBtn.className='assign-maid-btn';
clearBtn.style.cssText='background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--uncleaned);padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;';
clearBtn.textContent='✕ 배정 해제';
clearBtn.onclick=function(){execBulkAssign('');};
btnWrap.appendChild(clearBtn);
}

function updateAssignBar(){
const cnt=S.assignSelected.size;
const countEl=$('assignCount');
if(countEl)countEl.textContent=cnt+'개 객실 선택됨';
const btnWrap=$('assignMaidBtns');
if(btnWrap){
btnWrap.querySelectorAll('.assign-maid-btn').forEach(b=>{
b.style.opacity=cnt===0?'0.45':'1';
b.disabled=cnt===0;
});
}
}

async function execBulkAssign(maidName){
const cnt=S.assignSelected.size;
if(!cnt){toast('객실을 먼저 선택하세요');return;}
const label=maidName?maidName:'배정 해제';
if(!confirm(cnt+'개 객실을 ['+label+']로 배정합니다.\n계속하시겠습니까?'))return;
const rooms=[...S.assignSelected];
toggleAssignMode();
showLoad('0 / '+cnt+' 처리 중...');
let done=0;
for(const roomNo of rooms){
await api({action:'assignMaid',roomNo,maidName});
done++;
$('loadingMsg').textContent=done+' / '+cnt+' 처리 중...';
}
await loadRooms(true);hideLoad();
toast('✅ '+cnt+'개 객실 배정 완료: '+label);
}

function setFilter(f){
S.filter=f;
document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
render();
}

function fmtCardTime(iso){
if(!iso)return'';
const d=new Date(iso);
const now=new Date();
const isToday=d.toLocaleDateString('ko-KR')===now.toLocaleDateString('ko-KR');
if(isToday){
return d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
}else{
return d.toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})+' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
}
}
const MAID_COLORS = ['#06b6d4','#a78bfa','#fb923c','#f472b6','#facc15'];

const STATUS_CARD_THEME = {
occupied: {bg:'#3d1a2e', border:'#f472b6', numColor:'#fce7f3', dimColor:'#f9a8d4'},
uncleaned: {bg:'#3d0f0f', border:'#ef4444', numColor:'#fee2e2', dimColor:'#fca5a5'},
cleaning: {bg:'#3d2a00', border:'#f59e0b', numColor:'#fef3c7', dimColor:'#fde68a'},
inspection: {bg:'#1e2535', border:'#94a3b8', numColor:'#e2e8f0', dimColor:'#94a3b8'},
vacant: {bg:'#0d2e1a', border:'#4ade80', numColor:'#dcfce7', dimColor:'#86efac'},
broken: {bg:'#2e1a0a', border:'#ff6b35', numColor:'#ffedd5', dimColor:'#fdba74'},
cleaned: {bg:'#1e2535', border:'#94a3b8', numColor:'#e2e8f0', dimColor:'#94a3b8'}
};

function render(){
let rooms=S.rooms.map(r=>r.status==='cleaned'?{...r,status:'inspection'}:r);
if(S.filter!=='all')rooms=rooms.filter(x=>x.status===S.filter);
if(S.role==='maid'){
rooms=rooms.filter(x=>x.status!=='occupied'&&x.status!=='vacant'&&x.status!=='broken');
rooms=rooms.filter(x=>!x.maidName||x.maidName.split(',').map(n=>n.trim()).includes(S.name));
}
const grid=$('roomsGrid');grid.innerHTML='';
rooms.forEach(function(room){
const no=String(room.roomNo);
const isSel=S.selected.has(no);
const isAssignSel=S.assignSelected.has(no);
const card=document.createElement('div');
const firstMaid=room.maidName?room.maidName.split(',')[0].trim():'';
const assignedIdx=getMaidColorIdx(firstMaid);
const maidColor=assignedIdx>=0?MAID_COLORS[assignedIdx]:null;
const theme=STATUS_CARD_THEME[room.status]||STATUS_CARD_THEME.inspection;

card.className='room-card'+(isSel||isAssignSel?' card-selected':'');
card.style.background=theme.bg;
card.style.border='1px solid '+(isSel||isAssignSel?'#ef4444':theme.border);
if(maidColor&&!isAssignSel){card.style.borderLeft='5px solid '+maidColor;}
if(isAssignSel){card.style.borderLeft='5px solid #4ade80';card.style.boxShadow='0 0 0 2px rgba(74,222,128,.35)';}

const badge=bedBadge(room.typeCode);
const timeStr=fmtCardTime(room.updatedAt);
const timeHtml=timeStr?'<div class="room-time" style="color:'+theme.dimColor+'">'+timeStr+'</div>':'';

let maidHtml='';
if(room.maidName){
const maidNames=room.maidName.split(',').map(n=>n.trim()).filter(Boolean);
maidHtml=maidNames.map(function(name,idx){
const mc=getMaidColorIdx(name);
const color=mc>=0?MAID_COLORS[mc]:null;
return '<div class="room-maid-badge"'+(color?' style="background:'+color+'22;color:'+color+';border-color:'+color+'44"':'')+'>'
+'<span class="maid-dot"'+(color?' style="background:'+color+'"':'')+'>'+'</span>'+esc(name)+'</div>';
}).join('');
}

const innerHtml=
'<div class="room-no" style="color:'+theme.numColor+'">'+no+'</div>'+
'<div class="room-type-row"><span class="room-type" style="color:'+theme.dimColor+'">'+room.typeCode+'</span>'+badge+'</div>'+
'<div class="room-status status-'+room.status+'">'+KR[room.status]+'</div>'+
maidHtml+timeHtml;

if(S.selectMode&&S.role==='admin'){
card.innerHTML='<div class="card-check">'+(isSel?'☑':'☐')+'</div>'+innerHtml;
card.onclick=function(){toggleSelect(no);};
}else if(S.assignMode&&S.role==='admin'){
card.innerHTML='<div class="card-check" style="color:'+(isAssignSel?'var(--vacant)':'var(--text2)')+'">'
+(isAssignSel?'☑':'☐')+'</div>'+innerHtml;
card.onclick=function(){toggleAssignSelect(no);};
}else{
card.innerHTML=innerHtml;
card.onclick=function(){openRoom(no);};
}
grid.appendChild(card);
});
}
async function openRoom(no){
if(S.selectMode||S.assignMode)return;
no=String(no);
S.room=S.rooms.find(r=>String(r.roomNo)===no);
if(!S.room){toast('오류: 객실 없음 '+no);return;}
if(S.room.status==='cleaned')S.room={...S.room,status:'inspection'};
S.status=S.room.status;
$('mRoomNo').textContent=no+'호';
$('mRoomType').textContent=S.room.typeName||'';
$('maidInput').value=S.room.maidName||'';
$('noteInput').value='';
const modalTime=$('mModalTime');
if(modalTime){
const ts=fmtCardTime(S.room.updatedAt);
modalTime.textContent=ts?'마지막 변경: '+ts:'';
}
updBtns();
document.querySelectorAll('.status-btn-admin').forEach(b=>{
b.style.display=S.role==='admin'?'':'';
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
try{
const rh=await api({action:'getRoomHistory',roomNo:no,limit:5});
const hl=$('historyList');
if(hl){
if(rh.ok&&rh.history&&rh.history.length){
const KR_S={occupied:'재실',uncleaned:'미정비',cleaning:'정비중',inspection:'인스펙션필요',vacant:'공실완료',broken:'고장',cleaned:'인스펙션필요'};
hl.innerHTML=rh.history.map(h=>'<div class="note-item"><div class="note-meta">'+esc(h.changedBy||'?')+' · '+fmt(h.timestamp)+'</div>'+(KR_S[h.fromStatus]||h.fromStatus||'?')+' → '+(KR_S[h.toStatus]||h.toStatus||'?')+'</div>').join('');
}else{
hl.innerHTML='<div style="color:var(--text2);font-size:13px">이력 없음</div>';
}
}
}catch(e){}
}

function closeModal(e){if(e.target.id==='roomModal'){$('roomModal').classList.remove('open');S.room=null;}}
function selStatus(s){S.status=s;updBtns();}

function updBtns(){
const map={occupied:0,uncleaned:1,broken:2,cleaning:3,inspection:4,vacant:5};
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
message:'✅ '+S.room.roomNo+'호 점검 통과! 공실완료 정체되었습니다. ('+S.room.maidName+' 님 수고하셨습니다 👍)'});
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
async function loadChat(s=false){
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
if(!mine) sendChatNotif(m);
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
function requestNotifPermission(){
if(!('Notification' in window)){toast('이 브라우저는 알림을 지원하지 않습니다');return;}
Notification.requestPermission().then(function(perm){
const bar=$('notifBar');
if(perm==='granted'){
if(bar)bar.classList.remove('show');
toast('✅ 알림이 허용되었습니다');
new Notification('Hotel Around Sokcho',{body:'새 메시지 알림 활성화 🔔',icon:'/housekeeping/favicon.ico'});
}else{
if(bar)bar.classList.remove('show');
toast('알림 거부');
}
});
}
function maybeShowNotifBar(){
if(!('Notification' in window))return;
if(Notification.permission==='default'){
const bar=$('notifBar');
if(bar)bar.classList.add('show');
}
}
function sendChatNotif(msg){
if(!('Notification' in window))return;
if(Notification.permission!=='granted')return;
if(document.visibilityState==='visible')return;
const sl=msg.role==='admin'?'관리자':'메이드';
new Notification('💬 '+msg.sender+' ('+sl+')',{
body:msg.message.length>60?msg.message.substring(0,60)+'…':msg.message,
icon:'/housekeeping/favicon.ico',tag:'hk-chat'
});
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
(function restoreSession(){
const role=sessionStorage.getItem('hk_role');
const name=sessionStorage.getItem('hk_name');
if(role&&name){S.role=role;S.name=name;go();}
})();

// ── 업무일지 다운로드 ──
function openReportModal(){
const today=new Date().toISOString().slice(0,10);
$('reportFrom').value=today;
$('reportTo').value=today;
$('reportModal').classList.add('open');
}
function closeReportModal(){$('reportModal').classList.remove('open');}

async function downloadReport(){
const from=$('reportFrom').value;
const to=$('reportTo').value;
if(!from||!to){toast('날짜를 선택하세요');return;}
showLoad('업무일지 생성 중...');
try{
const r=await api({action:'getReportData',dateFrom:from,dateTo:to});
if(!r.ok){hideLoad();toast('데이터 로드 실패');return;}
const KR_S={occupied:'재실',uncleaned:'미정비',cleaning:'정비중',
inspection:'인스펙션필요',vacant:'공실완료',broken:'고장',cleaned:'인스펙션필요'};
const tally={};
r.rooms.forEach(function(rm){
if(!rm.maidName)return;
rm.maidName.split(',').map(function(n){return n.trim();}).filter(Boolean).forEach(function(name){
if(!tally[name])tally[name]={done:0,wip:0,total:0};
const st=rm.status==='cleaned'?'inspection':rm.status;
if(['uncleaned','cleaning','inspection','vacant'].includes(st)){
tally[name].total++;
if(st==='inspection'||st==='vacant')tally[name].done++;
if(st==='cleaning')tally[name].wip++;
}
});
});
const sc={occupied:0,uncleaned:0,cleaning:0,inspection:0,vacant:0,broken:0};
r.rooms.forEach(function(rm){
const st=rm.status==='cleaned'?'inspection':rm.status;
if(sc[st]!==undefined)sc[st]++;
});
const summary=[
['호텔 어라운드 속초 — 업무일지'],
['기간',from+' ~ '+to],
['생성일시',new Date().toLocaleString('ko-KR')],
[],
['[ 객실 현황 ]'],
['재실','미정비','정비중','인스펙션필요','공실완료','고장'],
[sc.occupied,sc.uncleaned,sc.cleaning,sc.inspection,sc.vacant,sc.broken],
[],
['[ 메이드별 현황 ]'],
['이름','완료','정비중','담당합계','완료율']
].concat(Object.entries(tally).map(function(e){
const name=e[0],d=e[1];
return [name,d.done,d.wip,d.total,d.total?Math.round(d.done/d.total*100)+'%':'0%'];
}));
const noteMap={};
r.notes.forEach(function(n){
if(!noteMap[n.roomNo])noteMap[n.roomNo]=[];
const t=n.timestamp?new Date(n.timestamp).toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'';
noteMap[n.roomNo].push('['+t+'] '+n.sender+': '+n.note);
});
const detail=[
['객실번호','타입코드','타입명','현재상태','담당메이드','마지막변경','메모']
].concat(r.rooms.map(function(rm){
return [
rm.roomNo,rm.typeCode,rm.typeName,
KR_S[rm.status]||rm.status,
rm.maidName||'미배정',
rm.updatedAt?new Date(rm.updatedAt).toLocaleString('ko-KR'):'',
(noteMap[rm.roomNo]||[]).join(' | ')
];
}));
const hist=[
['변경시각','객실번호','이전상태','변경후상태','변경자','역할']
].concat(r.history.map(function(h){
return [
h.timestamp?new Date(h.timestamp).toLocaleString('ko-KR'):'',
h.roomNo,
KR_S[h.fromStatus]||h.fromStatus||'',
KR_S[h.toStatus]||h.toStatus||'',
h.changedBy||'',
h.role==='admin'?'관리자':'메이드'
];
}));
const wb=XLSX.utils.book_new();
const ws1=XLSX.utils.aoa_to_sheet(summary);
ws1['!cols']=[{wch:20},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}];
XLSX.utils.book_append_sheet(wb,ws1,'업무요약');
const ws2=XLSX.utils.aoa_to_sheet(detail);
ws2['!cols']=[{wch:10},{wch:10},{wch:24},{wch:14},{wch:16},{wch:18},{wch:40}];
XLSX.utils.book_append_sheet(wb,ws2,'객실상세');
const ws3=XLSX.utils.aoa_to_sheet(hist);
ws3['!cols']=[{wch:18},{wch:10},{wch:14},{wch:14},{wch:12},{wch:8}];
XLSX.utils.book_append_sheet(wb,ws3,'변경이력');
const fname='HK_업무일지_'+from+(from!==to?'~'+to:'')+'.xlsx';
XLSX.writeFile(wb,fname);
hideLoad();closeReportModal();toast('✅ 다운로드 완료');
}catch(e){hideLoad();toast('오류: '+e.message);}
}
