/*!
 * sw-register.js — PWA 装配层
 *   1) 注册 Service Worker（离线可用）；file:// 下自动跳过（单文件离线版不受影响）
 *   2) 离线 / 恢复在线状态提示
 *   3) 导出全部数据（kp_* 拼 JSON 下载）/ 导入数据（上传恢复）
 */
(function () {
  'use strict';

  var STORE = function () { return (typeof globalThis !== 'undefined' ? globalThis : window).KP_STORE; };

  /* ---------------- Service Worker ---------------- */
  function registerSW() {
    var g = (typeof globalThis !== 'undefined') ? globalThis : window;
    if (!('serviceWorker' in g.navigator)) return;
    /* file:// 打开时 SW 不可用，直接跳过（离线单文件版不受影响） */
    if (g.location && g.location.protocol === 'file:') return;
    g.navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && g.navigator.serviceWorker.controller) {
            g.dispatchEvent(new CustomEvent('kp:sw-updated'));
          }
        });
      });
    }).catch(function () { /* 注册失败不影响使用 */ });
  }

  /* ---------------- 移动端增强：日历点击自动滚动到当天任务 ---------------- */
  function bindPlanScroll() {
    if (!document.addEventListener) return;
    document.addEventListener('click', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('[data-cal-date]') : null;
      if (!cell) return;
      /* 仅移动端单列布局生效（≥769px 为两列，不需要滚动） */
      var mq = window.matchMedia && window.matchMedia('(max-width: 768px)');
      if (!mq || !mq.matches) return;
      var day = document.querySelector('.plan-day');
      if (!day) return;
      var r = day.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.5) {
        day.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, true);
  }

  /* ---------------- 离线 / 在线 / 操作提示 ---------------- */
  var hintEl = null;
  var hintTimer = null;

  function hint() {
    if (hintEl) return hintEl;
    var el = document.getElementById('offline-hint');
    if (el) hintEl = el;
    return hintEl;
  }

  /** 显示一条临时提示（成功/导入等） */
  function flash(_unused, msg) {
    var el = hint();
    if (!el || !msg) return;
    el.textContent = msg;
    el.classList.add('show');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function setupOnlineUI() {
    var g = (typeof globalThis !== 'undefined') ? globalThis : window;
    function update() {
      var el = hint();
      if (!el) return;
      if (g.navigator.onLine) {
        el.classList.remove('show');
      } else {
        el.textContent = '当前离线 · 数据仍保存在本机，可正常读写';
        el.classList.add('show');
        g.setTimeout(function () { el.classList.remove('show'); }, 4000);
      }
    }
    g.addEventListener('offline', update);
    g.addEventListener('online', update);
    /* 初次进入若已离线则提示一次 */
    if (!g.navigator.onLine) update();
  }

  /* ---------------- 导出 / 导入 ---------------- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportData() {
    var store = STORE();
    if (!store || !store.exportAll) { alert('导出功能不可用（store 未初始化）'); return; }
    var obj = store.exportAll();
    var stamp = new Date().toISOString().slice(0, 10);
    download('kp-backup-' + stamp + '.json', JSON.stringify(obj, null, 2), 'application/json;charset=utf-8');
    flash('已导出 ' + Object.keys(obj.data).length + ' 项数据');
  }

  function importData(file) {
    var store = STORE();
    if (!store || !store.importAll) { alert('导入功能不可用（store 未初始化）'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { alert('导入失败：文件不是有效的 JSON'); return; }
      if (!obj || typeof obj.data !== 'object' || obj.data === null) {
        alert('导入失败：缺少 data 字段（请使用本应用导出的备份文件）');
        return;
      }
      if (!confirm('导入将覆盖当前数据（' + Object.keys(obj.data).length + ' 项），确定继续？')) return;
      var res = store.importAll(obj);
      // 导入后切到 dashboard 触发全量重渲染（各模块进入时都会重新读 store）
      if (typeof KP_APP !== 'undefined' && KP_APP.activate) KP_APP.activate('dashboard');
      flash('已导入 ' + res.restored + ' 项数据');
    };
    reader.onerror = function () { alert('读取文件失败'); };
    reader.readAsText(file);
  }

  function bindImportExport() {
    var expBtn = document.querySelector('[data-export]');
    var impInput = document.querySelector('[data-import]');
    if (expBtn) expBtn.addEventListener('click', exportData);
    if (impInput) impInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) importData(f);
      this.value = '';
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    registerSW();
    setupOnlineUI();
    bindImportExport();
    bindPlanScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
