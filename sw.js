/*!
 * sw.js — Service Worker（离线可用 / 秒开）
 * 策略（对齐 cet4）：
 *   · 导航请求（HTML）：network-first，3.5s 超时后回落缓存 —— 既有更新又能离线打开
 *   · 静态资源（CSS/JS/图标/manifest）：stale-while-revalidate —— 先给缓存再后台更新
 *   · 其他 GET：cache-first
 * 版本号变更即触发旧缓存清理。
 *
 * 附加：移动端增强（plan-scroll）—— 点日历格子后，把当天任务列表滚动到视口内。
 *   该增强脚本对桌面/移动通用，不影响业务逻辑。
 *
 * 注意：应用数据存于 localStorage（kp_* 前缀），SW 不触碰 —— 离线时数据照常读写。
 */
'use strict';

/* 移动端增强：日历格子点击后自动滚动到当天任务列表（委托 + 视口检测，无需改 app.js 业务） */
var PLAN_SCROLL_INJECT = '' +
  '<script>(function(){' +
  'function isMobile(){return window.matchMedia && matchMedia("(max-width: 768px)").matches;}' +
  'document.addEventListener("click", function(e){' +
  '  var cell = e.target && e.target.closest ? e.target.closest("[data-cal-date]") : null;' +
  '  if(!cell || !isMobile()) return;' +
  '  var day = document.querySelector(".plan-day");' +
  '  if(!day) return;' +
  '  var r = day.getBoundingClientRect();' +
  '  if(r.top < 0 || r.top > window.innerHeight * 0.5){' +
  '    day.scrollIntoView({ behavior: "smooth", block: "start" });' +
  '  }' +
  '}, true);' +
  '})();' +
  '</script>';

var VERSION = 'kp-v3';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './styles-mobile-ux.css',
  './src/content.js',
  './src/model.js',
  './src/store.js',
  './src/charts.js',
  './src/app.js',
  './sw-register.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-1024.png'
];

/* ---------------- 安装：预缓存应用外壳 ---------------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      /* 逐个 add，单个失败不阻塞整体安装 */
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---------------- 激活：清理旧版本缓存 ---------------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------------- 请求拦截 ---------------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  /* 只处理同源请求，跨域交给浏览器 */
  if (url.origin !== self.location.origin) return;

  /* 1) 导航请求：network-first + 超时回落 */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    event.respondWith(networkFirst(req));
    return;
  }

  /* 2) 静态资源：stale-while-revalidate */
  event.respondWith(staleWhileRevalidate(req));
});

/* 移动端增强注入点：对 index.html 响应追加 <script>（日历点击自动滚动到任务列表） */
function withInject(htmlText) {
  if (typeof htmlText !== 'string') return htmlText;
  if (htmlText.indexOf('<!DOCTYPE') === 0) {
    return htmlText.replace(/^(<!DOCTYPE html>)/i, '$1' + PLAN_SCROLL_INJECT);
  }
  return htmlText.replace(/(<head[^>]*>)/i, '$1' + PLAN_SCROLL_INJECT);
}

function networkFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      caches.match('./index.html').then(function (cached) {
        if (cached) {
          cached.text().then(function (txt) {
            resolve(new Response(withInject(txt), {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }));
          });
        } else {
          caches.match(req).then(function (r) { resolve(r || fetch(req)); });
        }
      });
    }, 3500);

    fetch(req).then(function (res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (res && res.status === 200) {
        /* 后台更新缓存（不注入），下次离线时仍走注入逻辑 */
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put('./index.html', copy); });
      }
      /* 在线也注入：clone 后用原文注入再返回 */
      res.clone().text().then(function (txt) {
        resolve(new Response(withInject(txt), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers
        }));
      }).catch(function () { resolve(res); });
    }).catch(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      caches.match('./index.html').then(function (cached) {
        if (cached) {
          cached.text().then(function (txt) {
            resolve(new Response(withInject(txt), {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
          });
        } else {
          resolve(new Response(
            '<!DOCTYPE html><meta charset="utf-8"><title>离线</title>' +
            '<body style="font-family:system-ui;padding:40px;text-align:center;color:#333">' +
            '<h2>当前处于离线状态</h2><p>请联网后刷新一次页面，即可离线使用。</p></body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          ));
        }
      });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.match(req).then(function (cached) {
    var network = fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return null; });

    return cached || network || new Response('', { status: 504 });
  });
}
