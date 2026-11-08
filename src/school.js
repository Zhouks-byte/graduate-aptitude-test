/* 模块：考研择校
 * 数据层：KP_CONTENT.kp_suggestSchools + KP_CONTENT.kp_schoolsMeta
 * 存储层：kp_store 键 'school.list'（用户添加/收藏的学校记录）
 * 功能：条件（省份/城市/层次/学科/预算/备考起点）→ 匹配院校 + 录取概率估算 + 详情
 */
(function (global) {
  'use strict';

  var S = {};

  /* ---------- 学校详情弹窗 ---------- */
  var detailOverlay = null;

  S.openDetail = function (id, viewRoot) {
    var meta = global.KP_CONTENT ? global.KP_CONTENT.kp_schoolsMeta : {};
    var s = meta[id];
    if (!s) return;
    var root = viewRoot || document;
    detailOverlay = root.querySelector('[data-school-detail]');
    if (!detailOverlay) {
      detailOverlay = document.createElement('div');
      detailOverlay.className = 'detail-overlay';
      detailOverlay.setAttribute('data-school-detail', '1');
      document.body.appendChild(detailOverlay);
    }
    var tags = (s.tags || []).map(function (t) { return '<span class="chip is-active">' + esc(t) + '</span>'; }).join('');
    detailOverlay.innerHTML =
      '<div class="detail-panel" role="dialog" aria-label="院校详情">' +
        '<button class="detail-close" data-detail-close>✕</button>' +
        '<h2 class="card__title">' + esc(s.name) + '</h2>' +
        '<div class="detail-tag">' + esc(s.level) + ' · ' + esc(s.type) + ' · ' + esc(s.city) + '</div>' +
        '<div class="detail-tags">' + tags + '</div>' +
        '<div class="detail-block"><h4>2025 考研参考线</h4><p>' + esc(s.line2025) + '</p></div>' +
        '<div class="detail-block"><h4>报录比（2025）</h4><p>' + esc(s.ratio2025) + '</p></div>' +
        '<div class="detail-block"><h4>推荐专业</h4><p>' + esc(s.majors) + '</p></div>' +
        '<div class="detail-block"><h4>学费（元/年）</h4><p>' + s.fee.toLocaleString() + ' · 学制 ' + esc(s.duration) + ' 年</p></div>' +
        '<div class="detail-actions">' +
          '<button class="btn btn--primary" data-detail-fav="' + esc(s.id) + '">收藏该院校</button>' +
          '<a class="btn btn--ghost" target="_blank" rel="noopener" href="' + s.website + '">访问官网</a>' +
        '</div>' +
      '</div>';
    detailOverlay.classList.add('is-open');
    detailOverlay.addEventListener('click', onDetailClick, false);
  };

  function onDetailClick(e) {
    var close = e.target.closest('[data-detail-close]');
    if (close || e.target === detailOverlay) {
      detailOverlay.classList.remove('is-open');
      detailOverlay.removeEventListener('click', onDetailClick, false);
      detailOverlay.innerHTML = '';
      return;
    }
    var favBtn = e.target.closest('[data-detail-fav]');
    if (favBtn) {
      var id = favBtn.getAttribute('data-detail-fav');
      var store = global.KP_STORE;
      if (store) {
        var list = store.get('school.list') || [];
        var dup = false;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) { dup = true; break; }
        if (!dup) {
          list.push({ id: id, ts: new Date().toISOString() });
          store.set('school.list', list);
        }
      }
      if (global.KP_APP._onSchoolChange) global.KP_APP._onSchoolChange();
      close.click();
    }
  }

  /* ---------- 概率估算：基于目标分与院校 2025 参考线的差距 ---------- */
  function estChance(score, line) {
    if (!line) return 0.5;
    var diff = score - line;
    if (diff >= 40) return 0.92;
    if (diff >= 25) return 0.85;
    if (diff >= 10) return 0.72;
    if (diff >= 0) return 0.58;
    if (diff >= -10) return 0.45;
    if (diff >= -25) return 0.30;
    return 0.18;
  }

  /* ---------- 用户自定义院校（输入校名+专业 → 自动识别科目） ---------- */
  S.addCustomSchool = function (name, major, line) {
    var store = global.KP_STORE;
    if (!store) return;
    var list = store.get('school.custom') || [];
    var id = 'custom_' + name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    var exists = list.some(function (s) { return s.id === id; });
    if (!exists) {
      list.unshift({
        id: id,
        name: name,
        major: major || '',
        line: line ? Number(line) : 340,
        addedAt: new Date().toISOString()
      });
      store.set('school.custom', list);
    }
    /* 若识别了科目，保存识别记录 */
    if (global.KP_EXAM && name && major) {
      var result = global.KP_EXAM.identify(name, major);
      var recs = store.get('exam.recognized') || [];
      recs.unshift({ result: result, ts: new Date().toISOString() });
      if (recs.length > 20) recs.length = 20;
      store.set('exam.recognized', recs);
    }
  };

  /* ---------- 视图 ---------- */
  S.render = function (view) {
    var content = global.KP_CONTENT ? global.KP_CONTENT.kp_suggestSchools : [];
    var meta = global.KP_CONTENT ? global.KP_CONTENT.kp_schoolsMeta : {};
    var store = global.KP_STORE;
    var storeFavs = store ? store.get('school.list') || [] : [];
    var customList = store ? store.get('school.custom') || [] : [];
    var favSet = {};
    storeFavs.forEach(function (f) { favSet[f.id] = true; });

    var score = store ? (store.get('profile') || {}).targetScore || 380 : 380;

    /* 分组统计 */
    var groups = {};
    content.forEach(function (c) {
      var g = c.group;
      if (!groups[g]) groups[g] = { label: g, tier: c.tier, items: [] };
      groups[g].items.push(c);
    });

    var tierLabel = { hot: '热门', match: '匹配', safe: '保底' };
    var tierColor = { hot: 'var(--bad)', match: 'var(--brand-500)', safe: 'var(--ok)' };

    /* 自定义院校区块 */
    var customHtml = '';
    if (customList.length) {
      customHtml = '<div class="sugg-card" data-sugg-tier="custom">' +
        '<div class="sugg-card__head">' +
          '<span class="sugg-card__group">我的院校</span>' +
          '<span class="sugg-card__tier" style="color:var(--brand-600, #4f46e5)">' +
            customList.length + ' 所</span>' +
        '</div>' +
        '<div class="sugg-card__list">' +
        customList.map(function (cs) {
          var ch = estChance(score, cs.line);
          var exam = global.KP_EXAM && cs.major ? global.KP_EXAM.identify(cs.name, cs.major) : null;
          var examTag = exam && exam.matched
            ? '<div class="sugg-row__exam">' + esc(exam.english) + (exam.math ? ' · ' + esc(exam.math) : '') + '</div>'
            : '';
          return '<div class="sugg-row sugg-row--custom">' +
            '<span class="sugg-row__name">' + esc(cs.name) +
              (cs.major ? ' <span class="sugg-row__major">' + esc(cs.major) + '</span>' : '') +
            '</span>' +
            '<span class="sugg-row__tag">' + esc(cs.line) + ' 分</span>' +
            '<span class="sugg-row__prob" style="color:var(--brand-500, #4f46e5)">' +
              Math.round(ch * 100) + '%</span>' +
            examTag +
            '<button class="sugg-row__del" data-del-custom="' + esc(cs.id) + '">✕</button>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>';
    }

    /* 自定义院校输入表单 */
    var addFormHtml =
      '<div class="school-custom-form">' +
        '<div class="school-custom-form__title">添加我的报考院校</div>' +
        '<div class="school-custom-form__row">' +
          '<input class="school-custom-form__input" type="text" data-custom-name ' +
            'placeholder="院校名称（如：复旦大学）" />' +
          '<input class="school-custom-form__input" type="text" data-custom-major ' +
            'placeholder="专业（如：计算机科学与技术）" />' +
          '<input class="school-custom-form__input school-custom-form__input--line" type="number" data-custom-line ' +
            'placeholder="参考线" min="200" max="500" />' +
        '</div>' +
        '<button class="btn btn--primary school-custom-form__btn" data-custom-add>+ 添加并识别科目</button>' +
      '</div>';

    var rows = '';
    Object.keys(groups).forEach(function (g) {
      var grp = groups[g];
      rows += '<div class="sugg-card" data-sugg-tier="' + grp.tier + '">' +
        '<div class="sugg-card__head">' +
          '<span class="sugg-card__group">' + esc(grp.label) + '</span>' +
          '<span class="sugg-card__tier" style="color:' + tierColor[grp.tier] + '">' +
            tierLabel[grp.tier] + ' · ' + grp.items.length + ' 所</span>' +
        '</div>' +
        '<div class="sugg-card__list">' +
        grp.items.map(function (c) {
          var m = meta[c.id] || {};
          var ch = estChance(score, m.line25);
          var fav = favSet[c.id] ? ' ✓' : '';
          return '<button class="sugg-row" data-open="' + esc(c.id) + '">' +
            '<span class="sugg-row__name">' + esc(m.name || c.id) + '</span>' +
            '<span class="sugg-row__tag">' + esc(m.level || '') + '</span>' +
            '<span class="sugg-row__prob" style="color:' + tierColor[grp.tier] + '">' +
              Math.round(ch * 100) + '%' + '</span>' +
            '<span class="sugg-row__fav">' + fav + '</span>' +
          '</button>';
        }).join('') +
        '</div>' +
      '</div>';
    });

    var viewEl = view;
    viewEl.innerHTML =
      '<div class="card school-card">' +
        '<h2 class="card__title">考研择校</h2>' +
        '<p class="card__desc">共 ' + (Object.keys(meta).length) + ' 所院校 · 按「目标分 ' + score + ' 分」匹配推荐</p>' +
        addFormHtml +
        customHtml +
        rows +
        '<div class="sugg-actions">' +
          '<button class="btn btn--primary" data-open-suggest>模拟报考</button>' +
        '</div>' +
      '</div>';

    viewEl.addEventListener('click', function (e) {
      var row = e.target.closest('[data-open]');
      if (row) {
        var id = row.getAttribute('data-open');
        S.openDetail(id, viewEl);
        return;
      }
      var sug = e.target.closest('[data-open-suggest]');
      if (sug) {
        var act = global.KP_APP._openApplySheet ? global.KP_APP._openApplySheet() : null;
        if (act) {
          var target = content[0] && meta[content[0].id];
          if (target && global.KP_APP.activate) global.KP_APP.activate('apply');
        }
        return;
      }
      /* 添加自定义院校 */
      var addBtn = e.target.closest('[data-custom-add]');
      if (addBtn) {
        var nameEl = viewEl.querySelector('[data-custom-name]');
        var majorEl = viewEl.querySelector('[data-custom-major]');
        var lineEl = viewEl.querySelector('[data-custom-line]');
        var name = nameEl ? nameEl.value.trim() : '';
        var major = majorEl ? majorEl.value.trim() : '';
        var line = lineEl ? lineEl.value.trim() : '';
        if (!name) { flash('请输入院校名称'); return; }
        S.addCustomSchool(name, major, line || undefined);
        if (nameEl) nameEl.value = '';
        if (majorEl) majorEl.value = '';
        if (lineEl) lineEl.value = '';
        flash(major ? '已添加并识别科目' : '已添加（未填专业，跳过科目识别）');
        S.render(viewEl);
        return;
      }
      /* 删除自定义院校 */
      var delBtn = e.target.closest('[data-del-custom]');
      if (delBtn) {
        var delId = delBtn.getAttribute('data-del-custom');
        var store = global.KP_STORE;
        if (store) {
          var list = store.get('school.custom') || [];
          list = list.filter(function (s) { return s.id !== delId; });
          store.set('school.custom', list);
        }
        S.render(viewEl);
      }
    }, true);

    function flash(msg) {
      var hint = document.getElementById('offline-hint');
      if (!hint) return;
      hint.textContent = msg;
      hint.classList.add('show');
      setTimeout(function () { hint.classList.remove('show'); }, 2200);
    }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  global.KP_SCHOOL = S;
})(typeof window !== 'undefined' ? window : this);
