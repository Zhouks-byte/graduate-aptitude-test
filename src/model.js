/* 数据模型：实体工厂 + 纯函数（无 DOM、无 localStorage，Node 可直接跑） */
(function (global) {
  'use strict';

  /** 艾宾浩斯复习间隔表（天） */
  var EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];

  /* ---------- 内部工具 ---------- */

  function normalize(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function normalizeArr(v) {
    if (!Array.isArray(v)) return [];
    return v.map(normalize);
  }

  function todayStr(d) {
    d = d || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  /* ---------- 判定 ---------- */

  function judgeAnswer(question, userAnswer) {
    if (!question || question.answer === undefined || question.answer === null) {
      return { correct: false, judged: false, reason: 'no-answer' };
    }
    var u = userAnswer;
    var a = question.answer;

    // 未作答（null/undefined）视为未判定
    if (u === null || u === undefined) {
      return { correct: false, judged: false, reason: 'no-user-answer', answer: a, userAnswer: u };
    }

    var correct;
    if (question.type === 'blank') {
      // 填空：trim + 大小写不敏感
      correct = normalize(u).toLowerCase() === normalize(a).toLowerCase();
    } else if (Array.isArray(a)) {
      // 多选：归一化后按集合比较（顺序无关）
      var as = normalizeArr(a).sort().join('|');
      var us = Array.isArray(u) ? normalizeArr(u).sort().join('|') : '';
      correct = as === us;
    } else if (typeof u === 'string' && typeof a === 'string') {
      correct = normalize(u) === normalize(a);
    } else {
      correct = u === a;
    }
    return { correct: !!correct, judged: true, answer: a, userAnswer: u };
  }

  /* ---------- 艾宾浩斯间隔 ---------- */

  function ebbinghaus(stage) {
    var s = Number(stage);
    if (!isFinite(s) || s < 0) return EBBINGHAUS_INTERVALS[0];
    var idx = Math.floor(s);
    if (idx < EBBINGHAUS_INTERVALS.length) {
      return EBBINGHAUS_INTERVALS[idx];
    }
    /* 超出表范围后按最后一个间隔倍增封顶 */
    var extra = idx - EBBINGHAUS_INTERVALS.length + 1;
    return EBBINGHAUS_INTERVALS[EBBINGHAUS_INTERVALS.length - 1] * Math.pow(2, extra);
  }

  /* ---------- 正确率 ---------- */

  function accuracy(records) {
    if (!Array.isArray(records)) return 0;
    if (records.length === 0) return 0;
    var hit = 0;
    for (var i = 0; i < records.length; i++) {
      var c = records[i];
      var ok = c && c.correct === true;
      if (ok) hit++;
    }
    return hit / records.length;
    // 0.33 等浮点直接返回，调用方按需 round
  }

  /* ---------- 连续打卡天数 ---------- */

  function streak(dates, refDate) {
    if (!Array.isArray(dates)) return 0;
    var set = {};
    var raw = dates;
    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      if (typeof d === 'string') set[d.slice(0, 10)] = true;
      else if (d && typeof d === 'object') {
        var t = d.date || d.day;
        if (typeof t === 'string') set[t.slice(0, 10)] = true;
      }
    }
    if (Object.keys(set).length === 0) return 0;

    var cursor = refDate ? String(refDate).slice(0, 10) : todayStr();

    function shift(dateStr, delta) {
      var p = dateStr.split('-');
      var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      dt.setDate(dt.getDate() + delta);
      return todayStr(dt);
    }

    // 若参考日未打卡，允许从今天往回算（参考日可能是“今天”但还没打，常见场景是统计到昨天为止）
    if (!set[cursor]) {
      cursor = shift(cursor, -1);
    }
    var count = 0;
    while (set[cursor]) {
      count++;
      cursor = shift(cursor, -1);
      if (count > 3660) break; // 上限保护
    }
    return count;
  }

  /* ---------- 日历 / 计划 ---------- */

  /**
   * 生成某月日历网格。
   * @param year  四位年份
   * @param month 0-11
   * @returns { year, month, weeks: string[6][7] } 每格 'YYYY-MM-DD'，前导补 'YYYY-MM-01' 空位
   */
  function calendarWeeks(year, month) {
    var first = new Date(year, month, 1);
    var startDow = first.getDay(); // 0=周日
    // 周一作为周首
    var startOffset = startDow === 0 ? 6 : startDow - 1;
    var dayCount = new Date(year, month + 1, 0).getDate();

    var pad = startOffset;
    var cells = [];
    for (var i = 1; i <= dayCount; i++) {
      var m = month + 1;
      var ds = year + '-' + (m < 10 ? '0' + m : m) + '-' + (i < 10 ? '0' + i : i);
      cells.push(ds);
    }
    // 前导空位
    for (var p = 0; p < pad; p++) cells.unshift('');
    // 尾部补齐到 7 的倍数
    while (cells.length % 7 !== 0) cells.push('');

    var weeks = [];
    for (var w = 0; w < cells.length; w += 7) {
      weeks.push(cells.slice(w, w + 7));
    }
    return { year: year, month: month, weeks: weeks };
  }

  /** 某天计划任务摘要 */
  function planDaySummary(plan, dateStr) {
    var items = (Array.isArray(plan) ? plan : []).filter(function (t) { return t.date === dateStr; });
    var done = items.filter(function (t) { return t.done; }).length;
    var total = items.length;
    var allDone = total > 0 && done === total;
    var minutes = 0;
    items.forEach(function (t) { minutes += Number(t.duration) || 0; });
    return {
      items: items,
      total: total,
      done: done,
      allDone: allDone,
      minutes: minutes,
      accuracy: total === 0 ? 0 : done / total
    };
  }

  /* ---------- 薄弱知识点雷达 ---------- */

  /**
   * 雷达数据：按维度统计正确率，低于 60% 记为薄弱并标记 isWeak，
   * 值域归一化为 0~1。
   * @param mock  { questions?: Array<{dimension|tag, correct}> , dims?: Array, records?: Array }
   * @param dims  维度名数组
   * @returns     Array<{ name, value, correct, total, isWeak }>
   */
  function radarData(mock, dims) {
    if (!Array.isArray(dims) || dims.length === 0) return [];
    var qs = (mock && mock.questions) || (mock && mock.records) || [];
    var byDim = {};
    for (var d = 0; d < dims.length; d++) byDim[dims[d]] = { correct: 0, total: 0 };

    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      var dim = q && (q.dimension || q.tag || q.category);
      if (!byDim[dim]) continue;
      byDim[dim].total++;
      if (q && q.correct === true) byDim[dim].correct++;
    }

    var out = [];
    for (var j = 0; j < dims.length; j++) {
      var name = dims[j];
      var cell = byDim[name];
      var total = cell.total;
      var correct = cell.correct;
      var rate = total === 0 ? 0 : correct / total;
      out.push({
        name: name,
        value: Math.max(0, Math.min(1, rate)),
        correct: correct,
        total: total,
        isWeak: total > 0 && rate < 0.6
      });
    }
    return out;
  }

  /* ---------- 模考薄弱点雷达 ---------- */

  /**
   * 统计模考记录中被标记的薄弱点（weakPoints[] 数组）频次。
   * @param mocks  Array<{ weakPoints: string[] }>
   * @param dims   维度名数组（6 维）
   * @returns Array<{ name, count, value }>  value 归一化为 0~1（count / maxCount）
   */
  function mockRadarData(mocks, dims) {
    var out = [];
    if (!Array.isArray(dims) || dims.length === 0) return out;
    var counts = {};
    for (var d = 0; d < dims.length; d++) counts[dims[d]] = 0;
    (Array.isArray(mocks) ? mocks : []).forEach(function (m) {
      var wp = m && m.weakPoints;
      if (!Array.isArray(wp)) return;
      wp.forEach(function (w) {
        if (counts[w] !== undefined) counts[w]++;
      });
    });
    var max = 0;
    for (var k in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, k) && counts[k] > max) max = counts[k];
    }
    for (var j = 0; j < dims.length; j++) {
      var c = counts[dims[j]] || 0;
      out.push({
        name: dims[j],
        count: c,
        value: max === 0 ? 0 : c / max
      });
    }
    return out;
  }

  /* ---------- 公开 ---------- */

  var KP_MODEL = {
    EBBINGHAUS_INTERVALS: EBBINGHAUS_INTERVALS,

    /* 实体工厂 */
    createQuestion: function (data) {
      return Object.assign({
        id: null,
        category: '',
        stem: '',
        options: [],
        answer: null,
        explanation: '',
        difficulty: 1,
        tags: [],
        source: '',
        isMistake: false,
        mistakeCount: 0
      }, data || {});
    },

    createVocab: function (data) {
      return Object.assign({
        id: null,
        word: '',
        phonetic: '',
        meaning: '',
        example: '',
        status: 'new'
      }, data || {});
    },

    createPlanItem: function (data) {
      return Object.assign({
        id: null,
        title: '',
        dueDate: null,
        done: false,
        priority: 'mid'
      }, data || {});
    },

    createNote: function (data) {
      return Object.assign({
        id: null,
        title: '',
        body: '',
        tags: [],
        updatedAt: null
      }, data || {});
    },

    createMockSession: function (data) {
      return Object.assign({
        id: null,
        startedAt: null,
        endedAt: null,
        score: null
      }, data || {});
    },

    createCheckin: function (date) {
      return { date: date, minutes: 0 };
    },

    /* 纯函数 */
    judgeAnswer: judgeAnswer,
    ebbinghaus: ebbinghaus,
    accuracy: accuracy,
    streak: streak,
    radarData: radarData,
    mockRadarData: mockRadarData,
    calendarWeeks: calendarWeeks,
    planDaySummary: planDaySummary
  };

  global.KP_MODEL = KP_MODEL;
}(typeof window !== 'undefined' ? window : this));
