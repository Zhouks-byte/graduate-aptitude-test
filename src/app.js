/* 应用入口：导航切换 + 题库练习模块 + 各模块占位渲染 */
(function (global) {
  'use strict';

  var KP_APP = {};

  var MODULES = [
    'dashboard', 'school', 'apply', 'signup', 'exam',
    'plan', 'score-analysis', 'mock', 'notes'
  ];

  var LABELS = {
    dashboard:      '仪表盘',
    school:         '考研择校',
    apply:          '志愿模拟',
    signup:         '报名模拟',
    exam:           '科目识别',
    plan:           '备考计划',
    'score-analysis': '成绩分析',
    mock:           '模考',
    notes:          '笔记'
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 占位渲染 ---------- */
  function renderPlaceholder(view, moduleId) {
    var title = LABELS[moduleId] || moduleId;
    view.innerHTML = '' +
      '<div class="card">' +
        '<h2 class="card__title">' + title + '</h2>' +
        '<p class="card__desc">该模块骨架已就绪，业务功能待实现。</p>' +
        '<div class="card__body"></div>' +
      '</div>';
  }

  /* ---------- 仪表盘 ---------- */
  var DASHBOARD = {
    view: null,

    /* 读 store 计算仪表盘所需数据 */
    collect: function () {
      var store = global.KP_STORE;
      var checkins = store ? store.get('checkins') : [];
      var model = global.KP_MODEL;

      var todayStr = new Date().toISOString().slice(0, 10);

      // 连续打卡：优先读 kp_streak，回退到 checkins 计算
      var streakDays = model.streak(checkins);
      var planStreak = store ? store.getStreak().count : 0;
      if (planStreak > streakDays) streakDays = planStreak;

      // 今日是否已打卡
      var needCheckin = store ? !store.isCheckedIn(todayStr) : true;

      // 模考记录数 / 成绩提交数 / 笔记数
      var mockCount = store ? (store.get('mock.records') || []).length : 0;
      var scoreCount = store ? (store.get('score.submissions') || []).length : 0;
      var noteCount = store ? (store.get('note.list') || []).length : 0;
      var signup = store ? (store.get('signup.state') || {}) : {};
      var signupDone = 0;
      if (signup.nodes) {
        for (var k in signup.nodes) if (signup.nodes[k] && signup.nodes[k].done) signupDone++;
      }

      // 计划：今日任务完成率
      var planByDay = store ? store.planByDate(todayStr) : [];
      var planDone = planByDay.filter(function (t) { return t.done; }).length;
      var planPct = planByDay.length ? Math.round((planDone / planByDay.length) * 100) : 0;

      // 择校收藏
      var favSchools = store ? (store.get('school.list') || []).length : 0;

      return {
        streakDays: streakDays,
        needCheckin: needCheckin,
        mockCount: mockCount,
        scoreCount: scoreCount,
        noteCount: noteCount,
        signupDone: signupDone,
        signupTotal: 5,
        planPct: planPct,
        planDone: planDone,
        planTotal: planByDay.length,
        favSchools: favSchools,
        todayStr: todayStr
      };
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var d = this.collect();

      // 统计卡（4 张）
      var statsHtml =
        '<div class="dash-stats">' +
          '<a class="stat" href="#mock">' +
            '<div class="stat__num">' + d.mockCount + '</div>' +
            '<div class="stat__label">模考记录</div>' +
            '<div class="stat__hint">累计次</div>' +
          '</a>' +
          '<a class="stat" href="#score-analysis">' +
            '<div class="stat__num">' + d.scoreCount + '</div>' +
            '<div class="stat__label">成绩提交</div>' +
            '<div class="stat__hint">累计次</div>' +
          '</a>' +
          '<a class="stat" href="#notes">' +
            '<div class="stat__num">' + d.noteCount + '</div>' +
            '<div class="stat__label">笔记</div>' +
            '<div class="stat__hint">累计条</div>' +
          '</a>' +
          '<div class="stat">' +
            '<div class="stat__num">' + d.streakDays + '</div>' +
            '<div class="stat__label">连续打卡</div>' +
            '<div class="stat__hint">天</div>' +
          '</div>' +
        '</div>';

      // 今日任务
      var tasks = [];
      if (d.needCheckin) {
        tasks.push('<a class="dash-task dash-task--checkin" href="#dashboard" data-open-checkin>' +
          '<span class="dash-task__icon">✓</span>' +
          '<span class="dash-task__text">今日尚未打卡</span>' +
          '<span class="dash-task__go">去打卡</span></a>');
      }
      if (d.planTotal === 0) {
        tasks.push('<a class="dash-task" href="#plan"><span class="dash-task__icon">🗓</span>' +
          '<span class="dash-task__text">今日还没有计划任务</span>' +
          '<span class="dash-task__go">去添加</span></a>');
      } else if (d.planPct < 100) {
        tasks.push('<a class="dash-task" href="#plan"><span class="dash-task__icon">📋</span>' +
          '<span class="dash-task__text">今日计划 <b>' + d.planDone + '/' + d.planTotal + '</b> 完成</span>' +
          '<span class="dash-task__go">继续</span></a>');
      }
      if (d.signupDone < d.signupTotal) {
        tasks.push('<a class="dash-task" href="#signup"><span class="dash-task__icon">📑</span>' +
          '<span class="dash-task__text">报名流程 <b>' + d.signupDone + '/' + d.signupTotal + '</b></span>' +
          '<span class="dash-task__go">去完成</span></a>');
      }
      var todayHtml = tasks.length
        ? '<h3 class="dashboard-today__title">今日待办</h3><div class="dash-tasks">' + tasks.join('') + '</div>'
        : '<p class="dashboard-today__empty">今日待办全部完成，保持节奏！</p>';

      // 功能入口卡
      var entriesHtml =
        '<div class="dash-entries">' +
          '<a class="dash-entry" href="#school"><span class="dash-entry__icon">🏫</span> 择校</a>' +
          '<a class="dash-entry" href="#apply"><span class="dash-entry__icon">📝</span> 志愿</a>' +
          '<a class="dash-entry" href="#signup"><span class="dash-entry__icon">📑</span> 报名</a>' +
          '<a class="dash-entry" href="#exam"><span class="dash-entry__icon">🎯</span> 科目</a>' +
          '<a class="dash-entry" href="#score-analysis"><span class="dash-entry__icon">📊</span> 成绩</a>' +
        '</div>';

      view.innerHTML = '' +
        '<div class="card dashboard-card">' +
          '<div class="dashboard-card__head">' +
            '<div>' +
              '<h2 class="card__title">仪表盘</h2>' +
              '<p class="card__desc">学习概况 · 今日待办 · 快捷入口</p>' +
            '</div>' +
          '</div>' +
          statsHtml +
          '<div class="dashboard-today">' + todayHtml + '</div>' +
          entriesHtml +
        '</div>';
    }
  };

  /* ---------- 导航切换 ---------- */
  function activate(moduleId) {
    if (MODULES.indexOf(moduleId) === -1) return;

    // 视图切换
    $all('.view').forEach(function (v) {
      var active = v.getAttribute('data-view') === moduleId;
      v.classList.toggle('is-active', active);
      if (!active) return;
      switch (moduleId) {
        case 'dashboard':
          DASHBOARD.view = v;
          DASHBOARD.render();
          break;
        case 'school':
          if (global.KP_SCHOOL) global.KP_SCHOOL.render(v);
          else renderPlaceholder(v, moduleId);
          break;
        case 'apply':
          if (global.KP_APPLY) global.KP_APPLY.render(v);
          else renderPlaceholder(v, moduleId);
          break;
        case 'signup':
          if (global.KP_SIGNUP) global.KP_SIGNUP.render(v);
          else renderPlaceholder(v, moduleId);
          break;
        case 'exam':
          if (global.KP_EXAM) global.KP_EXAM.render(v);
          else renderPlaceholder(v, moduleId);
          break;
        case 'score-analysis':
          if (global.KP_SCORE) global.KP_SCORE.render(v);
          else renderPlaceholder(v, moduleId);
          break;
        case 'plan':
          PLAN.view = v;
          PLAN.render();
          break;
        case 'mock':
          MOCK.view = v;
          MOCK.render();
          break;
        case 'notes':
          NOTES.view = v;
          NOTES.render();
          break;
        default:
          renderPlaceholder(v, moduleId);
      }
    });

    // 侧栏
    $all('.sidebar .nav-item').forEach(function (n) {
      n.classList.toggle('is-active', n.getAttribute('data-nav') === moduleId);
    });

    // 底部 Tab
    $all('.tabbar__item').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-nav') === moduleId);
    });

    // URL hash
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, '', '#' + moduleId);
    }
  }





  /* ---------- 倒计时 ---------- */
  function updateCountdown() {
    var el = $('#exam-days');
    if (!el) return;

    var profile = global.KP_STORE ? global.KP_STORE.get('profile') : null;
    var examDate = profile && profile.examDate;

    if (!examDate) {
      el.textContent = '--';
      return;
    }

    var target = new Date(examDate);
    if (isNaN(target.getTime())) {
      el.textContent = '--';
      return;
    }

    var now = new Date();
    var diff = target.getTime() - now.getTime();
    var days = Math.ceil(diff / 86400000);
    el.textContent = days > 0 ? String(days) : '0';
  }

  /* ---------- 打卡 ---------- */
  function bindCheckin() {
    var btn = $('#today-checkin');
    if (!btn || !global.KP_STORE) return;

    function sync() {
      var checked = global.KP_STORE.isCheckedIn();
      btn.classList.toggle('is-checked', checked);
      var txt = btn.querySelector('.btn-txt');
      var target = txt || btn;
      target.textContent = checked ? '已打卡' : '打卡';
    }

    btn.addEventListener('click', function () {
      global.KP_STORE.checkInToday();
      sync();
    });
    sync();
  }

  /* ---------- 导航事件绑定 ---------- */
  function bindNav() {
    $all('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () {
        activate(el.getAttribute('data-nav'));
      });
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    if (global.KP_STORE) global.KP_STORE.init();

    bindNav();
    bindCheckin();
    updateCountdown();

    // hash 路由
    var initial = (global.location && global.location.hash || '#dashboard').replace('#', '');
    if (MODULES.indexOf(initial) === -1) initial = 'dashboard';
    activate(initial);

    global.addEventListener('hashchange', function () {
      var id = (global.location.hash || '').replace('#', '') || 'dashboard';
      activate(id);
    });

    return KP_APP;
  }

  KP_APP.init = init;
  KP_APP.activate = activate;

  global.KP_APP = KP_APP;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(typeof window !== 'undefined' ? window : this));
