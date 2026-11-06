/* 图表模块：SVG 图表（无 Canvas / 无外部依赖，颜色走 CSS 变量适配深色）
 * - KP_CHARTS.ring(el, value, options)      环形进度
 * - KP_CHARTS.trend(el, data, options)       双轴折线（分数 + 正确率）
 * - KP_CHARTS.radar(el, data, options)       雷达图（薄弱知识点）
 * el 可以是 <div>/<section>/<svg>，内部注入 <svg class="kp-chart-*">。
 */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function pct(v) {
    return clamp(Number(v) || 0, 0, 100);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============ 环形进度 ============ */

  function ringSvg(value, options) {
    options = options || {};
    var size = options.size || 96;
    var stroke = options.stroke || 8;
    var color = options.color || 'var(--brand-500)';
    var track = options.trackColor || 'var(--ring-track, var(--gray-100))';
    var v = pct(value);

    var r = (size - stroke) / 2;
    var cx = size / 2;
    var cy = size / 2;
    var circumference = 2 * Math.PI * r;
    var dash = (v / 100) * circumference;
    var offset = circumference - dash;

    var svgOpen = '<svg class="kp-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img">';
    var trackEl = '<circle class="kp-ring__track" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + track + '" stroke-width="' + stroke + '"/>';
    var valueEl = '<circle class="kp-ring__value" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
    var showLabel = options.showLabel !== false;
    var valueText = options.valueText || (v + (options.labelUnit || '%'));
    var labelEl = showLabel
      ? '<text class="kp-ring__label" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="' + Math.round(size * 0.2) + '">' + esc(valueText) + '</text>'
      : '';

    return svgOpen + trackEl + valueEl + labelEl + '</svg>';
  }

  /* ============ 双轴折线（分数 + 正确率） ============ */

  /**
   * @param data  [{ label, score, accuracy }]  按时间升序
   * @param options { width, height, leftMax, rightMax }
   *   leftMax   分数轴上界（默认取数据最大 score 的整数倍或 100）
   *   rightMax  正确率轴上界（默认 100）
   */
  function trendSvg(data, options) {
    options = options || {};
    var W = options.width || 320;
    var H = options.height || 200;
    var padL = 40, padR = 44, padT = 18, padB = 28;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var n = data.length;
    // 分数轴上界
    var maxScore = 0;
    for (var i = 0; i < n; i++) maxScore = Math.max(maxScore, Number(data[i].score) || 0);
    var leftMax = options.leftMax || Math.max(20, Math.ceil(maxScore / 20) * 20);
    var rightMax = options.rightMax || 100;

    function x(idx) {
      if (n <= 1) return padL + plotW / 2;
      return padL + (idx / (n - 1)) * plotW;
    }
    function yScore(v) {
      return padT + plotH - (clamp(Number(v) || 0, 0, leftMax) / leftMax) * plotH;
    }
    function yPct(v) {
      return padT + plotH - (clamp(Number(v) || 0, 0, rightMax) / rightMax) * plotH;
    }

    var lines = '';
    // 网格线（分数轴 0/50/100）
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * plotH;
      lines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--chart-grid, var(--gray-100))" stroke-width="1"/>';
    }

    var scorePts = [];
    var pctPts = [];
    var markerScore = '';
    var markerPct = '';
    for (var j = 0; j < n; j++) {
      var px = x(j);
      var ps = yScore(data[j].score);
      var pp = yPct(data[j].accuracy);
      scorePts.push(px + ',' + ps);
      pctPts.push(px + ',' + pp);
      markerScore += '<circle cx="' + px + '" cy="' + ps + '" r="3.5" fill="var(--chart-score, var(--brand-500))"><title>' + esc(data[j].label) + '  ' + (Number(data[j].score) || 0) + ' 分</title></circle>';
      markerPct += '<circle cx="' + px + '" cy="' + pp + '" r="3.5" fill="var(--chart-acc, var(--ok))"><title>' + esc(data[j].label) + '  ' + Math.round((Number(data[j].accuracy) || 0) * 100) + '%</title></circle>';
    }

    var scorePoly = n > 1 ? '<polyline points="' + scorePts.join(' ') + '" fill="none" stroke="var(--chart-score, var(--brand-500))" stroke-width="2"/>' : '';
    var pctPoly = n > 1 ? '<polyline points="' + pctPts.join(' ') + '" fill="none" stroke="var(--chart-acc, var(--ok))" stroke-width="2" stroke-dasharray="5 3"/>' : '';

    // X 轴标签
    var xlabels = '';
    for (var k = 0; k < n; k++) {
      var lx = x(k);
      xlabels += '<text x="' + lx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--chart-text, var(--text-muted))">' + esc(data[k].label) + '</text>';
    }

    // Y 轴左标签（分数 0..leftMax）
    var yl = '';
    for (var ly = 0; ly <= 2; ly++) {
      var val = (ly / 2) * leftMax;
      var yy = yScore(val);
      yl += '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="var(--chart-text, var(--text-muted))">' + Math.round(val) + '</text>';
    }
    // Y 轴右标签（正确率 0/50/100）
    var yr = '';
    for (var ry = 0; ry <= 2; ry++) {
      var rval = (ry / 2) * rightMax;
      var ry2 = yPct(rval);
      yr += '<text x="' + (W - padR + 6) + '" y="' + (ry2 + 3) + '" text-anchor="start" font-size="10" fill="var(--chart-text, var(--text-muted))">' + Math.round(rval) + '%</text>';
    }

    // 轴标题
    var yTitles = '<text x="' + padL + '" y="' + 12 + '" font-size="10" fill="var(--chart-text, var(--text-muted))">分数</text>' +
      '<text x="' + (W - padR) + '" y="' + 12 + '" text-anchor="end" font-size="10" fill="var(--chart-text, var(--text-muted))">正确率</text>';

    var empty = n === 0
      ? '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="13" fill="var(--text-muted)">暂无模考记录</text>'
      : '';

    return '' +
      '<svg class="kp-chart kp-chart--trend" viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      lines + scorePoly + pctPoly + markerScore + markerPct + xlabels + yl + yr + yTitles + empty +
      '</svg>';
  }

  /* ============ 雷达图（薄弱知识点，6 维） ============ */

  /**
   * @param data  Array<{ name, value }>  value ∈ 0~1（KP_MODEL.radarData 输出可直接用）
   * @param options { size, rings, showLabels }
   */
  function radarSvg(data, options) {
    options = options || {};
    var size = options.size || 280;
    var rings = options.rings || 4;
    var cx = size / 2;
    var cy = size / 2;
    var R = size / 2 - 34; // 给标签留白
    var n = data.length;

    if (n < 3) {
      return '<svg class="kp-chart kp-chart--radar" viewBox="0 0 ' + size + ' ' + size + '"><text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="13" fill="var(--text-muted)">维度不足</text></svg>';
    }

    // 角度：从正上开始，顺时针
    function angle(i) {
      return (Math.PI * 2 * i / n) - Math.PI / 2;
    }
    function point(i, r) {
      var a = angle(i);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }

    var svg = '';
    // 背景网格环
    for (var g = 1; g <= rings; g++) {
      var rr = (g / rings) * R;
      var ringPts = [];
      for (var i = 0; i < n; i++) {
        var p = point(i, rr);
        ringPts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
      }
      svg += '<polygon class="kp-radar__grid" points="' + ringPts.join(' ') + '"/>';
      // 辐条
      for (var s = 0; s < n; s++) {
        var sp = point(s, rr);
        if (g === rings) {
          svg += '<line class="kp-radar__spoke" x1="' + cx + '" y1="' + cy + '" x2="' + sp[0].toFixed(1) + '" y2="' + sp[1].toFixed(1) + '"/>';
        }
      }
    }

    // 数据多边形
    var dataPts = [];
    var dotMarks = '';
    for (var d = 0; d < n; d++) {
      var val = clamp(Number(data[d].value) || 0, 0, 1);
      var dp = point(d, val * R);
      dataPts.push(dp[0].toFixed(1) + ',' + dp[1].toFixed(1));
      dotMarks += '<circle cx="' + dp[0].toFixed(1) + '" cy="' + dp[1].toFixed(1) + '" r="3" class="kp-radar__dot' + (data[d].isWeak ? ' is-weak' : '') + '"><title>' + esc(data[d].name) + '  ' + Math.round(val * 100) + '%</title></circle>';
    }

    svg += '<polygon class="kp-radar__area" points="' + dataPts.join(' ') + '"/>' + dotMarks;

    // 标签
    var labels = options.showLabels !== false;
    if (labels) {
      for (var li = 0; li < n; li++) {
        var lp = point(li, R + 18);
        var txt = data[li].name || '';
        // 标签锚点：上/下居中，左/右对齐
        var anchor = 'middle';
        if (lp[0] > cx + 8) anchor = 'start';
        else if (lp[0] < cx - 8) anchor = 'end';
        svg += '<text class="kp-radar__label" x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 4).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11">' + esc(txt) + '</text>';
      }
    }

    return '<svg class="kp-chart kp-chart--radar" viewBox="0 0 ' + size + ' ' + size + '" role="img">' + svg + '</svg>';
  }

  var KP_CHARTS = {
    ring: function (target, value, options) {
      if (!target) return;
      target.innerHTML = ringSvg(value, options);
    },

    trend: function (target, data, options) {
      if (!target) return;
      target.innerHTML = trendSvg(data || [], options);
    },

    radar: function (target, data, options) {
      if (!target) return;
      target.innerHTML = radarSvg(data || [], options);
    },

    /* 兼容旧接口占位 */
    line: function () {},
    bar: function () {}
  };

  global.KP_CHARTS = KP_CHARTS;
}(typeof window !== 'undefined' ? window : this));
