/* 模块：报名模拟
 * 数据层：KP_CONTENT.kp_signupFlow（流程节点）
 * 存储层：kp_store 'signup.state'（各节点完成状态 + 信息）
 * 功能：模拟报名流程向导（5 节点） + 信息表单 + 完成页 + 时间轴
 */
(function (global) {
  'use strict';

  var B = {};

  var NODES = [
    { id: 'account', label: '账号注册', desc: '学信网 / 研招网 实名注册', days: 7 },
    { id: 'info', label: '基本信息', desc: '学历 / 身份证 / 专业', days: 2 },
    { id: 'add', label: '添加志愿', desc: '学校 / 专业 / 导师', days: 5 },
    { id: 'fee', label: '缴费确认', desc: '模拟缴费 300–400 元', days: 1 },
    { id: 'print', label: '打印准考证', desc: '考前 10 天下载', days: 10 }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  B.render = function (view) {
    var store = global.KP_STORE;
    var state = store ? (store.get('signup.state') || {}) : {};
    if (!state.nodes) state.nodes = {};
    if (!state.info) state.info = {};

    /* 当前进度 */
    var idx = 0;
    for (var i = 0; i < NODES.length; i++) {
      if (state.nodes[NODES[i].id]) { idx = i + 1; } else break;
    }
    var allDone = idx >= NODES.length;

    var self = this;

    /* 时间轴 */
    var timeline = NODES.map(function (n, i) {
      var done = state.nodes[n.id];
      var current = !done && i === idx && !allDone;
      var cls = done ? 'tl-node--done' : (current ? 'tl-node--current' : 'tl-node--todo');
      return '<div class="tl-node ' + cls + '">' +
        '<div class="tl-node__dot"></div>' +
        '<div class="tl-node__label">' + esc(n.label) + '</div>' +
        '<div class="tl-node__desc">' + esc(n.desc) + '</div>' +
        '<div class="tl-node__days">' + n.days + ' 天</div>' +
      '</div>';
    }).join('');

    /* 当前节点表单 */
    var formHtml = '';
    if (!allDone) {
      var n = NODES[idx];
      formHtml = '<div class="signup-form" data-signup-node="' + esc(n.id) + '">' +
        '<h3 class="card__title">第 ' + (idx + 1) + ' 步 · ' + esc(n.label) + '</h3>' +
        '<p class="card__desc">' + esc(n.desc) + '</p>' +
        B._formFor(n.id, state.info) +
        '<div class="signup-actions">' +
          (idx > 0 ? '<button class="btn btn--ghost" data-signup-prev>上一步</button>' : '') +
          '<button class="btn btn--primary" data-signup-next>完成并下一步</button>' +
        '</div>' +
      '</div>';
    } else {
      formHtml = '<div class="signup-done" data-signup-done>' +
        '<div class="signup-done__mark">✓</div>' +
        '<h3 class="card__title">报名流程已全部完成</h3>' +
        '<p class="card__desc">已模拟走完 5 个节点，共 ' +
          NODES.reduce(function (s, x) { return s + x.days; }, 0) + ' 天。</p>' +
        B._infoSummary(state.info) +
        '<div class="signup-actions"><button class="btn btn--ghost" data-signup-reset>重置流程</button></div>' +
      '</div>';
    }

    view.innerHTML =
      '<div class="card signup-card">' +
        '<h2 class="card__title">报名模拟</h2>' +
        '<p class="card__desc">5 节点时间轴 · 模拟研招网 报名 流程</p>' +
        '<div class="signup-tl">' + timeline + '</div>' +
        formHtml +
      '</div>';

    view.addEventListener('click', function (e) {
      var next = e.target.closest('[data-signup-next]');
      if (next) { self._advance(idx, state, store, view); return; }
      var prev = e.target.closest('[data-signup-prev]');
      if (prev) { self._back(idx, state, store, view); return; }
      var reset = e.target.closest('[data-signup-reset]');
      if (reset) { self._reset(store, view); return; }
    }, true);

    /* 表单 input 实时写 state */
    view.querySelectorAll('[data-signup-input]').forEach(function (inp) {
      inp.value = state.info[inp.getAttribute('data-signup-input')] || '';
      inp.addEventListener('input', function () {
        state.info[inp.getAttribute('data-signup-input')] = inp.value;
        if (store) store.set('signup.state', state);
      });
    });
  };

  B._formFor = function (nodeId, info) {
    function field(name, label, type, ph) {
      var t = type || 'text';
      return '<div class="signup-field">' +
        '<label class="signup-field__label" for="si-' + esc(name) + '">' + esc(label) + '</label>' +
        '<input class="signup-field__input" id="si-' + esc(name) + '" data-signup-input="' + esc(name) + '" ' +
          'type="' + t + '" placeholder="' + esc(ph || '') + '" ' +
          (t === 'date' ? 'min="2025-10-01" max="2025-10-31"' : '') + '/>' +
      '</div>';
    }
    switch (nodeId) {
      case 'account':
        return field('phone', '手机号', 'tel', '11 位手机号') +
          field('realname', '姓名', 'text', '与身份证一致');
      case 'info':
        return field('edu', '学历', 'select', '') +
          '<div class="signup-field__hint">本科 / 硕士 / 专科（同等学力）</div>' +
          field('major', '本科专业', 'text', '如：计算机科学与技术') +
          field('gradYear', '毕业年份', 'number', '如 2026');
      case 'add':
        return field('targetSchool', '目标院校', 'text', '如：华东师范大学') +
          field('targetMajor', '目标专业', 'text', '如：教育学') +
          field('advisor', '意向导师（选填）', 'text', '姓名 / 研究方向');
      case 'fee':
        return '<div class="signup-field"><span class="signup-field__label">模拟缴费</span>' +
          '<div class="signup-fee">¥ ' + (300 + Math.floor(Math.random() * 100)) + '（模拟）</div></div>' +
          '<label class="signup-agree"><input type="checkbox" data-signup-input="agreePay" /> 我已确认模拟缴费规则</label>';
      case 'print':
        return field('printAt', '打印时间', 'date', '考前 10 天');
    }
    return '';
  };

  B._infoSummary = function (info) {
    var rows = [];
    if (info.phone) rows.push(['手机号', info.phone]);
    if (info.realname) rows.push(['姓名', info.realname]);
    if (info.edu) rows.push(['学历', info.edu]);
    if (info.major) rows.push(['本科专业', info.major]);
    if (info.targetSchool) rows.push(['目标院校', info.targetSchool]);
    if (info.targetMajor) rows.push(['目标专业', info.targetMajor]);
    return rows.map(function (r) {
      return '<div class="signup-sum"><span class="signup-sum__k">' + esc(r[0]) +
        '</span><span class="signup-sum__v">' + esc(r[1]) + '</span></div>';
    }).join('');
  };

  B._advance = function (idx, state, store, view) {
    var n = NODES[idx];
    /* 简单校验 */
    if (n.id === 'account' && !state.info.phone) {
      alert('请填写手机号'); return;
    }
    if (n.id === 'add' && !state.info.targetSchool) {
      alert('请填写目标院校'); return;
    }
    state.nodes[n.id] = { done: true, ts: new Date().toISOString() };
    if (store) store.set('signup.state', state);
    B.render(view);
  };

  B._back = function (idx, state, store, view) {
    if (idx > 0) {
      delete state.nodes[NODES[idx].id];
      if (store) store.set('signup.state', state);
    }
    B.render(view);
  };

  B._reset = function (store, view) {
    if (store) store.set('signup.state', {});
    B.render(view);
  };

  global.KP_SIGNUP = B;
})(typeof window !== 'undefined' ? window : this);
