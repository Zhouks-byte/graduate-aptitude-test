'use strict';
/* Node 单测：KP_STORE 统一 localStorage 读写（键前缀 kp_ + JSON + 默认值） */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 内存版 localStorage 模拟
function createMemoryStorage() {
  let map = {};
  return {
    _map: map,
    getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem(k, v) { map[k] = String(v); },
    removeItem(k) { delete map[k]; },
    key(i) { return Object.keys(map)[i]; },
    get length() { return Object.keys(map).length; },
    clear() { map = {}; }
  };
}

// 加载 model.js + store.js（模拟浏览器 global 有 localStorage）
const modelSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'model.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'store.js'), 'utf8');
const mem = createMemoryStorage();
global.window = global.window || globalThis;
global.window.localStorage = mem;
eval(modelSrc);
eval(storeSrc);
const S = global.window.KP_STORE;

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

console.log('\ninit / get 默认值');
t('init 后 get 空库返回默认 profile', () => {
  mem.clear();
  S.init();
  assert.deepStrictEqual(S.get('profile'), { examDate: null, targetScore: 0, name: '', createdAt: null });
});
t('get 缺失键返回默认（数组为空）', () => {
  assert.deepStrictEqual(S.get('questions'), []);
  assert.deepStrictEqual(S.get('vocab'), []);
});

console.log('\nset / 前缀 / JSON 序列化');
t('set 后以 kp_ 前缀写入 localStorage 且 JSON 序列化', () => {
  S.set('questions', [{ id: 1, stem: 'hi' }]);
  const raw = mem.getItem('kp_questions');
  assert.strictEqual(raw, '[{"id":1,"stem":"hi"}]');
  assert.strictEqual(mem.getItem('questions'), null); // 无前缀键不存在
});
t('set 后再 get 读回同一值', () => {
  S.set('notes', [{ id: 1, title: 'x' }]);
  assert.deepStrictEqual(S.get('notes'), [{ id: 1, title: 'x' }]);
});

console.log('\nupdateProfile / add / removeById');
t('updateProfile 合并字段', () => {
  const p = S.updateProfile({ examDate: '2027-12-18', name: 'Alice' });
  assert.strictEqual(p.examDate, '2027-12-18');
  assert.strictEqual(p.name, 'Alice');
  assert.strictEqual(p.targetScore, 0); // 保留默认
  assert.strictEqual(S.get('profile').examDate, '2027-12-18');
});
t('add 追加到数组', () => {
  S.set('vocab', []);
  S.add('vocab', { id: 1, word: 'run' });
  S.add('vocab', { id: 2, word: 'jump' });
  assert.strictEqual(S.get('vocab').length, 2);
});
t('removeById 按 id 删除', () => {
  S.set('vocab', [{ id: 1 }, { id: 2 }, { id: 3 }]);
  S.removeById('vocab', 2);
  assert.deepStrictEqual(S.get('vocab').map(v => v.id), [1, 3]);
});

console.log('\n打卡');
t('checkInToday 幂等', () => {
  S.set('checkins', []);
  const day = '2027-01-01';
  assert.strictEqual(S.checkInToday(day), true);
  assert.strictEqual(S.checkInToday(day), false);
  assert.strictEqual(S.get('checkins').length, 1);
});
t('isCheckedIn 判定', () => {
  assert.strictEqual(S.isCheckedIn('2027-01-01'), true);
  assert.strictEqual(S.isCheckedIn('2027-01-02'), false);
});

console.log('\nreset');
t('reset 清库并恢复默认', () => {
  S.set('questions', [{ id: 1 }]);
  S.reset();
  assert.deepStrictEqual(S.get('questions'), []);
  assert.strictEqual(mem.getItem('kp_questions'), '[]'); // 默认空数组已重写
});

