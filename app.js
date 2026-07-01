const API = 'https://script.google.com/macros/s/AKfycbzEZj1UW3bejogNEuqmThCZNPlFdqXhq2zmlHI-D8cFgLFszs9G3Zcb4EFau1NyJl6D/exec';
let S = {
role:null, name:'', rooms:[], filter:'all',
room:null, status:null, chatSince:null,
isInspector:false, selectMode:false, selected:new Set(),
assignMode:false, assignSelected:new Set(),
todayInspector:'',
  crossInspection:false,
  maidFilter:''
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
if(nameSelect){
  nameSelect.style.display='block';
  renderAdminNameBtns(r.admins);
}
$('loginError').textContent='';
}else $('loginError').textContent='PIN 오류';
}

function selectAdminName(name){
S.role='admin'; S.name=name;
document.querySelectorAll('.admin-name-btn').forEach(b=>b.classList.toggle('active',b.dataset.name===name));
sessionStorage.setItem('hk_role','admin');
sessionStorage.setItem('hk_name',name);
go();
}
function renderAdminNameBtns(admins){
const wrap=$('adminNameSelect');
if(!wrap)return;
wrap.innerHTML='';
(admins||['장경순','박지연']).forEach(function(name){
  const btn=document.createElement('button');
  btn.className='admin-name-btn';
  btn.dataset.name=name;
  btn.textContent='👔 '+name;
  btn.onclick=function(){selectAdminName(name);};
  wrap.appendChild(btn);
});
}
async function loginMaid(){
const n=$('maidNameInput').value.trim();
if(!n){$('loginError').textContent='이름을 입력하세요';return;}
showLoad('인증 중...');
const r=await api({action:'verifyMaid',name:n});
hideLoad();
if(r.ok){
const canonName=r.name||n;
S.role='maid';S.name=canonName;S.isInspector=!!(r.isInspector);
sessionStorage.setItem('hk_role','maid');sessionStorage.setItem('hk_name',canonName);sessionStorage.setItem('hk_inspector',r.isInspector?'1':'0');go();
}else $('loginError').textContent=r.error||'등록되지 않은 이름입니다';
}

function logout(){
clearInterval(timer);
sessionStorage.removeItem('hk_role');
sessionStorage.removeItem('hk_name');
const ns=$('adminNameSelect');if(ns){ns.style.display='none';}
switchTab('admin');
S={role:null,name:'',rooms:[],filter:'all',room:null,status:null,chatSince:null,selectMode:false,selected:new Set(),assignMode:false,assignSelected:new Set()};_prevRoomMap=null;_popupQueue=[];_popupRunning=false;
$('loginScreen').style.display='flex';$('app').style.display='none';
$('pinInput').value='';$('maidNameInput').value='';
document.querySelectorAll('.admin-name-btn').forEach(b=>b.classList.remove('active'));
}
async function go(){
$('loginScreen').style.display='none';$('app').style.display='flex';
$('headerSub').textContent=S.role==='admin'?'관리자 모드':S.name+' 님';
['resetBtn','maidSec','changePinBtn','maidMgmtBtn','adminMgmtBtn','inspectorMgmtBtn','reportBtn','maidStatsSection','selectModeBtn','assignModeBtn'].forEach(id=>{
const el=$(id);if(el)el.style.display=S.role==='admin'?'block':'none';
});
showLoad('로딩 중...');
if(S.role==='admin'){const mr=await api({action:'getMaids'});S.maids=(mr.ok&&mr.maids)?mr.maids:[];const tr=await api({action:'getTodayInspector'});S.todayInspector=(tr.ok&&tr.inspector)?tr.inspector:'';renderTodayInspectorBar();}
if(S.role==='admin'){const cr=await api({action:'getCrossInspection'});if(cr.ok)S.crossInspection=cr.enabled;renderTodayInspectorBar();}
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
if(r.ok){detectRoomChanges(r.rooms);S.rooms=r.rooms;render();stats();maidStats();if(S.role==='admin')renderTodayInspectorBar();}
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
const total=S.rooms.length;
const cntAllEl=$('cntAll');
if(cntAllEl)cntAllEl.textContent=total;
updateStatCardHighlight();
}

