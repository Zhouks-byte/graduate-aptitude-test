'use strict';
/* Node 单测：KP_MODEL 纯函数（无 DOM） */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 在 Node 中加载 model.js（其 IIFE 用 this/window，Node 下 this 为 undefined，需补全局）
const modelSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'model.js'), 'utf8');
global.window = global.window || globalThis;
eval(modelSrc);
const M = global.window.KP_MODEL || globalThis.KP_MODEL;

assert(M && typeof M.judgeAnswer === 'function', 'KP_MODEL should be exposed');

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name);
    console.error('   ', e.message);
    process.exitCode = 1;
  }
}

console.log('\njudgeAnswer');
t('字符串匹配（忽略首尾空格）', () => {
  assert.strictEqual(M.judgeAnswer({ answer: ' B ' }, 'B').correct, true);
});
t('字符串大小写敏感', () => {
  assert.strictEqual(M.judgeAnswer({ answer: 'B' }, 'b').correct, false);
});
t('字符串不匹配', () => {
  assert.strictEqual(M.judgeAnswer({ answer: 'A' }, 'B').correct, false);
});
t('多选：数组完全一致（顺序无关）', () => {
  assert.strictEqual(M.judgeAnswer({ answer: ['A', 'B'] }, ['B', 'A']).correct, true);
});
t('多选：缺失选项', () => {
  assert.strictEqual(M.judgeAnswer({ answer: ['A', 'B', 'C'] }, ['A']).correct, false);
});
t('数值匹配', () => {
  assert.strictEqual(M.judgeAnswer({ answer: 42 }, 42).correct, true);
  assert.strictEqual(M.judgeAnswer({ answer: 42 }, 41).correct, false);
});
t('无答案字段返回 judged=false', () => {
  const r = M.judgeAnswer({}, 'x');
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.judged, false);
});
t('填空：trim + 大小写不敏感', () => {
  assert.strictEqual(M.judgeAnswer({ type: 'blank', answer: 'abc' }, 'ABC').correct, true);
  assert.strictEqual(M.judgeAnswer({ type: 'blank', answer: '0.68' }, ' 0.68 ').correct, true);
  assert.strictEqual(M.judgeAnswer({ type: 'blank', answer: '0.68' }, '0.69').correct, false);
});

console.log('\nebbinghaus');
t('间隔表 [1,2,4,7,15,30]', () => {
  const seq = [0, 1, 2, 3, 4, 5].map(M.ebbinghaus);
  assert.deepStrictEqual(seq, [1, 2, 4, 7, 15, 30]);
});
t('超表后按最后间隔倍增', () => {
  assert.strictEqual(M.ebbinghaus(6), 60);   // 30 * 2
  assert.strictEqual(M.ebbinghaus(7), 120);  // 30 * 4
});
t('负数/非数退回首档', () => {
  assert.strictEqual(M.ebbinghaus(-1), 1);
  assert.strictEqual(M.ebbinghaus('x'), 1);
});

console.log('\naccuracy');
t('空数组为 0', () => {
  assert.strictEqual(M.accuracy([]), 0);
});
t('非数组为 0', () => {
  assert.strictEqual(M.accuracy(null), 0);
});
t('正常正确率', () => {
  const rec = [
    { correct: true }, { correct: false }, { correct: true }, { correct: true }
  ];
  assert.ok(Math.abs(M.accuracy(rec) - 0.75) < 1e-9, 'expect 0.75');
});
t('全错为 0', () => {
  assert.strictEqual(M.accuracy([{ correct: false }, { correct: false }]), 0);
});

console.log('\nstreak');
const today = new Date().toISOString().slice(0, 10);
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
t('连续 3 天（含今天）', () => {
  assert.strictEqual(M.streak([daysAgo(2), daysAgo(1), today], today), 3);
});
t('今天未打、算到昨天为止', () => {
  assert.strictEqual(M.streak([daysAgo(2), daysAgo(1)], daysAgo(0)), 2);
});
t('中断则只数尾部连续段', () => {
  // daysAgo(0)=今天 打, daysAgo(1) 打, daysAgo(2) 断, daysAgo(3) 打 -> 连续2
  assert.strictEqual(M.streak([today, daysAgo(1), daysAgo(3)]), 2);
});
t('支持对象形式 {date}', () => {
  assert.strictEqual(M.streak([{ date: today }, { date: daysAgo(1) }]), 2);
});
t('空数组为 0', () => {
  assert.strictEqual(M.streak([]), 0);
});