console.log('\n题库练习模块');
t('addRecord 写入答题记录', () => {
  S.set('records', []);
  S.addRecord({ qid: 'pz01', answer: 'A', correct: true, seconds: 5 });
  const rec = S.get('records')[0];
  assert.strictEqual(rec.qid, 'pz01');
  assert.strictEqual(rec.correct, true);
  assert.strictEqual(rec.seconds, 5);
  assert.ok(rec.ts > 0, 'ts should be set');
});
t('addWrong 新增 / 重复累加重试 / 掌握移除', () => {
  S.set('wrong', []);
  S.addWrong({ qid: 'q1', reason: '错', status: 'pending' });
  assert.strictEqual(S.get('wrong').length, 1);
  S.addWrong({ qid: 'q1', reason: '错', status: 'pending' });
  assert.strictEqual(S.get('wrong')[0].retries, 1);
  S.addWrong({ qid: 'q1', status: 'mastered' });
  assert.strictEqual(S.get('wrong').length, 0, 'mastered 应移除');
});
t('masterWrong 按 qid 移除', () => {
  S.set('wrong', [{ qid: 'a' }, { qid: 'b' }]);
  S.masterWrong('a');
  assert.deepStrictEqual(S.get('wrong').map(w => w.qid), ['b']);
});
t('toggleFav 收藏切换 + isFav', () => {
  S.set('quiz.fav', []);
  assert.strictEqual(S.toggleFav('q1'), true);
  assert.strictEqual(S.isFav('q1'), true);
  assert.strictEqual(S.toggleFav('q1'), false);
  assert.strictEqual(S.isFav('q1'), false);
  assert.deepStrictEqual(S.getFavs(), []);
});

console.log('\n间隔复习模块');
t('getReview 初始化默认 stage=0', () => {
  S.set('review', {});
  S.set('records', []);
  S.set('wrong', []);
  const r = S.getReview('q1');
  assert.strictEqual(r.stage, 0);
  assert.strictEqual(S.get('review')['q1'].stage, 0);
});
t('reviewMastered：stage+1，nextDate 按 ebbinghaus 间隔后移', () => {
  S.set('review', {});
  S.reviewMastered('q1', '2026-11-06');
  const r = S.get('review')['q1'];
  assert.strictEqual(r.stage, 1);
  assert.strictEqual(r.lastDate, '2026-11-06');
  assert.strictEqual(r.nextDate, '2026-11-07'); // ebbinghaus(0)=1 天后
  S.reviewMastered('q1', '2026-11-07');
  assert.strictEqual(S.get('review')['q1'].stage, 2);
  assert.strictEqual(S.get('review')['q1'].nextDate, '2026-11-09'); // ebbinghaus(1)=2 天后
});
t('reviewForgot：stage 重置 0，nextDate=当天', () => {
  S.reviewMastered('q2', '2026-11-06');
  S.reviewForgot('q2', '2026-11-08');
  const r = S.get('review')['q2'];
  assert.strictEqual(r.stage, 0);
  assert.strictEqual(r.lastDate, '2026-11-08');
  assert.strictEqual(r.nextDate, '2026-11-08');
});
t('removeReview 移除条目', () => {
  S.removeReview('q2');
  assert.strictEqual(S.get('review')['q2'], undefined);
});
t('dueToday：未复习过的题立即到期；nextDate>今天 则不到期', () => {
  S.set('review', {});
  S.set('records', [
    { qid: 'a', correct: true },
    { qid: 'b', correct: false }
  ]);
  S.set('wrong', []);
  // a/b 无 review → 都到期
  let due = S.dueToday('2026-11-06');
  assert.ok(due.indexOf('a') !== -1 && due.indexOf('b') !== -1, '未复习过的题到期');
  // a 复习后 nextDate=11-07，今天(11-06) 仍到期？nextDate=11-07 > 11-06 → 不到期
  S.reviewMastered('a', '2026-11-06');
  due = S.dueToday('2026-11-06');
  assert.ok(due.indexOf('a') === -1, 'a 复习后今天不到期');
  assert.ok(due.indexOf('b') !== -1, 'b 仍到期');
  // 11-07 时 a 到期
  due = S.dueToday('2026-11-07');
  assert.ok(due.indexOf('a') !== -1, 'a 在 11-07 到期');
});