function maidStats(){
if(S.role!=='admin')return;
const box=$('maidStatsGrid');if(!box)return;
const tally={};
S.rooms.forEach(r=>{
if(!r.maidName)return;
const maids=r.maidName.split(',').map(n=>n.trim()).filter(Boolean);
maids.forEach(function(name){
if(!tally[name])tally[name]={occupied:0,uncleaned:0,cleaning:0,inspection:0,vacant:0,broken:0,total:0};
tally[name].total++;
const _st=r.status==='cleaned'?'inspection':r.status;
if(tally[name][_st]!==undefined)tally[name][_st]++;
});
});
const names=Object.keys(tally);
if(!names.length){box.innerHTML='<div style="color:var(--text2);font-size:12px;padding:8px">배정된 메이드 없음</div>';return;}
box.innerHTML='';
names.forEach(function(name){
const d=tally[name];
const pct=d.total?Math.round(d.done/d.total*100):0;
const card=document.createElement('div');card.className='maid-stat-card';
card.dataset.maid=name;
card.innerHTML='<div class="maid-stat-name">'+esc(name)+'<span style="font-size:11px;font-weight:500;color:var(--text2);margin-left:8px;">총 '+d.total+'객실</span></div>'+
'<div class="maid-stat-numbers" style="flex-wrap:wrap;gap:6px 10px;">'+
(d.occupied?'<span style="color:var(--occupied);font-size:12px;font-weight:600;">재실 '+d.occupied+'</span>':'')+
(d.uncleaned?'<span style="color:var(--uncleaned);font-size:12px;font-weight:600;">미정비 '+d.uncleaned+'</span>':'')+
(d.cleaning?'<span style="color:var(--cleaning);font-size:12px;font-weight:600;">정비중 '+d.cleaning+'</span>':'')+
(d.inspection?'<span style="color:var(--inspection);font-size:12px;font-weight:600;">인스펙션 '+d.inspection+'</span>':'')+
(d.vacant?'<span style="color:var(--vacant);font-size:12px;font-weight:600;">공실완료 '+d.vacant+'</span>':'')+
(d.broken?'<span style="color:var(--broken);font-size:12px;font-weight:600;">고장 '+d.broken+'</span>':'')+
'</div>'+
'<div class="maid-stat-bar-wrap"><div class="maid-stat-bar" style="width:'+(d.total?Math.round(d.vacant/d.total*100):0)+'%"></div></div>'+
'<div class="maid-stat-pct">'+(d.total?Math.round(d.vacant/d.total*100):0)+'% 공실완료</div>';
card.onclick=function(){
  if(S.maidFilter===name){
    S.maidFilter='';
    updateMaidStatHighlight('');
    updateStatCardHighlight();
  }else{
    S.maidFilter=name;
    updateMaidStatHighlight(name);
    document.querySelectorAll('.stat-card').forEach(c=>c.classList.remove('active-filter'));
  }
  render();
};
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
  if(S.role==='maid')rooms=rooms.filter(x=>x.maidName&&x.maidName.split(',').map(n=>n.trim().toLowerCase()).includes(S.name.toLowerCase()));
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

function loadAssignBar(){
const maids=S.maids&&S.maids.length?S.maids:[];
const btnWrap=$('assignMaidBtns');
if(!btnWrap)return;
btnWrap.innerHTML='';
S._assignPickSelected=new Set();
if(!maids.length){
btnWrap.innerHTML='<span style="color:var(--text2);font-size:12px">등록된 메이드 없음</span>';
return;
}
function renderAssignPicker(){
btnWrap.innerHTML='';
const COLORS=['#06b6d4','#a78bfa','#fb923c','#f472b6','#facc15'];
maids.forEach(function(name,idx){
const color=COLORS[idx%5];
const isSel=S._assignPickSelected.has(name);
const btn=document.createElement('button');
btn.className='assign-maid-btn';
btn.style.cssText=isSel
?'background:'+color+'33;border:2px solid '+color+';color:'+color+';padding:8px 14px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;'
:'background:'+color+'11;border:1.5px solid '+color+'55;color:'+color+';padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.75;';
btn.textContent=(isSel?'✓ ':'')+name;
btn.onclick=function(){
if(S._assignPickSelected.has(name))S._assignPickSelected.delete(name);
else S._assignPickSelected.add(name);
renderAssignPicker();
};
btnWrap.appendChild(btn);
});
const sep=document.createElement('div');
sep.style.cssText='width:1px;height:32px;background:var(--border);margin:0 4px;flex-shrink:0;';
btnWrap.appendChild(sep);
const selCount=S._assignPickSelected.size;
const ok=document.createElement('button');
ok.className='assign-maid-btn';
ok.style.cssText='background:rgba(74,222,128,.15);border:1.5px solid rgba(74,222,128,.4);color:var(--vacant);padding:8px 16px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;'+(selCount===0?'opacity:0.4;':'');
ok.textContent=selCount>0?'✅ '+Array.from(S._assignPickSelected).join('+')+' 배정':'✅ 배정';
ok.onclick=function(){
if(S._assignPickSelected.size===0){toast('메이드를 선택하세요');return;}
execBulkAssign(Array.from(S._assignPickSelected).join(','));
};
btnWrap.appendChild(ok);
const clr=document.createElement('button');
clr.className='assign-maid-btn';
clr.style.cssText='background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.3);color:var(--uncleaned);padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;';
clr.textContent='✕ 해제';
clr.onclick=function(){execBulkAssign('');};
btnWrap.appendChild(clr);
}
renderAssignPicker();
}

function updateAssignBar(){
const cnt=S.assignSelected.size;
const countEl=$('assignCount');
if(countEl)countEl.textContent=cnt+'개 객실 선택됨';
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
S.maidFilter='';
document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
updateStatCardHighlight();
updateMaidStatHighlight('');
render();
}

function updateStatCardHighlight(){
const ids=['statCardAll','statCard0','statCard1','statCard2','statCard3','statCard4','statCard5'];
const filters=['all','occupied','uncleaned','cleaning','inspection','vacant','broken'];
ids.forEach((id,i)=>{
const el=$(id);
if(!el)return;
el.classList.toggle('active-filter', S.filter===filters[i] && !S.maidFilter);
});
}

function updateMaidStatHighlight(name){
document.querySelectorAll('.maid-stat-card').forEach(c=>{
c.classList.toggle('active-maid', !!name && c.dataset.maid===name);
});
}

function fmtCardTime(iso){
if(!iso)return'';
const d=new Date(iso);
const now=new Date();
const isToday=d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})===now.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
if(isToday){
return d.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
}else{
return d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'})+' '+d.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
}
}
const MAID_COLORS = ['#06b6d4','#a78bfa','#fb923c','#f472b6','#facc15'];

const STATUS_CARD_THEME = {
occupied:   {bg:'#f9a8d4', border:'#ec4899', numColor:'#ffffff', dimColor:'#000000'},
uncleaned:  {bg:'#f87171', border:'#dc2626', numColor:'#ffffff', dimColor:'#000000'},
cleaning:   {bg:'#fcd34d', border:'#f59e0b', numColor:'#1c1200', dimColor:'#000000'},
inspection: {bg:'#a78bfa', border:'#7c3aed', numColor:'#ffffff', dimColor:'#000000'},
vacant:     {bg:'#4ade80', border:'#16a34a', numColor:'#022c16', dimColor:'#000000'},
broken:     {bg:'#fb923c', border:'#ea580c', numColor:'#ffffff', dimColor:'#000000'},
cleaned:    {bg:'#a78bfa', border:'#7c3aed', numColor:'#ffffff', dimColor:'#000000'},
};

function render(){
  let rooms=S.rooms.map(r=>r.status==='cleaned'?{...r,status:'inspection'}:r);
  if(S.filter!=='all')rooms=rooms.filter(x=>x.status===S.filter);
  if(S.maidFilter)rooms=rooms.filter(x=>x.maidName&&x.maidName.split(',').map(n=>n.trim().toLowerCase()).includes(S.maidFilter.toLowerCase()));

  // ── 메이드 화면 전용 처리 ──
  if(S.role==='maid'){
    rooms=rooms.filter(x=>x.status!=='occupied'&&x.status!=='broken');
    if(S.isInspector){
      rooms=rooms.filter(x=>x.status==='inspection'&&(x.inspectorName===S.name||!x.inspectorName));
    }else{
      rooms=rooms.filter(x=>x.maidName&&x.maidName.split(',').map(n=>n.trim().toLowerCase()).includes(S.name.toLowerCase()));
    }

    const grid=$('roomsGrid');
    grid.innerHTML='';

    if(rooms.length===0){
      grid.innerHTML='<div style="color:var(--text2);text-align:center;padding:40px 20px;font-size:14px">배정된 객실이 없습니다.<br><small>Waiting for room assignment</small></div>';
      return;
    }

    // 완료(vacant) / 미완료 분리 + roomNo 오름차순 정렬
    const sortFn=(a,b)=>String(a.roomNo).localeCompare(String(b.roomNo),'ko',{numeric:true});
    const pending=rooms.filter(r=>r.status!=='vacant').sort(sortFn);
    const done   =rooms.filter(r=>r.status==='vacant').sort(sortFn);
    const total  =rooms.length;
    const doneCount=done.length;

    // 예상 완료 시각 (완료 객실 간격 기반)
    let etaStr='';
    if(pending.length>0&&doneCount>=2){
      const vacantTimes=done.map(r=>r.updatedAt?new Date(r.updatedAt).getTime():0).filter(Boolean).sort();
      if(vacantTimes.length>=2){
        const gaps=[];
        for(let i=1;i<vacantTimes.length;i++)gaps.push(vacantTimes[i]-vacantTimes[i-1]);
        const avgGap=gaps.reduce((a,b)=>a+b,0)/gaps.length;
        const etaDate=new Date(vacantTimes[vacantTimes.length-1]+avgGap*pending.length);
        etaStr=etaDate.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' 예상';
      }
    }

    // 진행률 헤더
    const pct=total?Math.round(doneCount/total*100):0;
    const bar=document.createElement('div');
    bar.style.cssText='margin-bottom:14px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;';
    bar.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'+
        '<span style="font-size:13px;font-weight:600;color:var(--text);">'+esc(S.name)+' 님 오늘 현황</span>'+
        '<span style="font-size:13px;font-weight:700;color:var(--vacant);">'+doneCount+' / '+total+'</span>'+
      '</div>'+
      '<div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden;">'+
        '<div style="background:var(--vacant);height:100%;width:'+pct+'%;border-radius:6px;transition:width .4s ease;"></div>'+
      '</div>'+
      '<div style="margin-top:5px;font-size:11px;color:var(--text2);text-align:right;">'+
        (pending.length>0?'남은 객실 '+pending.length+'개 / '+pending.length+' left':'✅ 모든 객실 공실완료! / All Vacant!')+
        ' · 완료율 '+pct+'% / '+pct+'% done'+
        (etaStr?' · <span style="color:var(--accent);font-weight:600;">'+etaStr+'</span>':'')+
      '</div>';
    grid.appendChild(bar);

    // 미완료 섹션
    if(pending.length>0){
      const ph=document.createElement('div');
      ph.style.cssText='font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;padding:4px 2px 8px;';
      ph.textContent='미완료 / Pending · '+pending.length;
      grid.appendChild(ph);
      const pg=document.createElement('div');
      pg.className='rooms-grid-inner';
      pending.forEach(function(room){ pg.appendChild(buildCard(room,false)); });
      grid.appendChild(pg);
    }

    // 완료 섹션
    if(done.length>0){
      const dh=document.createElement('div');
      dh.style.cssText='font-size:11px;font-weight:700;color:var(--vacant);text-transform:uppercase;letter-spacing:.06em;padding:14px 2px 8px;display:flex;align-items:center;gap:6px;';
      dh.innerHTML='✅ 공실완료 / Vacant · '+done.length;
      grid.appendChild(dh);
      const dg=document.createElement('div');
      dg.className='rooms-grid-inner';
      done.forEach(function(room){ dg.appendChild(buildCard(room,true)); });
      grid.appendChild(dg);
    }
    return;
  }

  // ── 관리자 화면 (기존 로직 유지) ──
  const grid=$('roomsGrid');
  grid.innerHTML='';
  rooms.forEach(function(room){ grid.appendChild(buildCard(room,false)); });
}

function buildCard(room, isDone){
  const no=String(room.roomNo);
  const isSel=S.selected.has(no);
  const isAssignSel=S.assignSelected.has(no);
  const card=document.createElement('div');
  const firstMaid=room.maidName?room.maidName.split(',')[0].trim():'';
  const assignedIdx=getMaidColorIdx(firstMaid);
  const maidColor=assignedIdx>=0?MAID_COLORS[assignedIdx]:null;
  const theme=STATUS_CARD_THEME[room.status]||STATUS_CARD_THEME.inspection;

  const _isUnassignCleaning=(room.status==='cleaning'&&!room.maidName);
  card.className='room-card'+(isSel||isAssignSel?' card-selected':'')+(_isUnassignCleaning?' cleaning-unassigned':'');
  card.style.background=theme.bg;
  card.style.border=_isUnassignCleaning?'2px dashed #f59e0b':'1px solid '+(isSel||isAssignSel?'#ef4444':theme.border);
  if(isDone) card.style.opacity='0.5';
  if(maidColor&&!isAssignSel){card.style.borderLeft='5px solid '+maidColor;}
  if(isAssignSel){card.style.borderLeft='5px solid #4ade80';card.style.boxShadow='0 0 0 2px rgba(74,222,128,.35)';}

  const badge=bedBadge(room.typeCode);
  const timeStr=fmtCardTime(room.updatedAt);
  const timeHtml=timeStr?'<div class="room-time" style="color:'+theme.dimColor+'">'+timeStr+'</div>':'';

  let maidHtml='';
  if(room.maidName){
    const maidNames=room.maidName.split(',').map(n=>n.trim()).filter(Boolean);
    maidHtml=maidNames.map(function(name){
      const mc=getMaidColorIdx(name);
      const color=mc>=0?MAID_COLORS[mc]:null;
      return '<div class="room-maid-badge"'+(color?' style="background:'+color+'22;color:#000000;border-color:'+color+'44"':'')+'>'        +'<span class="maid-dot"'+(color?' style="background:'+color+'"':'')+'>'+'</span>'+esc(name)+'</div>';
    }).join('');
  }else if(room.status==='cleaning'){
    maidHtml='<div class="room-maid-badge" style="background:rgba(245,158,11,.18);color:#f59e0b;border-color:rgba(245,158,11,.5);font-weight:700;">⚠️ 미배정</div>';
  }

  const innerHtml=
    '<div class="room-no" style="color:'+theme.numColor+'">'+no+'</div>'+
    '<div class="room-type-row"><span class="room-type" style="color:'+theme.dimColor+'">'+room.typeCode+'</span>'+badge+'</div>'+
    '<div class="room-status status-'+room.status+'">'+KR[room.status]+'</div>'+
    (room.inspectorName&&room.status==='inspection'?'<div class="room-inspector-badge">🔍 '+esc(room.inspectorName)+'</div>':'')+maidHtml+timeHtml;

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
  return card;
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
const _isSelfInspect=S.role==='maid'&&S.room&&S.room.maidName&&S.room.maidName.split(',').map(n=>n.trim().toLowerCase()).includes(S.name.toLowerCase())&&S.room.status==='inspection';
const _showAdmin=S.role==='admin'||(b.dataset.status==='vacant'&&(S.isInspector||_isSelfInspect));
b.style.display=_showAdmin?'':'none';
});
if(S.role==='admin'){renderMaidPicker(S.room.maidName||'');}
const inspSec=document.getElementById('inspectorOverrideSection');
const inspPicker=document.getElementById('inspectorOverridePicker');
if(inspSec&&inspPicker&&S.role==='admin'){
  if(S.room.status==='inspection'){
    inspSec.style.display='block';
    inspPicker.dataset.changed='0';
    const allNames=[...S.maids,...['장경순','박지연']];
    inspPicker.innerHTML='<option value="">선택하세요 / Select</option>'+allNames.map(n=>'<option value="'+n+'"'+(S.room.inspectorName===n?' selected':'')+'>'+n+'</option>').join('');
  }else{inspSec.style.display='none';}
}else if(inspSec){inspSec.style.display='none';}
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
hl.innerHTML=rh.history.map(h=>'<div class="note-item"><div class="note-meta">'+esc(h.changedBy||'?')+' · '+fmt(h.timestamp)+'</div>'+(KR[h.fromStatus]||h.fromStatus||'?')+' → '+(KR[h.toStatus]||h.toStatus||'?')+'</div>').join('');
}else{
hl.innerHTML='<div style="color:var(--text2);font-size:13px">이력 없음</div>';
}
}
}catch(e){}
}

