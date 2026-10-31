// تشغيل: node --test tests/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/logic.js');

const levels = [{ id: 'L1', name: 'ملاحظة' }, { id: 'L2', name: 'إنذار 1' }, { id: 'L3', name: 'إنذار 2' }, { id: 'L4', name: 'استدعاء' }];

test('genCode: 8 خانات بدون أحرف متشابهة', () => {
  for (let i = 0; i < 200; i++) {
    const c = L.genCode(n => Array.from({ length: n }, () => Math.floor(Math.random() * 256)));
    assert.match(c, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  }
});

test('periodStart: كل الأوضاع', () => {
  assert.strictEqual(L.periodStart({ mode: 'none' }, '2026-10-23'), null);
  assert.strictEqual(L.periodStart({ mode: 'month' }, '2026-10-23'), '2026-10-01');
  assert.strictEqual(L.periodStart({ mode: 'days', days: 10, anchor: '2026-10-01' }, '2026-10-23'), '2026-10-21');
  assert.strictEqual(L.periodStart({ mode: 'days', days: 10, anchor: '2026-10-01' }, '2026-10-20'), '2026-10-11');
  const terms = [{ start: '2026-09-20', end: '2027-01-15' }, { start: '2027-02-05', end: '2027-06-01' }];
  assert.strictEqual(L.periodStart({ mode: 'term', terms }, '2026-10-23'), '2026-09-20');
  assert.strictEqual(L.periodStart({ mode: 'term', terms }, '2027-01-25'), '2027-01-16'); // إجازة بين الترمين
  assert.strictEqual(L.periodStart({ mode: 'term', terms }, '2026-08-01'), null);
});

test('levelOf: التصفير لا يحذف التاريخي ويستبعد غير المحتسب والمحذوف', () => {
  const inc = [
    { date: '2026-09-05', levelId: 'L3' },
    { date: '2026-10-05', levelId: 'L1' },
    { date: '2026-10-06', levelId: 'L4', countsTowardLevel: '0' },
    { date: '2026-10-07', levelId: 'L4', deleted: '1' }
  ];
  assert.strictEqual(L.levelOf(inc, levels, null), 2);
  assert.strictEqual(L.levelOf(inc, levels, '2026-10-01'), 0);
  assert.strictEqual(L.levelOf([], levels, null), -1);
});

test('attStats: نسبة الحضور تستبعد الغياب بعذر', () => {
  const s = L.attStats([{ date: '1', status: 'present' }, { date: '2', status: 'late' }, { date: '3', status: 'absent' }, { date: '4', status: 'excused' }]);
  assert.strictEqual(s.rate, 67);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(L.attStats([]).rate, null);
});

function ctx(att, inc, rules, extra) {
  return Object.assign({
    students: [{ id: 's1', name: 'أحمد' }],
    attBy: new Map([['s1', att]]), incBy: new Map([['s1', inc]]),
    settings: { levels, rules, reset: { mode: 'none' }, dismissed: {} },
    today: '2026-10-23'
  }, extra);
}

test('suggestions: غياب متتالي', () => {
  const rule = { id: 'U1', type: 'absenceStreak', count: 3, days: 0, levelId: 'L2', reasonId: 'R1' };
  const att = ['2026-10-19', '2026-10-20', '2026-10-21'].map(date => ({ date, status: 'absent' }));
  assert.strictEqual(L.suggestions(ctx(att, [], [rule])).length, 1);
  att.push({ date: '2026-10-22', status: 'present' });
  assert.strictEqual(L.suggestions(ctx(att, [], [rule])).length, 0);
  att.pop(); att.push({ date: '2026-10-22', status: 'excused' }); // العذر لا يقطع التتابع
  assert.strictEqual(L.suggestions(ctx(att, [], [rule]))[0].reasonId, 'R1');
});

test('suggestions: لا يقترح لو الطالب في مستوى أعلى أو مؤجل', () => {
  const rule = { id: 'U1', type: 'absenceStreak', count: 3, days: 0, levelId: 'L2' };
  const att = ['2026-10-19', '2026-10-20', '2026-10-21'].map(date => ({ date, status: 'absent' }));
  assert.strictEqual(L.suggestions(ctx(att, [{ date: '2026-10-21', levelId: 'L3' }], [rule])).length, 0);
  const c = ctx(att, [], [rule]); c.settings.dismissed = { 'U1:s1': '2026-10-25' };
  assert.strictEqual(L.suggestions(c).length, 0);
  c.settings.dismissed = { 'U1:s1': '2026-10-22' };
  assert.strictEqual(L.suggestions(c).length, 1);
});

test('suggestions: تكرار سبب وتكرار بعد مستوى', () => {
  const r1 = { id: 'U3', type: 'reasonCount', count: 2, days: 30, reasonId: 'R2', levelId: 'L3' };
  const inc = [{ date: '2026-10-10', levelId: 'L1', reasonId: 'R2' }, { date: '2026-10-15', levelId: 'L1', reasonId: 'R2' }];
  assert.strictEqual(L.suggestions(ctx([], inc, [r1])).length, 1);
  const r2 = { id: 'U4', type: 'escalate', count: 1, days: 30, fromLevelId: 'L3', levelId: 'L4' };
  const inc2 = [{ date: '2026-10-10', levelId: 'L3', reasonId: 'R3', createdAt: '1' }];
  assert.strictEqual(L.suggestions(ctx([], inc2, [r2])).length, 0);
  inc2.push({ date: '2026-10-12', levelId: 'L1', reasonId: 'R3', createdAt: '2' });
  const s = L.suggestions(ctx([], inc2, [r2]));
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].reasonId, 'R3');
});