console.log('\n仪表盘进度模块');
t('setProgress / getProgress 读写 + 0-100 钳制', () => {
  S.set('progress', {});
  S.setProgress('政治', 30);
  assert.strictEqual(S.getProgress('政治'), 30);
  S.setProgress('英语', 150);   // 越界钳制
  assert.strictEqual(S.getProgress('英语'), 100);
  S.setProgress('数学', -20);   // 负数钳制
  assert.strictEqual(S.getProgress('数学'), 0);
  S.setProgress('专业课', 'abc'); // 非法值落回 0
  assert.strictEqual(S.getProgress('专业课'), 0);
  assert.strictEqual(S.getProgress('不存在'), 0);
});
t('getProgressAll 返回全量快照并钳制', () => {
  S.set('progress', {});
  S.setProgress('政治', 50);
  S.setProgress('英语', 999);
  S.setProgress('数学', -5);
  var all = S.getProgressAll();
  assert.strictEqual(all['政治'], 50);
  assert.strictEqual(all['英语'], 100);  // 越界钳制
  assert.strictEqual(all['数学'], 0);     // 负数钳制
  assert.strictEqual(all['专业课'], undefined); // 未设置的科目不在快照中
});

console.log('\n学习计划模块');
t('addPlanItem 自动补 id/done=false', () => {
  S.set('plan', []);
  var it = S.addPlanItem({ date: '2026-11-06', subject: '政治', content: '刷10题', duration: 30 });
  assert.ok(it.id && it.id.length > 0);
  assert.strictEqual(it.done, false);
  assert.strictEqual(S.get('plan').length, 1);
});
t('togglePlanDone 翻转完成态', () => {
  S.set('plan', []);
  var it = S.addPlanItem({ date: '2026-11-06', subject: '数学', content: 'x', duration: 10 });
  assert.strictEqual(S.togglePlanDone(it.id), true);
  assert.strictEqual(S.togglePlanDone(it.id), false);
});
t('removePlanItem 删除', () => {
  S.set('plan', []);
  var it = S.addPlanItem({ date: '2026-11-06', subject: '英语', content: 'y', duration: 5 });
  S.removePlanItem(it.id);
  assert.strictEqual(S.get('plan').length, 0);
});
t('planByDate 按日期过滤 + duration 降序', () => {
  S.set('plan', [
    { id: 'a', date: '2026-11-06', duration: 20, done: false },
    { id: 'b', date: '2026-11-06', duration: 40, done: false },
    { id: 'c', date: '2026-11-07', duration: 10, done: false }
  ]);
  var out = S.planByDate('2026-11-06').map(t => t.id);
  assert.deepStrictEqual(out, ['b', 'a']);
});
t('isPlanDayDone 全勾才为 true', () => {
  S.set('plan', [
    { id: 'a', date: '2026-11-06', done: true },
    { id: 'b', date: '2026-11-06', done: false }
  ]);
  assert.strictEqual(S.isPlanDayDone('2026-11-06'), false);
  S.set('plan', [
    { id: 'a', date: '2026-11-06', done: true },
    { id: 'b', date: '2026-11-06', done: true }
  ]);
  assert.strictEqual(S.isPlanDayDone('2026-11-06'), true);
  assert.strictEqual(S.isPlanDayDone('2026-11-08'), false); // 无任务
});
t('completedDates 全勾日期集合', () => {
  S.set('plan', [
    { id: 'a', date: '2026-11-06', done: true },
    { id: 'b', date: '2026-11-07', done: true },
    { id: 'c', date: '2026-11-07', done: false }
  ]);
  var cd = S.completedDates();
  assert.strictEqual(cd['2026-11-06'], true);
  assert.strictEqual(cd['2026-11-07'], undefined);
});
t('planCheckIn 连续 2 天 +1，跳日重置 1，幂等', () => {
  S.set('streak', { count: 0, lastDate: null });
  S.set('checkins', []);
  // 11-05 打卡
  var s1 = S.planCheckIn('2026-11-05');
  assert.strictEqual(s1.count, 1);
  // 11-06 连续
  var s2 = S.planCheckIn('2026-11-06');
  assert.strictEqual(s2.count, 2);
  // 11-09 跳日 → 重置 1
  var s3 = S.planCheckIn('2026-11-09');
  assert.strictEqual(s3.count, 1);
  // 同一天重复 → 幂等
  var s4 = S.planCheckIn('2026-11-09');
  assert.strictEqual(s4.count, 1);
  // 同步写入了 checkins
  assert.ok(S.get('checkins').some(c => c.date === '2026-11-09'));
});
t('getStreak 返回 {count,lastDate}', () => {
 S.set('streak', { count: 5, lastDate: '2026-11-06' });
 assert.deepStrictEqual(S.getStreak(), { count: 5, lastDate: '2026-11-06' });
 S.set('streak', {}); // 损坏数据回退
 assert.deepStrictEqual(S.getStreak(), { count: 0, lastDate: null });
});

