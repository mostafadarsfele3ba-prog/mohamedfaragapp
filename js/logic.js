/* دوال الحساب النقية — بدون أي اعتماد على الواجهة أو الشبكة (ومُختبرة في tests/) */
(function (root) {
  const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const pad = n => String(n).padStart(2, '0');
  const parse = d => new Date(d + 'T00:00:00Z');
  const fmt = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const addDays = (d, n) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const live = r => r && r.deleted !== '1';

  function genCode(rand) {
    const b = rand ? rand(8) : crypto.getRandomValues(new Uint8Array(8));
    let s = '';
    for (let i = 0; i < 8; i++) s += CHARS[b[i] % CHARS.length];
    return s;
  }

  /** بداية "الفترة الحالية" حسب إعداد التصفير، أو null لو بدون تصفير */
  function periodStart(reset, t) {
    if (!reset || !reset.mode || reset.mode === 'none') return null;
    if (reset.mode === 'month') return t.slice(0, 8) + '01';
    if (reset.mode === 'days') {
      const n = Math.max(1, Number(reset.days) || 30);
      const anchor = reset.anchor || '2026-01-01';
      return addDays(anchor, Math.floor(diffDays(anchor, t) / n) * n);
    }
    if (reset.mode === 'term') {
      const terms = (reset.terms || []).filter(x => x.start && x.end);
      const cur = terms.find(x => x.start <= t && t <= x.end);
      if (cur) return cur.start;
      const ended = terms.filter(x => x.end < t).map(x => x.end).sort();
      return ended.length ? addDays(ended[ended.length - 1], 1) : null;
    }
    return null;
  }

  const levelIndex = (levels, id) => (levels || []).findIndex(l => l.id === id);

  /** أعلى مستوى (index) من الوقائع المحتسبة منذ start، أو -1 */
  function levelOf(incidents, levels, start) {
    let best = -1;
    (incidents || []).forEach(i => {
      if (!live(i) || i.countsTowardLevel === '0') return;
      if (start && i.date < start) return;
      best = Math.max(best, levelIndex(levels, i.levelId));
    });
    return best;
  }

  function attStats(recs, from) {
    const c = { present: 0, absent: 0, late: 0, excused: 0, total: 0, rate: null };
    (recs || []).forEach(r => {
      if (!live(r) || (from && r.date < from) || !(r.status in c)) return;
      c[r.status]++; c.total++;
    });
    const base = c.total - c.excused;
    c.rate = base > 0 ? Math.round((c.present + c.late) * 100 / base) : null;
    return c;
  }

  const RULE_TYPES = {
    absenceStreak: 'غياب متتالي',
    absenceCount: 'عدد مرات الغياب',
    lateCount: 'عدد مرات التأخر',
    reasonCount: 'تكرار سبب معيّن',
    escalate: 'تكرار بعد الوصول لمستوى',
    missingHomework: 'عدم تسليم الواجبات',
    lowGrades: 'درجات أقل من الحد'
  };

  function hwStats(subs, from) {
    const c = { done: 0, missing: 0, late: 0, excused: 0, total: 0, rate: null };
    (subs || []).forEach(r => {
      if (!live(r) || (from && r.date && r.date < from) || !(r.status in c)) return;
      c[r.status]++; c.total++;
    });
    const base = c.total - c.excused;
    c.rate = base > 0 ? Math.round((c.done + c.late) * 100 / base) : null;
    return c;
  }

  /** نسبة الدرجة من النهائية، أو null لو غائب/لم تُرصد */
  function pct(score, max) {
    if (score === '' || score == null || !(Number(max) > 0)) return null;
    const n = Number(score);
    return isNaN(n) ? null : Math.round(n * 1000 / Number(max)) / 10;
  }

  function scoreSummary(values) {
    const v = values.filter(x => x != null && !isNaN(x));
    if (!v.length) return { n: 0, avg: null, max: null, min: null };
    const sum = v.reduce((a, b) => a + b, 0);
    return { n: v.length, avg: Math.round(sum * 10 / v.length) / 10, max: Math.max(...v), min: Math.min(...v) };
  }

  const dayOfWeek = d => parse(d).getUTCDay(); // 0 = الأحد

  /** اختيار عشوائي بدون تكرار حتى ينتهي الجميع */
  function pickRandom(pool, used, rand) {
    rand = rand || Math.random;
    let left = pool.filter(x => !used.has(x));
    let reset = false;
    if (!left.length) { used.clear(); left = pool.slice(); reset = true; }
    if (!left.length) return { pick: null, reset };
    const pick = left[Math.floor(rand() * left.length)];
    used.add(pick);
    return { pick, reset, left: left.length - 1 };
  }

  function shuffle(arr, rand) {
    rand = rand || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /** تقسيم قائمة إلى n مجموعات متوازنة */
  function splitGroups(arr, n, rand) {
    n = Math.max(1, Math.min(Number(n) || 1, arr.length || 1));
    const out = Array.from({ length: n }, () => []);
    shuffle(arr, rand).forEach((x, i) => out[i % n].push(x));
    return out;
  }

  function checkRule(rule, att, inc, levels, t, pStart, extra) {
    const n = Math.max(1, Number(rule.count) || 1);
    const from = Number(rule.days) > 0 ? addDays(t, -(Number(rule.days) - 1)) : (pStart || '0000-00-00');
    if (rule.type === 'absenceStreak') {
      let k = 0;
      for (const r of att.slice().sort((a, b) => b.date.localeCompare(a.date))) {
        if (r.status === 'excused') continue;
        if (r.status !== 'absent') break;
        k++;
      }
      return k >= n ? { text: 'غاب ' + k + ' مرات متتالية', reasonId: rule.reasonId } : null;
    }
    if (rule.type === 'absenceCount' || rule.type === 'lateCount') {
      const st = rule.type === 'absenceCount' ? 'absent' : 'late';
      const k = att.filter(r => r.status === st && r.date >= from).length;
      return k >= n ? { text: (st === 'absent' ? 'غاب ' : 'تأخر ') + k + ' مرات خلال الفترة', reasonId: rule.reasonId } : null;
    }
    if (rule.type === 'reasonCount') {
      const k = inc.filter(i => i.reasonId === rule.reasonId && i.date >= from).length;
      return k >= n ? { text: 'تكرر نفس السبب ' + k + ' مرات', reasonId: rule.reasonId } : null;
    }
    if (rule.type === 'missingHomework') {
      const k = ((extra && extra.subs) || []).filter(x => x.status === 'missing' && x.date >= from && x.date <= t).length;
      return k >= n ? { text: 'لم يسلّم ' + k + ' واجبات خلال الفترة', reasonId: rule.reasonId } : null;
    }
    if (rule.type === 'lowGrades') {
      const th = Number(rule.threshold) || 50;
      const k = ((extra && extra.grades) || []).filter(g => g.pct != null && g.pct < th && g.date >= from).length;
      return k >= n ? { text: 'درجته أقل من ' + th + '% في ' + k + ' اختبارات', reasonId: rule.reasonId } : null;
    }
    if (rule.type === 'escalate') {
      const fi = levelIndex(levels, rule.fromLevelId);
      if (fi < 0) return null;
      const inPeriod = inc.filter(i => i.date >= from && i.countsTowardLevel !== '0')
        .sort((a, b) => a.date.localeCompare(b.date) || Number(a.createdAt) - Number(b.createdAt));
      let at = -1;
      inPeriod.forEach((i, k) => { if (levelIndex(levels, i.levelId) >= fi) at = k; });
      if (at < 0) return null;
      const base = inPeriod[at];
      const after = inPeriod.slice(at + 1).filter(i => i.reasonId === base.reasonId);
      return after.length >= n ? { text: 'تكرر السبب بعد الوصول لـ ' + levels[fi].name, reasonId: base.reasonId } : null;
    }
    return null;
  }

  /** اقتراحات القواعد الذكية — تقترح فقط ولا تنفذ */
  function suggestions(ctx) {
    const { students, attBy, incBy, settings, today: t } = ctx;
    const subBy = ctx.subBy || new Map(), gradeBy = ctx.gradeBy || new Map();
    const levels = settings.levels || [], rules = (settings.rules || []).filter(r => r.enabled !== false);
    const dismissed = settings.dismissed || {};
    const pStart = periodStart(settings.reset, t);
    const out = [];
    students.forEach(s => {
      const att = (attBy.get(s.id) || []).filter(live);
      const inc = (incBy.get(s.id) || []).filter(live);
      const cur = levelOf(inc, levels, pStart);
      rules.forEach(rule => {
        const li = levelIndex(levels, rule.levelId);
        if (li < 0 || cur >= li) return;
        const key = rule.id + ':' + s.id;
        if (dismissed[key] && dismissed[key] >= t) return;
        const hit = checkRule(rule, att, inc, levels, t, pStart, { subs: (subBy.get(s.id) || []).filter(live), grades: (gradeBy.get(s.id) || []).filter(live) });
        if (hit) out.push({ key, studentId: s.id, ruleId: rule.id, levelId: rule.levelId, reasonId: hit.reasonId || '', text: hit.text, li });
      });
    });
    // اقتراح واحد (الأعلى) لكل طالب
    const best = new Map();
    out.forEach(x => { const b = best.get(x.studentId); if (!b || x.li > b.li) best.set(x.studentId, x); });
    return [...best.values()].sort((a, b) => b.li - a.li);
  }

  function riskScore(att, inc, levels, pStart, t, subs) {
    const from = addDays(t, -29);
    const a = (att || []).filter(r => live(r) && r.date >= from);
    const miss = (subs || []).filter(r => live(r) && r.status === 'missing' && r.date >= from).length;
    return (levelOf(inc, levels, pStart) + 1) * 10 + a.filter(r => r.status === 'absent').length * 3 + a.filter(r => r.status === 'late').length + miss * 2;
  }

  const fillTemplate = (tpl, vars) => String(tpl || '').replace(/\{([^{}]+)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : m));

  function normalizePhone(phone, cc) {
    let d = String(phone || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
    if (!d) return '';
    cc = String(cc || '').replace(/\D/g, '');
    if (d.startsWith('00')) return d.slice(2);
    if (cc && d.startsWith(cc) && d.length > 10) return d;
    if (d.startsWith('0')) return cc + d.slice(1);
    return cc + d;
  }

  const waLink = (phone, cc, text) => {
    const n = normalizePhone(phone, cc);
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text || '');
  };

  function parseBulk(text) {
    return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split(/[,\t،]/).map(x => x.trim());
      return { name: p[0], guardianPhone: p[1] || '', guardianName: p[2] || '' };
    }).filter(x => x.name);
  }

  const L = { CHARS, RULE_TYPES, hwStats, pct, scoreSummary, dayOfWeek, pickRandom, shuffle, splitGroups, genCode, periodStart, levelIndex, levelOf, attStats, suggestions, checkRule, riskScore, fillTemplate, normalizePhone, waLink, parseBulk, addDays, diffDays, today };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.Logic = L;
})(typeof window !== 'undefined' ? window : globalThis);