console.log('\nradarData');
t('按维度归一化并标记薄弱', () => {
  const mock = {
    questions: [
      { dimension: '政治', correct: true },
      { dimension: '政治', correct: false },
      { dimension: '英语', correct: true },
      { dimension: '英语', correct: true }
    ]
  };
  const data = M.radarData(mock, ['政治', '英语', '数学']);
  assert.strictEqual(data.length, 3);
  assert.strictEqual(data[0].name, '政治');
  assert.ok(Math.abs(data[0].value - 0.5) < 1e-9);
  assert.strictEqual(data[0].isWeak, true);   // 0.5 < 0.6
  assert.strictEqual(data[1].name, '英语');
  assert.strictEqual(data[1].value, 1);
  assert.strictEqual(data[1].isWeak, false);
  assert.strictEqual(data[2].total, 0);
  assert.strictEqual(data[2].value, 0);
  assert.strictEqual(data[2].isWeak, false);
});
t('无数据维度 value=0 且 isWeak=false', () => {
  const data = M.radarData({ questions: [] }, ['数学']);
  assert.strictEqual(data[0].value, 0);
  assert.strictEqual(data[0].isWeak, false);
});
t('dims 为空返回 []', () => {
  assert.deepStrictEqual(M.radarData({ questions: [] }, []), []);
});

console.log('\ncalendarWeeks');
t('某月天数正确且周一为周首', () => {
  // 2026-11：11-01 是周日，周一为周首 → 前导 6 空位 + 30 天
  const cw = M.calendarWeeks(2026, 10); // month=10 → 11 月
  const all = cw.weeks.flat();
  const filled = all.filter(Boolean);
  assert.strictEqual(filled.length, 30);
  assert.strictEqual(all[0], '');
  assert.strictEqual(all[6], '2026-11-01'); // 第 7 格（周日列）
  assert.strictEqual(all[7], '2026-11-02');
});
t('平年 2 月 28 天', () => {
  const cw = M.calendarWeeks(2026, 1); // 2026-02
  assert.strictEqual(cw.weeks.flat().filter(Boolean).length, 28);
});
t('闰年 2 月 29 天', () => {
  const cw = M.calendarWeeks(2028, 1); // 2028-02
  assert.strictEqual(cw.weeks.flat().filter(Boolean).length, 29);
});
t('周数 5 或 6 且每格 7 列', () => {
  const cw = M.calendarWeeks(2026, 10);
  assert.ok(cw.weeks.length >= 5 && cw.weeks.length <= 6);
  cw.weeks.forEach(w => assert.strictEqual(w.length, 7));
});

console.log('\nplanDaySummary');
t('空 plan 当天返回 total=0 accuracy=0', () => {
  const s = M.planDaySummary([], '2026-11-06');
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.accuracy, 0);
  assert.strictEqual(s.allDone, false);
});
t('统计当天任务完成数 + 分钟累计', () => {
  const plan = [
    { date: '2026-11-06', done: true, duration: 30 },
    { date: '2026-11-06', done: false, duration: 20 },
    { date: '2026-11-07', done: true, duration: 60 }
  ];
  const s = M.planDaySummary(plan, '2026-11-06');
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.done, 1);
  assert.strictEqual(s.minutes, 50);
  assert.strictEqual(s.allDone, false);
});
t('全勾 allDone=true', () => {
  const plan = [
    { date: '2026-11-06', done: true, duration: 10 },
    { date: '2026-11-06', done: true, duration: 10 }
  ];
  assert.strictEqual(M.planDaySummary(plan, '2026-11-06').allDone, true);
});

console.log('\nmockRadarData');
t('统计弱项频次并按最大频次归一化', () => {
  const mocks = [
    { weakPoints: ['政治', '数学', '时间管理'] },
    { weakPoints: ['政治', '英语'] },
    { weakPoints: ['政治'] }
  ];
  const dims = ['政治', '英语', '数学', '专业课', '时间管理', '心态'];
  const out = M.mockRadarData(mocks, dims);
  const by = {};
  out.forEach(o => { by[o.name] = o; });
  assert.strictEqual(by['政治'].count, 3);
  assert.strictEqual(by['英语'].count, 1);
  assert.strictEqual(by['数学'].count, 1);
  assert.strictEqual(by['时间管理'].count, 1);
  assert.strictEqual(by['专业课'].count, 0);
  assert.strictEqual(by['心态'].count, 0);
  // value 归一化：max=3 → 政治=1，英语=1/3
  assert.strictEqual(by['政治'].value, 1);
  assert.ok(Math.abs(by['英语'].value - 1 / 3) < 1e-9);
  assert.strictEqual(by['专业课'].value, 0);
});
t('空记录时全部 value=0', () => {
  const dims = ['a', 'b', 'c'];
  const out = M.mockRadarData([], dims);
  assert.strictEqual(out.length, 3);
  out.forEach(o => assert.strictEqual(o.value, 0));
});
t('dims 为空返回 []', () => {
  assert.deepStrictEqual(M.mockRadarData([{ weakPoints: ['a'] }], []), []);
});
t('非数组 mocks 退化为空', () => {
  const out = M.mockRadarData(null, ['a', 'b', 'c']);
  out.forEach(o => assert.strictEqual(o.value, 0));
});

console.log('\n' + (process.exitCode ? '存在失败用例' : '全部通过: ' + passed + ' 项') + '\n');