function renderMaidPicker(currentMaid){
const picker=$('maidPicker');const display=$('maidSelectedDisplay');if(!picker)return;
let selected=new Set(currentMaid?currentMaid.split(',').map(n=>n.trim()).filter(Boolean):[]);
const maids=S.maids&&S.maids.length?S.maids:[];
const COLORS=['color-0','color-1','color-2','color-3','color-4'];
function renderButtons(){
picker.innerHTML='';
maids.forEach(function(name,idx){
const btn=document.createElement('button');
btn.className='maid-pick-btn'+(selected.has(name)?' selected selected-'+COLORS[idx%5]:'');
btn.textContent=name[0].toUpperCase()+name.slice(1);
btn.onclick=function(){
if(selected.has(name))selected.delete(name);else selected.add(name);
const val=Array.from(selected).join(',');
$('maidInput').value=val;
display.textContent=val?'배정: '+val:'배정 없음';
renderButtons();};
picker.appendChild(btn);});
const clr=document.createElement('button');
clr.className='maid-pick-btn-clear';clr.textContent='✕ 해제';
clr.onclick=function(){selected.clear();$('maidInput').value='';display.textContent='배정 없음';renderButtons();};
picker.appendChild(clr);}
renderButtons();
display.textContent=currentMaid?'배정: '+currentMaid:'배정 없음';
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
if(n){
  calls.push(api({action:'addRoomNote',roomNo:S.room.roomNo,sender:S.name,role:S.role,note:n}));
  // 패키지 A: 인스펙터/관리자가 메모 입력 시 담당 메이드에게 채팅 자동 발송
  if((S.role==='admin'||S.isInspector)&&S.room.maidName){
    const _noteMsg='📋 '+S.room.roomNo+'호 메모 ('+S.name+' → '+S.room.maidName+'): "'+n+'"';
    calls.push(api({action:'sendChat',sender:S.name,role:S.role,message:_noteMsg}));
  }
}
const newInsp=document.getElementById('inspectorOverridePicker');
if(newInsp&&S.room&&S.room.status==='inspection'&&newInsp.dataset.changed==='1'){
  calls.push(api({action:'assignInspector',roomNo:S.room.roomNo,inspectorName:newInsp.value}));
}
await Promise.all(calls);
if(S.status==='cleaning'){
const _nm=$('maidInput').value.trim();
const _cm=S.room.maidName||'';
if(!_nm&&!_cm)setTimeout(function(){toast('⚠️ '+S.room.roomNo+'호 메이드 미배정 상태로 정비중 전환되었습니다');},400);
}
const _canInspect=S.role==='admin'||(S.role==='maid'&&(S.isInspector||(S.room.maidName&&S.room.maidName.split(',').map(n=>n.trim().toLowerCase()).includes(S.name.toLowerCase()))));
if(_canInspect&&prevStatus==='inspection'&&S.status==='vacant'){
const _chatSender=S.role==='admin'?'관리자':S.name;
const _chatMsg=(S.role==='admin'&&S.room.maidName)?'✅ '+S.room.roomNo+'호 점검 통과 / Inspection Passed! 공실완료 / Vacant, 체크인 준비완료 / Ready for Check-in. ('+S.room.maidName+' 님 수고하셨습니다 👍)':'✅ '+S.room.roomNo+'호 인스펙션 완료 / Inspection Done! 공실완료 / Vacant. (담당: '+S.name+')';
await api({action:'sendChat',sender:_chatSender,role:S.role,message:_chatMsg});
await api({action:'assignMaid',roomNo:S.room.roomNo,maidName:''});
}
await loadRooms(true);hideLoad();
$('roomModal').classList.remove('open');toast('✅ 저장완료');
}catch(e){hideLoad();toast('저장실패');}
}


