/* 模块：志愿模拟填报
 * 数据层：KP_CONTENT.kp_suggestSchools + kp_schoolsMeta
 * 存储层：kp_store 'apply.draft'（草稿）/ 'apply.submissions'（提交记录）
 * 功能：3 志愿（冲/稳/保）选择 + 自动概率校验 + 保存草稿 + 提交记录
 */
(function (global) {
  'use strict';

  var A = {};

  var TIER = [
    { key: 'hot', label: '冲', desc: '高于目标分，低概率' },
    { key: 'match', label: '稳', desc: '贴近目标分，中概率' },
    { key: 'safe', label: '保', desc: '低于目标分，高概率' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  A.render = function (view) {
    var content = global.KP_CONTENT ? global.KP_CONTENT.kp_suggestSchools : [];
    var meta = global.KP_CONTENT ? global.KP_CONTENT.kp_schoolsMeta : {};
    var store = global.KP_STORE;

    var draft = store ? (store.get('apply.draft') || {}) : {};
    /* 默认每个 tier 取一个推荐 */
    if (!draft.hot || !draft.match || !draft.safe) {
      var first = { hot: null, match: null, safe: null };
      content.forEach(function (c) {
        if (!first[c.tier]) first[c.tier] = c.id;
      });
      draft.hot = draft.hot || first.hot;
      draft.match = draft.match || first.match;
      draft.safe = draft.safe || first.safe;
    }

    var profile = store ? (store.get('profile') || {}) : {};
    var score = profile.targetScore || 380;

    /* 提交记录 */
    var subs = store ? (store.get('apply.submissions') || []) : [];

    var rows = TIER.map(function (t) {
      var selId = draft[t.key];
      var sel = meta[selId];
      var ch = sel ? sel.estChance : 0;
      if (typeof ch !== 'number') ch = 0.5;
      var ok = ch >= 0.35;
      return '<div class="apply-row" data-apply-tier="' + t.key + '">' +
        '<div class="apply-row__label">' + t.label + ' <span class="apply-row__desc">' + t.desc + '</span></div>' +
        '<select class="apply-row__select" data-select="' + t.key + '">' +
        content.filter(function (c) { return c.tier === t.key; }).map(function (c) {
          var m = meta[c.id];
          var selOpt = c.id === selId ? ' selected' : '';
          return '<option value="' + esc(c.id) + '"' + selOpt + '>' +
            esc(m ? m.name : c.id) + '（' + Math.round((m ? m.estChance : 0) * 100) + '%）' +
          '</option>';
        }).join('') +
        '</select>' +
        '<div class="apply-row__check ' + (ok ? 'ok' : 'bad') + '">' +
          '<span>' + Math.round(ch * 100) + '%</span> ' +
          (ok ? '✓ 达标' : '⚠ 概率偏低') +
        '</div>' +
      '</div>';
    }).join('');

    var subHtml = '';
    if (subs.length) {
      subHtml = '<h3 class="card__title" style="margin-top:var(--sp-4)">提交记录</h3><div class="apply-submissions">' +
        subs.slice(0, 8).map(function (s) {
          var m = meta[s.id];
          return '<div class="apply-sub">' +
            '<span>' + esc(s.date) + '</span>' +
            '<span>' + esc(m ? m.name : s.id) + '</span>' +
            '<span>' + Math.round(s.chance * 100) + '%</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    view.innerHTML =
      '<div class="card apply-card">' +
        '<h2 class="card__title">志愿模拟填报</h2>' +
        '<p class="card__desc">按「冲 / 稳 / 保」三梯度选择目标院校，目标分 ' + score + '</p>' +
        '<div class="apply-grid">' + rows + '</div>' +
        '<div class="apply-actions">' +
          '<button class="btn btn--ghost" data-apply-draft>保存草稿</button>' +
          '<button class="btn btn--primary" data-apply-submit>提交模拟填报</button>' +
        '</div>' +
        subHtml +
      '</div>';

    var self = this;
    view.addEventListener('change', function (e) {
      var sel = e.target.closest('[data-select]');
      if (!sel) return;
      var tier = sel.getAttribute('data-select');
      var val = sel.value;
      draft[tier] = val;
      /* 更新对应 row 的 check */
      var rowEl = view.querySelector('[data-apply-tier="' + tier + '"]');
      var m = meta[val];
      var ch = m ? m.estChance : 0;
      var ok = ch >= 0.35;
      var check = rowEl.querySelector('.apply-row__check');
      check.className = 'apply-row__check ' + (ok ? 'ok' : 'bad');
      check.innerHTML = '<span>' + Math.round(ch * 100) + '%</span> ' + (ok ? '✓ 达标' : '⚠ 概率偏低');
      A._draft = draft;
    });

    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-apply-draft]');
      if (t) {
        if (store) store.set('apply.draft', A._draft || draft);
        flash(view, '已保存草稿');
        return;
      }
      var s = e.target.closest('[data-apply-submit]');
      if (s) self.submit(A._draft || draft, store, meta, score, view);
    }, true);

    A._draft = draft;
  };

  A.submit = function (draft, store, meta, score, view) {
    if (!draft.hot || !draft.match || !draft.safe) { alert('请先选择冲/稳/保三个志愿'); return; }
    /* 取最稳（match）作为代表 */
    var targetId = draft.match;
    var m = meta[targetId];
    var chance = m ? m.estChance : 0;
    var rec = {
      id: targetId,
      chance: chance,
      draft: { hot: draft.hot, match: draft.match, safe: draft.safe },
      score: score,
      ts: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10)
    };
    if (store) {
      var subs = store.get('apply.submissions') || [];
      subs.unshift(rec);
      if (subs.length > 50) subs.length = 50;
      store.set('apply.submissions', subs);
      store.set('apply.draft', draft);
    }
    flash(view, '已提交模拟填报 · ' + (m ? m.name : targetId) + ' · ' + Math.round(chance * 100) + '%');
    /* 刷新提交记录 */
    A.render(view);
  };

  function flash(view, msg) {
    var hint = document.getElementById('offline-hint');
    if (!hint) return;
    hint.textContent = msg;
    hint.classList.add('show');
    setTimeout(function () { hint.classList.remove('show'); }, 2200);
  }

  global.KP_APPLY = A;
})(typeof window !== 'undefined' ? window : this);
