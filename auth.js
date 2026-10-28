/* ============================================================
 * auth.js — 로그인 · 가입 신청 · 보스 승인 UI (신규 파일)
 * index.html 에서 app.js 보다 먼저 로드한다.
 * app.js 의 전역(S, go, logout, api, showLoad, hideLoad, $)을 호출 시점에 참조한다.
 * ============================================================ */
(function () {
  'use strict';

  var KEY = 'hk_auth';
  var A = window.AUTH = {
    st: { token: '', exp: 0, id: '', name: '', role: '', isOwner: false },
    pending: 0,
    tab: 'login'
  };
  var pollTimer = null;
  var denying = false;

  /* ── 저장소 (접근 불가 환경 대비 try/catch) ── */
  function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function lsSet(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function lsDel() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  /* ── 암호화: 비밀번호는 평문으로 전송하지 않고 아이디를 섞어 SHA-256 ── */
  A.sha = async function (s) {
    if (!(window.crypto && window.crypto.subtle)) throw new Error('이 브라우저는 지원되지 않습니다 / Browser not supported');
    var buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };
  A.pre = function (id, pw) { return A.sha('hk:' + String(id).toLowerCase() + ':' + pw); };

  /* ── api() 연동 (app.js 의 api 에서 호출) ── */
  A.decorate = function (p) {
    var q = Object.assign({}, p);
    if (A.st.token && !q.token) q.token = A.st.token;
    return q;
  };
  A.denied = function () {
    if (denying) return;
    denying = true;
    A.clear();
    try { logout(); } catch (e) {}
    setTimeout(function () { denying = false; A.msg('세션이 만료되었습니다. 다시 로그인하세요 / Session expired', 'err'); }, 0);
  };
  A.clear = function () {
    A.st = { token: '', exp: 0, id: '', name: '', role: '', isOwner: false };
    A.pending = 0;
    lsDel();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  };
  /* logout() 시작부에서 호출: 서버 세션 폐기 후 화면 초기화 */
  A.onLogout = function () {
    var tok = A.st.token;
    if (tok) { try { api({ action: 'logout', token: tok }); } catch (e) {} }
    A.clear();
    A.unmount();
    setTimeout(function () { A.showLogin('login'); }, 0);
  };

  /* ── DOM 헬퍼 ── */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function busy(on, msg) {
    if (on && typeof showLoad === 'function') showLoad(msg || '처리 중...');
    if (!on && typeof hideLoad === 'function') hideLoad();
  }

  /* ── 스타일 ── */
  function injectCss() {
    if (document.getElementById('authCss')) return;
    var css = '' +
      '#maidPwBtn{display:none!important}' +
      '.auth-tabs{display:flex;gap:6px;margin-bottom:14px}' +
      '.auth-tab{flex:1;padding:9px 0;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:13px;cursor:pointer}' +
      '.auth-tab.on{border-color:var(--accent);color:var(--text);background:var(--surface)}' +
      '.auth-note{font-size:11.5px;color:var(--text2);line-height:1.5;margin:2px 0 12px}' +
      '.auth-msg{min-height:18px;font-size:12.5px;margin-top:10px}' +
      '.auth-msg.err{color:#ef4444}.auth-msg.ok{color:#4ade80}.auth-msg.info{color:#f59e0b}' +
      '#authFab{position:fixed;left:12px;bottom:12px;z-index:900;width:40px;height:40px;border-radius:50%;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:18px;cursor:pointer;display:none;align-items:center;justify-content:center}' +
      '#authFab .bd{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;line-height:18px;text-align:center;padding:0 4px}' +
      '#authPanel{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center}' +
      '#authPanel.open{display:flex}' +
      '.auth-sheet{background:var(--surface);border:1px solid var(--border);border-radius:16px 16px 0 0;width:100%;max-width:520px;max-height:86vh;overflow:auto;padding:16px}' +
      '.auth-sheet h3{margin:0 0 4px;font-size:16px;color:var(--text)}' +
      '.auth-sub{font-size:12px;color:var(--text2);margin-bottom:12px}' +
      '.auth-row{border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--surface2)}' +
      '.auth-row .t{font-size:13.5px;color:var(--text)}.auth-row .s{font-size:11.5px;color:var(--text2);margin:2px 0 8px}' +
      '.auth-row .ctl{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
      '.auth-sheet input,.auth-sheet select{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px}' +
      '.auth-btn{padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;cursor:pointer}' +
      '.auth-btn.pri{background:var(--accent);border-color:var(--accent);color:#0f1117;font-weight:600}' +
      '.auth-btn.dng{color:#ef4444}' +
      '.auth-sec{margin:14px 0 6px;font-size:12px;color:var(--text2)}';
    document.head.appendChild(h('style', { id: 'authCss', text: css }));
  }

  /* ── 로그인 / 가입 화면 ── */
  A.msg = function (t, kind) {
    var el = document.getElementById('authMsg');
    if (el) { el.className = 'auth-msg ' + (kind || ''); el.textContent = t || ''; }
  };

  A.showLogin = function (tab) {
    injectCss();
    A.tab = tab || 'login';
    var root = document.getElementById('authRoot');
    if (!root) return;
    var ls = document.getElementById('loginScreen');
    if (ls) ls.style.display = 'flex';
    var appEl = document.getElementById('app');
    if (appEl && !(typeof S !== 'undefined' && S && S.role)) appEl.style.display = 'none';
    root.textContent = '';

    var tabs = h('div', { class: 'auth-tabs' }, [
      h('button', { type: 'button', class: 'auth-tab' + (A.tab === 'login' ? ' on' : ''), text: '로그인 / Sign in', onclick: function () { A.showLogin('login'); } }),
      h('button', { type: 'button', class: 'auth-tab' + (A.tab === 'register' ? ' on' : ''), text: '가입 신청 / Sign up', onclick: function () { A.showLogin('register'); } })
    ]);
    root.appendChild(tabs);

    var fId = h('input', { type: 'text', id: 'authId', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', placeholder: 'abc1234' });
    var fPw = h('input', { type: 'password', id: 'authPw', autocomplete: A.tab === 'login' ? 'current-password' : 'new-password', placeholder: A.tab === 'login' ? '비밀번호 / Password' : '8자 이상 / 8+ characters' });
    var group = function (label, input) { return h('div', { class: 'form-group' }, [h('label', { text: label }), input]); };

    if (A.tab === 'register') {
      var fName = h('input', { type: 'text', id: 'authName', autocomplete: 'name', maxlength: '30', placeholder: '본명 / Full name' });
      var fPw2 = h('input', { type: 'password', id: 'authPw2', autocomplete: 'new-password', placeholder: '비밀번호 확인 / Confirm' });
      root.appendChild(group('본명 / Full name', fName));
      root.appendChild(group('아이디 / ID (영문 소문자·숫자·_ 4~20)', fId));
      root.appendChild(group('비밀번호 / Password', fPw));
      root.appendChild(group('비밀번호 확인 / Confirm password', fPw2));
      root.appendChild(h('div', { class: 'auth-note', text: '신청 후 관리자 승인이 완료되어야 이용할 수 있습니다. / You can sign in after approval.' }));
      root.appendChild(h('button', { type: 'button', class: 'btn-primary', id: 'authSubmit', text: '가입 신청 / Request access', onclick: A.submitRegister }));
      [fName, fId, fPw, fPw2].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') A.submitRegister(); }); });
    } else {
      root.appendChild(group('아이디 / ID', fId));
      root.appendChild(group('비밀번호 / Password', fPw));
      root.appendChild(h('button', { type: 'button', class: 'btn-primary', id: 'authSubmit', text: '로그인 / Sign in', onclick: A.submitLogin }));
      [fId, fPw].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') A.submitLogin(); }); });
    }
    root.appendChild(h('div', { class: 'auth-msg', id: 'authMsg' }));
  };

  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  A.submitRegister = async function () {
    var name = val('authName').trim(), id = val('authId').trim().toLowerCase(), pw = val('authPw'), pw2 = val('authPw2');
    if (!name || !id || !pw) return A.msg('모든 항목을 입력하세요 / Fill in all fields', 'err');
    if (!/^[a-z0-9_]{4,20}$/.test(id)) return A.msg('아이디는 영문 소문자·숫자·밑줄 4~20자입니다 / ID: 4-20 chars (a-z, 0-9, _)', 'err');
    if (pw.length < 8) return A.msg('비밀번호는 8자 이상이어야 합니다 / Password must be 8+ characters', 'err');
    if (pw.toLowerCase().indexOf(id) !== -1) return A.msg('비밀번호에 아이디를 포함할 수 없습니다 / Password must not contain the ID', 'err');
    if (pw !== pw2) return A.msg('비밀번호 확인이 일치하지 않습니다 / Passwords do not match', 'err');
    busy(true, '신청 중...');
    try {
      var r = await api({ action: 'register', name: name, id: id, password: await A.pre(id, pw) });
      busy(false);
      if (r && r.ok) {
        A.showLogin('login');
        var idEl = document.getElementById('authId'); if (idEl) idEl.value = id;
        A.msg('가입 신청이 접수되었습니다. 승인 후 로그인할 수 있습니다. / Request received. Sign in after approval.', 'ok');
      } else A.msg((r && r.error) || '신청 실패 / Failed', 'err');
    } catch (e) { busy(false); A.msg(String(e.message || e), 'err'); }
  };

  A.submitLogin = async function () {
    var id = val('authId').trim().toLowerCase(), pw = val('authPw');
    if (!id || !pw) return A.msg('아이디와 비밀번호를 입력하세요 / Enter ID and password', 'err');
    busy(true, '인증 중...');
    try {
      var r = await api({ action: 'login', id: id, password: await A.pre(id, pw) });
      busy(false);
      if (r && r.ok) {
        var pwEl = document.getElementById('authPw'); if (pwEl) pwEl.value = '';
        A.apply(r, r.token, new Date(r.expiresAt).getTime());
      } else if (r && r.code === 'PENDING') A.msg(r.error + ' / Waiting for approval', 'info');
      else A.msg((r && r.error) || '로그인 실패 / Sign-in failed', 'err');
    } catch (e) { busy(false); A.msg(String(e.message || e), 'err'); }
  };

  /* ── 로그인 성공 처리: 기존 submitLogin 과 동일한 상태 세팅 ── */
  A.apply = function (r, token, expMs) {
    A.st = { token: token, exp: expMs, id: r.id || '', name: r.name, role: r.role, isOwner: !!r.isOwner };
    lsSet({ token: token, exp: expMs });
    S.role = r.role; S.name = r.name;
    S.isInspector = !!r.isInspector; S.maidPasswordSet = true; S.lang = r.lang || '';
    ssSet('hk_role', r.role); ssSet('hk_name', r.name);
    ssSet('hk_inspector', r.isInspector ? '1' : '0'); ssSet('hk_maid_pwset', '1');
    if (r.role === 'maid') ssSet('hk_maid_lang', S.lang);
    A.pending = r.pendingCount || 0;
    go();
    A.mount();
  };

  /* ── 앱 시작 시: 저장된 토큰 검증 후 복귀 ── */
  A.restore = async function () {
    injectCss();
    A.showLogin('login');
    var o = lsGet();
    if (!(o && o.token && o.exp > Date.now())) { lsDel(); return; }
    A.st.token = o.token;
    busy(true, '인증 확인 중...');
    var r;
    try { r = await api({ action: 'me' }); } catch (e) { r = { ok: false, error: String(e) }; }
    busy(false);
    if (r && r.ok) { A.apply(r, o.token, o.exp); return; }
    A.st.token = '';
    if (r && r.code === 'AUTH_REQUIRED') { lsDel(); return; }
    A.msg('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요 / Cannot reach server', 'err');
  };
  A.initLogin = function () { /* 구 로그인 카드 로딩 대체: 복원 로직이 화면을 그린다 */ };

  /* ── 계정 버튼 / 패널 ── */
  A.mount = function () {
    injectCss();
    var fab = document.getElementById('authFab');
    if (!fab) {
      fab = h('button', { id: 'authFab', type: 'button', title: '내 계정 / My account', onclick: A.openPanel });
      document.body.appendChild(fab);
    }
    fab.style.display = 'flex';
    A.renderFab();
    if (pollTimer) clearInterval(pollTimer);
    if (A.st.isOwner) {
      pollTimer = setInterval(async function () {
        if (!A.st.token) return;
        var r = await api({ action: 'me' });
        if (r && r.ok) { A.pending = r.pendingCount || 0; A.renderFab(); }
      }, 60000);
    }
  };
  A.unmount = function () {
    var fab = document.getElementById('authFab'); if (fab) fab.style.display = 'none';
    var pn = document.getElementById('authPanel'); if (pn) pn.classList.remove('open');
  };
  A.renderFab = function () {
    var fab = document.getElementById('authFab'); if (!fab) return;
    fab.textContent = '👤';
    if (A.st.isOwner && A.pending > 0) fab.appendChild(h('span', { class: 'bd', text: String(A.pending) }));
  };

  A.openPanel = function () {
    var pn = document.getElementById('authPanel');
    if (!pn) {
      pn = h('div', { id: 'authPanel', onclick: function (e) { if (e.target === pn) pn.classList.remove('open'); } });
      document.body.appendChild(pn);
    }
    pn.classList.add('open');
    A.renderPanel(A.st.isOwner ? 'pending' : 'me');
  };

  function roleLabel(role) { return role === 'owner' ? '보스 / Owner' : role === 'admin' ? '관리자 / Admin' : role === 'maid' ? '메이드 / Maid' : '-'; }
  function statusLabel(s) { return { pending: '승인 대기', active: '사용 중', rejected: '거절됨', disabled: '중지됨' }[s] || s; }

  A.renderPanel = async function (tab) {
    var pn = document.getElementById('authPanel'); if (!pn) return;
    pn.textContent = '';
    var sheet = h('div', { class: 'auth-sheet' });
    pn.appendChild(sheet);
    sheet.appendChild(h('h3', { text: A.st.name || '계정' }));
    sheet.appendChild(h('div', { class: 'auth-sub', text: roleLabel(A.st.isOwner ? 'owner' : A.st.role) + (A.st.id ? '  ·  ' + A.st.id : '') }));

    if (A.st.isOwner) {
      var tabs = h('div', { class: 'auth-tabs' }, [
        h('button', { type: 'button', class: 'auth-tab' + (tab === 'pending' ? ' on' : ''), text: '승인 대기' + (A.pending ? ' (' + A.pending + ')' : ''), onclick: function () { A.renderPanel('pending'); } }),
        h('button', { type: 'button', class: 'auth-tab' + (tab === 'all' ? ' on' : ''), text: '전체 계정', onclick: function () { A.renderPanel('all'); } }),
        h('button', { type: 'button', class: 'auth-tab' + (tab === 'me' ? ' on' : ''), text: '내 계정', onclick: function () { A.renderPanel('me'); } })
      ]);
      sheet.appendChild(tabs);
    }

    if (tab === 'me') A.renderMe(sheet);
    else await A.renderAccounts(sheet, tab);

    sheet.appendChild(h('div', { style: 'height:10px' }));
    sheet.appendChild(h('button', { type: 'button', class: 'auth-btn', text: '닫기 / Close', onclick: function () { pn.classList.remove('open'); } }));
  };

  A.renderMe = function (sheet) {
    var o = h('input', { type: 'password', id: 'cpOld', autocomplete: 'current-password', placeholder: '현재 비밀번호 / Current' });
    var n1 = h('input', { type: 'password', id: 'cpNew', autocomplete: 'new-password', placeholder: '새 비밀번호 (8자 이상) / New' });
    var n2 = h('input', { type: 'password', id: 'cpNew2', autocomplete: 'new-password', placeholder: '새 비밀번호 확인 / Confirm' });
    var msg = h('div', { class: 'auth-msg', id: 'cpMsg' });
    var btn = h('button', { type: 'button', class: 'auth-btn pri', text: '비밀번호 변경 / Change password', onclick: async function () {
      var set = function (t, k) { msg.className = 'auth-msg ' + k; msg.textContent = t; };
      if (n1.value.length < 8) return set('새 비밀번호는 8자 이상이어야 합니다', 'err');
      if (n1.value.toLowerCase().indexOf(A.st.id) !== -1) return set('비밀번호에 아이디를 포함할 수 없습니다', 'err');
      if (n1.value !== n2.value) return set('새 비밀번호 확인이 일치하지 않습니다', 'err');
      busy(true);
      try {
        var r = await api({ action: 'changePassword', oldPassword: await A.pre(A.st.id, o.value), newPassword: await A.pre(A.st.id, n1.value) });
        busy(false);
        if (r && r.ok) { o.value = n1.value = n2.value = ''; set('변경되었습니다. 다른 기기는 로그아웃됩니다', 'ok'); }
        else set((r && r.error) || '변경 실패', 'err');
      } catch (e) { busy(false); set(String(e.message || e), 'err'); }
    } });
    sheet.appendChild(h('div', { class: 'auth-sec', text: '비밀번호 변경' }));
    [o, n1, n2].forEach(function (el) { el.style.cssText = 'display:block;width:100%;margin-bottom:8px;box-sizing:border-box'; sheet.appendChild(el); });
    sheet.appendChild(btn);
    sheet.appendChild(msg);
    sheet.appendChild(h('div', { class: 'auth-sec', text: '이 계정으로 로그인된 모든 기기에서 로그아웃' }));
    sheet.appendChild(h('button', { type: 'button', class: 'auth-btn dng', text: '로그아웃 / Sign out', onclick: function () { document.getElementById('authPanel').classList.remove('open'); logout(); } }));
  };

  A.renderAccounts = async function (sheet, tab) {
    var holder = h('div', { text: '불러오는 중...' });
    sheet.appendChild(holder);
    var r = await api({ action: 'listAccounts' });
    holder.textContent = '';
    if (!(r && r.ok)) { holder.textContent = (r && r.error) || '불러오기 실패'; return; }
    var list = r.accounts || [];
    A.pending = list.filter(function (x) { return x.status === 'pending'; }).length;
    A.renderFab();

    var rows = tab === 'pending' ? list.filter(function (x) { return x.status === 'pending'; }) : list;
    if (!rows.length) holder.appendChild(h('div', { class: 'auth-sub', text: tab === 'pending' ? '승인 대기 중인 신청이 없습니다.' : '계정이 없습니다.' }));

    rows.forEach(function (a) {
      var row = h('div', { class: 'auth-row' });
      row.appendChild(h('div', { class: 't', text: a.name + '  (' + a.id + ')' }));
      row.appendChild(h('div', { class: 's', text: statusLabel(a.status) + (a.role ? ' · ' + roleLabel(a.role) : '') + (a.createdAt ? ' · 신청 ' + a.createdAt.slice(0, 16).replace('T', ' ') : '') + (a.lastLogin ? ' · 최근 ' + a.lastLogin.slice(0, 16).replace('T', ' ') : '') }));
      var ctl = h('div', { class: 'ctl' });
      var done = function (r2, okMsg) { if (r2 && r2.ok) A.renderPanel(tab); else alert((r2 && r2.error) || '실패'); };

      if (a.status === 'pending' || a.status === 'rejected') {
        var sel = h('select', {}, [h('option', { value: 'maid', text: '메이드 / Maid' }), h('option', { value: 'admin', text: '관리자 / Admin' })]);
        var mk = h('input', { type: 'text', placeholder: '메이드 표시명', value: a.name.toLowerCase().replace(/\s+/g, ''), maxlength: '20', style: 'width:130px' });
        sel.addEventListener('change', function () { mk.style.display = sel.value === 'maid' ? '' : 'none'; });
        ctl.appendChild(sel); ctl.appendChild(mk);
        ctl.appendChild(h('button', { type: 'button', class: 'auth-btn pri', text: '승인', onclick: async function () {
          if (!confirm(a.name + ' (' + a.id + ') 님을 ' + (sel.value === 'maid' ? '메이드' : '관리자') + '로 승인합니까?\n본인 확인이 끝난 신청만 승인하세요.')) return;
          done(await api({ action: 'approveAccount', id: a.id, role: sel.value, maidName: mk.value }));
        } }));
        if (a.status === 'pending') ctl.appendChild(h('button', { type: 'button', class: 'auth-btn dng', text: '거절', onclick: async function () {
          if (confirm(a.name + ' 신청을 거절합니까?')) done(await api({ action: 'rejectAccount', id: a.id }));
        } }));
      } else if (a.role !== 'owner') {
        if (a.status === 'active') ctl.appendChild(h('button', { type: 'button', class: 'auth-btn dng', text: '사용 중지', onclick: async function () {
          if (confirm(a.name + ' 계정을 중지합니까? 모든 기기에서 즉시 로그아웃됩니다.')) done(await api({ action: 'setAccountStatus', id: a.id, status: 'disabled' }));
        } }));
        if (a.status === 'disabled') ctl.appendChild(h('button', { type: 'button', class: 'auth-btn', text: '다시 사용', onclick: async function () {
          done(await api({ action: 'setAccountStatus', id: a.id, status: 'active' }));
        } }));
        if (a.status === 'active') {
          ctl.appendChild(h('button', { type: 'button', class: 'auth-btn', text: '임시 비밀번호', onclick: async function () {
            var t = prompt(a.name + ' 님의 임시 비밀번호 (8자 이상). 본인에게 직접 전달 후 변경하도록 안내하세요.');
            if (!t) return;
            if (t.length < 8 || t.toLowerCase().indexOf(a.id) !== -1) return alert('8자 이상이며 아이디를 포함하지 않아야 합니다');
            done(await api({ action: 'resetAccountPassword', id: a.id, newPassword: await A.pre(a.id, t) }));
          } }));
          var other = a.role === 'maid' ? 'admin' : 'maid';
          ctl.appendChild(h('button', { type: 'button', class: 'auth-btn', text: other === 'admin' ? '관리자로 변경' : '메이드로 변경', onclick: async function () {
            if (confirm(a.name + ' 의 역할을 ' + (other === 'admin' ? '관리자' : '메이드') + '로 변경합니까?')) done(await api({ action: 'setAccountRole', id: a.id, role: other }));
          } }));
        }
      }
      row.appendChild(ctl);
      holder.appendChild(row);
    });
  };
})();