function renderTodayInspectorBar(){
  const bar=$('todayInspectorBar');
  if(!bar)return;
  bar.style.display=S.role==='admin'?'flex':'none';
  const inspectors=S.maids.filter(m=>m);
  bar.innerHTML='<span style="color:var(--text2);font-size:13px;margin-right:8px;">🔍 오늘의 인스펙터:</span>'+
    inspectors.map(function(name){
      const active=S.todayInspector===name;
      return '<button'+(active?' style="background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:20px;padding:4px 14px;font-size:13px;cursor:pointer;margin-right:6px;"':' style="background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:20px;padding:4px 14px;font-size:13px;cursor:pointer;margin-right:6px;"')+' onclick="setTodayInspectorUI(\''+name+'\')">'  +(name[0].toUpperCase()+name.slice(1))+'</button>';
    }).join('')+
    (S.todayInspector?'<button onclick="setTodayInspectorUI(\'\')" style="background:transparent;color:var(--text2);border:none;font-size:12px;cursor:pointer;padding:4px 8px;">✕ 해제</button>':'');
  let crossBtn=document.getElementById('crossInspBtn');
  if(!crossBtn){crossBtn=document.createElement('button');crossBtn.id='crossInspBtn';crossBtn.style.cssText='margin-left:8px;padding:4px 10px;border-radius:8px;border:1px solid var(--border);font-size:12px;cursor:pointer;';bar.appendChild(crossBtn);crossBtn.onclick=toggleCrossInspection;}
  crossBtn.textContent=S.crossInspection?'🔀 크로스 ON':'🔀 크로스 OFF';
  crossBtn.style.background=S.crossInspection?'var(--accent)':'var(--surface2)';
  crossBtn.style.color=S.crossInspection?'#fff':'var(--text2)';
}
async function setTodayInspectorUI(name){
  const r=await api({action:'setTodayInspector',inspector:name});
  if(r.ok){S.todayInspector=name;renderTodayInspectorBar();toast(name?'인스펙터: '+name+' 지정':'인스펙터 해제');}
  else toast('오류');
}
async function confirmReset(){
if(!confirm('⚠️ 전체 객실을 공실완료로 초기화합니다.\n재실·공실완료 포함 모든 상태가 초기화됩니다.\n정말 계속하시겠습니까?'))return;
if(!confirm('🔴 재확인: 정말로 전체 초기화하시겠습니까?'))return;
showLoad('초기화...');
try{await api({action:'resetRooms'});await loadRooms(true);hideLoad();toast('✅ 초기화완료');}
catch(e){hideLoad();toast('실패');}
}
async function openMaidMgmtModal(){$('maidMgmtList').innerHTML='<div style="color:var(--text2);font-size:12px">로딩중...</div>';$('maidMgmtModal').classList.add('open');await refreshMaidList();}
async function refreshMaidList(){const r=await api({action:'getMaids'});const box=$('maidMgmtList');if(!r.ok){box.innerHTML='<div style="color:var(--uncleaned)">로드 실패</div>';return;}const maids=r.maids||[];if(!maids.length){box.innerHTML='<div style="color:var(--text2);font-size:12px">등록된 메이드 없음</div>';return;}box.innerHTML='';maids.forEach(function(name){const row=document.createElement('div');row.className='maid-row';row.innerHTML='<span class="maid-row-name">👤 '+esc(name[0].toUpperCase()+name.slice(1))+'</span>';const btn=document.createElement('button');btn.className='maid-del-btn';btn.textContent='삭제';btn.onclick=function(){removeMaid(name);};row.appendChild(btn);box.appendChild(row);});}
async function addMaid(){const inp=$('newMaidInput');const name=inp.value.trim();if(!name)return;showLoad('추가 중...');const r=await api({action:'addMaid',name});hideLoad();if(r.ok){inp.value='';toast('✅ '+name+' 추가완료');await refreshMaidList();}else toast('추가 실패: '+(r.error||''));}
async function removeMaid(name){if(!confirm(name+' 님을 명단에서 삭제하시겠습니까?'))return;showLoad('삭제 중...');const r=await api({action:'removeMaid',name});hideLoad();if(r.ok){toast('✅ '+name+' 삭제완료');await refreshMaidList();}else toast('삭제 실패: '+(r.error||''));}
async function toggleCrossInspection(){
  const newVal=!S.crossInspection;
  const r=await api({action:'setCrossInspection',enabled:newVal});
  if(r.ok){S.crossInspection=newVal;renderTodayInspectorBar();toast(newVal?'🔀 크로스 인스펙션 ON':'👤 오늘의 인스펙터 모드');}
  else toast('설정 실패');
}
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
if(!mine){sendChatNotif(m);if(document.visibilityState==='visible')playChatAlert();}
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
function fmt(iso){if(!iso)return'';return new Date(iso).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
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

  playChatAlert();}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ══════════════════════════════════════════════