test('القوالب وأرقام واتساب', () => {
  assert.strictEqual(L.fillTemplate('أهلاً {اسم_الطالب} {غير_موجود}', { 'اسم_الطالب': 'سارة' }), 'أهلاً سارة {غير_موجود}');
  assert.strictEqual(L.normalizePhone('010 1234-5678', '20'), '201012345678');
  assert.strictEqual(L.normalizePhone('٠١٠١٢٣٤٥٦٧٨', '20'), '201012345678');
  assert.strictEqual(L.normalizePhone('+20 101 234 5678', '20'), '201012345678');
  assert.strictEqual(L.normalizePhone('00966501234567', '20'), '966501234567');
  assert.match(L.waLink('01012345678', '20', 'سلام'), /^https:\/\/wa\.me\/201012345678\?text=/);
});

test('parseBulk', () => {
  const r = L.parseBulk('أحمد علي، 0101, محمد\n\nسارة');
  assert.deepStrictEqual(r, [{ name: 'أحمد علي', guardianPhone: '0101', guardianName: 'محمد' }, { name: 'سارة', guardianPhone: '', guardianName: '' }]);
});

test('الواجبات والدرجات', () => {
  const h = L.hwStats([{ status: 'done' }, { status: 'late' }, { status: 'missing' }, { status: 'excused' }, { status: 'missing', deleted: '1' }]);
  assert.strictEqual(h.rate, 67);
  assert.strictEqual(h.missing, 1);
  assert.strictEqual(L.pct('15', '20'), 75);
  assert.strictEqual(L.pct('', '20'), null);
  assert.strictEqual(L.pct('7', '0'), null);
  assert.deepStrictEqual(L.scoreSummary([10, null, 20, 15]), { n: 3, avg: 15, max: 20, min: 10 });
  assert.strictEqual(L.scoreSummary([null]).avg, null);
  assert.strictEqual(L.dayOfWeek('2026-10-23'), 5); // جمعة
});

test('قواعد الواجبات والدرجات المنخفضة', () => {
  const r1 = { id: 'U5', type: 'missingHomework', count: 2, days: 30, levelId: 'L2', reasonId: 'R2' };
  const subs = [{ date: '2026-10-10', status: 'missing' }, { date: '2026-10-15', status: 'missing' }];
  const c = ctx([], [], [r1], { subBy: new Map([['s1', subs]]) });
  assert.strictEqual(L.suggestions(c)[0].reasonId, 'R2');
  const r2 = { id: 'U6', type: 'lowGrades', count: 2, days: 60, threshold: 50, levelId: 'L1' };
  const gr = [{ date: '2026-10-01', pct: 40 }, { date: '2026-10-12', pct: 45 }, { date: '2026-10-20', pct: 90 }];
  assert.strictEqual(L.suggestions(ctx([], [], [r2], { gradeBy: new Map([['s1', gr]]) })).length, 1);
  gr[1].pct = 60;
  assert.strictEqual(L.suggestions(ctx([], [], [r2], { gradeBy: new Map([['s1', gr]]) })).length, 0);
});

test('الاختيار العشوائي بدون تكرار والتقسيم', () => {
  const used = new Set(), seen = new Set();
  for (let i = 0; i < 5; i++) { const r = L.pickRandom(['a', 'b', 'c', 'd', 'e'], used); seen.add(r.pick); }
  assert.strictEqual(seen.size, 5);
  assert.strictEqual(L.pickRandom(['a', 'b'], used).reset, true);
  const g = L.splitGroups([1, 2, 3, 4, 5, 6, 7], 3);
  assert.deepStrictEqual(g.map(x => x.length).sort(), [2, 2, 3]);
  assert.deepStrictEqual(g.flat().sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(L.splitGroups([1, 2], 5).length, 2);
});