console.log('\n单词模块');
t('addVocabLearned 幂等去重 + 同日计数', () => {
 S.set('vocab.learned', []);
 S.addVocabLearned('abandon', '2026-11-06');
 S.addVocabLearned('abandon', '2026-11-06'); // 重复，不入库
 S.addVocabLearned('absorb', '2026-11-06');
 assert.strictEqual(S.get('vocab.learned').length, 2);
 assert.strictEqual(S.vocabLearnedToday('2026-11-06'), 2);
 assert.strictEqual(S.vocabLearnedToday('2026-11-07'), 0);
});
t('vocabRateWeak 按 [1,2,4,7] 推进 stage + nextDate', () => {
 S.set('vocab.review', {});
 var r1 = S.vocabRateWeak('abandon', '2026-11-06'); // 首评 stage=1 → +1天
 assert.strictEqual(r1.stage, 1);
 assert.strictEqual(r1.nextDate, '2026-11-07');
 var r2 = S.vocabRateWeak('abandon', '2026-11-07'); // stage=2 → +2天
 assert.strictEqual(r2.stage, 2);
 assert.strictEqual(r2.nextDate, '2026-11-09');
 var r3 = S.vocabRateWeak('abandon', '2026-11-09'); // stage=3 → +4天
 assert.strictEqual(r3.stage, 3);
 assert.strictEqual(r3.nextDate, '2026-11-13');
 var r4 = S.vocabRateWeak('abandon', '2026-11-13'); // stage=4 → +7天
 assert.strictEqual(r4.stage, 4);
 assert.strictEqual(r4.nextDate, '2026-11-20');
 var r5 = S.vocabRateWeak('abandon', '2026-11-20'); // stage=5 超表 → 封顶 7天
 assert.strictEqual(r5.stage, 5);
 assert.strictEqual(r5.nextDate, '2026-11-27');
});
t('vocabDueToday 过滤未到期 + 无 nextDate 立即到期', () => {
 S.set('vocab.review', {
   a: { stage: 1, nextDate: '2026-11-10' }, // 未到
   b: { stage: 1, nextDate: '2026-11-06' },  // 当天到期
   c: { stage: 0, nextDate: null }            // 无 nextDate → 立即到期
 });
 var due = S.vocabDueToday('2026-11-06');
 assert.ok(due.indexOf('b') !== -1 && due.indexOf('c') !== -1, 'b/c 到期');
 assert.ok(due.indexOf('a') === -1, 'a 未到期');
});
t('vocabMarkMastered 移出队列 + 累计已掌握', () => {
 S.set('vocab.review', { abandon: { stage: 2, nextDate: '2026-11-09' } });
 S.set('settings', { vocabMasteredSet: [] });
 S.vocabMarkMastered('abandon');
 assert.strictEqual(S.get('vocab.review')['abandon'], undefined, '已移出队列');
 assert.strictEqual(S.vocabMasteredCount(), 1);
 S.vocabMarkMastered('abandon'); // 幂等，不重复累计
 assert.strictEqual(S.vocabMasteredCount(), 1);
});
t('vocabPendingCount 统计待复习队列长度', () => {
 S.set('vocab.review', { a: {}, b: {} });
 assert.strictEqual(S.vocabPendingCount(), 2);
 S.set('vocab.review', {});
 assert.strictEqual(S.vocabPendingCount(), 0);
});

