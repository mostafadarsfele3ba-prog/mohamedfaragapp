/* الواجهة: الشاشات + التنقل + الأحداث */
(() => {
  const L = window.Logic, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const norm = s => String(s || '').replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
  const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const fmtFull = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const PKEY = 'tapp_parent_code';
  const ST = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر' };
  const ST_SHORT = { present: 'ح', absent: 'غ', late: 'ت', excused: 'ع' };
  const FU = { new: 'جديد', notified: 'تم الإبلاغ', replied: 'ولي الأمر رد', attended: 'حضر', resolved: 'تم الحل' };
  const NAV = [['', '🏠', 'الرئيسية'], ['attendance', '✅', 'الحضور'], ['students', '🎓', 'الطلاب'], ['incidents', '⚠️', 'الإنذارات'], ['more', '☰', 'المزيد']];
  const MORE_ROUTES = ['more', 'groups', 'group', 'class', 'homework', 'hw', 'exams', 'exam', 'schedule', 'reports', 'stats', 'tools', 'lessons', 'settings'];
  const SUB = { done: 'سلّم', missing: 'لم يسلّم', late: 'متأخر', excused: 'بعذر' };
  const SUB_SHORT = { done: '✓', missing: '✗', late: 'ت', excused: 'ع' };
  const SUBCLS = { done: 'present', missing: 'absent', late: 'late', excused: 'excused' };
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const WEEK = [6, 0, 1, 2, 3, 4, 5]; // الأسبوع يبدأ السبت
  const TPL_FB = {
    homework: 'السلام عليكم {اسم_ولي_الأمر}،\nنحيطكم علماً بأن الطالب/ة {اسم_الطالب} لم يسلّم واجب ({الواجب}) المطلوب بتاريخ {التاريخ}.\nنرجو المتابعة.\n{اسم_المدرس} - {المادة}',
    grade: 'السلام عليكم {اسم_ولي_الأمر}،\nدرجة الطالب/ة {اسم_الطالب} في ({الاختبار}) بتاريخ {التاريخ}: {الدرجة} من {النهائية}.\n{اسم_المدرس} - {المادة}'
  };
  const state = { sel: {}, bulkOpen: false, q: {}, search: '', pickQ: '', draft: {}, openSec: '', modal: null, showSetup: false, parent: null, sugg: [], route: '', tools: { used: {}, current: '', skipAbsent: true, n: 4, split: null, timer: { total: 300, left: 300, running: false, end: 0 } } };

  // ───────── بيانات مساعدة ─────────
  const P = () => {
    const prof = (Store.token() && Store.setting('profile')) || (state.parent && state.parent.data && state.parent.data.settings.profile) || {};
    const o = Object.assign({}, CONFIG);
    Object.keys(prof).forEach(k => { if (prof[k]) o[k] = prof[k]; });
    return o;
  };
  let cVer = -1, C = {}, I = {};
  function cache() {
    if (cVer !== Store.version) {
      const by = list => { const m = new Map(); list.forEach(r => { if (!m.has(r.studentId)) m.set(r.studentId, []); m.get(r.studentId).push(r); }); return m; };
      const as = new Map(Store.list('Assignments').map(a => [a.id, a]));
      const ex = new Map(Store.list('Exams').map(x => [x.id, x]));
      const subs = Store.list('Submissions').filter(x => as.has(x.assignmentId)).map(x => Object.assign({}, x, { date: as.get(x.assignmentId).dueDate }));
      const grds = Store.list('Grades').filter(x => ex.has(x.examId)).map(x => { const e = ex.get(x.examId); return Object.assign({}, x, { date: e.date, max: e.maxScore, pct: x.status === 'absent' ? null : L.pct(x.score, e.maxScore) }); });
      I = { att: by(Store.list('Attendance')), inc: by(Store.list('Incidents')), pr: by(Store.list('Praise')), sub: by(subs), grd: by(grds), as, ex };
      C = {}; ['levels', 'reasons', 'reset', 'rules', 'templates', 'dismissed', 'grading'].forEach(k => C[k] = Store.setting(k));
      cVer = Store.version;
    }
  }
  const ix = () => (cache(), I);
  const S = () => (cache(), C);
  const byName = (a, b) => a.name.localeCompare(b.name, 'ar');
  const groups = () => Store.list('Groups').sort((a, b) => (+a.sortOrder || 0) - (+b.sortOrder || 0) || byName(a, b));
  const students = (gid, arch) => Store.list('Students').filter(s => (!gid || s.groupId === gid) && (arch ? s.status === 'archived' : s.status !== 'archived')).sort(byName);
  const gName = id => (Store.get('Groups', id) || {}).name || '—';
  const level = id => (S().levels || []).find(l => l.id === id);
  const reason = id => (S().reasons || []).find(r => r.id === id);
  const lvBadge = (lv, extra) => lv ? `<span class="lv" style="--c:${esc(lv.color || '#64748b')}">${esc(lv.name)}${extra || ''}</span>` : '';
  const empty = (t, sub) => `<div class="empty"><div>📭</div><b>${esc(t)}</b>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const attId = (sid, d) => 'a_' + sid + '_' + d;
  const subId = (aid, sid) => 's_' + aid + '_' + sid;
  const gradeId = (eid, sid) => 'g_' + eid + '_' + sid;
  // ── الحصص وتسجيلاتها ──
  const recId = (cid, sid) => 'r_' + cid + '_' + sid;
  const rec = (cid, sid) => Store.get('Records', recId(cid, sid));
  const classesOf = gid => Store.list('Classes').filter(c => !gid || c.groupId === gid).sort((a, b) => b.date.localeCompare(a.date) || Number(b.createdAt) - Number(a.createdAt));
  const clsTitle = c => c.title ? c.title : 'حصة ' + fmtDate(c.date);
  const defFee = c => (c && c.fee) || ((Store.get('Groups', c && c.groupId) || {}).fee) || '';
  const money = v => (Number(v) || 0).toLocaleString('en-US') + ' ج';
  const frac = (a, b) => `<bdi dir="ltr">${esc(a)}${b ? ' / ' + esc(b) : ''}</bdi>`;
  const enNum = s => String(s ?? '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٫,]/g, '.').trim();
  const ATT2 = { present: 'حاضر', late: 'حضر متأخراً', absent: 'غائب' };
  const HW3 = { done: 'حل كامل', partial: 'حل ناقص', missing: 'لم يحل' };
  function recSummary(recs, maxOf) {
    const s = { present: 0, late: 0, absent: 0, done: 0, partial: 0, missing: 0, notTaken: 0, paidN: 0, unpaidN: 0, paidSum: 0, scoreN: 0, pctSum: 0, pctN: 0, scoreSum: 0 };
    recs.forEach(r => {
      if (r.attendance === 'present') s.present++; else if (r.attendance === 'late') s.late++; else if (r.attendance === 'absent') s.absent++;
      if (r.homework === 'done') s.done++; else if (r.homework === 'partial') s.partial++; else if (r.homework === 'missing') s.missing++;
      if (r.examStatus === 'notTaken') s.notTaken++;
      if (r.paid === '1') { s.paidN++; s.paidSum += Number(r.amount) || 0; } else if (r.paid === '0') s.unpaidN++;
      if (r.score !== '' && r.score != null) { s.scoreN++; s.scoreSum += Number(r.score) || 0; const m = Number(maxOf(r)); if (m > 0) { s.pctN++; s.pctSum += (Number(r.score) || 0) * 100 / m; } }
    });
    const rate = (a, b) => a + b ? Math.round(a * 100 / (a + b)) : null;
    s.attRate = rate(s.present + s.late, s.absent); s.hwRate = s.done + s.partial + s.missing ? Math.round((s.done + s.partial / 2) * 100 / (s.done + s.partial + s.missing)) : null;
    s.avgPct = s.pctN ? Math.round(s.pctSum / s.pctN) : null;
    s.avg = s.scoreN ? Math.round(s.scoreSum * 10 / s.scoreN) / 10 : null;
    return s;
  }
  const recStats = sm => `<div class="stats">
      <div class="stat"><b>${pctTxt(sm.attRate)}</b><span>حضور الحصص · ${sm.late} تأخير · ${sm.absent} غياب</span></div>
      <div class="stat"><b>${pctTxt(sm.hwRate)}</b><span>حل الواجب · ${sm.done} كامل · ${sm.partial} ناقص · ${sm.missing} لم يحل</span></div>
      <div class="stat"><b>${pctTxt(sm.avgPct)}</b><span>متوسط امتحانات الحصص${sm.notTaken ? ' · ' + sm.notTaken + ' لم يختبر' : ''}</span></div>
      <div class="stat"><b>${money(sm.paidSum)}</b><span>إجمالي المدفوع${sm.unpaidN ? ' · ' + sm.unpaidN + ' لم يدفع' : ''}</span></div></div>`;
  const recCell = { att: r => ATT2[r.attendance] || '—', hw: r => HW3[r.homework] || '—', paid: r => r.paid === '1' ? 'دفع' + (r.amount ? ' ' + money(r.amount) : '') : r.paid === '0' ? 'لم يدفع' : '—', score: r => r.examStatus === 'notTaken' ? 'حضر ولم يختبر' : r.score !== '' && r.score != null ? frac(r.score, r.max) : '—' };
  const goodBad = (v, good, bad) => v === bad ? 'bad-t' : v === good ? 'ok-c' : v === 'partial' || v === 'notTaken' || v === 'late' ? 'mid-t' : '';
  const sched = g => { try { return JSON.parse((g && g.schedule) || '[]'); } catch (e) { return []; } };
  const tpl = k => ((S().templates || {})[k]) || TPL_FB[k] || '';
  const passPct = () => Number((S().grading || {}).passPercent) || 50;
  const pctTxt = v => v == null ? '—' : v + '%';
  const groupSel = (chg, sel, all) => `<select class="inp" data-chg="${chg}" aria-label="المجموعة">${all ? '<option value="">كل المجموعات</option>' : ''}${groups().map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;
  const barsHtml = items => `<div class="card bars">${items.map(b => `<div class="bar" title="${esc(b.title || '')}"><i style="height:${Math.max(0, Math.min(100, b.v ?? 0))}%"></i><b>${b.v == null ? '—' : Math.round(b.v) + '%'}</b><small>${esc(b.label)}</small></div>`).join('')}</div>`;

  function studentLevels(sid) {
    const s = S(), inc = ix().inc.get(sid) || [];
    const ps = L.periodStart(s.reset, L.today());
    return { cur: s.levels[L.levelOf(inc, s.levels, ps)], hist: s.levels[L.levelOf(inc, s.levels, null)], ps };
  }

  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function vars(s, extra) {
    const p = P();
    return Object.assign({ 'اسم_الطالب': s.name, 'اسم_ولي_الأمر': s.guardianName || 'ولي الأمر', 'اسم_المدرس': p.teacherName, 'المادة': p.subject }, extra);
  }
  function openWA(phone, text) {
    if (!phone) toast('لا يوجد رقم لولي الأمر — اختر جهة الاتصال من واتساب');
    window.open(L.waLink(phone, CONFIG.countryCode, text), '_blank');
  }

  // ───────── التخطيط العام ─────────
  function badge() {
    const s = Store.status, p = Store.pending;
    const m = { synced: ['ok', '✓ متزامن'], syncing: ['busy', '⟳ مزامنة…'], offline: ['warn', '⚡ غير متصل'], error: ['err', '✕ خطأ'], idle: ['', '…'] };
    let [c, t] = m[s] || m.idle;
    if (p && s !== 'syncing') { c = 'warn'; t = '● ' + p + ' معلّق'; }
    return `<button class="badge ${c}" data-act="syncNow" title="${esc(Store.lastError || 'اضغط للمزامنة الآن')}">${t}</button>`;
  }
  function layout(v, r) {
    const p = P(), act = r === 'student' ? 'students' : MORE_ROUTES.includes(r) ? 'more' : r;
    return `<header class="top">
      ${v.back ? `<a class="icon" href="${v.back}" aria-label="رجوع">➜</a>` : (p.logo ? `<img class="logo round" src="${esc(p.logo)}" alt="" onerror="this.remove()">` : '')}
      <div class="ttl"><b>${esc(v.title)}</b>${v.sub ? `<small>${esc(v.sub)}</small>` : ''}</div>
      <span id="badge">${badge()}</span>
      <a class="icon" href="#/settings" aria-label="الإعدادات">⚙️</a>
    </header>
    <main>${v.body}</main>
    <nav class="bottom">${NAV.map(([h, i, t]) => `<a href="#/${h}" class="${act === h ? 'on' : ''}"><span>${i}</span>${t}</a>`).join('')}</nav>`;
  }

  // ───────── تسجيل الدخول ─────────
  function viewLogin() {
    const p = P();
    return `<div class="auth">
      ${p.logo ? `<img class="logo-lg round" src="${esc(p.logo)}" alt="" onerror="this.remove()">` : '<div class="logo-lg emoji">🎓</div>'}
      <h1>${esc(p.appName)}</h1><p class="muted">${esc(p.teacherName)} — ${esc(p.subject)}</p>
      ${state.showSetup ? `
      <form data-form="firstSetup" class="card stack">
        <b>إعداد أول مرة</b>
        <p class="muted small">اختر كلمة مرور المدرس. ستُستخدم لاحقاً للدخول من أي جهاز.</p>
        <input class="inp" type="password" name="password" placeholder="كلمة المرور (6 أحرف على الأقل)" minlength="6" required>
        <input class="inp" type="password" name="password2" placeholder="تأكيد كلمة المرور" required>
        <button class="btn pri">حفظ والدخول</button>
      </form>` : `
      <form data-form="login" class="card stack">
        <input class="inp" type="password" name="password" placeholder="كلمة المرور" required autofocus>
        <button class="btn pri">دخول</button>
      </form>`}
      <button class="link" data-act="toggleSetup">${state.showSetup ? 'لدي كلمة مرور بالفعل' : 'إعداد أول مرة'}</button>
      <a class="link" href="#/p">👪 بوابة ولي الأمر</a>
    </div>`;
  }

  // ───────── الرئيسية ─────────
  function viewDashboard() {
    const p = P(), t = L.today();
    if (!Store.list('Settings').length) {
      return { title: p.appName, body: Store.status === 'syncing' || Store.status === 'idle' ? '<div class="empty"><div class="spin"></div><b>جاري تحميل البيانات…</b></div>' : empty('تعذر تحميل البيانات', esc(Store.lastError) + '<br><button class="btn" data-act="syncNow">إعادة المحاولة</button>') };
    }
    const s = S(), st = students(), { att, inc, sub, grd } = ix();
    const allAtt = Store.list('Attendance');
    const c = L.attStats(allAtt.filter(a => a.date === t));
    const open = Store.list('Incidents').filter(i => i.followUpStatus !== 'resolved');
    const sugg = state.sugg = L.suggestions({ students: st, attBy: att, incBy: inc, subBy: sub, gradeBy: grd, settings: s, today: t });
    const ps = L.periodStart(s.reset, t);
    const risk = st.map(x => ({ x, score: L.riskScore(att.get(x.id), inc.get(x.id), s.levels, ps, t, sub.get(x.id)) })).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    const days = [...Array(7)].map((_, i) => L.addDays(t, i - 6));
    const bars = days.map(d => { const k = L.attStats(allAtt.filter(a => a.date === d)); return { d, r: k.rate, n: k.total }; });
    const recent = Store.list('Incidents').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);

    return {
      title: 'أهلاً ' + p.teacherName, sub: fmtFull(t),
      body: `
      <div class="stats">
        <a class="stat" href="#/students"><b>${st.length}</b><span>طالب</span></a>
        <a class="stat" href="#/attendance"><b>${c.total ? (c.present + c.late) + '/' + c.total : '—'}</b><span>حضور اليوم</span></a>
        <a class="stat" href="#/attendance"><b>${c.absent}</b><span>غياب اليوم</span></a>
        <a class="stat" href="#/incidents"><b>${open.length}</b><span>إنذار مفتوح</span></a>
      </div>
      <div class="quick">
        <a class="btn" href="#/attendance">✅ تسجيل حضور</a>
        <button class="btn" data-act="newIncident">⚠️ واقعة جديدة</button>
        <button class="btn" data-act="newPraise">🌟 إشادة</button>
        <button class="btn" data-act="addHw">📚 واجب</button>
        <button class="btn" data-act="addExam">📝 اختبار</button>
        <button class="btn" data-act="addStudent">➕ طالب</button>
      </div>
      ${todayBlock(t)}
      <h3>🔔 محتاجين انتباه ${sugg.length ? `<span class="pill">${sugg.length}</span>` : ''}</h3>
      ${sugg.length ? sugg.slice(0, 15).map(x => { const stu = Store.get('Students', x.studentId); return `
        <div class="card sug">
          <div class="grow"><a href="#/student/${x.studentId}"><b>${esc(stu.name)}</b></a><small class="muted">${esc(x.text)} · ${esc(gName(stu.groupId))}</small></div>
          <div class="sug-r">${lvBadge(level(x.levelId), ' ؟')}
            <div class="acts"><button class="btn sm pri" data-act="applySug" data-k="${esc(x.key)}">تطبيق</button><button class="btn sm" data-act="snooze" data-k="${esc(x.key)}" data-days="3">تأجيل</button><button class="btn sm ghost" data-act="snooze" data-k="${esc(x.key)}" data-days="30">رفض</button></div>
          </div>
        </div>`; }).join('') : '<p class="muted small card">لا توجد اقتراحات حالياً 👌</p>'}
      ${risk.length ? `<h3>📈 الأعلى خطورة</h3><div class="card list">${risk.map(r => `<a class="li" href="#/student/${r.x.id}"><span class="grow">${esc(r.x.name)} <small class="muted">${esc(gName(r.x.groupId))}</small></span>${lvBadge(studentLevels(r.x.id).cur)}</a>`).join('')}</div>` : ''}
      <h3>📊 نسبة الحضور آخر 7 أيام</h3>
      <div class="card bars">${bars.map(b => `<div class="bar" title="${b.n} سجل"><i style="height:${b.r ?? 0}%"></i><b>${b.r == null ? '—' : b.r + '%'}</b><small>${fmtDate(b.d).split('،')[0]}</small></div>`).join('')}</div>
      <h3>🕑 آخر الوقائع</h3>
      ${recent.length ? recent.map(i => incCard(i, true)).join('') : '<p class="muted small card">لا توجد وقائع.</p>'}`
    };
  }

  // ───────── المجموعات ─────────
  function viewGroups() {
    const gs = groups();
    return {
      title: 'المجموعات والفصول',
      body: `<button class="btn pri block" data-act="addGroup">➕ مجموعة / فصل جديد</button>
      ${gs.length ? gs.map(g => `<a class="card li" href="#/group/${g.id}"><span class="av">${g.type === 'class' ? '🏫' : '👥'}</span><span class="grow"><b>${esc(g.name)}</b><small class="muted">${g.type === 'class' ? 'فصل' : 'مجموعة'}${g.note ? ' · ' + esc(g.note) : ''}</small></span><span class="pill">${students(g.id).length}</span></a>`).join('')
        : empty('لا توجد مجموعات بعد', 'ابدأ بإضافة فصل أو مجموعة، ثم أضف الطلاب إليها.')}`
    };
  }
  function viewGroup(id) {
    const g = Store.get('Groups', id);
    if (!g) return { title: 'غير موجود', back: '#/groups', body: empty('المجموعة غير موجودة') };
    const st = students(id);
    return {
      title: g.name, sub: (g.type === 'class' ? 'فصل' : 'مجموعة') + ' · ' + st.length + ' طالب' + (g.fee ? ' · المصاريف ' + money(g.fee) : ''), back: '#/groups',
      body: `<div class="quick">
        <button class="btn pri" data-act="addClass" data-g="${id}">📅 حصة جديدة</button>
        <a class="btn" href="#/attendance?g=${id}">✅ الحضور</a>
        <button class="btn" data-act="addStudent" data-g="${id}">➕ طالب</button>
        <button class="btn" data-act="bulk" data-g="${id}">📋 إضافة جماعية</button>
        <a class="btn" href="#/codes?g=${id}">🖨️ أكواد الأولياء</a>
        <button class="btn" data-act="editGroup" data-id="${id}">✏️ تعديل</button>
        <button class="btn ghost" data-act="delGroup" data-id="${id}">🗑️ حذف</button>
      </div>
      ${g.note ? `<p class="muted card small">${esc(g.note)}</p>` : ''}
      ${groupClasses(g, st)}
      <h3>🎓 الطلاب (${st.length})</h3>
      ${st.length ? `<div class="card list">${st.map(studentLi).join('')}</div>` : empty('لا يوجد طلاب في هذه المجموعة')}`
    };
  }

  function groupClasses(g, st) {
    const cl = classesOf(g.id), all = state.q.cl === 'all', shown = all ? cl : cl.slice(0, 5);
    return `<h3>📅 الحصص (${cl.length})</h3>
      ${cl.length ? `<div class="card list">${shown.map(c => {
        const sm = recSummary(st.map(s => rec(c.id, s.id)).filter(Boolean), () => c.maxScore);
        return `<a class="li" href="#/class/${c.id}"><span class="grow"><b>${esc(clsTitle(c))}</b><small class="muted">${fmtFull(c.date)}</small>
          <small>✅ ${sm.present} حاضر${sm.late ? ' · ⏰ ' + sm.late + ' متأخر' : ''} · ❌ ${sm.absent} غائب · 📚 ${sm.done} حل كامل${sm.partial ? ' · ' + sm.partial + ' ناقص' : ''} · 💰 ${sm.paidN} دفع</small></span><span class="muted">‹</span></a>`;
      }).join('')}</div>${cl.length > shown.length ? `<a class="btn block" href="#/group/${g.id}?cl=all">عرض كل الحصص (${cl.length})</a>` : ''}`
      : `<p class="muted small card">اضغط «📅 حصة جديدة» لتسجيل الحضور والواجب ودرجة الامتحان والمصاريف لكل طالب.</p>`}`;
  }

  // ───────── شاشة الحصة (تسجيل الطلاب) ─────────
  function viewClass(id) {
    const c = Store.get('Classes', id);
    if (!c) return { title: 'غير موجودة', back: '#/groups', body: empty('الحصة غير موجودة') };
    const st = students(c.groupId), sel = state.sel[id] || (state.sel[id] = new Set());
    [...sel].forEach(x => { if (!st.find(s => s.id === x)) sel.delete(x); });
    const sm = recSummary(st.map(s => rec(id, s.id)).filter(Boolean), () => c.maxScore), max = c.maxScore, fee = defFee(c);
    const tg = (sid, f, pairs, cur, extra) => `<div class="tg ${extra || ''}">${pairs.map(([v, t, col], i) => `<button type="button" class="${cur === v ? 'on ' + (col || (i ? 'r' : 'g')) : ''}" data-act="setf" data-s="${sid}" data-f="${f}" data-v="${v}">${t}</button>`).join('')}</div>`;
    const cards = st.map(s => {
      const r = rec(id, s.id) || {};
      return `<div class="card stu ${sel.has(s.id) ? 'sel' : ''}">
        <div class="stu-h"><label class="chk"><input type="checkbox" data-chg="recSel" data-s="${s.id}" ${sel.has(s.id) ? 'checked' : ''} aria-label="تحديد"></label>
          <a class="grow" href="#/student/${s.id}"><b>${esc(s.name)}</b></a><span class="code small ltr">${esc(s.code)}</span></div>
        <div class="fields">
          <div class="f full"><span>الحضور</span>${tg(s.id, 'attendance', [['present', 'حاضر', 'g'], ['late', 'حضر متأخراً', 'o'], ['absent', 'غائب', 'r']], r.attendance)}</div>
          <div class="f full"><span>الواجب</span>${tg(s.id, 'homework', [['done', 'حل كامل', 'g'], ['partial', 'حل ناقص', 'o'], ['missing', 'لم يحل', 'r']], r.homework)}</div>
          <div class="f full"><span>درجة الامتحان</span><div class="sc"><input class="inp sm num" inputmode="decimal" data-chg="recScore" data-s="${s.id}" value="${esc(r.score || '')}" placeholder="${r.examStatus === 'notTaken' ? 'لم يختبر' : '—'}" aria-label="الدرجة">${max ? `<small class="muted">/ ${esc(max)}</small>` : ''}
            ${tg(s.id, 'examStatus', [['notTaken', 'حضر ولم يختبر', 'o']], r.examStatus, 'one')}</div></div>
          <div class="f"><span>المصاريف</span>${tg(s.id, 'paid', [['1', 'دفع'], ['0', 'لم يدفع']], r.paid)}</div>
          <div class="f"><span>المبلغ</span><div class="sc"><input class="inp sm num" inputmode="decimal" data-chg="recAmount" data-s="${s.id}" value="${esc(r.amount || '')}" placeholder="${esc(fee || '—')}" aria-label="المبلغ"><small class="muted">ج</small></div></div>
          <div class="f full"><input class="inp sm" data-chg="recNote" data-s="${s.id}" value="${esc(r.note || '')}" placeholder="📝 ملاحظات (تظهر لولي الأمر)" aria-label="ملاحظات"></div>
        </div></div>`;
    }).join('');
    const radio = (name, pairs) => `<div class="chips">${[['', 'بدون تغيير'], ...pairs].map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}" ${v === '' ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
    const bulk = `<details class="card bulk" ${state.bulkOpen ? 'open' : ''} data-bulk="1"><summary>⚡ إدخال / تعديل جماعي</summary>
      <form data-form="bulkRec" class="stack">
        <div class="seg big">${[['all', 'كل الطلاب (' + st.length + ')'], ['sel', 'المحددين فقط (' + sel.size + ')']].map(([v, t]) => `<label><input type="radio" name="target" value="${v}" ${(sel.size ? 'sel' : 'all') === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
        <b class="small">الحضور</b>${radio('attendance', [['present', 'حاضر'], ['late', 'حضر متأخراً'], ['absent', 'غائب']])}
        <b class="small">الواجب</b>${radio('homework', [['done', 'حل كامل'], ['partial', 'حل ناقص'], ['missing', 'لم يحل']])}
        <b class="small">امتحان الحصة</b>${radio('examStatus', [['notTaken', 'حضر ولم يختبر']])}
        <b class="small">المصاريف</b>${radio('paid', [['1', 'دفع'], ['0', 'لم يدفع']])}
        <div class="row2"><label>المبلغ<input class="inp" name="amount" inputmode="decimal" placeholder="${esc(fee || 'بدون تغيير')}"></label>
          <label>درجة الامتحان${max ? ' (من ' + esc(max) + ')' : ''}<input class="inp" name="score" inputmode="decimal" placeholder="بدون تغيير"></label></div>
        <label>ملاحظة للجميع<input class="inp" name="note" placeholder="بدون تغيير"></label>
        <label class="chk"><input type="checkbox" name="clear"> مسح كل بيانات الطلاب المختارين في هذه الحصة</label>
        <button class="btn pri">تطبيق</button>
      </form></details>`;
    return {
      title: clsTitle(c), sub: gName(c.groupId) + ' · ' + fmtFull(c.date), back: '#/group/' + c.groupId,
      body: `<div class="stats">
          <div class="stat"><b>${sm.present + sm.late} <small>من ${st.length}</small></b><span>حاضر${sm.late ? ' (منهم ' + sm.late + ' متأخر)' : ''} · ${sm.absent} غائب</span></div>
          <div class="stat"><b>${sm.done}</b><span>حل كامل · ${sm.partial} ناقص · ${sm.missing} لم يحل</span></div>
          <div class="stat"><b>${sm.avg == null ? '—' : sm.avg}</b><span>متوسط الدرجة${max ? ' من ' + esc(max) : ''}${sm.notTaken ? ' · ' + sm.notTaken + ' لم يختبر' : ''}</span></div>
          <div class="stat"><b>${money(sm.paidSum)}</b><span>${sm.paidN} دفع · ${sm.unpaidN} لم يدفع</span></div></div>
        <div class="quick">
          <button class="btn sm" data-act="fillAll" data-f="attendance" data-v="present">✅ الباقي حاضر</button>
          <button class="btn sm" data-act="fillAll" data-f="homework" data-v="done">📚 الباقي حل كامل</button>
          <button class="btn sm" data-act="fillAll" data-f="paid" data-v="1">💰 الباقي دفع</button>
          <button class="btn sm" data-act="selAll">${sel.size === st.length && st.length ? '☐ إلغاء التحديد' : '☑️ تحديد الكل'}</button>
        </div>
        ${bulk}
        ${st.length ? cards : empty('لا يوجد طلاب في هذه المجموعة')}
        <div class="acts mt"><button class="btn sm" data-act="editClass" data-id="${id}">✏️ تعديل بيانات الحصة</button><button class="btn sm ghost" data-act="delClass" data-id="${id}">🗑️ حذف الحصة</button></div>`
    };
  }
  function classHistory(sid) {
    return Store.list('Records').filter(r => r.studentId === sid).map(r => {
      const c = Store.get('Classes', r.classId);
      return c ? Object.assign({}, r, { date: c.date, title: c.title, max: c.maxScore }) : null;
    }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  }
  const classTable = rs => `<div class="card scroll"><table class="tbl"><thead><tr><th>الحصة</th><th>الحضور</th><th>الواجب</th><th>الدرجة</th><th>المصاريف</th><th>ملاحظات</th></tr></thead><tbody>${rs.map(r => `<tr>
    <td class="nm"><a href="#/class/${r.classId}">${fmtDate(r.date)}</a>${r.title ? `<small class="muted d">${esc(r.title)}</small>` : ''}</td>
    <td class="${goodBad(r.attendance, 'present', 'absent')}">${recCell.att(r)}</td><td class="${goodBad(r.homework, 'done', 'missing')}">${recCell.hw(r)}</td>
    <td class="${r.examStatus === 'notTaken' ? 'mid-t' : ''}">${recCell.score(r)}</td><td class="${goodBad(r.paid, '1', '0')}">${recCell.paid(r)}</td><td class="nm">${esc(r.note || '')}</td></tr>`).join('')}</tbody></table></div>`;

  // ───────── الطلاب ─────────
  const studentLi = s => `<a class="li" href="#/student/${s.id}"><span class="av">${esc(s.name.trim()[0] || '؟')}</span><span class="grow">${esc(s.name)}<small class="muted">${esc(gName(s.groupId))}</small></span>${lvBadge(studentLevels(s.id).cur)}</a>`;
  function studentRows() {
    const q = norm(state.search), arch = state.q.arch === '1';
    const st = students(state.q.g, arch).filter(s => !q || norm(s.name).includes(q) || s.code.includes(state.search.toUpperCase()) || (s.guardianPhone || '').includes(q));
    return st.length ? `<p class="muted small">${st.length} طالب</p><div class="card list">${st.slice(0, 300).map(studentLi).join('')}</div>` : empty(arch ? 'لا يوجد طلاب مؤرشفون' : 'لا يوجد طلاب', 'أضف طلاباً فردياً أو بالإضافة الجماعية.');
  }
  function viewStudents() {
    return {
      title: 'الطلاب',
      body: `<div class="quick"><button class="btn pri" data-act="addStudent" data-g="${esc(state.q.g || '')}">➕ طالب</button><button class="btn" data-act="bulk" data-g="${esc(state.q.g || '')}">📋 إضافة جماعية</button></div>
      <input class="inp" type="search" placeholder="🔍 بحث بالاسم أو الكود أو الهاتف" data-inp="search" value="${esc(state.search)}">
      <div class="row2">
        <select class="inp" data-chg="stGroup"><option value="">كل المجموعات</option>${groups().map(g => `<option value="${g.id}" ${state.q.g === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
        <select class="inp" data-chg="stArch"><option value="">النشطون</option><option value="1" ${state.q.arch === '1' ? 'selected' : ''}>المؤرشفون</option></select>
      </div>
      <div id="list">${studentRows()}</div>`
    };
  }

  function viewStudent(id) {
    const s = Store.get('Students', id);
    if (!s) return { title: 'غير موجود', back: '#/students', body: empty('الطالب غير موجود') };
    const X = ix(), { att, inc, pr } = X, a = att.get(id) || [], ic = inc.get(id) || [], p = pr.get(id) || [], sb = X.sub.get(id) || [], gr = X.grd.get(id) || [];
    const hw = L.hwStats(sb), gs = L.scoreSummary(gr.map(g => g.pct));
    const lastEx = gr.filter(g => g.pct != null).sort((x, y) => x.date.localeCompare(y.date)).slice(-8);
    const { cur, hist, ps } = studentLevels(id);
    const all = L.attStats(a), per = ps ? L.attStats(a, ps) : null;
    const pts = p.reduce((n, x) => n + (Number(x.points) || 0), 0);
    const items = [
      ...a.filter(r => r.status !== 'present').map(r => ({ d: r.date, c: r.createdAt, h: `<div class="tl att-${r.status}"><span class="dot"></span><div class="grow"><b>${ST[r.status]}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}</div><small class="muted">${fmtDate(r.date)}</small></div>` })),
      ...ic.map(i => ({ d: i.date, c: i.createdAt, h: incCard(i, false) })),
      ...p.map(x => ({ d: x.date, c: x.createdAt, h: praiseCard(x) })),
      ...sb.filter(r => r.status !== 'done').map(r => ({ d: r.date, c: r.createdAt, h: `<a class="tl att-${SUBCLS[r.status]}" href="#/hw/${r.assignmentId}"><span class="dot"></span><div class="grow"><b>📚 ${SUB[r.status]}: ${esc(X.as.get(r.assignmentId).title)}</b></div><small class="muted">${fmtDate(r.date)}</small></a>` })),
      ...gr.map(g => ({ d: g.date, c: g.createdAt, h: `<a class="tl" href="#/exam/${g.examId}"><span class="dot" style="background:${g.pct != null && g.pct < passPct() ? 'var(--err)' : 'var(--pri)'}"></span><div class="grow"><b>📝 ${esc(X.ex.get(g.examId).title)}</b></div><b class="ltr">${g.status === 'absent' ? 'غائب' : esc(g.score) + ' / ' + esc(g.max)}</b><small class="muted">${fmtDate(g.date)}</small></a>` }))
    ].sort((x, y) => y.d.localeCompare(x.d) || y.c - x.c);
    const shown = state.q.all ? items : items.slice(0, 40);
    return {
      title: s.name, sub: gName(s.groupId) + (s.status === 'archived' ? ' · مؤرشف' : ''), back: '#/students',
      body: `
      <div class="card prof">
        <div class="lvls"><div><small class="muted">المستوى الحالي${ps ? ' (منذ ' + fmtDate(ps) + ')' : ''}</small>${lvBadge(cur) || '<span class="ok-t">لا يوجد ✓</span>'}</div>
          <div><small class="muted">أعلى مستوى تاريخياً</small>${lvBadge(hist) || '<span class="muted">—</span>'}</div></div>
        <div class="kv"><span>نسبة الحضور</span><b>${all.rate == null ? '—' : all.rate + '%'}</b><small class="muted">غياب ${all.absent} · تأخر ${all.late} · بعذر ${all.excused}${per ? ` (الفترة الحالية: ${per.rate == null ? '—' : per.rate + '%'})` : ''}</small></div>
        <div class="kv"><span>الواجبات</span><b>${pctTxt(hw.rate)}</b><small class="muted">سلّم ${hw.done} · لم يسلّم ${hw.missing} · متأخر ${hw.late}</small></div>
        <div class="kv"><span>متوسط الاختبارات</span><b>${pctTxt(gs.avg)}</b><small class="muted">${gs.n} اختبار</small></div>
        ${lastEx.length > 1 ? `<div class="spark" aria-label="آخر الاختبارات">${lastEx.map(g => `<i style="height:${Math.max(4, g.pct)}%" class="${g.pct < passPct() ? 'low' : ''}" title="${esc(X.ex.get(g.examId).title)}: ${g.pct}%"></i>`).join('')}</div>` : ''}
        <div class="kv"><span>نقاط التشجيع</span><b>${pts} 🌟</b></div>
        <div class="kv"><span>ولي الأمر</span><b>${esc(s.guardianName || '—')}</b>${s.guardianPhone ? `<a class="ltr" href="tel:${esc(s.guardianPhone)}">${esc(s.guardianPhone)}</a>` : ''}</div>
        ${s.studentPhone ? `<div class="kv"><span>هاتف الطالب</span><a class="ltr" href="tel:${esc(s.studentPhone)}">${esc(s.studentPhone)}</a></div>` : ''}
        <div class="kv"><span>كود ولي الأمر</span><b class="code ltr">${esc(s.code)}</b>
          <span class="acts"><button class="btn sm" data-act="copy" data-t="${esc(s.code)}">نسخ</button><button class="btn sm" data-act="sendCode" data-id="${id}">📲 إرسال</button><button class="btn sm ghost" data-act="regen" data-id="${id}">توليد جديد</button></span></div>
        ${s.notes ? `<div class="kv"><span>ملاحظات 🔒</span><small>${esc(s.notes)}</small></div>` : ''}
      </div>
      <div class="quick">
        <button class="btn pri" data-act="newIncident" data-s="${id}">⚠️ واقعة</button>
        <button class="btn" data-act="newPraise" data-s="${id}">🌟 إشادة</button>
        <a class="btn" href="#/report/student/${id}">🖨️ تقرير</a>
        <button class="btn" data-act="editStudent" data-id="${id}">✏️ تعديل</button>
        <button class="btn ghost" data-act="archive" data-id="${id}">${s.status === 'archived' ? '↩️ إلغاء الأرشفة' : '📦 أرشفة'}</button>
        <button class="btn ghost" data-act="delStudent" data-id="${id}">🗑️ حذف</button>
      </div>
      ${(() => { const rs = classHistory(id); return rs.length ? `<h3>📅 سجل الحصص</h3>${recStats(recSummary(rs, r => r.max))}${classTable(rs)}` : ''; })()}
      <h3>🗂️ السجل</h3>
      ${shown.length ? shown.map(x => x.h).join('') : '<p class="muted small card">لا يوجد سجل بعد.</p>'}
      ${items.length > shown.length ? `<a class="btn block" href="#/student/${id}?all=1">عرض الكل (${items.length})</a>` : ''}`
    };
  }

  function incCard(i, withStudent) {
    const s = Store.get('Students', i.studentId), lv = level(i.levelId), rs = reason(i.reasonId);
    return `<div class="card inc" style="--c:${esc(lv ? lv.color : '#94a3b8')}">
      <div class="inc-h">${lvBadge(lv) || '<span class="lv">مستوى محذوف</span>'}<b class="grow">${esc(rs ? rs.name : '—')}</b><small class="muted">${fmtDate(i.date)}</small></div>
      ${withStudent && s ? `<a href="#/student/${s.id}" class="small">👤 ${esc(s.name)} · ${esc(gName(s.groupId))}</a>` : ''}
      ${i.note ? `<p class="small">${esc(i.note)}</p>` : ''}
      ${i.privateNote ? `<p class="small priv">🔒 ${esc(i.privateNote)}</p>` : ''}
      ${i.countsTowardLevel === '0' ? '<small class="muted">لا تُحتسب في المستوى</small>' : ''}
      <div class="inc-f">
        <select class="inp sm" data-chg="fu" data-id="${i.id}" aria-label="حالة المتابعة">${Object.keys(FU).map(k => `<option value="${k}" ${(i.followUpStatus || 'new') === k ? 'selected' : ''}>${FU[k]}</option>`).join('')}</select>
        <button class="btn sm wa" data-act="waIncident" data-id="${i.id}">📲 لولي الأمر</button>
        <button class="btn sm ghost" data-act="editIncident" data-id="${i.id}" aria-label="تعديل">✏️</button>
        <button class="btn sm ghost" data-act="delIncident" data-id="${i.id}" aria-label="حذف">🗑️</button>
      </div></div>`;
  }
  const praiseCard = x => `<div class="card inc praise"><div class="inc-h"><span class="lv" style="--c:#16a34a">🌟 إشادة${Number(x.points) ? ' +' + esc(x.points) : ''}</span><b class="grow">${esc(x.text)}</b><small class="muted">${fmtDate(x.date)}</small></div>
    <div class="inc-f"><button class="btn sm wa" data-act="waPraise" data-id="${x.id}">📲 لولي الأمر</button><button class="btn sm ghost" data-act="delPraise" data-id="${x.id}" aria-label="حذف">🗑️</button></div></div>`;

  // ───────── الحضور ─────────
  function viewAttendance() {
    const gs = groups();
    if (!gs.length) return { title: 'الحضور', body: empty('أضف مجموعة وطلاباً أولاً', '<a class="btn" href="#/groups">المجموعات</a>') };
    let gid = state.q.g || localStorage.getItem('tapp_lastGroup');
    if (!Store.get('Groups', gid)) gid = gs[0].id;
    const d = state.q.d || L.today();
    const st = students(gid);
    const recs = st.map(s => Store.get('Attendance', attId(s.id, d)));
    const c = L.attStats(recs.filter(Boolean));
    return {
      title: 'الحضور', sub: fmtFull(d),
      body: `<div class="row2">
        <select class="inp" data-chg="attGroup">${gs.map(g => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
        <input class="inp" type="date" value="${d}" data-chg="attDate" data-g="${gid}">
      </div>
      <div class="att-sum card"><span>✅ ${c.present}</span><span>❌ ${c.absent}</span><span>⏰ ${c.late}</span><span>📝 ${c.excused}</span><span class="muted">لم يُسجَّل ${st.length - c.total}</span></div>
      ${st.length ? `<button class="btn pri block" data-act="allPresent" data-g="${gid}" data-d="${d}">✔️ الكل حاضر (لغير المسجَّلين)</button>
      <div class="card list">${st.map((s, k) => { const r = recs[k]; return `<div class="li att">
        <a class="grow" href="#/student/${s.id}">${esc(s.name)}</a>
        <div class="seg">${Object.keys(ST).map(x => `<button class="st-${x} ${r && r.status === x ? 'on' : ''}" data-act="mark" data-s="${s.id}" data-g="${gid}" data-d="${d}" data-st="${x}" aria-label="${ST[x]}">${ST_SHORT[x]}</button>`).join('')}</div>
        ${r && r.status === 'absent' ? `<button class="btn sm wa" data-act="waAbsent" data-s="${s.id}" data-d="${d}" aria-label="إبلاغ ولي الأمر">📲</button>` : ''}
      </div>`; }).join('')}</div>
      <p class="muted small">ح = حاضر · غ = غائب · ت = متأخر · ع = بعذر — اضغط الحالة مرة ثانية لإلغائها.</p>` : empty('لا يوجد طلاب في هذه المجموعة')}`
    };
  }

  // ───────── الإنذارات ─────────
  function viewIncidents() {
    const tab = state.q.t || 'open';
    const q = norm(state.search);
    let list = Store.list('Incidents');
    if (tab === 'open') list = list.filter(i => i.followUpStatus !== 'resolved');
    else if (tab !== 'all') list = list.filter(i => (i.followUpStatus || 'new') === tab);
    if (q) list = list.filter(i => norm((Store.get('Students', i.studentId) || {}).name).includes(q));
    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const tabs = [['open', 'المفتوحة'], ...Object.entries(FU), ['all', 'الكل']];
    return {
      title: 'الإنذارات والمتابعة',
      body: `<button class="btn pri block" data-act="newIncident">⚠️ تسجيل واقعة</button>
      <div class="tabs">${tabs.map(([k, t]) => `<a href="#/incidents?t=${k}" class="${tab === k ? 'on' : ''}">${t}</a>`).join('')}</div>
      <input class="inp" type="search" placeholder="🔍 بحث باسم الطالب" data-inp="incSearch" value="${esc(state.search)}">
      <div id="list">${list.length ? list.slice(0, 200).map(i => incCard(i, true)).join('') : empty('لا توجد وقائع هنا')}</div>`
    };
  }

  // ───────── الإعدادات ─────────
  const FIELDS = { levels: ['id', 'name', 'color'], reasons: ['id', 'name'], terms: ['name', 'start', 'end'], rules: ['id', 'type', 'count', 'days', 'reasonId', 'fromLevelId', 'levelId', 'threshold', 'enabled'] };
  const rowBtns = (sec, i, n) => `<span class="acts"><button type="button" class="btn sm ghost" data-act="rowOp" data-sec="${sec}" data-op="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="لأعلى">▲</button><button type="button" class="btn sm ghost" data-act="rowOp" data-sec="${sec}" data-op="down" data-i="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="لأسفل">▼</button><button type="button" class="btn sm ghost" data-act="rowOp" data-sec="${sec}" data-op="del" data-i="${i}" aria-label="حذف">✕</button></span>`;
  const opts = (arr, sel, emptyLabel) => (emptyLabel != null ? `<option value="">${emptyLabel}</option>` : '') + arr.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  function viewSettings() {
    const s = S(), d = k => state.draft[k] ?? s[k], p = Store.setting('profile') || {}, tp = s.templates || {};
    const sec = (id, title, body) => `<details class="card sec" data-sec="${id}" ${state.openSec === id ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
    const lv = d('levels'), rs = d('reasons'), rst = d('reset') || { mode: 'none' }, ru = d('rules');
    const parentUrl = location.origin + location.pathname + '#/p';
    return {
      title: 'الإعدادات', back: '#/',
      body: `
      ${sec('profile', '👤 بيانات المدرس', `<form data-form="profile" class="stack">
        <label>اسم المدرس<input class="inp" name="teacherName" value="${esc(p.teacherName || '')}" placeholder="${esc(CONFIG.teacherName)}"></label>
        <label>المادة<input class="inp" name="subject" value="${esc(p.subject || '')}" placeholder="${esc(CONFIG.subject)}"></label>
        <label>المدرسة / السنتر<input class="inp" name="schoolName" value="${esc(p.schoolName || '')}" placeholder="${esc(CONFIG.schoolName)}"></label>
        <label>رقم واتساب للتواصل (يظهر لولي الأمر)<input class="inp ltr" name="whatsapp" value="${esc(p.whatsapp || '')}" placeholder="${esc(CONFIG.whatsapp)}"></label>
        <small class="muted">الحقل الفارغ يستخدم القيمة الموجودة في config.js</small>
        <button class="btn pri">حفظ</button></form>`)}
      ${sec('levels', '🪜 مستويات الإنذار (بالترتيب من الأخف للأشد)', `<form data-form="levels" class="stack">
        ${lv.map((l, i) => `<div class="erow"><input type="hidden" name="id.${i}" value="${esc(l.id)}"><input type="color" name="color.${i}" value="${esc(l.color || '#64748b')}" aria-label="اللون"><input class="inp grow" name="name.${i}" value="${esc(l.name)}" required>${rowBtns('levels', i, lv.length)}</div>`).join('')}
        <button type="button" class="btn" data-act="rowOp" data-sec="levels" data-op="add">➕ مستوى</button>
        <button class="btn pri">حفظ المستويات</button></form>`)}
      ${sec('reasons', '🏷️ أسباب الإنذار', `<form data-form="reasons" class="stack">
        ${rs.map((r, i) => `<div class="erow"><input type="hidden" name="id.${i}" value="${esc(r.id)}"><input class="inp grow" name="name.${i}" value="${esc(r.name)}" required>${rowBtns('reasons', i, rs.length)}</div>`).join('')}
        <button type="button" class="btn" data-act="rowOp" data-sec="reasons" data-op="add">➕ سبب</button>
        <button class="btn pri">حفظ الأسباب</button></form>`)}
      ${sec('reset', '🔄 تصفير المستوى الحالي', `<form data-form="reset" class="stack">
        <p class="muted small">التصفير لا يحذف أي سجل؛ فقط "المستوى الحالي" يُحسب من وقائع الفترة الحالية، ويبقى المستوى التاريخي ظاهراً.</p>
        <select class="inp" name="mode">${[['none', 'بدون تصفير'], ['month', 'كل شهر'], ['term', 'كل ترم'], ['days', 'مخصص: كل عدد أيام']].map(([k, t]) => `<option value="${k}" ${rst.mode === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <div class="row2"><label>كل كم يوم (للمخصص)<input class="inp" type="number" min="1" name="days" value="${esc(rst.days || 30)}"></label><label>بداية العدّ<input class="inp" type="date" name="anchor" value="${esc(rst.anchor || L.today())}"></label></div>
        <b class="small">الترمات (لخيار كل ترم)</b>
        ${(rst.terms || []).map((t, i) => `<div class="erow wrap"><input class="inp" name="name.${i}" value="${esc(t.name)}" placeholder="اسم الترم"><input class="inp" type="date" name="start.${i}" value="${esc(t.start)}" aria-label="البداية"><input class="inp" type="date" name="end.${i}" value="${esc(t.end)}" aria-label="النهاية">${rowBtns('terms', i, rst.terms.length)}</div>`).join('')}
        <button type="button" class="btn" data-act="rowOp" data-sec="terms" data-op="add">➕ ترم</button>
        <button class="btn pri">حفظ</button></form>`)}
      ${sec('rules', '💡 القواعد الذكية (تقترح فقط)', `<form data-form="rules" class="stack">
        <p class="muted small">الأيام = 0 تعني "الفترة الحالية" حسب إعداد التصفير. قاعدة "تكرار بعد الوصول لمستوى" تقترح عندما يتكرر نفس السبب بعد بلوغ المستوى المحدد. "حد الدرجة" يخص قاعدة الدرجات فقط.</p>
        ${ru.map((r, i) => `<div class="rule">
          <div class="erow"><label class="chk"><input type="checkbox" name="enabled.${i}" ${r.enabled !== false ? 'checked' : ''}> مفعّلة</label><input type="hidden" name="id.${i}" value="${esc(r.id)}">
            <select class="inp grow" name="type.${i}">${Object.entries(L.RULE_TYPES).map(([k, t]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select>${rowBtns('rules', i, ru.length)}</div>
          <div class="erow wrap"><label>العدد<input class="inp" type="number" min="1" name="count.${i}" value="${esc(r.count)}"></label><label>خلال (يوم)<input class="inp" type="number" min="0" name="days.${i}" value="${esc(r.days)}"></label>
            <label>السبب<select class="inp" name="reasonId.${i}">${opts(s.reasons, r.reasonId, '—')}</select></label>
            <label>بعد مستوى<select class="inp" name="fromLevelId.${i}">${opts(s.levels, r.fromLevelId, '—')}</select></label>
            <label>حد الدرجة %<input class="inp" type="number" min="0" max="100" name="threshold.${i}" value="${esc(r.threshold ?? 50)}"></label>
            <label>← اقتراح<select class="inp" name="levelId.${i}">${opts(s.levels, r.levelId)}</select></label></div></div>`).join('')}
        <button type="button" class="btn" data-act="rowOp" data-sec="rules" data-op="add">➕ قاعدة</button>
        <button class="btn pri">حفظ القواعد</button></form>`)}
      ${sec('grading', '📝 الدرجات', `<form data-form="grading" class="stack"><label>الحد الأدنى المقبول للدرجة (%)<input class="inp" type="number" min="0" max="100" name="passPercent" value="${esc((s.grading || {}).passPercent ?? 50)}"></label><small class="muted">يُستخدم لتمييز الدرجات المنخفضة في الاختبارات والتقارير.</small><button class="btn pri">حفظ</button></form>`)}
      ${sec('templates', '💬 قوالب رسائل واتساب', `<form data-form="templates" class="stack">
        <p class="muted small">المتغيرات: {اسم_الطالب} {اسم_ولي_الأمر} {المستوى} {السبب} {التاريخ} {اسم_المدرس} {المادة} — وللإشادة: {الإشادة} {النقاط} — وللواجب: {الواجب} — وللدرجات: {الاختبار} {الدرجة} {النهائية}</p>
        <label>القالب الافتراضي للإنذارات<textarea class="inp" rows="4" name="default">${esc(tp.default)}</textarea></label>
        ${s.levels.map(l => `<label>قالب خاص بـ «${esc(l.name)}» (اتركه فارغاً لاستخدام الافتراضي)<textarea class="inp" rows="3" name="lv_${esc(l.id)}">${esc((tp.byLevel || {})[l.id] || '')}</textarea></label>`).join('')}
        <label>قالب الإشادة<textarea class="inp" rows="3" name="praise">${esc(tp.praise)}</textarea></label>
        <label>قالب إبلاغ الغياب<textarea class="inp" rows="3" name="absence">${esc(tp.absence)}</textarea></label>
        <label>قالب عدم تسليم الواجب<textarea class="inp" rows="3" name="homework">${esc(tp.homework ?? TPL_FB.homework)}</textarea></label>
        <label>قالب إرسال الدرجة<textarea class="inp" rows="3" name="grade">${esc(tp.grade ?? TPL_FB.grade)}</textarea></label>
        <button class="btn pri">حفظ القوالب</button></form>`)}
      ${sec('password', '🔑 تغيير كلمة المرور', `<form data-form="password" class="stack">
        <input class="inp" type="password" name="oldPassword" placeholder="كلمة المرور الحالية" required>
        <input class="inp" type="password" name="newPassword" placeholder="كلمة المرور الجديدة" minlength="6" required>
        <input class="inp" type="password" name="newPassword2" placeholder="تأكيد الجديدة" required>
        <small class="muted">سيتم تسجيل الخروج من باقي الأجهزة.</small>
        <button class="btn pri">تغيير</button></form>`)}
      ${sec('data', '🗄️ البيانات والتطبيق', `<div class="stack">
        <div class="kv"><span>رابط بوابة ولي الأمر</span><b class="ltr small">${esc(parentUrl)}</b><button class="btn sm" data-act="copy" data-t="${esc(parentUrl)}">نسخ</button></div>
        <button class="btn" data-act="syncNow">🔄 مزامنة الآن</button>
        <button class="btn" data-act="export">⬇️ تصدير نسخة احتياطية (JSON)</button>
        <button class="btn" data-act="theme">🌓 تبديل الوضع الداكن/الفاتح</button>
        <button class="btn ghost" data-act="logout">🚪 تسجيل الخروج من هذا الجهاز</button>
        ${Store.lastError ? `<small class="muted">آخر خطأ: ${esc(Store.lastError)}</small>` : ''}</div>`)}`
    };
  }

  function collectRows(form, sec) {
    const f = FIELDS[sec], out = [];
    for (let i = 0; form.elements[f[0] + '.' + i] || form.elements[f[1] + '.' + i]; i++) {
      const o = {};
      f.forEach(k => { const el = form.elements[k + '.' + i]; if (el) o[k] = el.type === 'checkbox' ? el.checked : el.value; });
      if (sec === 'rules') { o.count = Number(o.count) || 1; o.days = Number(o.days) || 0; o.threshold = Number(o.threshold) || 50; }
      out.push(o);
    }
    return out;
  }
  function collectReset(form) {
    const f = form.elements;
    return { mode: f.mode.value, days: Number(f.days.value) || 30, anchor: f.anchor.value, terms: collectRows(form, 'terms') };
  }

  // ───────── طباعة الأكواد ─────────
  function viewCodes(gid) {
    const p = P(), st = students(gid), url = location.origin + location.pathname + '#/p';
    return `<div class="print-bar no-print"><a class="btn" href="#/${gid ? 'group/' + gid : 'students'}">➜ رجوع</a><button class="btn pri" data-act="print">🖨️ طباعة</button></div>
      <div class="codes">${st.map(s => `<div class="code-card"><b>${esc(s.name)}</b><small>${esc(gName(s.groupId))} · ${esc(p.teacherName)} — ${esc(p.subject)}</small>
        <div>كود المتابعة: <b class="code ltr">${esc(s.code)}</b></div><small class="ltr">${esc(url)}</small></div>`).join('') || empty('لا يوجد طلاب')}</div>`;
  }

  // ───────── بوابة ولي الأمر ─────────
  async function parentLoad(code) {
    state.parent = { loading: true };
    render();
    try {
      const data = await Store.api('parentPortal', { code });
      localStorage.setItem(PKEY, code);
      state.parent = { data };
    } catch (e) {
      state.parent = { error: e.message };
      if (e.code === 'NOT_FOUND') localStorage.removeItem(PKEY);
    }
    render();
  }
  function viewParent() {
    const st = state.parent || {}, p = P();
    const head = `<div class="p-head">${p.logo ? `<img class="logo-lg round" src="${esc(p.logo)}" alt="" onerror="this.remove()">` : ''}<b>${esc(p.teacherName)}</b><small class="muted">${esc(p.subject)}${p.schoolName ? ' · ' + esc(p.schoolName) : ''}</small></div>`;
    if (st.loading) return `<div class="parent">${head}<div class="empty"><div class="spin"></div><b>جاري التحميل…</b></div></div>`;
    if (!st.data) return `<div class="parent">${head}
      <form data-form="parent" class="card stack"><b>متابعة الطالب</b><p class="muted small">اكتب كود الطالب المكوّن من 8 خانات الذي أرسله المدرس.</p>
      <input class="inp ltr code-inp" name="code" maxlength="8" required autocomplete="off" value="${esc(localStorage.getItem(PKEY) || '')}" placeholder="XXXXXXXX">
      ${st.error ? `<p class="err-t">${esc(st.error)}</p>` : ''}<button class="btn pri">عرض</button></form></div>`;
    const d = st.data, set = d.settings || {}, levels = set.levels || [], reasons = set.reasons || [];
    const inc = d.incidents.map(i => Object.assign({}, i, { countsTowardLevel: i.countsTowardLevel ? '1' : '0' }));
    const ps = L.periodStart(set.reset, L.today());
    const cur = levels[L.levelOf(inc, levels, ps)];
    const a = L.attStats(d.attendance);
    const last = d.attendance.slice().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 14);
    const pts = d.praise.reduce((n, x) => n + (Number(x.points) || 0), 0);
    const hw = L.hwStats(d.homework || []), grades = (d.grades || []).slice().sort((x, y) => y.date.localeCompare(x.date));
    const lvl = id => levels.find(l => l.id === id), rsn = id => (reasons.find(r => r.id === id) || {}).name || '—';
    return `<div class="parent">${head}
      <div class="card"><h2>${esc(d.student.name)}</h2><small class="muted">${esc(d.student.group)}</small></div>
      <div class="stats"><div class="stat"><b>${a.rate == null ? '—' : a.rate + '%'}</b><span>نسبة الحضور</span></div><div class="stat"><b>${a.absent}</b><span>غياب</span></div><div class="stat"><b>${pts} 🌟</b><span>نقاط تشجيع</span></div>${hw.total ? `<div class="stat"><b>${pctTxt(hw.rate)}</b><span>تسليم الواجبات</span></div>` : ''}</div>
      <div class="card"><b>الحالة السلوكية الحالية</b><div class="mt">${lvBadge(cur) || '<span class="ok-t">لا توجد إنذارات حالية ✓</span>'}</div></div>
      ${last.length ? `<h3>آخر أيام الحضور</h3><div class="card list">${last.map(r => `<div class="li"><span class="grow">${fmtFull(r.date)}</span><span class="stt st-${r.status}">${ST[r.status]}</span></div>`).join('')}</div>` : ''}
      ${d.incidents.length ? `<h3>الإنذارات</h3><div class="card list">${d.incidents.slice().sort((x, y) => y.date.localeCompare(x.date)).map(i => `<div class="li">${lvBadge(lvl(i.levelId))}<span class="grow">${esc(rsn(i.reasonId))}</span><small class="muted">${fmtDate(i.date)}</small></div>`).join('')}</div>` : ''}
      ${d.praise.length ? `<h3>الإشادات 🌟</h3><div class="card list">${d.praise.slice().sort((x, y) => y.date.localeCompare(x.date)).map(x => `<div class="li"><span class="grow">${esc(x.text)}</span><small class="muted">${fmtDate(x.date)}</small></div>`).join('')}</div>` : ''}
      ${grades.length ? `<h3>درجات الاختبارات 📝</h3><div class="card list">${grades.map(g => `<div class="li"><span class="grow">${esc(g.title)}<small class="muted">${fmtDate(g.date)}</small></span><b class="ltr">${g.status === 'absent' ? 'غائب' : esc(g.score) + ' / ' + esc(g.max)}</b></div>`).join('')}</div>` : ''}
      ${hw.total ? `<h3>الواجبات 📚</h3><div class="card list">${d.homework.slice().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 20).map(h => `<div class="li"><span class="grow">${esc(h.title)}<small class="muted">${fmtDate(h.date)}</small></span><span class="stt st-${SUBCLS[h.status]}">${SUB[h.status]}</span></div>`).join('')}</div>` : ''}
      ${(() => {
        const rs = (d.records || []).slice().sort((x, y) => y.date.localeCompare(x.date));
        if (!rs.length) return '';
        const item = (k, v, cls) => `<div class="pi ${cls || ''}"><small>${k}</small><b>${v}</b></div>`;
        const gb = (v, g, b) => v === b ? 'bad' : v === g ? 'good' : v === 'partial' || v === 'notTaken' || v === 'late' ? 'mid' : '';
        return `<h3>📅 الحصص</h3>${recStats(recSummary(rs, r => r.max))}${rs.map(r => `<div class="card prec"><div class="prec-h"><b>${fmtFull(r.date)}</b>${r.title ? `<small class="muted">${esc(r.title)}</small>` : ''}</div>
          <div class="pgrid">${item('الحضور', recCell.att(r), gb(r.attendance, 'present', 'absent'))}${item('الواجب', recCell.hw(r), gb(r.homework, 'done', 'missing'))}${item('درجة الامتحان', recCell.score(r), r.examStatus === 'notTaken' ? 'mid' : '')}${item('المصاريف', recCell.paid(r), gb(r.paid, '1', '0'))}</div>
          ${r.note ? `<p class="pnote">📝 ${esc(r.note)}</p>` : ''}</div>`).join('')}`;
      })()}
      ${p.whatsapp ? `<a class="btn wa block" target="_blank" href="${L.waLink(p.whatsapp, CONFIG.countryCode, 'السلام عليكم، بخصوص الطالب/ة ' + d.student.name)}">📲 تواصل مع المدرس</a>` : ''}
      <button class="btn ghost block" data-act="parentReset">تغيير الكود</button></div>`;
  }

  // ───────── المزيد ─────────
  function viewMore() {
    const tiles = [['groups', '👥', 'المجموعات والفصول'], ['homework', '📚', 'الواجبات'], ['exams', '📝', 'الاختبارات والدرجات'], ['schedule', '🗓️', 'الجدول الأسبوعي'],
      ['lessons', '📒', 'تحضير الدروس'], ['tools', '🎲', 'أدوات الفصل'], ['reports', '🖨️', 'التقارير والطباعة'], ['stats', '📊', 'الإحصائيات'], ['settings', '⚙️', 'الإعدادات']];
    return { title: 'المزيد', body: `<div class="tiles">${tiles.map(([h, i, t]) => `<a class="tile" href="#/${h}"><span>${i}</span>${t}</a>`).join('')}</div>` };
  }

  // ───────── اليوم (في الرئيسية) ─────────
  function todayBlock(t) {
    const d = L.dayOfWeek(t);
    const gs = groups().map(g => ({ g, x: sched(g).find(y => y.d === d) })).filter(o => o.x).sort((a, b) => (a.x.t || '').localeCompare(b.x.t || ''));
    const ls = Store.list('Lessons').filter(l => l.date === t);
    if (!gs.length && !ls.length) return '';
    return `<h3>🗓️ النهارده</h3>
      ${gs.length ? `<div class="card list">${gs.map(({ g, x }) => {
        const st = students(g.id), done = st.filter(s => Store.get('Attendance', attId(s.id, t))).length;
        return `<div class="li"><b class="ltr time">${esc(x.t || '—')}</b><a class="grow" href="#/group/${g.id}">${esc(g.name)}<small class="muted">${done ? 'الحضور: ' + done + '/' + st.length : 'لم يُسجَّل الحضور بعد'}</small></a><a class="btn sm" href="#/attendance?g=${g.id}&d=${t}">✅ حضور</a></div>`;
      }).join('')}</div>` : ''}
      ${ls.length ? `<div class="card list">${ls.map(l => `<a class="li" href="#/lessons"><span>📒</span><span class="grow">${esc(l.title)}<small class="muted">${esc(l.groupId ? gName(l.groupId) : 'عام')}</small></span>${l.status === 'done' ? '<span class="ok-t">✓</span>' : ''}</a>`).join('')}</div>` : ''}`;
  }

  // ───────── الواجبات ─────────
  function viewHwList() {
    const g = state.q.g || '';
    const list = Store.list('Assignments').filter(a => !g || a.groupId === g).sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.createdAt - a.createdAt);
    const cnt = new Map();
    Store.list('Submissions').forEach(x => { const c = cnt.get(x.assignmentId) || { ok: 0, miss: 0 }; if (x.status === 'done' || x.status === 'late') c.ok++; if (x.status === 'missing') c.miss++; cnt.set(x.assignmentId, c); });
    return {
      title: 'الواجبات', back: '#/more',
      body: `<button class="btn pri block" data-act="addHw" data-g="${esc(g)}">➕ واجب جديد</button>
      <div class="mb">${groupSel('qg', g, true)}</div>
      ${list.length ? list.map(a => { const c = cnt.get(a.id) || { ok: 0, miss: 0 }, n = students(a.groupId).length; return `<a class="card li" href="#/hw/${a.id}"><span class="av">📚</span><span class="grow"><b>${esc(a.title)}</b><small class="muted">${esc(gName(a.groupId))} · التسليم ${fmtDate(a.dueDate)}${c.miss ? ' · <span class="err-t">لم يسلّم ' + c.miss + '</span>' : ''}</small></span><span class="pill">${c.ok}/${n}</span></a>`; }).join('')
        : empty('لا توجد واجبات', 'أضف واجباً، ثم سجّل التسليم لكل طالب بضغطة.')}`
    };
  }
  function viewHw(id) {
    const a = Store.get('Assignments', id);
    if (!a) return { title: 'غير موجود', back: '#/homework', body: empty('الواجب غير موجود') };
    const st = students(a.groupId), recs = st.map(s => Store.get('Submissions', subId(id, s.id)));
    const c = L.hwStats(recs.filter(Boolean));
    return {
      title: a.title, sub: gName(a.groupId) + ' · التسليم ' + fmtDate(a.dueDate), back: '#/homework',
      body: `<div class="quick"><button class="btn" data-act="editHw" data-id="${id}">✏️ تعديل</button><button class="btn ghost" data-act="delHw" data-id="${id}">🗑️ حذف</button></div>
      ${a.note ? `<p class="card small pre">${esc(a.note)}</p>` : ''}
      <div class="att-sum card"><span>✅ ${c.done}</span><span>❌ ${c.missing}</span><span>⏰ ${c.late}</span><span>📝 ${c.excused}</span><span class="muted">لم يُسجَّل ${st.length - c.total}</span></div>
      ${st.length ? `<button class="btn pri block" data-act="allDone" data-id="${id}">✔️ الكل سلّم (لغير المسجَّلين)</button>
      <div class="card list">${st.map((s, k) => { const r = recs[k]; return `<div class="li att"><a class="grow" href="#/student/${s.id}">${esc(s.name)}</a>
        <div class="seg">${Object.keys(SUB).map(x => `<button class="st-${SUBCLS[x]} ${r && r.status === x ? 'on' : ''}" data-act="sub" data-a="${id}" data-s="${s.id}" data-st="${x}" aria-label="${SUB[x]}">${SUB_SHORT[x]}</button>`).join('')}</div>
        ${r && r.status === 'missing' ? `<button class="btn sm wa" data-act="waHw" data-a="${id}" data-s="${s.id}" aria-label="إبلاغ ولي الأمر">📲</button>` : ''}</div>`; }).join('')}</div>
      <p class="muted small">✓ = سلّم · ✗ = لم يسلّم · ت = متأخر · ع = بعذر — اضغط مرة ثانية للإلغاء.</p>` : empty('لا يوجد طلاب في هذه المجموعة')}`
    };
  }

  // ───────── الاختبارات والدرجات ─────────
  function viewExamList() {
    const g = state.q.g || '', X = ix();
    const list = Store.list('Exams').filter(x => !g || x.groupId === g).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const by = new Map();
    Store.list('Grades').forEach(x => { if (!by.has(x.examId)) by.set(x.examId, []); by.get(x.examId).push(x); });
    return {
      title: 'الاختبارات والدرجات', back: '#/more',
      body: `<button class="btn pri block" data-act="addExam" data-g="${esc(g)}">➕ اختبار جديد</button>
      <div class="mb">${groupSel('qg', g, true)}</div>
      ${list.length ? list.map(x => {
        const gr = by.get(x.id) || [], sm = L.scoreSummary(gr.map(r => r.status === 'absent' ? null : L.pct(r.score, x.maxScore)));
        return `<a class="card li" href="#/exam/${x.id}"><span class="av">📝</span><span class="grow"><b>${esc(x.title)}</b><small class="muted">${esc(gName(x.groupId))} · ${fmtDate(x.date)} · من ${esc(x.maxScore)} · رُصد ${sm.n}/${students(x.groupId).length}</small></span><span class="pill ${sm.avg != null && sm.avg < passPct() ? 'bad' : ''}">${pctTxt(sm.avg)}</span></a>`;
      }).join('') : empty('لا توجد اختبارات', 'أضف اختباراً ورصّد درجات الطلاب بسرعة.')}`
    };
  }
  function viewExam(id) {
    const x = Store.get('Exams', id);
    if (!x) return { title: 'غير موجود', back: '#/exams', body: empty('الاختبار غير موجود') };
    const st = students(x.groupId), max = Number(x.maxScore) || 0, pass = passPct();
    const gr = st.map(s => Store.get('Grades', gradeId(id, s.id)));
    const vals = gr.map(g => g && g.status !== 'absent' && g.score !== '' ? Number(g.score) : null);
    const sm = L.scoreSummary(vals);
    const below = vals.filter(v => v != null && L.pct(v, max) < pass).length, absent = gr.filter(g => g && g.status === 'absent').length;
    return {
      title: x.title, sub: gName(x.groupId) + ' · ' + fmtDate(x.date) + ' · من ' + x.maxScore, back: '#/exams',
      body: `<div class="quick"><a class="btn" href="#/report/exam/${id}">🖨️ كشف الدرجات</a><button class="btn" data-act="editExam" data-id="${id}">✏️ تعديل</button><button class="btn ghost" data-act="delExam" data-id="${id}">🗑️ حذف</button></div>
      <div class="stats">
        <div class="stat"><b>${sm.avg == null ? '—' : sm.avg}</b><span>المتوسط (${pctTxt(L.pct(sm.avg, max))})</span></div>
        <div class="stat"><b>${sm.max ?? '—'} / ${sm.min ?? '—'}</b><span>أعلى / أقل درجة</span></div>
        <div class="stat"><b>${sm.n}/${st.length}</b><span>تم الرصد · غياب ${absent}</span></div>
        <div class="stat"><b class="${below ? 'err-t' : ''}">${below}</b><span>أقل من ${pass}%</span></div>
      </div>
      ${st.length ? `<div class="card list">${st.map((s, k) => {
        const g = gr[k], ab = g && g.status === 'absent', v = vals[k], low = v != null && L.pct(v, max) < pass;
        return `<div class="li grade ${low ? 'low' : ''}"><a class="grow" href="#/student/${s.id}">${esc(s.name)}</a>
          <input class="inp num ltr" type="text" inputmode="decimal" enterkeyhint="next" value="${ab ? '' : esc(g ? g.score : '')}" placeholder="${ab ? 'غائب' : '—'}" data-chg="grade" data-e="${id}" data-s="${s.id}" ${ab ? 'disabled' : ''} aria-label="درجة ${esc(s.name)}"><span class="muted small">/ ${esc(x.maxScore)}</span>
          <button class="btn sm ${ab ? 'pri' : 'ghost'}" data-act="gradeAbsent" data-e="${id}" data-s="${s.id}" aria-label="غائب">غ</button>
          ${g ? `<button class="btn sm wa" data-act="waGrade" data-e="${id}" data-s="${s.id}" aria-label="إرسال الدرجة لولي الأمر">📲</button>` : ''}</div>`;
      }).join('')}</div>
      <p class="muted small">اكتب الدرجة واضغط Enter للانتقال للطالب التالي. زر «غ» = غائب عن الاختبار.</p>` : empty('لا يوجد طلاب في هذه المجموعة')}`
    };
  }

  // ───────── الجدول ─────────
  function viewSchedule() {
    const today = L.dayOfWeek(L.today()), gs = groups();
    const byDay = DAYS.map(() => []);
    gs.forEach(g => sched(g).forEach(x => { if (byDay[x.d]) byDay[x.d].push({ g, t: x.t }); }));
    const any = byDay.some(d => d.length);
    return {
      title: 'الجدول الأسبوعي', back: '#/more',
      body: `<p class="muted small card">تحدد مواعيد كل مجموعة من: المجموعات ← اختر المجموعة ← ✏️ تعديل.</p>
      ${any ? WEEK.filter(d => byDay[d].length).map(d => `<div class="card ${d === today ? 'today' : ''}"><b>${DAYS[d]}${d === today ? ' <span class="pill">النهارده</span>' : ''}</b>
        <div class="list">${byDay[d].sort((a, b) => (a.t || '').localeCompare(b.t || '')).map(({ g, t }) => `<div class="li"><b class="ltr time">${esc(t || '—')}</b><a class="grow" href="#/group/${g.id}">${esc(g.name)}<small class="muted">${students(g.id).length} طالب</small></a><a class="btn sm" href="#/attendance?g=${g.id}">✅</a></div>`).join('')}</div></div>`).join('')
        : empty('لم تُحدد مواعيد بعد', gs.length ? '<a class="btn" href="#/groups">المجموعات</a>' : 'أضف مجموعة أولاً')}`
    };
  }

  // ───────── تحضير الدروس ─────────
  const lessonCard = l => `<div class="card inc lesson" style="--c:${l.status === 'done' ? '#16a34a' : 'var(--pri)'}">
    <div class="inc-h"><b class="grow">${esc(l.title)}</b><small class="muted">${fmtDate(l.date)}</small></div>
    <small class="muted">${esc(l.groupId ? gName(l.groupId) : 'عام')}${l.status === 'done' ? ' · <span class="ok-t">تم ✓</span>' : ''}</small>
    ${l.objectives ? `<p class="small pre"><b>الأهداف:</b> ${esc(l.objectives)}</p>` : ''}
    ${l.plan ? `<p class="small pre"><b>الخطة:</b> ${esc(l.plan)}</p>` : ''}
    ${l.homework ? `<p class="small pre"><b>الواجب:</b> ${esc(l.homework)}</p>` : ''}
    ${l.notes ? `<p class="small pre priv"><b>ملاحظات:</b> ${esc(l.notes)}</p>` : ''}
    <div class="inc-f"><button class="btn sm ${l.status === 'done' ? '' : 'pri'}" data-act="lessonDone" data-id="${l.id}">${l.status === 'done' ? '↩️ لم يتم' : '✔️ تم الشرح'}</button>
      ${l.homework && l.groupId ? `<button class="btn sm" data-act="hwFromLesson" data-id="${l.id}">📚 تحويل لواجب</button>` : ''}
      <button class="btn sm ghost" data-act="editLesson" data-id="${l.id}" aria-label="تعديل">✏️</button><button class="btn sm ghost" data-act="delLesson" data-id="${l.id}" aria-label="حذف">🗑️</button></div></div>`;
  function viewLessons() {
    const g = state.q.g || '', t = L.today();
    const list = Store.list('Lessons').filter(l => !g || l.groupId === g || !l.groupId);
    const up = list.filter(l => l.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    const past = list.filter(l => l.date < t).sort((a, b) => b.date.localeCompare(a.date));
    return {
      title: 'تحضير الدروس', back: '#/more',
      body: `<button class="btn pri block" data-act="addLesson" data-g="${esc(g)}">➕ تحضير درس</button>
      <div class="mb">${groupSel('qg', g, true)}</div>
      <h3>📅 القادمة واليوم</h3>${up.length ? up.map(lessonCard).join('') : '<p class="muted small card">لا توجد دروس محضّرة قادمة.</p>'}
      ${past.length ? `<h3>🕑 السابقة</h3>${past.slice(0, state.q.all ? 500 : 20).map(lessonCard).join('')}${past.length > 20 && !state.q.all ? `<a class="btn block" href="#/lessons?${new URLSearchParams(Object.assign({}, state.q, { all: 1 }))}">عرض الكل (${past.length})</a>` : ''}` : ''}`
    };
  }

  // ───────── أدوات الفصل ─────────
  const fmtSec = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  function setTimer(sec) { state.tools.timer = { total: sec, left: sec, running: false, end: 0 }; }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.45, 0.9].forEach(o => { const os = ctx.createOscillator(), g = ctx.createGain(); os.frequency.value = 880; os.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.3, ctx.currentTime + o); os.start(ctx.currentTime + o); os.stop(ctx.currentTime + o + 0.3); });
    } catch (e) { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    toast('⏰ انتهى الوقت');
  }
  function toolPool(g) {
    const t = L.today();
    return students(g).filter(s => !(state.tools.skipAbsent && (Store.get('Attendance', attId(s.id, t)) || {}).status === 'absent'));
  }
  function viewTools() {
    const gs = groups();
    if (!gs.length) return { title: 'أدوات الفصل', back: '#/more', body: empty('أضف مجموعة وطلاباً أولاً') };
    let g = state.q.g || localStorage.getItem('tapp_lastGroup');
    if (!Store.get('Groups', g)) g = gs[0].id;
    const tab = state.q.t || 'random', T = state.tools, pool = toolPool(g);
    const used = T.used[g] || new Set();
    const tabs = [['random', '🎲 اختيار عشوائي'], ['groups', '👥 تقسيم مجموعات'], ['timer', '⏱️ مؤقت']];
    let body = '';
    if (tab === 'random') {
      body = `<div class="card center pick-card"><div id="pickShow" class="pick-big">${esc(T.current || '؟')}</div>
        <small class="muted">متبقي ${Math.max(0, pool.filter(s => !used.has(s.id)).length)} من ${pool.length} في هذه الجولة</small>
        <button class="btn pri block mt" data-act="pickRandom" data-g="${g}">🎲 اختر طالب</button>
        <button class="btn ghost" data-act="resetRandom" data-g="${g}">↺ جولة جديدة</button></div>`;
    } else if (tab === 'groups') {
      const sp = T.split && T.split.g === g ? T.split.groups : null;
      body = `<form data-form="split" class="card erow"><input type="hidden" name="g" value="${g}"><label class="grow">عدد المجموعات<input class="inp" type="number" name="n" min="2" max="${Math.max(2, pool.length)}" value="${T.n}"></label><button class="btn pri">قسّم</button></form>
        ${sp ? `<div class="split">${sp.map((arr, i) => `<div class="card"><b>المجموعة ${i + 1}</b> <small class="muted">(${arr.length})</small><ol>${arr.map(n => `<li>${esc(n)}</li>`).join('')}</ol></div>`).join('')}</div>
        <button class="btn block" data-act="reshuffle" data-g="${g}">🔀 إعادة الخلط</button>` : ''}`;
    } else {
      const tm = T.timer;
      body = `<div class="card center"><div id="timerShow" class="timer-big ltr ${tm.left === 0 ? 'done' : ''}">${fmtSec(tm.left)}</div>
        <div class="acts center-row">${tm.running ? '<button class="btn" data-act="timerPause">⏸️ إيقاف مؤقت</button>' : '<button class="btn pri" data-act="timerStart">▶️ ابدأ</button>'}<button class="btn ghost" data-act="timerReset">↺ إعادة</button></div></div>
        <div class="quick">${[1, 2, 3, 5, 10, 15].map(m => `<button class="btn" data-act="timerSet" data-sec="${m * 60}">${m} د</button>`).join('')}</div>
        <form data-form="timer" class="card erow"><label class="grow">مدة مخصصة (بالدقائق)<input class="inp" type="number" name="min" min="0.5" step="0.5" value="${tm.total / 60}"></label><button class="btn">ضبط</button></form>`;
    }
    return {
      title: 'أدوات الفصل', back: '#/more',
      body: `<div class="row2">${groupSel('qg', g)}<label class="chk card-ish"><input type="checkbox" data-chg="skipAbs" ${T.skipAbsent ? 'checked' : ''}> استبعاد غائبي اليوم</label></div>
      <div class="tabs">${tabs.map(([k, t]) => `<a href="#/tools?g=${g}&t=${k}" class="${tab === k ? 'on' : ''}">${t}</a>`).join('')}</div>${body}`
    };
  }

  // ───────── الإحصائيات ─────────
  function viewStats() {
    const t = L.today(), from30 = L.addDays(t, -29), gs = groups(), X = ix(), g = state.q.g || '';
    const att = Store.list('Attendance');
    const openInc = Store.list('Incidents').filter(i => i.followUpStatus !== 'resolved');
    const rows = gs.map(gr => {
      const sids = new Set(students(gr.id).map(s => s.id));
      const a = L.attStats(att.filter(r => sids.has(r.studentId) && r.date >= from30));
      const h = L.hwStats(Store.list('Submissions').filter(x => sids.has(x.studentId) && X.as.has(x.assignmentId) && X.as.get(x.assignmentId).groupId === gr.id));
      const pcts = [];
      sids.forEach(id => (X.grd.get(id) || []).forEach(x => { if (x.pct != null && X.ex.get(x.examId).groupId === gr.id) pcts.push(x.pct); }));
      const ex = L.scoreSummary(pcts);
      return `<tr><td class="nm"><a href="#/group/${gr.id}">${esc(gr.name)}</a></td><td>${sids.size}</td><td>${pctTxt(a.rate)}</td><td>${pctTxt(h.rate)}</td><td>${pctTxt(ex.avg)}</td><td>${openInc.filter(i => sids.has(i.studentId)).length}</td></tr>`;
    });
    const sids = g ? new Set(students(g).map(s => s.id)) : null;
    const scoped = sids ? att.filter(r => sids.has(r.studentId)) : att;
    const from90 = L.addDays(t, -89), wd = DAYS.map(() => ({ abs: 0, tot: 0 }));
    scoped.forEach(r => { if (r.date < from90 || r.status === 'excused') return; const d = L.dayOfWeek(r.date); wd[d].tot++; if (r.status === 'absent') wd[d].abs++; });
    const wdBars = WEEK.filter(d => wd[d].tot).map(d => ({ label: DAYS[d], v: Math.round(wd[d].abs * 100 / wd[d].tot), title: wd[d].abs + ' غياب من ' + wd[d].tot }));
    const months = [];
    for (let i = 5; i >= 0; i--) { const dt = new Date(t.slice(0, 7) + '-01T00:00:00'); dt.setMonth(dt.getMonth() - i); months.push(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0')); }
    const mBars = months.map(m => { const k = L.attStats(scoped.filter(r => r.date.startsWith(m))); return { label: new Date(m + '-01T00:00:00').toLocaleDateString('ar-EG', { month: 'short' }), v: k.rate, title: k.total + ' سجل' }; });
    const exams = Store.list('Exams').filter(x => !g || x.groupId === g).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
    const exBars = exams.map(x => {
      const ps = Store.list('Grades').filter(r => r.examId === x.id && r.status !== 'absent').map(r => L.pct(r.score, x.maxScore));
      return { label: x.title.slice(0, 10), v: L.scoreSummary(ps).avg, title: x.title };
    });
    return {
      title: 'الإحصائيات', back: '#/more',
      body: `<h3>📋 مقارنة المجموعات</h3>
      ${gs.length ? `<div class="card scroll"><table class="tbl"><thead><tr><th>المجموعة</th><th>الطلاب</th><th>الحضور (30 يوم)</th><th>الواجبات</th><th>متوسط الاختبارات</th><th>إنذارات مفتوحة</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('لا توجد مجموعات')}
      <div class="mb">${groupSel('qg', g, true)}</div>
      <h3>📈 نسبة الحضور آخر 6 شهور</h3>${barsHtml(mBars)}
      <h3>📅 نسبة الغياب حسب اليوم (آخر 3 شهور)</h3>${wdBars.length ? barsHtml(wdBars) : '<p class="muted small card">لا توجد بيانات كافية.</p>'}
      <h3>📝 متوسط آخر الاختبارات</h3>${exBars.length ? barsHtml(exBars) : '<p class="muted small card">لا توجد اختبارات بعد.</p>'}`
    };
  }

  // ───────── التقارير ─────────
  function viewReports() {
    const gs = groups();
    let g = state.q.g;
    if (!Store.get('Groups', g)) g = (gs[0] || {}).id || '';
    const m = state.q.m || L.today().slice(0, 7);
    const exams = Store.list('Exams').filter(x => x.groupId === g).sort((a, b) => b.date.localeCompare(a.date));
    if (!gs.length) return { title: 'التقارير', back: '#/more', body: empty('أضف مجموعة أولاً') };
    return {
      title: 'التقارير والطباعة', back: '#/more',
      body: `<div class="mb">${groupSel('qg', g)}</div>
      <a class="card li" href="#/report/group?g=${g}"><span class="av">📋</span><span class="grow"><b>التقرير الشامل للمجموعة</b><small class="muted">الحضور والواجبات والاختبارات والسلوك لكل طالب</small></span></a>
      <div class="card"><b>🗓️ كشف الحضور الشهري</b><div class="erow mt"><input class="inp grow" type="month" value="${m}" data-chg="repMonth" data-g="${g}" aria-label="الشهر"><a class="btn pri" href="#/report/att?g=${g}&m=${m}">عرض</a></div></div>
      <div class="card"><b>📝 كشوف درجات الاختبارات</b>${exams.length ? `<div class="list">${exams.map(x => `<a class="li" href="#/report/exam/${x.id}"><span class="grow">${esc(x.title)}</span><small class="muted">${fmtDate(x.date)}</small></a>`).join('')}</div>` : '<p class="muted small">لا توجد اختبارات لهذه المجموعة.</p>'}</div>
      <a class="card li" href="#/codes?g=${g}"><span class="av">🔑</span><span class="grow"><b>أكواد أولياء الأمور</b><small class="muted">كارت لكل طالب للطباعة والتوزيع</small></span></a>
      <p class="muted small card">🎓 تقرير طالب منفرد: افتح ملف الطالب واضغط «🖨️ تقرير». للحفظ PDF اختر «Save as PDF» من نافذة الطباعة.</p>`
    };
  }

  function reportWrap(back, title, body) {
    const p = P();
    return `<div class="print-bar no-print"><a class="btn" href="${back}">➜ رجوع</a><button class="btn pri" data-act="print">🖨️ طباعة / حفظ PDF</button></div>
      <div class="report"><div class="rep-head">${p.logo ? `<img src="${esc(p.logo)}" alt="" onerror="this.remove()">` : ''}<div class="grow"><b>${esc(p.teacherName)}</b><small>${esc(p.subject)}${p.schoolName ? ' · ' + esc(p.schoolName) : ''}</small></div><div class="rep-t"><b>${esc(title)}</b><small>${fmtFull(L.today())}</small></div></div>${body}</div>`;
  }
  const tbl = (head, rows) => `<table class="tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted">لا يوجد</td></tr>`}</tbody></table>`;
  function studentSummary(s) {
    const X = ix(), a = X.att.get(s.id) || [], ic = X.inc.get(s.id) || [], sb = X.sub.get(s.id) || [], gr = X.grd.get(s.id) || [], pr = X.pr.get(s.id) || [];
    return { a: L.attStats(a), h: L.hwStats(sb), ex: L.scoreSummary(gr.map(g => g.pct)), lv: studentLevels(s.id), pts: pr.reduce((n, x) => n + (Number(x.points) || 0), 0), att: a, inc: ic, sub: sb, grd: gr, pr };
  }
  function viewReport(parts, q) {
    const kind = parts[1];
    if (kind === 'student') return reportStudent(parts[2]);
    if (kind === 'exam') return reportExam(parts[2]);
    if (kind === 'att') return reportAtt(q.g, q.m);
    return reportGroup(q.g);
  }
  function reportStudent(id) {
    const s = sOf(id);
    if (!s) return reportWrap('#/students', 'تقرير طالب', empty('الطالب غير موجود'));
    const x = studentSummary(s), X = ix(), byDate = (a, b) => a.date.localeCompare(b.date);
    return reportWrap('#/student/' + id, 'تقرير متابعة طالب', `
      <h2>${esc(s.name)}</h2><p class="muted">${esc(gName(s.groupId))}${s.guardianName ? ' · ولي الأمر: ' + esc(s.guardianName) : ''}</p>
      <div class="rep-stats">
        <div><small>نسبة الحضور</small><b>${pctTxt(x.a.rate)}</b><small>غياب ${x.a.absent} · تأخر ${x.a.late}</small></div>
        <div><small>تسليم الواجبات</small><b>${pctTxt(x.h.rate)}</b><small>لم يسلّم ${x.h.missing}</small></div>
        <div><small>متوسط الاختبارات</small><b>${pctTxt(x.ex.avg)}</b><small>${x.ex.n} اختبار</small></div>
        <div><small>المستوى السلوكي الحالي</small><b>${x.lv.cur ? esc(x.lv.cur.name) : 'لا يوجد'}</b><small>نقاط التشجيع: ${x.pts}</small></div>
      </div>
      <h3>الاختبارات</h3>${tbl(['الاختبار', 'التاريخ', 'الدرجة', 'النسبة'], x.grd.slice().sort(byDate).map(g => `<tr><td>${esc(X.ex.get(g.examId).title)}</td><td>${fmtDate(g.date)}</td><td class="ltr">${g.status === 'absent' ? 'غائب' : esc(g.score) + ' / ' + esc(g.max)}</td><td class="${g.pct != null && g.pct < passPct() ? 'low' : ''}">${pctTxt(g.pct)}</td></tr>`))}
      <h3>الواجبات غير المسلّمة أو المتأخرة</h3>${tbl(['الواجب', 'تاريخ التسليم', 'الحالة'], x.sub.filter(r => r.status === 'missing' || r.status === 'late').sort(byDate).map(r => `<tr><td>${esc(X.as.get(r.assignmentId).title)}</td><td>${fmtDate(r.date)}</td><td>${SUB[r.status]}</td></tr>`))}
      <h3>أيام الغياب والتأخر</h3>${tbl(['التاريخ', 'الحالة'], x.att.filter(r => r.status !== 'present').sort(byDate).map(r => `<tr><td>${fmtFull(r.date)}</td><td>${ST[r.status]}</td></tr>`))}
      <h3>الإنذارات والملاحظات السلوكية</h3>${tbl(['التاريخ', 'المستوى', 'السبب', 'ملاحظة'], x.inc.slice().sort(byDate).map(i => `<tr><td>${fmtDate(i.date)}</td><td>${esc((level(i.levelId) || {}).name || '—')}</td><td>${esc((reason(i.reasonId) || {}).name || '—')}</td><td>${esc(i.note)}</td></tr>`))}
      <h3>الإشادات</h3>${tbl(['التاريخ', 'الإشادة', 'النقاط'], x.pr.slice().sort(byDate).map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.text)}</td><td>${esc(p.points)}</td></tr>`))}
      <div class="sign"><span>توقيع المدرس: ....................</span><span>توقيع ولي الأمر: ....................</span></div>`);
  }
  function reportGroup(gid) {
    const g = Store.get('Groups', gid);
    if (!g) return reportWrap('#/reports', 'التقرير الشامل', empty('اختر مجموعة من صفحة التقارير'));
    const pass = passPct(), st = students(gid);
    const rows = st.map((s, i) => { const x = studentSummary(s); return `<tr><td>${i + 1}</td><td class="nm">${esc(s.name)}</td><td>${pctTxt(x.a.rate)}</td><td>${x.a.absent}</td><td>${pctTxt(x.h.rate)}</td><td class="${x.ex.avg != null && x.ex.avg < pass ? 'low' : ''}">${pctTxt(x.ex.avg)}</td><td>${x.lv.cur ? esc(x.lv.cur.name) : '—'}</td><td>${x.pts}</td></tr>`; });
    return reportWrap('#/reports?g=' + gid, 'التقرير الشامل — ' + g.name, `<p class="muted">${st.length} طالب</p>` + tbl(['#', 'الطالب', 'الحضور', 'غياب', 'الواجبات', 'متوسط الاختبارات', 'المستوى الحالي', 'نقاط'], rows));
  }
  function reportAtt(gid, m) {
    const g = Store.get('Groups', gid);
    if (!g) return reportWrap('#/reports', 'كشف الحضور', empty('اختر مجموعة من صفحة التقارير'));
    m = m || L.today().slice(0, 7);
    const st = students(gid), sids = new Set(st.map(s => s.id));
    const recs = Store.list('Attendance').filter(r => sids.has(r.studentId) && r.date.startsWith(m));
    const dates = [...new Set(recs.map(r => r.date))].sort();
    const map = new Map(recs.map(r => [r.studentId + '|' + r.date, r.status]));
    const rows = st.map((s, i) => {
      const c = { present: 0, absent: 0, late: 0, excused: 0 };
      const cells = dates.map(d => { const v = map.get(s.id + '|' + d); if (v) c[v]++; return `<td class="${v ? 'st-' + v : ''}">${v ? ST_SHORT[v] : ''}</td>`; }).join('');
      return `<tr><td>${i + 1}</td><td class="nm">${esc(s.name)}</td>${cells}<td>${c.present}</td><td>${c.absent}</td><td>${c.late}</td><td>${c.excused}</td></tr>`;
    });
    const month = new Date(m + '-01T00:00:00').toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
    return reportWrap('#/reports?g=' + gid + '&m=' + m, 'كشف حضور ' + month + ' — ' + g.name,
      (dates.length ? '' : '<p class="muted">لا يوجد حضور مسجّل في هذا الشهر.</p>') +
      `<div class="att-grid">${tbl(['#', 'الطالب', ...dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('ar-EG', { day: 'numeric' })), 'ح', 'غ', 'ت', 'ع'], rows)}</div><p class="muted small">ح = حاضر · غ = غائب · ت = متأخر · ع = بعذر</p>`);
  }
  function reportExam(id) {
    const x = Store.get('Exams', id);
    if (!x) return reportWrap('#/reports', 'كشف درجات', empty('الاختبار غير موجود'));
    const pass = passPct(), st = students(x.groupId);
    const vals = [];
    const rows = st.map((s, i) => {
      const g = Store.get('Grades', gradeId(id, s.id)), ab = g && g.status === 'absent', has = g && !ab && g.score !== '';
      const p = has ? L.pct(g.score, x.maxScore) : null;
      if (has) vals.push(Number(g.score));
      return `<tr><td>${i + 1}</td><td class="nm">${esc(s.name)}</td><td class="ltr">${ab ? 'غائب' : has ? esc(g.score) : '—'}</td><td class="${p != null && p < pass ? 'low' : ''}">${pctTxt(p)}</td></tr>`;
    });
    const sm = L.scoreSummary(vals);
    return reportWrap('#/exam/' + id, 'كشف درجات: ' + x.title, `<p class="muted">${esc(gName(x.groupId))} · ${fmtFull(x.date)} · الدرجة النهائية ${esc(x.maxScore)}</p>
      <div class="rep-stats"><div><small>المتوسط</small><b>${sm.avg ?? '—'}</b></div><div><small>أعلى درجة</small><b>${sm.max ?? '—'}</b></div><div><small>أقل درجة</small><b>${sm.min ?? '—'}</b></div><div><small>عدد من رُصد</small><b>${sm.n} / ${st.length}</b></div></div>
      ${tbl(['#', 'الطالب', 'الدرجة', 'النسبة'], rows)}`);
  }

  // ───────── النوافذ المنبثقة ─────────
  function pickList() {
    const q = norm(state.pickQ);
    const st = students().filter(s => !q || norm(s.name).includes(q)).slice(0, 30);
    return st.length ? st.map(s => `<button type="button" class="li pick" data-act="pick" data-id="${s.id}"><span class="grow">${esc(s.name)}</span><small class="muted">${esc(gName(s.groupId))}</small></button>`).join('') : '<p class="muted small">لا توجد نتائج</p>';
  }
  function picker(title) {
    return `<h2>${title}</h2><input class="inp" type="search" placeholder="🔍 ابحث باسم الطالب" data-inp="pick" value="${esc(state.pickQ)}" autofocus><div id="pickList" class="list">${pickList()}</div>`;
  }
  const stuHead = sid => { const s = Store.get('Students', sid); return `<div class="kv"><span>الطالب</span><b>${esc(s ? s.name : '')}</b><button type="button" class="btn sm ghost" data-act="unpick">تغيير</button></div>`; };

  function modalHtml(m) {
    const s = S();
    if (m.type === 'group') {
      const g = m.g || {};
      return `<form data-form="group" class="stack"><h2>${g.id ? 'تعديل' : 'إضافة'} مجموعة / فصل</h2>
        <div class="seg big">${[['class', '🏫 فصل'], ['group', '👥 مجموعة']].map(([k, t]) => `<label><input type="radio" name="type" value="${k}" ${(g.type || 'group') === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
        <input class="inp" name="name" value="${esc(g.name || '')}" placeholder="مثال: فصل 2/3 أو مجموعة السبت 4م" required>
        <input class="inp" name="note" value="${esc(g.note || '')}" placeholder="ملاحظة (المكان، السعر…)">
        <label class="lbl">المصاريف الافتراضية للحصة (ج)<input class="inp" name="fee" inputmode="decimal" value="${esc(g.fee || '')}" placeholder="مثال: 100"></label>
        <b class="small">مواعيد المجموعة في الأسبوع (اختياري)</b>
        <div class="sched">${WEEK.map(d => { const x = sched(g).find(y => y.d === d); return `<label class="sched-row"><input type="checkbox" name="d${d}" ${x ? 'checked' : ''}><span>${DAYS[d]}</span><input class="inp sm" type="time" name="t${d}" value="${esc(x ? x.t : '')}" aria-label="الوقت"></label>`; }).join('')}</div>
        <button class="btn pri">حفظ</button></form>`;
    }
    if (m.type === 'class') {
      const c = m.c || {};
      return `<form data-form="classForm" class="stack"><h2>${c.id ? 'تعديل الحصة' : 'حصة جديدة'}</h2>
        <label class="lbl">التاريخ<input class="inp" type="date" name="date" value="${esc(c.date || L.today())}" required></label>
        <label class="lbl">عنوان الحصة (اختياري)<input class="inp" name="title" value="${esc(c.title || '')}" placeholder="مثال: الدرس الثالث، النعت"></label>
        <div class="row2"><label class="lbl">الدرجة النهائية للامتحان<input class="inp" name="maxScore" inputmode="decimal" value="${esc(c.id ? c.maxScore : (CONFIG.defaultMaxScore || '10'))}"></label>
        <label class="lbl">المصاريف (ج)<input class="inp" name="fee" inputmode="decimal" value="${esc(c.id ? c.fee : ((Store.get('Groups', m.gid) || {}).fee || ''))}" placeholder="اختياري"></label></div>
        <button class="btn pri">${c.id ? 'حفظ' : 'إنشاء وبدء التسجيل'}</button></form>`;
    }
    if (m.type === 'student') {
      const x = m.s || {}, gs = groups();
      if (!gs.length) return `<h2>إضافة طالب</h2>${empty('أضف مجموعة أولاً')}<button class="btn pri block" data-act="addGroup">➕ مجموعة</button>`;
      return `<form data-form="student" class="stack"><h2>${x.id ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</h2>
        <input class="inp" name="name" value="${esc(x.name || '')}" placeholder="اسم الطالب" required>
        <select class="inp" name="groupId" required>${opts(gs, x.groupId || m.gid)}</select>
        <input class="inp" name="guardianName" value="${esc(x.guardianName || '')}" placeholder="اسم ولي الأمر">
        <input class="inp ltr" type="tel" name="guardianPhone" value="${esc(x.guardianPhone || '')}" placeholder="رقم ولي الأمر (واتساب)">
        <input class="inp ltr" type="tel" name="studentPhone" value="${esc(x.studentPhone || '')}" placeholder="رقم الطالب (اختياري)">
        <textarea class="inp" name="notes" rows="2" placeholder="ملاحظات خاصة 🔒 (لا تظهر لولي الأمر)">${esc(x.notes || '')}</textarea>
        <button class="btn pri">حفظ</button></form>`;
    }
    if (m.type === 'bulk') {
      return `<form data-form="bulk" class="stack"><h2>إضافة جماعية</h2>
        <select class="inp" name="groupId" required>${opts(groups(), m.gid)}</select>
        <textarea class="inp" name="list" rows="9" required placeholder="اسم في كل سطر. ويمكن إضافة الرقم واسم ولي الأمر بفاصلة:&#10;أحمد محمد علي، 01012345678، محمد علي&#10;سارة حسن"></textarea>
        <button class="btn pri">إضافة</button></form>`;
    }
    if (m.type === 'incident') {
      if (!m.studentId) return picker('واقعة جديدة — اختر الطالب');
      return `<form data-form="incident" class="stack"><h2>${m.id ? 'تعديل واقعة' : 'واقعة جديدة'}</h2>${stuHead(m.studentId)}
        <b class="small">المستوى</b><div class="chips">${s.levels.map(l => `<label><input type="radio" name="levelId" value="${esc(l.id)}" ${m.levelId === l.id ? 'checked' : ''} required><span style="--c:${esc(l.color)}">${esc(l.name)}</span></label>`).join('')}</div>
        <b class="small">السبب</b><div class="chips">${s.reasons.map(r => `<label><input type="radio" name="reasonId" value="${esc(r.id)}" ${m.reasonId === r.id ? 'checked' : ''} required><span>${esc(r.name)}</span></label>`).join('')}</div>
        <input class="inp" type="date" name="date" value="${esc(m.date || L.today())}" required>
        <textarea class="inp" name="note" rows="2" placeholder="ملاحظة">${esc(m.note || '')}</textarea>
        <textarea class="inp" name="privateNote" rows="2" placeholder="ملاحظة خاصة 🔒 لا تظهر لولي الأمر ولا في الطباعة">${esc(m.privateNote || '')}</textarea>
        <label class="chk"><input type="checkbox" name="counts" ${m.countsTowardLevel !== '0' ? 'checked' : ''}> تُحتسب في مستوى الطالب</label>
        <button class="btn pri">حفظ</button></form>`;
    }
    if (m.type === 'praise') {
      if (!m.studentId) return picker('إشادة — اختر الطالب');
      return `<form data-form="praise" class="stack"><h2>🌟 إشادة</h2>${stuHead(m.studentId)}
        <input class="inp" name="text" placeholder="مثال: مشاركة متميزة في الحصة" required>
        <div class="row2"><input class="inp" type="number" name="points" min="0" value="1" aria-label="النقاط"><input class="inp" type="date" name="date" value="${L.today()}" required></div>
        <button class="btn pri">حفظ</button></form>`;
    }
    if (m.type === 'assignment' || m.type === 'exam') {
      const gs = groups();
      if (!gs.length) return `<h2>أضف مجموعة أولاً</h2><button class="btn pri block" data-act="addGroup">➕ مجموعة</button>`;
      if (m.type === 'assignment') {
        const a = m.a || {};
        return `<form data-form="assignment" class="stack"><h2>${a.id ? 'تعديل واجب' : '📚 واجب جديد'}</h2>
          <select class="inp" name="groupId" required>${opts(gs, a.groupId || m.gid)}</select>
          <input class="inp" name="title" value="${esc(a.title || '')}" placeholder="عنوان الواجب، مثال: تدريبات صفحة 25" required>
          <label>تاريخ التسليم<input class="inp" type="date" name="dueDate" value="${esc(a.dueDate || L.today())}" required></label>
          <textarea class="inp" name="note" rows="2" placeholder="تفاصيل (اختياري)">${esc(a.note || '')}</textarea>
          <button class="btn pri">حفظ</button></form>`;
      }
      const x = m.x || {};
      return `<form data-form="exam" class="stack"><h2>${x.id ? 'تعديل اختبار' : '📝 اختبار جديد'}</h2>
        <select class="inp" name="groupId" required>${opts(gs, x.groupId || m.gid)}</select>
        <input class="inp" name="title" value="${esc(x.title || '')}" placeholder="اسم الاختبار، مثال: اختبار الوحدة الأولى" required>
        <div class="row2"><label>التاريخ<input class="inp" type="date" name="date" value="${esc(x.date || L.today())}" required></label>
        <label>الدرجة النهائية<input class="inp" type="number" name="maxScore" min="1" step="any" value="${esc(x.maxScore || 20)}" required></label></div>
        <textarea class="inp" name="note" rows="2" placeholder="ملاحظة (اختياري)">${esc(x.note || '')}</textarea>
        <button class="btn pri">حفظ</button></form>`;
    }
    if (m.type === 'lesson') {
      const l = m.l || {};
      return `<form data-form="lesson" class="stack"><h2>${l.id ? 'تعديل الدرس' : '📒 تحضير درس'}</h2>
        <select class="inp" name="groupId">${opts(groups(), l.groupId ?? m.gid, 'عام (كل المجموعات)')}</select>
        <input class="inp" name="title" value="${esc(l.title || '')}" placeholder="عنوان الدرس" required>
        <label>التاريخ<input class="inp" type="date" name="date" value="${esc(l.date || L.today())}" required></label>
        <textarea class="inp" name="objectives" rows="2" placeholder="أهداف الدرس">${esc(l.objectives || '')}</textarea>
        <textarea class="inp" name="plan" rows="4" placeholder="خطة الحصة / الأنشطة / الوسائل">${esc(l.plan || '')}</textarea>
        <textarea class="inp" name="homework" rows="2" placeholder="الواجب المنزلي">${esc(l.homework || '')}</textarea>
        <textarea class="inp" name="notes" rows="2" placeholder="ملاحظات بعد الحصة">${esc(l.notes || '')}</textarea>
        <button class="btn pri">حفظ</button></form>`;
    }
    if (m.type === 'sent') {
      return `<div class="stack center"><div class="big-ok">✓</div><h2>تم الحفظ</h2>
        <button class="btn wa block" data-act="${m.kind === 'praise' ? 'waPraise' : 'waIncident'}" data-id="${m.id}">📲 إرسال لولي الأمر على واتساب</button>
        <button class="btn block" data-act="closeModal">إغلاق</button></div>`;
    }
    return '';
  }
  function openModal(m) { state.modal = m; state.pickQ = ''; renderModal(); }
  function closeModal() { state.modal = null; renderModal(); }
  function renderModal() {
    const el = $('#modal');
    if (!state.modal) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="x" data-act="closeModal" aria-label="إغلاق">✕</button>${modalHtml(state.modal)}</div>`;
    const f = el.querySelector('[autofocus]'); if (f) f.focus();
  }

  // ───────── العرض والتنقل ─────────
  function parseHash() {
    const [p, qs] = (location.hash.slice(1) || '/').split('?');
    return { parts: p.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  function render() {
    const { parts, q } = parseHash(), r = parts[0] || '', app = $('#app');
    if (r !== state.route) { state.search = ''; state.draft = {}; state.route = r; state.bulkOpen = false; }
    state.q = q;
    document.body.classList.toggle('print-mode', r === 'codes' || r === 'report');
    if (r === 'p') {
      const code = q.c || localStorage.getItem(PKEY);
      if (code && !state.parent) { parentLoad(code.toUpperCase()); return; }
      app.innerHTML = viewParent(); return;
    }
    if (!Store.token()) {
      app.innerHTML = viewLogin();
      if (!state.pinged) { state.pinged = true; Store.api('ping').then(d => { if (d.needsSetup && !state.showSetup) { state.showSetup = true; render(); } }).catch(() => {}); }
      return;
    }
    if (r === 'codes') { app.innerHTML = viewCodes(q.g); return; }
    if (r === 'report') { app.innerHTML = viewReport(parts, q); return; }
    const V = {
      '': viewDashboard, groups: viewGroups, group: () => viewGroup(parts[1]), class: () => viewClass(parts[1]), students: viewStudents, student: () => viewStudent(parts[1]),
      attendance: viewAttendance, incidents: viewIncidents, settings: viewSettings, more: viewMore,
      homework: viewHwList, hw: () => viewHw(parts[1]), exams: viewExamList, exam: () => viewExam(parts[1]),
      schedule: viewSchedule, reports: viewReports, stats: viewStats, tools: viewTools, lessons: viewLessons
    };
    app.innerHTML = layout((V[r] || viewDashboard)(), r);
  }
  const go = h => { if (location.hash === h) render(); else location.hash = h; };

  // إعادة الرسم عند تغيّر البيانات (بدون مقاطعة الكتابة)
  let dirty = false, pdown = false;
  const typing = () => { const a = document.activeElement; return a && $('#app').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox'; };
  const flush = () => { if (dirty && !typing() && !pdown && state.route !== 'settings') { dirty = false; render(); } };
  Store.on(changed => {
    const b = $('#badge'); if (b) b.innerHTML = badge();
    if (!changed) return;
    if (!Store.token() && state.route !== 'p') return render();
    if (state.route === 'settings' || typing() || pdown) { dirty = true; return; }
    render();
  });
  document.addEventListener('focusout', () => setTimeout(flush, 300));
  // لا نعيد الرسم أثناء الضغط حتى لا تضيع اللمسة
  document.addEventListener('pointerdown', () => { pdown = true; }, true);
  const pup = () => setTimeout(() => { pdown = false; flush(); }, 60);
  document.addEventListener('pointerup', pup, true);
  document.addEventListener('pointercancel', pup, true);

  // ───────── الإجراءات ─────────
  const sOf = id => Store.get('Students', id);
  function uniqueCode() {
    const used = new Set(Store.list('Students').map(s => s.code));
    let c; do { c = L.genCode(); } while (used.has(c));
    return c;
  }
  function sendIncident(id) {
    const i = Store.get('Incidents', id), s = i && sOf(i.studentId);
    if (!s) return;
    const tp = S().templates || {}, lv = level(i.levelId), rs = reason(i.reasonId);
    openWA(s.guardianPhone, L.fillTemplate((tp.byLevel || {})[i.levelId] || tp.default, vars(s, { 'المستوى': lv ? lv.name : '', 'السبب': rs ? rs.name : '', 'التاريخ': fmtDate(i.date) })));
    if (!i.followUpStatus || i.followUpStatus === 'new') Store.save('Incidents', { id, followUpStatus: 'notified' });
    if (state.modal) closeModal();
  }

  // ── تسجيل الحصة ──
  const curClass = () => state.route === 'class' ? Store.get('Classes', parseHash().parts[1]) : null;
  function recRow(c, sid, patch) {
    const cur = rec(c.id, sid) || { id: recId(c.id, sid), classId: c.id, studentId: sid, attendance: '', homework: '', score: '', note: '', paid: '', amount: '', examStatus: '' };
    return Object.assign({}, cur, patch, { deleted: '' });
  }
  function numVal(v, label) {
    const t = enNum(v); if (t === '') return '';
    const n = Number(t); if (isNaN(n) || n < 0) throw new Error(label + ': رقم غير صحيح');
    return String(n);
  }
  function scoreVal(v, c) {
    const n = numVal(v, 'الدرجة');
    if (n !== '' && Number(c.maxScore) > 0 && Number(n) > Number(c.maxScore)) throw new Error('الدرجة لازم تكون بين 0 و ' + c.maxScore);
    return n;
  }
  /** حفظ تسجيلات الحصة + مزامنة حالة الحضور مع شاشة الحضور اليومية */
  function saveRecs(c, rows) {
    Store.saveMany('Records', rows);
    const att = [];
    rows.forEach(r => {
      const aid = attId(r.studentId, c.date), cur = Store.get('Attendance', aid);
      if (r.attendance && (!cur || cur.status !== r.attendance)) att.push({ id: aid, studentId: r.studentId, groupId: c.groupId, date: c.date, status: r.attendance, note: cur ? cur.note : '', deleted: '' });
      else if (!r.attendance && cur && (cur.status === 'present' || cur.status === 'absent' || cur.status === 'late')) att.push({ id: aid, deleted: '1' });
    });
    if (att.length) Store.saveMany('Attendance', att);
  }

  const acts = {
    addClass: el => openModal({ type: 'class', gid: el.dataset.g }),
    editClass: el => openModal({ type: 'class', c: Store.get('Classes', el.dataset.id) }),
    delClass: el => {
      if (!confirm('حذف هذه الحصة وكل ما سُجّل فيها؟')) return;
      const c = Store.get('Classes', el.dataset.id), rel = Store.list('Records').filter(r => r.classId === c.id).map(r => ({ id: r.id, deleted: '1' }));
      if (rel.length) Store.saveMany('Records', rel);
      Store.remove('Classes', c.id); go('#/group/' + c.groupId);
    },
    setf: el => {
      const c = curClass(); if (!c) return;
      const { s, f, v } = el.dataset, cur = rec(c.id, s) || {};
      const val = cur[f] === v ? '' : v, patch = { [f]: val };
      if (f === 'paid') patch.amount = val === '1' ? (cur.amount || defFee(c) || '') : val === '0' ? '' : cur.amount || '';
      if (f === 'examStatus' && val) { patch.score = ''; if (!cur.attendance) patch.attendance = 'present'; }
      saveRecs(c, [recRow(c, s, patch)]);
    },
    fillAll: el => {
      const c = curClass(); if (!c) return;
      const { f, v } = el.dataset;
      const rows = students(c.groupId).filter(s => !(rec(c.id, s.id) || {})[f]).map(s => {
        const patch = { [f]: v }; if (f === 'paid') patch.amount = (rec(c.id, s.id) || {}).amount || defFee(c) || '';
        return recRow(c, s.id, patch);
      });
      if (!rows.length) return toast('كل الطلاب مسجلين بالفعل');
      saveRecs(c, rows); toast('تم تسجيل ' + rows.length + ' طالب ✓');
    },
    selAll: () => {
      const c = curClass(); if (!c) return;
      const st = students(c.groupId), sel = state.sel[c.id] || (state.sel[c.id] = new Set());
      if (sel.size === st.length) sel.clear(); else st.forEach(s => sel.add(s.id));
      render();
    },
    syncNow: () => Store.sync(),
    toggleSetup: () => { state.showSetup = !state.showSetup; render(); },
    closeModal,
    print: () => window.print(),
    copy: el => navigator.clipboard.writeText(el.dataset.t).then(() => toast('تم النسخ ✓'), () => toast('تعذر النسخ', true)),
    theme: () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const n = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; localStorage.setItem('tapp_theme', n); },
    logout: () => { if (Store.pending && !confirm('يوجد ' + Store.pending + ' تعديل لم يُرفع بعد وسيُفقد. متابعة الخروج؟')) return; if (Store.pending || confirm('تسجيل الخروج من هذا الجهاز؟')) Store.clearAll(); },
    export: () => {
      const blob = new Blob([JSON.stringify(Store.exportLocal(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup-' + L.today() + '.json'; a.click();
    },
    addGroup: () => openModal({ type: 'group' }),
    editGroup: el => openModal({ type: 'group', g: Store.get('Groups', el.dataset.id) }),
    delGroup: el => {
      if (students(el.dataset.id).length || students(el.dataset.id, true).length) return toast('انقل الطلاب أو احذفهم أولاً', true);
      if (confirm('حذف هذه المجموعة؟')) { Store.remove('Groups', el.dataset.id); go('#/groups'); }
    },
    addStudent: el => openModal({ type: 'student', gid: el.dataset.g || state.q.g }),
    editStudent: el => openModal({ type: 'student', s: sOf(el.dataset.id) }),
    bulk: el => openModal({ type: 'bulk', gid: el.dataset.g }),
    archive: el => { const s = sOf(el.dataset.id); Store.save('Students', { id: s.id, status: s.status === 'archived' ? 'active' : 'archived' }); },
    delStudent: el => { if (confirm('حذف الطالب نهائياً من القوائم؟ (يُفضّل الأرشفة)')) { Store.remove('Students', el.dataset.id); go('#/students'); } },
    regen: el => { if (confirm('توليد كود جديد؟ الكود القديم سيتوقف عن العمل.')) Store.save('Students', { id: el.dataset.id, code: uniqueCode() }); },
    sendCode: el => {
      const s = sOf(el.dataset.id), url = location.origin + location.pathname + '#/p?c=' + s.code;
      openWA(s.guardianPhone, 'السلام عليكم ' + (s.guardianName || '') + '،\nيمكنكم متابعة الطالب/ة ' + s.name + ' (الحضور والسلوك) من الرابط:\n' + url + '\nكود الطالب: ' + s.code + '\n' + P().teacherName + ' - ' + P().subject);
    },
    newIncident: el => openModal({ type: 'incident', studentId: el.dataset.s || '' }),
    editIncident: el => openModal(Object.assign({ type: 'incident' }, Store.get('Incidents', el.dataset.id))),
    delIncident: el => { if (confirm('حذف هذه الواقعة؟')) Store.remove('Incidents', el.dataset.id); },
    waIncident: el => sendIncident(el.dataset.id),
    newPraise: el => openModal({ type: 'praise', studentId: el.dataset.s || '' }),
    delPraise: el => { if (confirm('حذف الإشادة؟')) Store.remove('Praise', el.dataset.id); },
    waPraise: el => {
      const x = Store.get('Praise', el.dataset.id), s = x && sOf(x.studentId);
      if (!s) return;
      openWA(s.guardianPhone, L.fillTemplate(S().templates.praise, vars(s, { 'الإشادة': x.text, 'النقاط': x.points, 'التاريخ': fmtDate(x.date) })));
      if (state.modal) closeModal();
    },
    applySug: el => { const x = state.sugg.find(s => s.key === el.dataset.k); if (x) openModal({ type: 'incident', studentId: x.studentId, levelId: x.levelId, reasonId: x.reasonId, note: x.text }); },
    snooze: el => {
      const t = L.today(), dis = Object.fromEntries(Object.entries(Store.setting('dismissed') || {}).filter(([, v]) => v >= t));
      dis[el.dataset.k] = L.addDays(t, Number(el.dataset.days));
      Store.saveSetting('dismissed', dis);
      toast(Number(el.dataset.days) > 3 ? 'تم الرفض لمدة شهر' : 'تم التأجيل 3 أيام');
    },
    mark: el => {
      const { s, g, d, st } = el.dataset, id = attId(s, d), cur = Store.get('Attendance', id);
      if (cur && cur.status === st) Store.remove('Attendance', id);
      else Store.save('Attendance', { id, studentId: s, groupId: g, date: d, status: st, note: '', deleted: '' });
    },
    allPresent: el => {
      const { g, d } = el.dataset;
      const rows = students(g).filter(s => !Store.get('Attendance', attId(s.id, d))).map(s => ({ id: attId(s.id, d), studentId: s.id, groupId: g, date: d, status: 'present', note: '', deleted: '' }));
      if (rows.length) Store.saveMany('Attendance', rows);
    },
    waAbsent: el => { const s = sOf(el.dataset.s); openWA(s.guardianPhone, L.fillTemplate(S().templates.absence, vars(s, { 'التاريخ': fmtDate(el.dataset.d) }))); },
    pick: el => { state.modal.studentId = el.dataset.id; renderModal(); },
    unpick: () => { state.modal.studentId = ''; state.pickQ = ''; renderModal(); },
    rowOp: el => {
      const form = el.closest('form'), { sec, op } = el.dataset, i = Number(el.dataset.i);
      let arr, rst;
      if (sec === 'terms') { rst = collectReset(form); arr = rst.terms; } else arr = collectRows(form, sec);
      if (op === 'add') {
        const id = { levels: 'L', reasons: 'R', rules: 'U' }[sec] + Date.now().toString(36);
        arr.push({ levels: { id, name: 'مستوى جديد', color: '#6366f1' }, reasons: { id, name: '' }, terms: { name: 'ترم ' + (arr.length + 1), start: '', end: '' }, rules: { id, type: 'absenceCount', count: 3, days: 30, threshold: 50, reasonId: '', fromLevelId: '', levelId: (S().levels[0] || {}).id, enabled: true } }[sec]);
      } else if (op === 'del') arr.splice(i, 1);
      else { const j = op === 'up' ? i - 1 : i + 1; [arr[i], arr[j]] = [arr[j], arr[i]]; }
      if (sec === 'terms') state.draft.reset = rst; else state.draft[sec] = arr;
      state.openSec = sec === 'terms' ? 'reset' : sec;
      render();
    },
    addHw: el => openModal({ type: 'assignment', gid: el.dataset.g || state.q.g }),
    editHw: el => openModal({ type: 'assignment', a: Store.get('Assignments', el.dataset.id) }),
    delHw: el => {
      if (!confirm('حذف هذا الواجب وكل تسجيلات التسليم الخاصة به؟')) return;
      const id = el.dataset.id, rel = Store.list('Submissions').filter(x => x.assignmentId === id).map(x => ({ id: x.id, deleted: '1' }));
      if (rel.length) Store.saveMany('Submissions', rel);
      Store.remove('Assignments', id); go('#/homework');
    },
    sub: el => {
      const { a, s, st } = el.dataset, id = subId(a, s), cur = Store.get('Submissions', id);
      if (cur && cur.status === st) Store.remove('Submissions', id);
      else Store.save('Submissions', { id, assignmentId: a, studentId: s, status: st, note: '', deleted: '' });
    },
    allDone: el => {
      const a = Store.get('Assignments', el.dataset.id);
      const rows = students(a.groupId).filter(s => !Store.get('Submissions', subId(a.id, s.id))).map(s => ({ id: subId(a.id, s.id), assignmentId: a.id, studentId: s.id, status: 'done', note: '', deleted: '' }));
      if (rows.length) Store.saveMany('Submissions', rows);
    },
    waHw: el => { const a = Store.get('Assignments', el.dataset.a), s = sOf(el.dataset.s); openWA(s.guardianPhone, L.fillTemplate(tpl('homework'), vars(s, { 'الواجب': a.title, 'التاريخ': fmtDate(a.dueDate) }))); },
    addExam: el => openModal({ type: 'exam', gid: el.dataset.g || state.q.g }),
    editExam: el => openModal({ type: 'exam', x: Store.get('Exams', el.dataset.id) }),
    delExam: el => {
      if (!confirm('حذف هذا الاختبار وكل درجاته؟')) return;
      const id = el.dataset.id, rel = Store.list('Grades').filter(x => x.examId === id).map(x => ({ id: x.id, deleted: '1' }));
      if (rel.length) Store.saveMany('Grades', rel);
      Store.remove('Exams', id); go('#/exams');
    },
    gradeAbsent: el => {
      const { e, s } = el.dataset, id = gradeId(e, s), cur = Store.get('Grades', id);
      if (cur && cur.status === 'absent') Store.remove('Grades', id);
      else Store.save('Grades', { id, examId: e, studentId: s, score: '', status: 'absent', note: '', deleted: '' });
    },
    waGrade: el => {
      const x = Store.get('Exams', el.dataset.e), g = Store.get('Grades', gradeId(el.dataset.e, el.dataset.s)), s = sOf(el.dataset.s);
      if (!g) return;
      openWA(s.guardianPhone, L.fillTemplate(tpl('grade'), vars(s, { 'الاختبار': x.title, 'التاريخ': fmtDate(x.date), 'الدرجة': g.status === 'absent' ? 'غائب' : g.score, 'النهائية': x.maxScore })));
    },
    addLesson: el => openModal({ type: 'lesson', gid: el.dataset.g || state.q.g || '' }),
    editLesson: el => openModal({ type: 'lesson', l: Store.get('Lessons', el.dataset.id) }),
    delLesson: el => { if (confirm('حذف تحضير هذا الدرس؟')) Store.remove('Lessons', el.dataset.id); },
    lessonDone: el => { const l = Store.get('Lessons', el.dataset.id); Store.save('Lessons', { id: l.id, status: l.status === 'done' ? 'planned' : 'done' }); },
    hwFromLesson: el => {
      const l = Store.get('Lessons', el.dataset.id);
      openModal({ type: 'assignment', a: { groupId: l.groupId, title: l.homework.split('\n')[0].slice(0, 120), dueDate: L.addDays(l.date, 7), note: l.homework } });
    },
    pickRandom: el => {
      const g = el.dataset.g, T = state.tools, pool = toolPool(g);
      if (!pool.length) return toast('لا يوجد طلاب متاحون', true);
      T.used[g] = T.used[g] || new Set();
      const res = L.pickRandom(pool.map(s => s.id), T.used[g]);
      if (res.reset) toast('اختير كل الطلاب — بدأت جولة جديدة');
      const box = $('#pickShow'), final = sOf(res.pick).name;
      let k = 0;
      el.disabled = true;
      const iv = setInterval(() => {
        if (box) box.textContent = pool[Math.floor(Math.random() * pool.length)].name;
        if (++k >= 14) { clearInterval(iv); T.current = final; render(); }
      }, 70);
    },
    resetRandom: el => { state.tools.used[el.dataset.g] = new Set(); state.tools.current = ''; render(); },
    reshuffle: el => forms.split({ n: state.tools.n, g: el.dataset.g }),
    timerSet: el => { setTimer(Number(el.dataset.sec)); render(); },
    timerStart: () => { const tm = state.tools.timer; if (tm.left <= 0) tm.left = tm.total; tm.end = Date.now() + tm.left * 1000; tm.running = true; render(); },
    timerPause: () => { const tm = state.tools.timer; tm.left = Math.max(0, Math.round((tm.end - Date.now()) / 1000)); tm.running = false; render(); },
    timerReset: () => { const tm = state.tools.timer; tm.left = tm.total; tm.running = false; render(); },
    parentReset: () => { localStorage.removeItem(PKEY); state.parent = {}; go('#/p'); }
  };

  // ───────── النماذج ─────────
  const forms = {
    classForm(f) {
      const c = state.modal.c || {}, id = c.id || uid();
      Store.save('Classes', { id, groupId: c.groupId || state.modal.gid, date: f.date, title: f.title.trim(), maxScore: numVal(f.maxScore, 'الدرجة النهائية'), fee: numVal(f.fee, 'المصاريف') });
      closeModal(); if (!c.id) go('#/class/' + id); else toast('تم الحفظ ✓');
    },
    bulkRec(f) {
      const c = curClass(); if (!c) return;
      const st = students(c.groupId), sel = state.sel[c.id] || new Set();
      const targets = f.target === 'sel' ? st.filter(s => sel.has(s.id)) : st;
      if (!targets.length) throw new Error(f.target === 'sel' ? 'لم تحدد أي طالب' : 'لا يوجد طلاب');
      const patch = {};
      if (f.clear) Object.assign(patch, { attendance: '', homework: '', score: '', note: '', paid: '', amount: '', examStatus: '' });
      else {
        if (f.attendance) patch.attendance = f.attendance;
        if (f.homework) patch.homework = f.homework;
        if (f.paid) patch.paid = f.paid;
        const sc = scoreVal(f.score, c); if (sc !== '') { patch.score = sc; patch.examStatus = ''; }
        if (f.examStatus) { patch.examStatus = f.examStatus; patch.score = ''; if (!patch.attendance) patch.attendance = 'present'; }
        const am = numVal(f.amount, 'المبلغ'); if (am !== '') patch.amount = am;
        if (f.note.trim()) patch.note = f.note.trim();
        if (!Object.keys(patch).length) throw new Error('اختر شيئاً لتطبيقه');
      }
      if (f.clear && !confirm('مسح بيانات ' + targets.length + ' طالب في هذه الحصة؟')) return;
      const rows = targets.map(s => {
        const p = Object.assign({}, patch), cur = rec(c.id, s.id) || {};
        if (p.paid === '1' && p.amount == null) p.amount = cur.amount || defFee(c) || '';
        if (p.paid === '0' && p.amount == null) p.amount = '';
        return recRow(c, s.id, p);
      });
      saveRecs(c, rows);
      state.bulkOpen = false; if (f.target === 'sel') sel.clear();
      toast('تم التطبيق على ' + rows.length + ' طالب ✓');
    },
    async login(f) {
      const d = await Store.api('login', { password: f.password });
      Store.setToken(d.token); render(); Store.sync();
    },
    async firstSetup(f) {
      if (f.password !== f.password2) throw new Error('كلمتا المرور غير متطابقتين');
      const d = await Store.api('initPassword', { password: f.password });
      Store.setToken(d.token); state.showSetup = false; render(); Store.sync();
    },
    async parent(f) { await parentLoad(f.code.trim().toUpperCase()); },
    group(f) {
      const g = state.modal.g || {}, id = g.id || uid();
      const schedule = WEEK.filter(d => f['d' + d] || f['t' + d]).map(d => ({ d, t: f['t' + d] || '' }));
      Store.save('Groups', { id, name: f.name.trim(), type: f.type, note: f.note.trim(), sortOrder: g.sortOrder || String(Date.now()), schedule: JSON.stringify(schedule), fee: numVal(f.fee, 'المصاريف') });
      closeModal(); if (!g.id) go('#/group/' + id);
    },
    student(f) {
      const x = state.modal.s || {};
      Store.save('Students', Object.assign({ id: x.id || uid(), code: x.code || uniqueCode(), status: x.status || 'active' }, {
        name: f.name.trim(), groupId: f.groupId, guardianName: f.guardianName.trim(), guardianPhone: f.guardianPhone.trim(), studentPhone: f.studentPhone.trim(), notes: f.notes.trim()
      }));
      closeModal(); toast('تم الحفظ ✓');
    },
    bulk(f) {
      const used = new Set(Store.list('Students').map(s => s.code));
      const rows = L.parseBulk(f.list).map(x => { let c; do { c = L.genCode(); } while (used.has(c)); used.add(c); return Object.assign({ id: uid(), code: c, groupId: f.groupId, status: 'active', studentPhone: '', notes: '' }, x); });
      if (!rows.length) throw new Error('لا توجد أسماء');
      Store.saveMany('Students', rows); closeModal(); toast('تمت إضافة ' + rows.length + ' طالب ✓');
    },
    async incident(f) {
      const m = state.modal, isNew = !m.id;
      const r = await Store.save('Incidents', { id: m.id || uid(), studentId: m.studentId, levelId: f.levelId, reasonId: f.reasonId, date: f.date, note: f.note.trim(), privateNote: f.privateNote.trim(), countsTowardLevel: f.counts ? '1' : '0', followUpStatus: m.followUpStatus || 'new', resolvedAt: m.resolvedAt || '' });
      if (isNew) openModal({ type: 'sent', kind: 'incident', id: r.id }); else closeModal();
    },
    async praise(f) {
      const r = await Store.save('Praise', { id: uid(), studentId: state.modal.studentId, text: f.text.trim(), points: String(Number(f.points) || 0), date: f.date });
      openModal({ type: 'sent', kind: 'praise', id: r.id });
    },
    profile(f) { Store.saveSetting('profile', f); toast('تم الحفظ ✓'); },
    levels(f, form) {
      const arr = collectRows(form, 'levels').filter(l => l.name.trim());
      if (!arr.length) throw new Error('لازم مستوى واحد على الأقل');
      Store.saveSetting('levels', arr); delete state.draft.levels; toast('تم الحفظ ✓'); render();
    },
    reasons(f, form) {
      const arr = collectRows(form, 'reasons').filter(r => r.name.trim());
      if (!arr.length) throw new Error('لازم سبب واحد على الأقل');
      Store.saveSetting('reasons', arr); delete state.draft.reasons; toast('تم الحفظ ✓'); render();
    },
    reset(f, form) {
      const r = collectReset(form);
      if (r.mode === 'term' && !r.terms.some(t => t.start && t.end)) throw new Error('أضف ترم واحد على الأقل بتاريخ بداية ونهاية');
      Store.saveSetting('reset', r); delete state.draft.reset; toast('تم الحفظ ✓'); render();
    },
    rules(f, form) { Store.saveSetting('rules', collectRows(form, 'rules')); delete state.draft.rules; toast('تم الحفظ ✓'); render(); },
    templates(f) {
      const byLevel = {};
      Object.keys(f).filter(k => k.startsWith('lv_') && f[k].trim()).forEach(k => byLevel[k.slice(3)] = f[k]);
      Store.saveSetting('templates', { default: f.default, praise: f.praise, absence: f.absence, homework: f.homework, grade: f.grade, byLevel }); toast('تم الحفظ ✓');
    },
    assignment(f) {
      const a = state.modal.a || {}, id = a.id || uid();
      Store.save('Assignments', { id, groupId: f.groupId, title: f.title.trim(), dueDate: f.dueDate, note: f.note.trim() });
      closeModal(); if (!a.id) go('#/hw/' + id);
    },
    exam(f) {
      const x = state.modal.x || {}, id = x.id || uid(), max = Number(f.maxScore);
      if (!(max > 0)) throw new Error('الدرجة النهائية لازم تكون أكبر من صفر');
      Store.save('Exams', { id, groupId: f.groupId, title: f.title.trim(), date: f.date, maxScore: String(max), note: f.note.trim() });
      closeModal(); if (!x.id) go('#/exam/' + id);
    },
    lesson(f) {
      const l = state.modal.l || {};
      Store.save('Lessons', { id: l.id || uid(), groupId: f.groupId || '', date: f.date, title: f.title.trim(), objectives: f.objectives.trim(), plan: f.plan.trim(), homework: f.homework.trim(), notes: f.notes.trim(), status: l.status || 'planned' });
      closeModal(); toast('تم الحفظ ✓');
    },
    grading(f) { Store.saveSetting('grading', { passPercent: Math.min(100, Math.max(0, Number(f.passPercent) || 50)) }); toast('تم الحفظ ✓'); },
    split(f) {
      const T = state.tools;
      T.n = Math.max(2, Number(f.n) || 2);
      T.split = { g: f.g, groups: L.splitGroups(toolPool(f.g), T.n).map(arr => arr.map(s => s.name)) };
      render();
    },
    timer(f) { setTimer(Math.max(1, Math.round((Number(f.min) || 1) * 60))); render(); },
    async password(f) {
      if (f.newPassword !== f.newPassword2) throw new Error('كلمتا المرور غير متطابقتين');
      const d = await Store.api('changePassword', { oldPassword: f.oldPassword, newPassword: f.newPassword });
      Store.setToken(d.token); toast('تم تغيير كلمة المرور ✓'); render();
    }
  };

  // ───────── ربط الأحداث ─────────
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el && acts[el.dataset.act]) { e.preventDefault(); acts[el.dataset.act](el, e); return; }
    if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('submit', async e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const btn = form.querySelector('button:not([type=button])');
    if (btn) btn.disabled = true;
    try { await forms[form.dataset.form](Object.fromEntries(new FormData(form)), form); }
    catch (x) { toast(x.message, true); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  });
  document.addEventListener('change', e => {
    const el = e.target, k = el.dataset && el.dataset.chg;
    if (!k) return;
    if (k.startsWith('rec')) {
      const c = curClass(); if (!c) return;
      const sid = el.dataset.s;
      if (k === 'recSel') {
        const sel = state.sel[c.id] || (state.sel[c.id] = new Set());
        if (el.checked) sel.add(sid); else sel.delete(sid);
        el.closest('.stu').classList.toggle('sel', el.checked);
        const lab = document.querySelector('form[data-form="bulkRec"] input[value="sel"] + span'); if (lab) lab.textContent = 'المحددين فقط (' + sel.size + ')';
        const r = document.querySelector('form[data-form="bulkRec"] input[value="' + (sel.size ? 'sel' : 'all') + '"]'); if (r) r.checked = true;
        return;
      }
      const cur = rec(c.id, sid) || {}, fld = { recScore: 'score', recAmount: 'amount', recNote: 'note' }[k];
      try {
        const v = k === 'recScore' ? scoreVal(el.value, c) : k === 'recAmount' ? numVal(el.value, 'المبلغ') : el.value.trim();
        if (v === (cur[fld] || '')) return;
        const patch = { [fld]: v };
        if (k === 'recAmount' && v) patch.paid = cur.paid || '1';
        if (k === 'recScore' && v) patch.examStatus = '';
        saveRecs(c, [recRow(c, sid, patch)]);
      } catch (x) { toast(x.message, true); el.value = cur[fld] || ''; }
      return;
    }
    const q = Object.assign({}, state.q);
    if (k === 'attGroup') { localStorage.setItem('tapp_lastGroup', el.value); go('#/attendance?g=' + el.value + (q.d ? '&d=' + q.d : '')); }
    if (k === 'attDate') go('#/attendance?g=' + el.dataset.g + '&d=' + el.value);
    if (k === 'stGroup' || k === 'stArch') { q[k === 'stGroup' ? 'g' : 'arch'] = el.value; const s = state.search; go('#/students?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v))); state.search = s; }
    if (k === 'qg') go('#/' + state.route + '?' + new URLSearchParams(Object.entries(Object.assign({}, q, { g: el.value })).filter(([, v]) => v)));
    if (k === 'repMonth') go('#/reports?' + new URLSearchParams({ g: el.dataset.g, m: el.value }));
    if (k === 'skipAbs') state.tools.skipAbsent = el.checked;
    if (k === 'grade') {
      const { e: eid, s: sid } = el.dataset, id = gradeId(eid, sid), v = el.value.trim(), x = Store.get('Exams', eid);
      if (v === '') { if (Store.get('Grades', id)) Store.remove('Grades', id); return; }
      const n = Number(v.replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
      if (isNaN(n) || n < 0 || n > Number(x.maxScore)) { toast('الدرجة لازم تكون بين 0 و ' + x.maxScore, true); el.value = ''; return; }
      Store.save('Grades', { id, examId: eid, studentId: sid, score: String(n), status: '', note: '', deleted: '' });
    }
    if (k === 'fu') Store.save('Incidents', { id: el.dataset.id, followUpStatus: el.value, resolvedAt: el.value === 'resolved' ? L.today() : '' });
  });
  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.inp;
    if (k === 'search') { state.search = e.target.value; $('#list').innerHTML = studentRows(); }
    if (k === 'incSearch') { state.search = e.target.value; const v = viewIncidents(); const tmp = document.createElement('div'); tmp.innerHTML = v.body; $('#list').innerHTML = tmp.querySelector('#list').innerHTML; }
    if (k === 'pick') { state.pickQ = e.target.value; $('#pickList').innerHTML = pickList(); }
  });
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details[data-bulk]')) state.bulkOpen = e.target.open; }, true);
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details[data-sec]') && e.target.open) state.openSec = e.target.dataset.sec; }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.modal) closeModal();
    if (e.key === 'Enter' && e.target.dataset && ['grade', 'recScore', 'recAmount', 'recNote'].includes(e.target.dataset.chg)) {
      e.preventDefault();
      const all = [...document.querySelectorAll('input[data-chg="' + e.target.dataset.chg + '"]:not([disabled])')], i = all.indexOf(e.target);
      if (all[i + 1]) all[i + 1].focus(); else e.target.blur();
    }
  });
  // مؤقت أدوات الفصل
  setInterval(() => {
    const tm = state.tools.timer;
    if (!tm.running) return;
    tm.left = Math.max(0, Math.round((tm.end - Date.now()) / 1000));
    const el = $('#timerShow');
    if (el) el.textContent = fmtSec(tm.left);
    if (tm.left === 0) { tm.running = false; beep(); if (state.route === 'tools') render(); }
  }, 250);
  window.addEventListener('hashchange', render);

  // ───────── التشغيل ─────────
  (async () => {
    const th = localStorage.getItem('tapp_theme'); if (th) document.documentElement.dataset.theme = th;
    document.documentElement.style.setProperty('--pri', CONFIG.primaryColor || '#0f766e');
    document.title = CONFIG.appName;
    try { await Store.init(); } catch (e) { toast('تعذر فتح التخزين المحلي: ' + e.message, true); }
    render();
    Store.sync();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
