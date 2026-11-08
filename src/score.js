/* 模块：考试成绩分析
 * 数据层：KP_CONTENT.kp_scoreNorm（全国平均分参考）
 * 存储层：kp_store 'score.submissions'（成绩记录）
 * 功能：多科成绩录入 + 总分/位次估算 + 趋势 + 薄弱点诊断 + 院校匹配
 */
(function (global) {
  'use strict';

  var C = {};

  var SUBJECTS = ['政治', '英语', '数学', '专业课'];
  var FULL = { '政治': 100, '英语': 100, '数学': 150, '专业课': 150 };
  var NORM = {
    '政治':  { avg: 58, sd: 14, top: 80 },
    '英语':  { avg: 62, sd: 16, top: 85 },
    '数学':  { avg: 75, sd: 20, top: 108 },
    '专业课': { avg: 105, sd: 24, top: 145 }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 位次估算：按正态分布累计（1 个标准差 ≈ 68%） */
  function estPercentile(score, avg, sd) {
    if (!sd) return 0.5;
    var z = (score - avg) / sd;
    /* 近似误差函数：数值积分法（Simpson 200 步） */
    var N = 200, lo = -4, hi = z;
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    var dx = (hi - lo) / N;
    var sum = 0;
    for (var i = 0; i <= N; i++) {
      var x = lo + i * dx;
      var w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
      sum += w * Math.exp(-0.5 * x * x);
    }
    var integral = (dx / 3) * sum;
    return Math.max(0, Math.min(1, 0.5 + integral / 2.5066282746));
  }

  C.addRecord = function (scores, label, view, noMath) {
    var store = global.KP_STORE;
    if (!store) return;
    var subs = store.get('score.submissions') || [];
    var total = 0, maxTotal = 0;
    SUBJECTS.forEach(function (s) {
      var v = Number(scores[s]) || 0;
      total += v;
      /* 不考数学：数学不计入满分（总分按 3 科计） */
      if (noMath && s === '数学') { /* skip */ }
      else maxTotal += FULL[s];
    });
    /* 位次估算：各科分别估算后取平均（不考数学则 3 科平均） */
    var pctAvg = 0;
    var cnt = 0;
    SUBJECTS.forEach(function (s) {
      if (noMath && s === '数学') return;
      var v = Number(scores[s]) || 0;
      var n = NORM[s];
      pctAvg += estPercentile(v, n.avg, n.sd);
      cnt++;
    });
    pctAvg = cnt ? pctAvg / cnt : 0;
    var sub = {
      id: 'sc' + Date.now().toString(36),
      label: label || ('第 ' + (subs.length + 1) + ' 次'),
      scores: scores,
      total: total,
      maxTotal: maxTotal,
      noMath: !!noMath,
      pct: Math.round(pctAvg * 10000) / 100,
      ts: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10)
    };
    subs.unshift(sub);
    if (subs.length > 30) subs.length = 30;
    store.set('score.submissions', subs);
    C.render(view);
  };

  C.render = function (view) {
    var store = global.KP_STORE;
    var subs = store ? (store.get('score.submissions') || []) : [];
    var self = this;

    /* 读上次科目识别结果（来自 KP_EXAM / store） */
    var lastExam = store ? (store.get('exam.recognized') || [])[0] : null;
    var examResult = lastExam && lastExam.result ? lastExam.result : null;
    var noMath = !!(examResult && examResult.matched && !examResult.math);
    noMath = noMath || !!(store && store.get('score.nomath'));
    var examHintHtml = examResult
      ? '<div class="score-form__exam-hint" data-score-exam-hint>' +
          '<span class="score-form__exam-tag">📌 已识别科目（' + esc(examResult.school || '未填院校') + ' · ' + esc(examResult.majorInput || '未填专业') + '）</span>' +
          '<span class="score-form__exam-subj">政治 ' + esc(examResult.politics || '') + ' · 英语 ' + esc(examResult.english || '') + ' · ' +
            (examResult.math ? esc(examResult.math) : '不考数学') + ' · ' + esc(examResult.major || '') + '</span>' +
          (noMath ? '<label class="score-form__exam-nomath"><input type="checkbox" data-score-nomath ' + (noMath ? 'checked' : '') + ' /> 本批次不考数学（总分按 3 科计）</label>' : '') +
          '<button class="score-form__exam-edit" data-score-exam-edit>改</button>' +
        '</div>'
      : '<div class="score-form__exam-hint" data-score-exam-hint><button class="btn btn--ghost" data-score-exam-open>🎯 识别考试科目</button></div>';

    var latest = subs[0] || null;

    /* 诊断：基于最新一次 */
    var diagHtml = '';
    if (latest) {
      var weak = [];
      SUBJECTS.forEach(function (s) {
        var v = Number(latest.scores[s]) || 0;
        var n = NORM[s];
        var p = estPercentile(v, n.avg, n.sd);
        if (p < 0.45) weak.push(s);
      });
      var totalPct = latest.pct;
      var advice = totalPct >= 80 ? '冲刺 985 院校，建议主攻专业课拉分'
        : totalPct >= 65 ? '报考 211 / 强势双非，稳住政治英语'
        : totalPct >= 50 ? '建议「保底」志愿为主，优先选择国家线 B 区'
        : '基础薄弱期：先 6 个月打地基，不要急于择校';
      diagHtml = '<div class="score-diag" data-score-diag>' +
        '<h3 class="card__title">诊断（基于 ' + esc(latest.label) + '）</h3>' +
        (weak.length
          ? '<p class="score-diag__weak">薄弱科目：' +
            weak.map(function (w) { return '<span class="chip">' + w + '</span>'; }).join(' ') +
            '</p>' : '<p class="score-diag__ok">各科均衡，无明显短板</p>') +
        '<p class="score-diag__advice">建议：' + esc(advice) + '</p>' +
        '<p class="score-diag__rank">全国位次估算 <b>' + totalPct + '%</b></p>' +
      '</div>';
    }

    /* 趋势（最新 6 次，KP_CHARTS.trend 期望 score + accuracy(0-1) 字段） */
    var trendData = subs.slice(0, 6).map(function (s) {
      return { label: s.label, score: s.total, accuracy: s.pct / 100 };
    }).reverse();

    var trendHtml = '';
    if (trendData.length >= 2) {
      trendHtml = '<div class="score-trend" data-score-trend></div>';
    }

    /* 提交记录列表 */
    var listHtml = '';
    if (subs.length) {
      listHtml = '<h3 class="card__title" style="margin-top:var(--sp-4)">提交记录</h3><div class="score-list">' +
        subs.slice(0, 10).map(function (s) {
          var scores = SUBJECTS.map(function (k) {
            if (s.noMath && k === '数学') return '<span class="score-chip score-chip--muted">数学 不考</span>';
            return '<span class="score-chip">' + k + ' ' + esc(String(s.scores[k] || 0)) + '</span>';
          }).join('');
          return '<div class="score-item">' +
            '<div class="score-item__head">' +
              '<b>' + esc(s.label) + '</b>' +
              '<span class="score-item__total">' + s.total + ' 分</span>' +
              '<span class="score-item__pct">' + s.pct + '%</span>' +
              '<span class="score-item__date">' + esc(s.date) + '</span>' +
            '</div>' +
            '<div class="score-item__scores">' + scores + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    view.innerHTML =
      '<div class="card score-card">' +
        '<h2 class="card__title">考试成绩分析</h2>' +
        '<p class="card__desc">录入模考/真题成绩 · 自动诊断 · 位次估算</p>' +

        '<div class="score-form" data-score-form>' +
          '<div class="score-form__head">' +
            '<label class="score-form__label">批次</label>' +
            '<input class="score-form__label-input" type="text" data-score-label ' +
              'placeholder="如：第 3 次模考" value="" />' +
          '</div>' +
          examHintHtml +
          '<div class="score-form__grid">' +
            SUBJECTS.map(function (s) {
              return '<div class="score-input" data-score-input="' + s + '">' +
                '<label class="score-input__label">' + s + ' <span>（' + FULL[s] + '）</span></label>' +
                '<input class="score-input__value" type="number" min="0" max="' + FULL[s] + '" ' +
                  'placeholder="0" />' +
                '<div class="score-input__norm">参考 平均 ' + NORM[s].avg +
                  ' / 优秀 ' + NORM[s].top + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="score-form__actions">' +
            '<button class="btn btn--primary" data-score-submit>提交并分析</button>' +
          '</div>' +
        '</div>' +

        diagHtml +
        trendHtml +
        listHtml +
      '</div>';

    /* 趋势图 */
    var tEl = view.querySelector('[data-score-trend]');
    if (tEl && global.KP_CHARTS) {
      global.KP_CHARTS.trend(tEl, trendData, { leftMax: 500 });
    }

    view.addEventListener('click', function (e) {
      var openExam = e.target.closest('[data-score-exam-open]');
      if (openExam) {
        if (global.KP_APP && global.KP_APP.activate) global.KP_APP.activate('exam');
        return;
      }
      var editExam = e.target.closest('[data-score-exam-edit]');
      if (editExam) {
        if (global.KP_APP && global.KP_APP.activate) global.KP_APP.activate('exam');
        return;
      }
      var sub = e.target.closest('[data-score-submit]');
      if (!sub) return;
      var form = view.querySelector('[data-score-form]');
      var scores = {};
      SUBJECTS.forEach(function (s) {
        var el = form.querySelector('[data-score-input="' + s + '"] input');
        scores[s] = el ? (Number(el.value) || 0) : 0;
      });
      /* 不考数学：数学记 0 且不计入满分（总分按 3 科计） */
      var noMathChk = form.querySelector('[data-score-nomath]');
      var noMath = !!(noMathChk && noMathChk.checked);
      if (noMath) scores['数学'] = 0;
      var labelEl = form.querySelector('[data-score-label]');
      var label = labelEl ? labelEl.value.trim() : '';
      if (store) store.set('score.nomath', noMath);
      self.addRecord(scores, label || undefined, view, noMath);
    }, true);
  };

  global.KP_SCORE = C;
})(typeof window !== 'undefined' ? window : this);