// 패키지 B — 소리/진동 알림 시스템
// ══════════════════════════════════════════════
let _audioCtx = null;
let _soundEnabled = sessionStorage.getItem('hk_sound') !== '0'; // 기본 ON

function _getAudioCtx(){
  if(!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  // iOS: suspended 상태면 resume
  if(_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

// 알림음 생성 (Web Audio API - 파일 없이 순수 코드로 생성)
function playSound(type){
  if(!_soundEnabled) return;
  try{
    const ctx = _getAudioCtx();
    if(type === 'chat'){
      // 채팅 알림: 짧고 맑은 "띵" (카카오톡 스타일)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if(type === 'status'){
      // 상태변경 알림: 두 음 "딩동"
      [0, 0.18].forEach(function(delay, i){
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 784 : 523;
        gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.25);
      });
    } else if(type === 'memo'){
      // 메모 알림: 세 음 올림 "띵띵띵"
      [0, 0.15, 0.30].forEach(function(delay){
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 1047;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.12);
      });
    }
  }catch(e){}
}

function vibrate(pattern){
  if(!_soundEnabled) return;
  if(navigator.vibrate) navigator.vibrate(pattern||[100]);
}

function playChatAlert(){
  playSound('chat');
  vibrate([80]);
}

function playStatusAlert(){
  playSound('status');
  vibrate([60,40,60]);
}

function playMemoAlert(){
  playSound('memo');
  vibrate([80,50,80,50,80]);
}

// iOS AudioContext unlock (첫 번째 사용자 인터랙션에서 실행)
function unlockAudio(){
  try{
    const ctx = _getAudioCtx();
    const buf = ctx.createBuffer(1,1,22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
  }catch(e){}
}
document.addEventListener('touchstart', unlockAudio, {once:true});
document.addEventListener('click', unlockAudio, {once:true});

function toggleSound(){
  _soundEnabled = !_soundEnabled;
  sessionStorage.setItem('hk_sound', _soundEnabled ? '1' : '0');
  const btn = $('soundToggleBtn');
  if(btn){
    btn.textContent = _soundEnabled ? '🔔' : '🔕';
    btn.title = _soundEnabled ? '알림 소리 ON' : '알림 소리 OFF';
  }
  toast(_soundEnabled ? '🔔 알림 소리 켜짐' : '🔕 알림 소리 꺼짐');
  if(_soundEnabled) playSound('chat'); // 미리듣기
}
// ── 관리자 관리 모달 ──
async function openAdminMgmtModal(){
  const box=$('adminMgmtList');
  if(box)box.innerHTML='<div style="color:var(--text2);font-size:12px">로딩중...</div>';
  $('adminMgmtModal').classList.add('open');
  await refreshAdminList();
}
function closeAdminMgmtModal(e){
  if(!e||e.target.id==='adminMgmtModal')$('adminMgmtModal').classList.remove('open');
}
async function refreshAdminList(){
  const r=await api({action:'getAdmins'});
  const box=$('adminMgmtList');
  if(!r.ok){box.innerHTML='<div style="color:var(--uncleaned)">로드 실패</div>';return;}
  const admins=r.admins||[];
  if(!admins.length){box.innerHTML='<div style="color:var(--text2);font-size:12px">등록된 관리자 없음</div>';return;}
  box.innerHTML='';
  admins.forEach(function(name){
    const row=document.createElement('div');
    row.className='maid-row';
    row.innerHTML='<span class="maid-row-name">👔 '+esc(name)+'</span>';
    const btn=document.createElement('button');
    btn.className='maid-del-btn';
    btn.textContent='삭제';
    btn.onclick=function(){removeAdminMember(name);};
    row.appendChild(btn);
    box.appendChild(row);
  });
}
async function addAdminMember(){
  const inp=$('newAdminInput');
  const name=inp.value.trim();
  if(!name)return;
  showLoad('추가 중...');
  const r=await api({action:'addAdmin',name});
  hideLoad();
  if(r.ok){inp.value='';toast('✅ '+name+' 추가완료');await refreshAdminList();}
  else toast('추가 실패: '+(r.error||''));
}
async function removeAdminMember(name){
  if(!confirm(name+' 님을 관리자 명단에서 삭제하시겠습니까?'))return;
  showLoad('삭제 중...');
  const r=await api({action:'removeAdmin',name});
  hideLoad();
  if(r.ok){toast('✅ '+name+' 삭제완료');await refreshAdminList();}
  else toast('삭제 실패: '+(r.error||''));
}

// ── 객실 상태변경 팝업 알림 시스템 (관리자 전용) ──
let _prevRoomMap = null;
let _popupQueue = [];
let _popupRunning = false;

const STATUS_POPUP_ICON = {
  occupied:'💗', uncleaned:'🔴', cleaning:'🟡',
  inspection:'⬜', vacant:'🟢', broken:'🔶', cleaned:'⬜'
};
const STATUS_POPUP_COLOR = {
  occupied:'#f472b6', uncleaned:'#ef4444', cleaning:'#f59e0b',
  inspection:'#94a3b8', vacant:'#4ade80', broken:'#ff6b35', cleaned:'#94a3b8'
};

function fmtPopupTime(iso){
  if(!iso)return'';
  const d=new Date(iso);
  const mo=d.getMonth()+1;
  const dy=d.getDate();
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  return mo+'/'+dy+' '+hh+':'+mm;
}

function detectRoomChanges(newRooms){
  if(S.role!=='admin')return;
  if(_prevRoomMap===null){
    _prevRoomMap={};
    newRooms.forEach(r=>{ _prevRoomMap[String(r.roomNo)]=r.status==='cleaned'?'inspection':r.status; });
    return;
  }
  const changed=[];
  newRooms.forEach(function(r){
    const no=String(r.roomNo);
    const newSt=r.status==='cleaned'?'inspection':r.status;
    const oldSt=_prevRoomMap[no];
    if(oldSt!==undefined && oldSt!==newSt){
      changed.push({roomNo:no,oldSt,newSt,maidName:r.maidName||'',updatedAt:r.updatedAt});
    }
    _prevRoomMap[no]=newSt;
  });
  if(changed.length) changed.forEach(c=>_popupQueue.push(c));
  if(changed.length && !_popupRunning) drainPopupQueue();
}

function drainPopupQueue(){
  if(!_popupQueue.length){_popupRunning=false;return;}
  _popupRunning=true;
  const item=_popupQueue.shift();
  showRoomChangePopup(item, function(){ setTimeout(drainPopupQueue, 280); });
}

function showRoomChangePopup(item, onDone){
  const color=STATUS_POPUP_COLOR[item.newSt]||'#6c8fff';
  const icon=STATUS_POPUP_ICON[item.newSt]||'🔔';
  const label=KR[item.newSt]||item.newSt;
  const timeStr=fmtPopupTime(item.updatedAt);
  const maidStr=item.maidName?'<span style="font-size:12px;font-weight:600;color:#a78bfa;">'+esc(item.maidName)+'</span>':'';
  const timeEl=timeStr?'<span style="font-size:11px;color:#8b91a8;">'+timeStr+'</span>':'';

  document.querySelectorAll('.room-change-popup').forEach(function(el){
    const cur=parseInt(el.style.bottom)||80;
    el.style.bottom=(cur+74)+'px';
  });

  const pop=document.createElement('div');
  pop.className='room-change-popup';
  pop.style.cssText=
    'position:fixed;bottom:80px;right:16px;z-index:9999;'+
    'background:#1a1d27;border:1px solid '+color+';border-left:4px solid '+color+';'+
    'border-radius:12px;padding:12px 16px;min-width:210px;max-width:280px;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.55);transition:bottom .25s ease;'+
    'animation:rcpSlideIn .28s cubic-bezier(.16,1,.3,1);'+
    'cursor:pointer;display:flex;flex-direction:column;gap:5px;';

  pop.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;">'+
      '<span style="font-size:18px;line-height:1;">'+icon+'</span>'+
      '<span style="font-size:16px;font-weight:700;color:#e8eaf0;">'+item.roomNo+'호</span>'+
      '<span style="font-size:12px;font-weight:600;color:'+color+';">'+label+'</span>'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:6px;padding-left:26px;">'+
      maidStr+
      (maidStr&&timeEl?'<span style="color:#3e4255;font-size:11px;">·</span>':'')+
      timeEl+
    '</div>';

  let tid;
  const remove=function(){
    clearTimeout(tid);
    pop.style.animation='rcpSlideOut .22s ease forwards';
    setTimeout(function(){if(pop.parentNode)pop.parentNode.removeChild(pop);if(onDone)onDone();},220);
  };
  pop.onclick=remove;
  document.body.appendChild(pop);
  tid=setTimeout(remove, 4500);
}
(function restoreSession(){
const role=sessionStorage.getItem('hk_role');
const name=sessionStorage.getItem('hk_name');
if(role&&name){S.role=role;S.name=name;S.isInspector=sessionStorage.getItem('hk_inspector')==='1';go();}
})();

// ── 업무일지 다운로드 ──
function openReportModal(){
const today=new Date().toISOString().slice(0,10);
$('reportFrom').value=today;
$('reportTo').value=today;
$('reportModal').classList.add('open');
}
function closeReportModal(){$('reportModal').classList.remove('open');}

function setReportRange(range){
const d=new Date();
const fmt=function(dt){return dt.toISOString().slice(0,10);};
if(range==='today'){
$('reportFrom').value=fmt(d);$('reportTo').value=fmt(d);
}else if(range==='yesterday'){
const y=new Date(d);y.setDate(y.getDate()-1);
$('reportFrom').value=fmt(y);$('reportTo').value=fmt(y);
}else if(range==='7days'){
const w=new Date(d);w.setDate(w.getDate()-6);
$('reportFrom').value=fmt(w);$('reportTo').value=fmt(d);
}
}

function fmtTime(ts){
if(!ts)return'';
return new Date(ts).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtTimeOnly(ts){
if(!ts)return'';
return new Date(ts).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
}
function calcDuration(startTs,endTs){
if(!startTs||!endTs)return'';
const diff=new Date(endTs)-new Date(startTs);
if(diff<0)return'';
const h=Math.floor(diff/3600000);
const m=Math.floor((diff%3600000)/60000);
return h>0?h+'시간 '+m+'분':m+'분';
}

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

const stepMap={};
r.history.forEach(function(h){
const no=String(h.roomNo);
if(!stepMap[no])stepMap[no]={};
const st=h.toStatus==='cleaned'?'inspection':h.toStatus;
if(['cleaning','inspection','vacant'].includes(st)){
stepMap[no][st]=h.timestamp;
}
});

const detail=[
['객실번호','타입','담당 메이드','현재상태','정비시작','인스펙션요청','공실완료','소요시간','메모']
].concat(r.rooms.map(function(rm){
const no=String(rm.roomNo);
const steps=stepMap[no]||{};
const tCleaning=steps['cleaning']||'';
const tInspection=steps['inspection']||'';
const tVacant=steps['vacant']||'';
const duration=calcDuration(tCleaning,tVacant);
return [
rm.roomNo,
rm.typeCode,
rm.maidName||'미배정',
KR_S[rm.status]||rm.status,
fmtTimeOnly(tCleaning),
fmtTimeOnly(tInspection),
fmtTimeOnly(tVacant),
duration,
(noteMap[no]||[]).join('\n')
];
}));

const hist=[
['변경시각','객실번호','이전상태','변경후상태','변경자','역할']
].concat(r.history.map(function(h){
return [
fmtTime(h.timestamp),
h.roomNo,
KR_S[h.fromStatus]||h.fromStatus||'',
KR_S[h.toStatus]||h.toStatus||'',
h.changedBy||'',
h.role==='admin'?'관리자':'메이드'
];
}));

// ── 메이드별 상세 시트 ──
const maidNames=Object.keys(tally);
const maidDetail=[
['메이드','객실번호','타입','현재상태','정비시작','인스펙션요청','공실완료','소요시간','메모']
];
maidNames.forEach(function(maidName){
r.rooms.forEach(function(rm){
if(!rm.maidName)return;
const assigned=rm.maidName.split(',').map(function(n){return n.trim();});
if(!assigned.map(function(n){return n.toLowerCase();}).includes(maidName.toLowerCase()))return;
const no=String(rm.roomNo);
const steps=stepMap[no]||{};
const tC=steps['cleaning']||'';
const tI=steps['inspection']||'';
const tV=steps['vacant']||'';
maidDetail.push([
maidName,rm.roomNo,rm.typeCode,KR_S[rm.status]||rm.status,
fmtTimeOnly(tC),fmtTimeOnly(tI),fmtTimeOnly(tV),calcDuration(tC,tV),
(noteMap[no]||[]).join('\n')
]);
});
const d=tally[maidName];
const pct=d.total?Math.round(d.done/d.total*100):0;
maidDetail.push([maidName+' 소계','','','',
'담당:'+d.total+'객실','완료:'+d.done+'객실','진행중:'+d.wip+'객실','완료율:'+pct+'%','']);
maidDetail.push([]);
});
const wb=XLSX.utils.book_new();
const ws1=XLSX.utils.aoa_to_sheet(summary);
ws1['!cols']=[{wch:20},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}];
XLSX.utils.book_append_sheet(wb,ws1,'업무요약');
const ws2=XLSX.utils.aoa_to_sheet(detail);
ws2['!cols']=[{wch:10},{wch:12},{wch:16},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:40}];
XLSX.utils.book_append_sheet(wb,ws2,'객실상세');
const ws4=XLSX.utils.aoa_to_sheet(maidDetail);
ws4['!cols']=[{wch:14},{wch:10},{wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:36}];
XLSX.utils.book_append_sheet(wb,ws4,'메이드별');
const ws3=XLSX.utils.aoa_to_sheet(hist);
ws3['!cols']=[{wch:18},{wch:10},{wch:14},{wch:14},{wch:12},{wch:8}];
XLSX.utils.book_append_sheet(wb,ws3,'변경이력');
const fname='HK_업무일지_'+from+(from!==to?'~'+to:'')+'.xlsx';
XLSX.writeFile(wb,fname);
hideLoad();closeReportModal();toast('✅ 다운로드 완료');
}catch(e){hideLoad();toast('오류: '+e.message);}
}

