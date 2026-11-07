/* 状态存储：统一 localStorage 读写（键前缀 kp_）+ 简单发布订阅 */
(function (global) {
  'use strict';

  var PREFIX = 'kp_';

  /* 各键的默认值 */
  var DEFAULTS = {
    profile:  { examDate: null, targetScore: 0, name: '', createdAt: null },
    questions: [],
    vocab: [],
    plan: [],
    notes: [],
    mocks: [],
    checkins: [],
    settings: {},

    /* 题库练习模块 */
    records: [],   /* 答题记录 {qid, answer, correct, seconds, ts} */
    wrong: [],     /* 错题 {qid, reason, status, retries} */
    'quiz.fav': [],/* 收藏题目 id 数组 */

    /* 间隔复习模块 */
    review: {},    /* 复习进度 {qid: {stage, lastDate, nextDate}} */

    /* 单词模块 */
    'vocab.review': {},  /* 单词复习 {word: {stage, nextDate, lastDate}} */
    'vocab.learned': [],/* 新学记录 {word, date} */

    /* 仪表盘模块 */
    progress: {},  /* 科目进度 {科目: 0-100} */

    /* 计划模块 */
    streak: { count: 0, lastDate: null }, /* 连续打卡 {count, lastDate} */

    /* 模考模块 */
    'mock.records': [],  /* 模考记录 {id, date, subject, score, maxScore, accuracy, weakPoints[], ts} */

    /* 笔记模块 */
    'note.list': [],     /* 笔记 {id, subject, tag, content, ts} */

    /* ---------- 择校 / 志愿 / 报名 / 成绩 4 个新模块 ---------- */
    'school.list': [],          /* 收藏院校 [{id, ts}] */
    'apply.draft': {},          /* 志愿草稿 {hot, match, safe} */
    'apply.submissions': [],    /* 志愿提交记录 [{id, chance, draft, score, ts, date}] */
    'signup.state': {},         /* 报名状态 {nodes:{}, info:{}} */
    'score.submissions': []     /* 成绩记录 [{id, label, scores, total, pct, ts, date}] */
  };

  /* 内存态：init() 前为空，init() 后与 localStorage 同步 */
  var state = null;

  /* ---------- 底层读写（直接 localStorage） ---------- */

  function storage() {
    return global.localStorage;
  }

  function readKey(key, fallback) {
    var s = storage();
    if (!s) return fallback;
    try {
      var raw = s.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeKey(key, value) {
    var s = storage();
    if (!s) return;
    try {
      s.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* 忽略配额/隐私模式异常 */ }
  }

  function removeKey(key) {
    var s = storage();
    if (!s) return;
    try {
      s.removeItem(PREFIX + key);
    } catch (e) {}
  }

  /* ---------- 内部工具 ---------- */

  function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepCopy);
    var out = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) out[keys[i]] = deepCopy(obj[keys[i]]);
    return out;
  }

  function defaultFor(key) {
    var d = DEFAULTS[key];
    return d === undefined ? null : deepCopy(d);
  }

  function loadAll() {
    var s = {};
    var keys = Object.keys(DEFAULTS);
    for (var i = 0; i < keys.length; i++) {
      s[keys[i]] = readKey(keys[i], defaultFor(keys[i]));
    }
    return s;
  }

  /** 基于 'YYYY-MM-DD' 的日期字符串加 n 天，返回同格式 */
  function addDays(dateStr, n) {
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + n);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  var listeners = {};

  function emit(event, payload) {
    var subs = listeners[event] || [];
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](payload); } catch (e) {}
    }
  }

  function syncToStorage() {
    var keys = Object.keys(state);
    for (var i = 0; i < keys.length; i++) {
      writeKey(keys[i], state[keys[i]]);
    }
  }

  /* ---------- 公开 API ---------- */

  var KP_STORE = {
    /**
     * 初始化：从 localStorage 加载全部键到内存态。
     * 已 init 则跳过。Node 无 localStorage 时退回纯内存（读写为 no-op）。
     */
    init: function () {
      if (state === null) {
        state = loadAll();
      }
      return this;
    },

    /**
     * 读取某键。未 init 时直接读 localStorage；localStorage 缺失/解析失败返回默认值。
     * 传 undefined 返回整个 state。
     */
    get: function (key) {
      if (state === null) state = loadAll();
      if (key === undefined) return state;
      return readKey(key, defaultFor(key));
    },

    /**
     * 写入某键：更新内存 + 持久化 + 触发事件。
     */
    set: function (key, value) {
      if (state === null) state = loadAll();
      state[key] = value;
      writeKey(key, value);
      emit(key, value);
      return this;
    },

    /** 删除某键（恢复默认）并触发事件 */
    remove: function (key) {
      if (state === null) state = loadAll();
      removeKey(key);
      state[key] = defaultFor(key);
      emit(key + ':removed', null);
      return this;
    },

    /** 清空全部 kp_ 前缀键并重置内存态（重写默认值） */
    reset: function () {
      var s = storage();
      if (s) {
        try {
          var all = [];
          for (var i = 0; i < s.length; i++) {
            var k = s.key(i);
            if (k && k.indexOf(PREFIX) === 0) all.push(k);
          }
          for (var j = 0; j < all.length; j++) s.removeItem(all[j]);
        } catch (e) {}
      }
      state = loadAll();
      syncToStorage();
      emit('reset', null);
      return this;
    },

    /* ---------- 全量导出 / 导入 ---------- */

    /**
     * 导出全部数据为可序列化对象。
     * @returns {{ version, exportedAt, prefix, data: {key: value} }}
     *   data 含所有已知键 + localStorage 中现存的额外 kp_* 键（完整备份）
     */
    exportAll: function () {
      if (state === null) state = loadAll();
      var data = {};
      // 1) 已知键（含未写过盘、仍为默认值的键也一并导出，保证结构完整）
      Object.keys(DEFAULTS).forEach(function (k) { data[k] = deepCopy(state[k] !== undefined ? state[k] : defaultFor(k)); });
      // 2) localStorage 中现存的额外 kp_* 键（向后兼容：旧版可能有的键）
      var s = storage();
      if (s) {
        try {
          for (var i = 0; i < s.length; i++) {
            var k = s.key(i);
            if (k && k.indexOf(PREFIX) === 0) {
              var inner = k.slice(PREFIX.length);
              if (!Object.prototype.hasOwnProperty.call(data, inner)) {
                try { data[inner] = JSON.parse(s.getItem(k)); } catch (e) { data[inner] = s.getItem(k); }
              }
            }
          }
        } catch (e) {}
      }
      return {
        version: 1,
        app: 'kp',
        prefix: PREFIX,
        exportedAt: new Date().toISOString(),
        data: data
      };
    },

    /**
     * 从导出对象恢复数据。
     * @param obj { version, data } 由 exportAll() 生成的对象
     * @returns { restored, total } 成功导入的键数 / 总键数
     */
    importAll: function (obj) {
      var data = (obj && obj.data) || {};
      if (state === null) state = loadAll();
      var keys = Object.keys(data);
      var total = keys.length, restored = 0;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        // 只接受合法键名（防注入）
        if (typeof k === 'string' && k && k === k.trim() && !/[\s/\\]/.test(k)) {
          state[k] = deepCopy(data[k]);
          writeKey(k, data[k]);
          emit(k, data[k]);
          restored++;
        }
      }
      emit('import', null);
      return { restored: restored, total: total };
    },

    /** 导入并触发一次整体刷新事件（供 UI 监听） */
    onImport: function (fn) {
      return this.on('import', fn);
    },

    /** 订阅键变更事件 */
    on: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return this;
    },

    /* ---------- 领域便捷方法 ---------- */

    /** 合并更新 profile 字段 */
    updateProfile: function (patch) {
      var cur = this.get('profile');
      var next = Object.assign({}, cur, patch);
      this.set('profile', next);
      return next;
    },

    /** 向数组键追加条目 */
    add: function (key, item) {
      var arr = this.get(key);
      if (!Array.isArray(arr)) return this;
      arr.push(item);
      this.set(key, arr);
      return this;
    },

    /** 按 id 删除数组条目 */
    removeById: function (key, id) {
      var arr = this.get(key);
      if (!Array.isArray(arr)) return this;
      var next = arr.filter(function (it) { return it.id !== id; });
      this.set(key, next);
      return this;
    },

    /** 今日打卡（幂等） */
    checkInToday: function (dateStr) {
      var today = dateStr || new Date().toISOString().slice(0, 10);
      var arr = this.get('checkins');
      var already = arr.some(function (c) { return c.date === today; });
      if (!already) {
        arr.push({ date: today, minutes: 0 });
        this.set('checkins', arr);
      }
      return !already;
    },

    /** 今日是否已打卡 */
    isCheckedIn: function (dateStr) {
      var today = dateStr || new Date().toISOString().slice(0, 10);
      return this.get('checkins').some(function (c) { return c.date === today; });
    },

    /* ---------- 题库练习模块 ---------- */

    /** 写答题记录 {qid, answer, correct, seconds, ts} */
    addRecord: function (rec) {
      var arr = this.get('records');
      arr.push(Object.assign({ ts: Date.now() }, rec));
      this.set('records', arr);
      return this;
    },

    /** 加入错题 {qid, reason, status, retries}
     *  - 不存在：push 新条目
     *  - 存在且 status=mastered：从队列移除
     *  - 存在且 status=pending：retries+1 并回写 */
    addWrong: function (item) {
      var arr = this.get('wrong');
      var idx = -1;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].qid === item.qid) { idx = i; break; }
      }

      if (idx === -1) {
        // 新增
        arr.push(Object.assign({ status: 'pending', retries: 0 }, item));
      } else if (item.status === 'mastered') {
        // 已掌握：移出队列
        arr.splice(idx, 1);
      } else {
        // 仍错：重试次数 +1，保留原 reason
        arr[idx].retries = (arr[idx].retries || 0) + 1;
        if (item.reason) arr[idx].reason = item.reason;
      }
      this.set('wrong', arr);
      return this;
    },

    /** 标记错题已掌握（从错题本移除） */
    masterWrong: function (qid) {
      var arr = this.get('wrong').filter(function (w) { return w.qid !== qid; });
      this.set('wrong', arr);
      return this;
    },

    /** 收藏状态切换，返回是否已收藏 */
    toggleFav: function (qid) {
      var arr = this.get('quiz.fav');
      var idx = arr.indexOf(qid);
      if (idx === -1) arr.push(qid);
      else arr.splice(idx, 1);
      this.set('quiz.fav', arr);
      return idx === -1;
    },

    /** 是否收藏 */
    isFav: function (qid) {
      return this.get('quiz.fav').indexOf(qid) !== -1;
    },

    /** 已收藏 id 列表 */
    getFavs: function () {
      return this.get('quiz.fav');
    },

    /* ---------- 间隔复习模块 ---------- */

    /** 确保某题在 review 中有条目（stage 默认 0），返回当前条目 */
    getReview: function (qid) {
      var review = this.get('review');
      if (!review[qid]) {
        review[qid] = { stage: 0, lastDate: null, nextDate: null };
        this.set('review', review);
      }
      return review[qid];
    },

    /**
     * 标记「已复习」：stage+1，按 ebbinghaus 间隔计算 nextDate。
     * 依赖 global.KP_MODEL.ebbinghaus。
     */
    reviewMastered: function (qid, todayStr) {
      var today = todayStr || new Date().toISOString().slice(0, 10);
      var review = this.get('review');
      var cur = review[qid] || { stage: 0, lastDate: null, nextDate: null };
      cur.stage = (cur.stage || 0) + 1;
      cur.lastDate = today;
      var days = global.KP_MODEL ? global.KP_MODEL.ebbinghaus(cur.stage - 1) : 1;
      cur.nextDate = addDays(today, days);
      review[qid] = cur;
      this.set('review', review);
      return cur;
    },

    /** 标记「忘了」：stage 重置 0，nextDate = 今天 */
    reviewForgot: function (qid, todayStr) {
      var today = todayStr || new Date().toISOString().slice(0, 10);
      var review = this.get('review');
      review[qid] = { stage: 0, lastDate: today, nextDate: today };
      this.set('review', review);
      return review[qid];
    },

    /** 移除某题的复习进度 */
    removeReview: function (qid) {
      var review = this.get('review');
      delete review[qid];
      this.set('review', review);
      return this;
    },

    /**
     * 计算「今日到期」的 qid 列表。
     * 题目集合 = records ∪ wrong 中出现过的 qid。
     * 到期条件：nextDate <= today 或尚未有 nextDate。
     */
    dueToday: function (todayStr) {
      var today = todayStr || new Date().toISOString().slice(0, 10);
      var review = this.get('review');
      var seen = {};
      var qids = [];

      var self = this;
      function addQid(qid) {
        if (!qid || seen[qid]) return;
        seen[qid] = true;
        qids.push(qid);
      }
      this.get('records').forEach(function (r) { addQid(r.qid); });
      this.get('wrong').forEach(function (w) { addQid(w.qid); });

      return qids.filter(function (qid) {
        var r = review[qid];
        if (!r || !r.nextDate) return true;       // 未复习过 → 立即到期
        return r.nextDate <= today;                // nextDate 到/过 → 到期
      });
    },

    /* ---------- 仪表盘 / 科目进度模块 ---------- */

    /**
     * 设置某科目进度 0-100。
     * @returns 更新后的 progress 对象
     */
    setProgress: function (subject, value) {
      var p = this.get('progress');
      var v = Number(value);
      if (!isFinite(v)) v = 0;
      p[subject] = Math.max(0, Math.min(100, Math.round(v)));
      this.set('progress', p);
      return p;
    },

    /** 读某科目进度 0-100，缺失默认 0 */
    getProgress: function (subject) {
      var p = this.get('progress');
      var v = p[subject];
      return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(100, v)) : 0;
    },

    /** 全量 progress 快照 */
    getProgressAll: function () {
      var p = this.get('progress');
      var out = {};
      for (var k in p) {
        if (Object.prototype.hasOwnProperty.call(p, k)) {
          var v = p[k];
          out[k] = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(100, v)) : 0;
        }
      }
      return out;
    },

    /* ---------- 学习计划模块 ---------- */

    /**
     * 新增计划任务 {id, date, subject, content, duration, done:false}
     * 返回写入后的任务对象。
     */
    addPlanItem: function (item) {
      var arr = this.get('plan');
      var rec = {
        id: item.id || ('p' + Date.now() + '_' + Math.floor(Math.random() * 1e4)),
        date: item.date || '',
        subject: item.subject || '',
        content: item.content || '',
        duration: Number(item.duration) || 0,
        done: false
      };
      arr.push(rec);
      this.set('plan', arr);
      return rec;
    },

    /** 切换某任务完成态，返回新状态 done */
    togglePlanDone: function (id) {
      var arr = this.get('plan');
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          arr[i].done = !arr[i].done;
          this.set('plan', arr);
          return arr[i].done;
        }
      }
      return false;
    },

    /** 删除某任务 */
    removePlanItem: function (id) {
      var arr = this.get('plan').filter(function (t) { return t.id !== id; });
      this.set('plan', arr);
      return this;
    },

    /** 取某天任务列表（按 duration 降序） */
    planByDate: function (dateStr) {
      var arr = this.get('plan');
      var out = arr.filter(function (t) { return t.date === dateStr; });
      out.sort(function (a, b) { return (b.duration || 0) - (a.duration || 0); });
      return out;
    },

    /** 某天是否全部完成（需至少 1 项任务） */
    isPlanDayDone: function (dateStr) {
      var items = this.planByDate(dateStr);
      if (!items.length) return false;
      return items.every(function (t) { return t.done; });
    },

    /** 当月全部完成过的日期集合 {date: true} */
    completedDates: function () {
      var out = {};
      var plan = this.get('plan');
      plan.forEach(function (t) {
        var doneAll = true;
        // 统计该 date 是否所有任务都完成
        var dayItems = plan.filter(function (x) { return x.date === t.date; });
        dayItems.forEach(function (x) { if (!x.done) doneAll = false; });
        if (t.date && doneAll) out[t.date] = true;
      });
      return out;
    },

    /**
     * 计划打卡：全勾当天 → 连续打卡 +1，写 kp_streak。
     * @param dateStr 'YYYY-MM-DD'
     * @returns 更新后的 streak 对象 {count, lastDate}
     */
    planCheckIn: function (dateStr) {
      var today = dateStr || new Date().toISOString().slice(0, 10);
      var s = this.get('streak');
      var yesterday = addDays(today, -1);

      if (s.lastDate === today) {
        // 已打卡，幂等
        return s;
      }
      if (s.lastDate === yesterday) {
        s.count = (s.count || 0) + 1;
      } else {
        s.count = 1;
      }
      s.lastDate = today;
      this.set('streak', s);

      // 同步写入通用 checkins，保持仪表盘连续打卡一致
      this.checkInToday(today);
      return s;
    },

    /** 读连续打卡 {count, lastDate} */
    getStreak: function () {
      var s = this.get('streak');
      return {
        count: (typeof s.count === 'number') ? s.count : 0,
        lastDate: s.lastDate || null
      };
    },

    /* ---------- 单词模块 ---------- */

    /** 单词复习间隔表（天）：[1,2,4,7] */
    VOCAB_INTERVALS: [1, 2, 4, 7],

    /** 间隔表索引 → 天数（超表封顶在 7） */
    _vocabInterval: function (stage) {
      var cap = this.VOCAB_INTERVALS.length;
      var idx = Math.max(0, Math.min(stage, cap - 1));
      return this.VOCAB_INTERVALS[idx];
    },

    /** 记录新学某单词（幂等去重，写 {word, date}） */
    addVocabLearned: function (word, dateStr) {
      var date = dateStr || new Date().toISOString().slice(0, 10);
      var arr = this.get('vocab.learned');
      var dup = arr.some(function (r) { return r.word === word; });
      if (!dup) arr.push({ word: word, date: date });
      this.set('vocab.learned', arr);
      return arr;
    },

    /** 今日新学单词数 */
    vocabLearnedToday: function (dateStr) {
      var date = dateStr || new Date().toISOString().slice(0, 10);
      return this.get('vocab.learned').filter(function (r) { return r.date === date; }).length;
    },

    /** 已学过的全部单词（去重，来自 vocab.learned） */
    vocabLearnedWords: function () {
      var seen = {};
      var out = [];
      this.get('vocab.learned').forEach(function (r) {
        if (r.word && !seen[r.word]) { seen[r.word] = true; out.push(r.word); }
      });
      return out;
    },

    /**
     * 单词评级「模糊 / 不认识」→ 进复习队列（间隔 [1,2,4,7]）。
     *   不存在：stage=0，nextDate = today + 1 天
     *   已存在：nextDate = today + interval(stage)，stage+1；超表封顶 7 天
     * @returns 更新后的条目
     */
    vocabRateWeak: function (word, todayStr) {
      var today = todayStr || new Date().toISOString().slice(0, 10);
      var rv = this.get('vocab.review');
      var cur = rv[word] ? rv[word] : { stage: 0, lastDate: null, nextDate: null };
      cur.lastDate = today;
      cur.nextDate = addDays(today, this._vocabInterval(cur.stage));
      cur.stage = (cur.stage || 0) + 1;
      rv[word] = cur;
      this.set('vocab.review', rv);
      return cur;
    },

    /** 标记单词「已掌握」→ 从复习队列移除，记入 settings.vocabMasteredSet 供统计 */
    vocabMarkMastered: function (word) {
      var s = this.get('settings');
      s.vocabMasteredSet = s.vocabMasteredSet || [];
      if (s.vocabMasteredSet.indexOf(word) === -1) s.vocabMasteredSet.push(word);
      this.set('settings', s);

      var rv = this.get('vocab.review');
      delete rv[word];
      this.set('vocab.review', rv);
      return this;
    },

    /** 已掌握单词数（settings.vocabMasteredSet 长度） */
    vocabMasteredCount: function () {
      var s = this.get('settings');
      return (s && Array.isArray(s.vocabMasteredSet)) ? s.vocabMasteredSet.length : 0;
    },

    /** 今日到期复习的单词列表 */
    vocabDueToday: function (todayStr) {
      var today = todayStr || new Date().toISOString().slice(0, 10);
      var rv = this.get('vocab.review');
      var out = [];
      for (var w in rv) {
        if (Object.prototype.hasOwnProperty.call(rv, w)) {
          var r = rv[w];
          if (!r.nextDate || r.nextDate <= today) out.push(w);
        }
      }
      return out;
    },

    /** 待复习总数（全部 vocab.review 条目） */
    vocabPendingCount: function () {
      var rv = this.get('vocab.review');
      return Object.keys(rv).length;
    },

    /* ---------- 真题模块 ---------- */

    /** 写入真题作答记录 {paperId, qid, answer, correct, score, reason, seconds, ts}（幂等覆盖同 paperId+qid） */
    addPastRecord: function (rec) {
      var arr = this.get('past.records');
      rec.ts = Date.now();
      // 同卷同题已有记录则更新（允许重做改错因/答案），否则追加
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].paperId === rec.paperId && arr[i].qid === rec.qid) {
          arr[i] = rec;
          this.set('past.records', arr);
          return rec;
        }
      }
      arr.push(rec);
      this.set('past.records', arr);
      return rec;
    },

    /** 某卷全部作答记录 */
    pastRecordsByPaper: function (paperId) {
      var arr = this.get('past.records');
      return arr.filter(function (r) { return r.paperId === paperId; });
    },

    /**
     * 计算某卷成绩。
     * @param paper {paperId, questions:[{qid, score, ...}]}
     * @returns { total, gained, correctCount, wrongCount, answered, pct, reasons: {错因: 次数} }
     */
    pastScore: function (paper) {
      var recs = this.pastRecordsByPaper(paper.paperId);
      var byQid = {};
      recs.forEach(function (r) { byQid[r.qid] = r; });

      var total = 0, gained = 0, correctCount = 0, wrongCount = 0, answered = 0;
      var reasons = {};
      (paper.questions || []).forEach(function (q) {
        total += Number(q.score) || 0;
        var r = byQid[q.qid];
        if (!r) return;
        answered++;
        if (r.correct === true) {
          gained += Number(q.score) || 0;
          correctCount++;
        } else {
          wrongCount++;
          var reason = r.reason || '未标注错因';
          reasons[reason] = (reasons[reason] || 0) + 1;
        }
      });

      return {
        total: total,
        gained: gained,
        correctCount: correctCount,
        wrongCount: wrongCount,
        answered: answered,
        pct: total ? Math.round((gained / total) * 100) : 0,
        reasons: reasons
      };
    },

    /** 是否已完整做过某卷（每题都有记录） */
    pastPaperCompleted: function (paper) {
      var qs = paper.questions || [];
      if (!qs.length) return false;
      var recs = this.pastRecordsByPaper(paper.paperId);
      var seen = {};
      recs.forEach(function (r) { seen[r.qid] = true; });
      return qs.every(function (q) { return seen[q.qid]; });
    },

    /* ---------- 模考模块 ---------- */

    /**
     * 添加一条模考记录 {id, date, subject, score, maxScore, accuracy, weakPoints[], ts}。
     * @returns 写入后的记录对象
     */
    addMockRecord: function (rec) {
      var arr = this.get('mock.records');
      var item = {
        id: rec.id || ('m' + Date.now() + '_' + Math.floor(Math.random() * 1e4)),
        date: rec.date || new Date().toISOString().slice(0, 10),
        subject: rec.subject || '',
        score: Number(rec.score) || 0,
        maxScore: Number(rec.maxScore) || 0,
        accuracy: (typeof rec.accuracy === 'number') ? Math.max(0, Math.min(1, rec.accuracy)) : 0,
        weakPoints: Array.isArray(rec.weakPoints) ? rec.weakPoints.slice() : [],
        ts: Date.now()
      };
      arr.push(item);
      this.set('mock.records', arr);
      return item;
    },

    /** 删除某条模考记录 */
    removeMockRecord: function (id) {
      var arr = this.get('mock.records').filter(function (r) { return r.id !== id; });
      this.set('mock.records', arr);
      return this;
    },

    /** 模考记录按日期升序（供趋势图使用） */
    mockRecordsSorted: function () {
      var arr = this.get('mock.records').slice();
      arr.sort(function (a, b) {
        if (a.date === b.date) return (a.ts || 0) - (b.ts || 0);
        return a.date < b.date ? -1 : 1;
      });
      return arr;
    },

    /* ---------- 笔记模块 ---------- */

    /** 新增笔记 {id, subject, tag, content, ts} */
    addNote: function (data) {
      var arr = this.get('note.list');
      var item = {
        id: data.id || ('n' + Date.now() + '_' + Math.floor(Math.random() * 1e4)),
        subject: data.subject || '其他',
        tag: data.tag || '',
        content: data.content || '',
        ts: data.ts || Date.now()
      };
      arr.push(item);
      this.set('note.list', arr);
      return item;
    },

    /** 更新某条笔记（按 id 合并字段） */
    updateNote: function (id, data) {
      var arr = this.get('note.list');
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          Object.assign(arr[i], data, { id: id });
          this.set('note.list', arr);
          return arr[i];
        }
      }
      return null;
    },

    /** 删除某条笔记 */
    removeNote: function (id) {
      var arr = this.get('note.list').filter(function (n) { return n.id !== id; });
      this.set('note.list', arr);
      return this;
    },

    /** 按科目分组的笔记 {科目: [note,...]}，组内按 ts 降序 */
    notesBySubject: function () {
      var arr = this.get('note.list');
      var out = {};
      arr.forEach(function (n) {
        var subj = n.subject || '其他';
        out[subj] = out[subj] || [];
        out[subj].push(n);
      });
      Object.keys(out).forEach(function (k) {
        out[k].sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      });
      return out;
    },

    /** 所有出现过的标签集合（去重 + 排序） */
    noteTags: function () {
      var set = {};
      this.get('note.list').forEach(function (n) {
        if (n.tag) set[n.tag] = true;
      });
      return Object.keys(set).sort();
    }
  };

  global.KP_STORE = KP_STORE;
}(typeof window !== 'undefined' ? window : this));