console.log('\n真题模块');
t('addPastRecord 幂等覆盖同卷同题', () => {
  S.set('past.records', []);
  S.addPastRecord({ paperId: 'p1', qid: 'q1', correct: false, score: 2, reason: '' });
  S.addPastRecord({ paperId: 'p1', qid: 'q1', correct: true, score: 2, reason: '' }); // 覆盖
  S.addPastRecord({ paperId: 'p1', qid: 'q2', correct: false, score: 2, reason: '计算失误' });
  assert.strictEqual(S.get('past.records').length, 2);
  assert.strictEqual(S.get('past.records')[0].correct, true, 'q1 被覆盖为 true');
});
t('pastRecordsByPaper 按卷过滤', () => {
  S.set('past.records', []);
  S.addPastRecord({ paperId: 'p1', qid: 'q1', correct: true, score: 2 });
  S.addPastRecord({ paperId: 'p2', qid: 'q1', correct: false, score: 2 });
  assert.strictEqual(S.pastRecordsByPaper('p1').length, 1);
  assert.strictEqual(S.pastRecordsByPaper('p2').length, 1);
  assert.strictEqual(S.pastRecordsByPaper('p3').length, 0);
});
t('pastScore 计算得分/正确数/错因统计', () => {
  S.set('past.records', []);
  var paper = { paperId: 'p1', questions: [
    { qid: 'q1', score: 2 }, { qid: 'q2', score: 3 }, { qid: 'q3', score: 5 }
  ]};
  S.addPastRecord({ paperId: 'p1', qid: 'q1', correct: true, score: 2, reason: '' });
  S.addPastRecord({ paperId: 'p1', qid: 'q2', correct: false, score: 3, reason: '计算失误' });
  // q3 未作答
  var s = S.pastScore(paper);
  assert.strictEqual(s.total, 10);
  assert.strictEqual(s.gained, 2);
  assert.strictEqual(s.correctCount, 1);
  assert.strictEqual(s.wrongCount, 1);
  assert.strictEqual(s.answered, 2);
  assert.strictEqual(s.pct, 20);
  assert.strictEqual(s.reasons['计算失误'], 1);
});
t('pastPaperCompleted 全题作答才 true', () => {
  S.set('past.records', []);
  var paper = { paperId: 'p1', questions: [{ qid: 'q1' }, { qid: 'q2' }] };
  assert.strictEqual(S.pastPaperCompleted(paper), false);
  S.addPastRecord({ paperId: 'p1', qid: 'q1', correct: true, score: 1 });
  assert.strictEqual(S.pastPaperCompleted(paper), false);
  S.addPastRecord({ paperId: 'p1', qid: 'q2', correct: false, score: 1 });
  assert.strictEqual(S.pastPaperCompleted(paper), true);
});

console.log('\n模考模块');
t('addMockRecord 补全字段 + accuracy 钳制 0-1', () => {
  S.set('mock.records', []);
  var r = S.addMockRecord({ date: '2026-11-06', subject: '政治', score: 80, maxScore: 100, accuracy: 0.8, weakPoints: ['政治'] });
  assert.ok(r.id && r.id.length > 0);
  assert.strictEqual(r.accuracy, 0.8);
  var r2 = S.addMockRecord({ date: '2026-11-06', subject: '英语', score: 10, maxScore: 100, accuracy: 1.5 });
  assert.strictEqual(r2.accuracy, 1, '越界钳制为 1');
  assert.strictEqual(S.get('mock.records').length, 2);
});
t('removeMockRecord 删除', () => {
  S.set('mock.records', []);
  var r = S.addMockRecord({ date: '2026-11-06', subject: '政治', score: 1, maxScore: 1 });
  S.removeMockRecord(r.id);
  assert.strictEqual(S.get('mock.records').length, 0);
});
t('mockRecordsSorted 按日期升序 + 同日按 ts', () => {
  S.set('mock.records', []);
  S.addMockRecord({ date: '2026-11-08', subject: 'A' });
  S.addMockRecord({ date: '2026-11-06', subject: 'B' });
  S.addMockRecord({ date: '2026-11-08', subject: 'C' });
  var out = S.mockRecordsSorted().map(r => r.subject);
  assert.strictEqual(out[0], 'B');
  assert.strictEqual(out[1], 'A'); // 同日 ts 较早
  assert.strictEqual(out[2], 'C');
});

