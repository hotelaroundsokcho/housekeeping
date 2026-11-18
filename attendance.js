/* attendance.js — 메이드 출근·점심 게이트 (정비앱 M1 · DEV 초안 2026-11-17)
 * 흐름: 로그인(메이드) → [1 출근] → [2 점심] → [3 정비 시작]
 * 의존: app.js 의 전역 api(), S, curLang(), logout()  (app.js 다음에 로드)
 * 서버: Attendance.gs 의 attStatus / attCheckIn / attSetLunch
 * 정책: 출근 기록이 '서버 오류'로 실패해도 정비 업무를 막지 않는다 (나중에 / Later 허용).
 *       단, '아직 출근하지 않음' 상태는 건너뛸 수 없다.
 */
(function () {
  'use strict';

  var DEV_KEY = 'hk_dev';
  var TXT = {
    ko: { title: '오늘 근무', s1: '출근', s2: '점심', s3: '정비 시작', btnIn: '출근하기', checking: '확인 중…', done: '출근 완료', at: '출근 시각',
      lunchQ: '오늘 점심을 드시나요?', yes: '먹어요', no: '안 먹어요', lunchSet: '점심: 먹어요', lunchNo: '점심: 안 먹어요', lunchNone: '아직 선택하지 않았어요',
      deadline: '점심 선택은 13:00까지 바꿀 수 있어요', lateWarn: '13:00 이후라 점심은 \'안 먹어요\'로 기록됩니다', locked: '점심 선택이 마감되었어요 (13:00)',
      start: '정비 시작하기', later: '나중에 하고 정비 시작', retry: '다시 시도', out: '로그아웃',
      errNet: '출근 기록 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', errMap: '출근 명단에 연결되지 않은 계정이에요. 총지배인에게 알려 주세요.', errGen: '처리하지 못했어요. 다시 시도해 주세요.', already: '이미 출근 처리되어 있어요' },
    en: { title: 'Today\'s shift', s1: 'Check in', s2: 'Lunch', s3: 'Start work', btnIn: 'Check in', checking: 'Checking…', done: 'Checked in', at: 'Checked in at',
      lunchQ: 'Will you have lunch today?', yes: 'Yes', no: 'No', lunchSet: 'Lunch: Yes', lunchNo: 'Lunch: No', lunchNone: 'Not chosen yet',
      deadline: 'You can change lunch until 13:00', lateWarn: 'After 13:00, lunch is recorded as "No"', locked: 'Lunch choice is closed (13:00)',
      start: 'Start work', later: 'Later — start work', retry: 'Try again', out: 'Sign out',
      errNet: 'Could not reach the attendance server. Please try again shortly.', errMap: 'This account is not linked to the attendance roster. Please tell the General Manager.', errGen: 'Something went wrong. Please try again.', already: 'Already checked in' },
    /* 몽골어: 현장 확인 필요 (검수 전 초안) */
    mn: { title: 'Өнөөдрийн ажил', s1: 'Ирц', s2: 'Үдийн хоол', s3: 'Ажил эхлэх', btnIn: 'Ирлээ', checking: 'Шалгаж байна…', done: 'Ирц бүртгэгдлээ', at: 'Ирсэн цаг',
      lunchQ: 'Өнөөдөр үдийн хоол идэх үү?', yes: 'Идэнэ', no: 'Идэхгүй', lunchSet: 'Үдийн хоол: Идэнэ', lunchNo: 'Үдийн хоол: Идэхгүй', lunchNone: 'Сонгоогүй байна',
      deadline: 'Үдийн хоолыг 13:00 хүртэл өөрчилж болно', lateWarn: '13:00-ээс хойш үдийн хоол «Идэхгүй» гэж бүртгэгдэнэ', locked: 'Үдийн хоолын сонголт хаагдсан (13:00)',
      start: 'Ажил эхлэх', later: 'Дараа нь — ажил эхлэх', retry: 'Дахин оролдох', out: 'Гарах',
      errNet: 'Ирцийн сервертэй холбогдож чадсангүй. Дахин оролдоно уу.', errMap: 'Энэ бүртгэл ирцийн жагсаалттай холбогдоогүй байна. Ерөнхий менежерт мэдэгдээрэй.', errGen: 'Алдаа гарлаа. Дахин оролдоно уу.', already: 'Ирц аль хэдийн бүртгэгдсэн' }
  };

  var inflight = null;

  function L() { var k = 'ko'; try { k = (typeof curLang === 'function' && TXT[curLang()]) ? curLang() : 'ko'; } catch (e) {} return TXT[k]; }
  function bi(key) { // 한·영 병기 (몽골어 사용자는 몽골어 + 영어)
    var k = 'ko'; try { k = (typeof curLang === 'function' && TXT[curLang()]) ? curLang() : 'ko'; } catch (e) {}
    var a = TXT[k][key], b = TXT.en[key];
    return (k === 'en' || a === b) ? a : a + ' / ' + b;
  }

  /* ── 기기 식별자: 감사용 익명 ID (기기 바인딩 아님 — 로그인 허용/차단에 사용하지 않음) ── */
  function deviceId() {
    try {
      var v = localStorage.getItem(DEV_KEY);
      if (v && /^[A-Za-z0-9_\-]{8,64}$/.test(v)) return v;
      var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
      v = 'd' + Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      localStorage.setItem(DEV_KEY, v); return v;
    } catch (e) { return ''; }
  }
  function call(action, extra) {
    var p = { action: action, deviceId: deviceId(), ua: String(navigator.userAgent || '').slice(0, 120) };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) p[k] = extra[k];
    return api(p); // api() 가 토큰을 붙인다. 이름/ID 는 보내지 않는다(서버가 토큰으로 확정)
  }

  /* ── 스타일 (한 번만 주입) ── */
  function css() {
    if (document.getElementById('attCss')) return;
    var s = document.createElement('style'); s.id = 'attCss';
    s.textContent =
      '#attGate{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;background:#0b1118;color:#e8eef5;font-family:inherit;overflow:auto}' +
      '#attGate .att-card{width:100%;max-width:420px}' +
      '#attGate h2{margin:0 0 4px;font-size:20px;font-weight:600;letter-spacing:.01em}' +
      '#attGate .att-sub{margin:0 0 22px;color:#8fa3b8;font-size:13px}' +
      '#attGate .att-steps{display:flex;gap:6px;margin:0 0 26px;padding:0;list-style:none}' +
      '#attGate .att-steps li{flex:1;padding-top:8px;border-top:2px solid #26384b;font-size:12px;color:#6f8498}' +
      '#attGate .att-steps li.on{border-color:#7fd1c7;color:#e8eef5}' +
      '#attGate .att-steps li.ok{border-color:#3d6f69;color:#8fb7b2}' +
      '#attGate .att-btn{display:block;width:100%;min-height:52px;margin:0 0 10px;padding:12px 16px;border:1px solid #2c4054;border-radius:12px;background:#142130;color:#e8eef5;font:inherit;font-size:16px;cursor:pointer}' +
      '#attGate .att-btn:focus-visible{outline:3px solid #7fd1c7;outline-offset:2px}' +
      '#attGate .att-btn.pri{background:#7fd1c7;border-color:#7fd1c7;color:#08211e;font-weight:600}' +
      '#attGate .att-btn.sel{border-color:#7fd1c7;box-shadow:inset 0 0 0 1px #7fd1c7}' +
      '#attGate .att-btn:disabled{opacity:.55;cursor:default}' +
      '#attGate .att-row{display:flex;gap:10px}#attGate .att-row .att-btn{flex:1}' +
      '#attGate .att-note{margin:4px 0 14px;color:#8fa3b8;font-size:13px;line-height:1.5}' +
      '#attGate .att-warn{color:#f0c987}' +
      '#attGate .att-err{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#2a1c1c;color:#f3b9b9;font-size:14px;line-height:1.5}' +
      '#attGate .att-link{background:none;border:0;color:#8fa3b8;font:inherit;font-size:13px;text-decoration:underline;padding:10px 0;cursor:pointer}' +
      '#attGate .att-in{display:block;width:100%;min-height:96px;margin:0 0 14px;border-radius:16px;border:1px solid #7fd1c7;color:#08211e;font:inherit;font-size:20px;font-weight:600;cursor:pointer;' +
        'background:linear-gradient(100deg,#7fd1c7 0%,#7fd1c7 40%,#b9efe8 50%,#7fd1c7 60%,#7fd1c7 100%);background-size:240% 100%;animation:attSweep 5.5s ease-in-out infinite}' +
      '#attGate .att-in:disabled{animation:none;opacity:.6}' +
      '#attGate .att-in:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
      '@keyframes attSweep{0%,100%{background-position:100% 0}50%{background-position:0 0}}' +
      '@media (prefers-reduced-motion:reduce){#attGate .att-in{animation:none}}';
    document.head.appendChild(s);
  }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'onclick') e.addEventListener('click', attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function errText(r) {
    if (!r) return bi('errGen');
    if (r.code === 'ATT_NOT_MAPPED' || r.code === 'ATT_MAID_INACTIVE') return bi('errMap');
    if (r.code === 'ATT_UNAVAILABLE' || /Failed to fetch|NetworkError|timeout/i.test(String(r.error || ''))) return bi('errNet');
    return bi('errGen');
  }
  function isSoftFail(r) { // 서버 쪽 문제: 정비 업무를 막지 않는다
    return !!r && !r.ok && r.code !== 'AUTH_REQUIRED' && r.code !== 'NOT_CHECKED_IN' && r.code !== 'LUNCH_LOCKED' && r.code !== 'ALREADY_CHECKED_IN' && r.code !== 'BAD_LUNCH';
  }

  /* ── 게이트 ── */
  function gate() {
    if (inflight) return inflight;
    inflight = new Promise(function (resolve) {
      css();
      var root = el('div', { id: 'attGate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'attTitle' });
      document.body.appendChild(root);
      var st = null, err = '', busy = false, softFail = false, closed = false;

      function close(val) { // 게이트 제거 + 상태 초기화 (한 번만)
        if (closed) return;
        closed = true;
        if (root.parentNode) root.parentNode.removeChild(root);
        inflight = null;
        resolve(val);
      }
      /* '정비 시작'/'나중에'. app.js go() 는 null 을 "로그아웃·인증 상실"로 보고 중단하므로,
         상태를 한 번도 못 받은 채 '나중에'를 눌러도 null 이 아닌 값을 돌려준다. */
      function finish() { close(st || { ok: false, later: true }); }
      /* 인증 오류: api() 가 이미 세션 정리·로그인 화면 전환(AUTH.denied)을 했다.
         게이트만 걷어내고 null 로 끝낸다 (app.js go() 는 null 이면 진행하지 않음). 여기서 logout() 을 다시 부르지 않는다. */
      function authLost(r) { if (r && r.code === 'AUTH_REQUIRED') { close(null); return true; } return false; }

      function step() { // 1 출근 전 / 2 점심 미선택 / 3 완료
        if (!st || !st.checkedIn) return 1;
        if (st.lunch === '' && !st.lunchLocked) return 2;
        return 3;
      }

      function render() {
        var t = L(), n = step();
        root.textContent = '';
        var card = el('div', { class: 'att-card' });
        card.appendChild(el('h2', { id: 'attTitle', text: bi('title') }));
        card.appendChild(el('p', { class: 'att-sub', text: (typeof S !== 'undefined' && S.name ? S.name : '') + (st && st.date ? ' · ' + st.date : '') }));

        var ol = el('ol', { class: 'att-steps' });
        [['s1', 1], ['s2', 2], ['s3', 3]].forEach(function (x) {
          ol.appendChild(el('li', { class: x[1] < n ? 'ok' : (x[1] === n ? 'on' : ''), text: x[1] + '. ' + bi(x[0]) }));
        });
        card.appendChild(ol);

        if (err) card.appendChild(el('div', { class: 'att-err', role: 'alert', text: err }));

        if (!st) { // 상태 조회 중이거나, 못 받은 경우 (서버 오류)
          if (busy) card.appendChild(el('p', { class: 'att-note', role: 'status', text: bi('checking') }));
          card.appendChild(el('button', { class: 'att-btn pri', type: 'button', text: bi('retry'), onclick: load, disabled: busy ? 'disabled' : null }));
          if (softFail && !busy) card.appendChild(el('button', { class: 'att-btn', type: 'button', text: bi('later'), onclick: finish }));
        } else if (n === 1) {
          var late = st.lunchLocked;
          card.appendChild(el('button', { id: 'attInBtn', class: 'att-in', type: 'button', text: busy ? bi('checking') : bi('btnIn'), onclick: doCheckIn, disabled: busy ? 'disabled' : null }));
          card.appendChild(el('p', { class: 'att-note' + (late ? ' att-warn' : ''), text: late ? bi('lateWarn') : bi('deadline') }));
          if (softFail) card.appendChild(el('button', { class: 'att-link', type: 'button', text: bi('later'), onclick: finish }));
        } else if (n === 2) {
          card.appendChild(el('p', { class: 'att-note', text: bi('done') + ' · ' + t.at + ' ' + st.checkInTime }));
          card.appendChild(el('p', { class: 'att-note', style: 'color:#e8eef5;font-size:16px', text: bi('lunchQ') }));
          var row = el('div', { class: 'att-row' });
          row.appendChild(el('button', { class: 'att-btn', type: 'button', text: bi('yes'), onclick: function () { setLunch('Y'); }, disabled: busy ? 'disabled' : null }));
          row.appendChild(el('button', { class: 'att-btn', type: 'button', text: bi('no'), onclick: function () { setLunch('N'); }, disabled: busy ? 'disabled' : null }));
          card.appendChild(row);
          card.appendChild(el('p', { class: 'att-note', role: busy ? 'status' : null, text: busy ? bi('checking') : bi('deadline') }));
          card.appendChild(el('button', { class: 'att-link', type: 'button', text: bi('start'), onclick: finish }));
        } else {
          card.appendChild(el('p', { class: 'att-note', text: bi('done') + ' · ' + t.at + ' ' + st.checkInTime }));
          var ltxt = st.lunch === 'Y' ? bi('lunchSet') : st.lunch === 'N' ? bi('lunchNo') : bi('lunchNone');
          card.appendChild(el('p', { class: 'att-note', style: 'color:#e8eef5;font-size:16px', text: ltxt }));
          if (st.lunchLocked) card.appendChild(el('p', { class: 'att-note', text: bi('locked') }));
          card.appendChild(el('button', { id: 'attGo', class: 'att-btn pri', type: 'button', text: bi('start'), onclick: finish }));
        }
        card.appendChild(el('button', { class: 'att-link', type: 'button', text: bi('out'), onclick: function () { close(null); try { logout(); } catch (e) {} } }));
        root.appendChild(card);
        var f = root.querySelector('#attInBtn:not(:disabled)') || root.querySelector('#attGo') || root.querySelector('button:not(:disabled)');
        if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
      }

      function apply(r) {
        if (r && r.ok) { st = r; err = ''; softFail = false; return true; }
        if (r && (r.code === 'ALREADY_CHECKED_IN' || r.code === 'LUNCH_LOCKED') && r.checkedIn !== undefined) { st = r; err = r.code === 'ALREADY_CHECKED_IN' ? bi('already') : bi('locked'); softFail = false; return true; }
        err = errText(r); softFail = isSoftFail(r);
        return false;
      }
      async function load() {
        if (busy) return;
        busy = true; err = ''; render();
        var r = await call('attStatus', {});
        busy = false;
        if (closed) return;            // 조회 중 로그아웃 등으로 이미 닫힘
        if (authLost(r)) return;
        apply(r); render();
      }
      async function doCheckIn() {
        if (busy) return;
        busy = true; render();
        var r = await call('attCheckIn', {});
        busy = false;
        if (closed) return;
        if (authLost(r)) return;
        apply(r); render();
      }
      async function setLunch(v) {
        if (busy) return;
        busy = true; render();
        var r = await call('attSetLunch', { lunch: v });
        busy = false;
        if (closed) return;
        if (authLost(r)) return;
        apply(r); render();
      }

      render();
      load();
    });
    return inflight;
  }

  window.ATT = { gate: gate, deviceId: deviceId };
})();