async function openInspectorModal(){
  const box=$('inspectorList');
  if(box)box.innerHTML='<div style="color:var(--text2);font-size:12px">로딩중...</div>';
  $('inspectorModal').classList.add('open');
await refreshInspectorList();
}
function closeInspectorModal(e){
if(!e||e.target.id==='inspectorModal')$('inspectorModal').classList.remove('open');
}
async function refreshInspectorList(){
const r=await api({action:'getInspectors'});
const rm=await api({action:'getMaids'});
const box=$('inspectorList');
if(!box)return;
const inspectors=r.ok?(r.inspectors||[]):[];
const maids=rm.ok?(rm.maids||[]):[];
const adminNames=['장경순','박지연'];
// 관리자 + 메이드 전체 (중복 없이)
const allTargets=[
...adminNames,
...maids.filter(m=>!adminNames.map(a=>a.toLowerCase()).includes(m.toLowerCase()))
];
if(!allTargets.length){box.innerHTML='<div style="color:var(--text2);font-size:12px">대상 없음</div>';return;}
box.innerHTML='';
let maidSectionAdded=false;
allTargets.forEach(function(name){
const isAdmin=adminNames.map(a=>a.toLowerCase()).includes(name.toLowerCase());
const isIns=inspectors.map(n=>n.toLowerCase()).includes(name.toLowerCase());
if(!isAdmin&&!maidSectionAdded){
maidSectionAdded=true;
const maidHeader=document.createElement('div');
maidHeader.style.cssText='font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;padding:10px 0 6px;margin-top:4px;border-top:1px solid var(--border);';
maidHeader.textContent='메이드 / Maid';
box.appendChild(maidHeader);
}else if(isAdmin&&!box.querySelector('.inspector-admin-header')){
const adminHeader=document.createElement('div');
adminHeader.className='inspector-admin-header';
adminHeader.style.cssText='font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;padding-bottom:6px;';
adminHeader.textContent='관리자 / Admin';
box.insertBefore(adminHeader,box.firstChild);
}
const row=document.createElement('div');
row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);';
row.innerHTML='<span style="font-size:14px">'+(isAdmin?'👔':'👤')+' '+esc(name)+'</span>';
const tog=document.createElement('button');
tog.style.cssText='padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;background:'+(isIns?'var(--vacant)':'var(--surface2)')+';color:'+(isIns?'#000':'var(--text2)');
tog.textContent=isIns?'ON ✓':'OFF';
tog.onclick=async function(){
showLoad('저장 중...');
await api({action:'setInspector',maidName:name,active:!isIns});
hideLoad();
await refreshInspectorList();
};
row.appendChild(tog);
box.appendChild(row);
});
}