console.log('\n笔记模块');
t('addNote 补全默认字段', () => {
  S.set('note.list', []);
  var n = S.addNote({ subject: '数学', tag: '高数', content: 'x=1' });
  assert.ok(n.id);
  assert.strictEqual(n.subject, '数学');
  assert.strictEqual(n.tag, '高数');
  assert.strictEqual(S.get('note.list').length, 1);
});
t('updateNote 合并字段 + 保持 id', () => {
  S.set('note.list', []);
  var n = S.addNote({ subject: '政治', tag: '', content: 'a' });
  var u = S.updateNote(n.id, { content: 'b', tag: '马原' });
  assert.strictEqual(u.id, n.id);
  assert.strictEqual(u.content, 'b');
  assert.strictEqual(u.tag, '马原');
  assert.strictEqual(S.get('note.list')[0].subject, '政治', '未改字段保留');
  assert.strictEqual(S.updateNote('not-exist', { content: 'x' }), null);
});
t('removeNote 删除', () => {
  S.set('note.list', []);
  var n = S.addNote({ subject: '英语', content: 'c' });
  S.removeNote(n.id);
  assert.strictEqual(S.get('note.list').length, 0);
});
t('notesBySubject 分组 + 组内 ts 降序', () => {
  S.set('note.list', [
    { id: 'a', subject: '数学', ts: 100 },
    { id: 'b', subject: '政治', ts: 200 },
    { id: 'c', subject: '数学', ts: 300 },
    { id: 'd', subject: '数学', ts: 200 }
  ]);
  var by = S.notesBySubject();
  assert.deepStrictEqual(by['数学'].map(n => n.id), ['c', 'd', 'a']);
  assert.deepStrictEqual(by['政治'].map(n => n.id), ['b']);
});
t('noteTags 去重 + 排序', () => {
  S.set('note.list', [
    { id: 'a', tag: 'z' },
    { id: 'b', tag: 'a' },
    { id: 'c', tag: 'z' },
    { id: 'd', tag: '' }
  ]);
  assert.deepStrictEqual(S.noteTags(), ['a', 'z']);
});

console.log('\n全量导出 / 导入');
t('exportAll 输出含已知键 + app 标识 + 可序列化', () => {
  S.reset();
  S.addNote({ subject: '政治', content: 'hello' });
  var exp = S.exportAll();
  assert.strictEqual(exp.app, 'kp');
  assert.strictEqual(exp.prefix, 'kp_');
  assert.ok(exp.version >= 1);
  assert.ok(Object.prototype.hasOwnProperty.call(exp.data, 'note.list'));
  assert.ok(Object.prototype.hasOwnProperty.call(exp.data, 'profile'));
  // 可往返 JSON
  var round = JSON.parse(JSON.stringify(exp));
  assert.strictEqual(round.data['note.list'].length, 1);
});
t('importAll 恢复被清空的库', () => {
  S.reset();
  S.addNote({ subject: '英语', content: 'import-test' });
  var exp = S.exportAll();
  S.reset();
  assert.strictEqual(S.get('note.list').length, 0);
  var res = S.importAll(exp);
  assert.strictEqual(res.total, res.restored);
  assert.ok(res.total > 0);
  var notes = S.get('note.list');
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].content, 'import-test');
});
t('importAll 拒绝缺 data 的对象', () => {
  var res = S.importAll({});
  assert.strictEqual(res.restored, 0);
  assert.strictEqual(res.total, 0);
});

console.log('\n损坏数据回退默认');
t('localStorage 写入非法 JSON 时 get 返回默认值', () => {
  mem.setItem('kp_settings', '{bad json');
  assert.deepStrictEqual(S.get('settings'), {});
});

console.log('\n' + (process.exitCode ? '存在失败用例' : '全部通过: ' + passed + ' 项') + '\n');
