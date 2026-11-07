/**
 * tools/gen-icons.mjs — 无依赖生成「考研报考」PWA 图标
 * 设计：圆角方形 + 品牌对角渐变 + 白色「定位针 + 上升箭头 + 校园建筑」
 * 寓意：定位院校（择校）+ 成绩提升（箭头）+ 校园建筑（报考）
 * 采用 4x 超采样抗锯齿，输出 192/512/1024。
 * 用法：node tools/gen-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- PNG 编码（RGBA） ---------- */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 几何命中（0..1 归一化坐标，y 向下） ---------- */
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

const C0 = hexToRgb('#4f46e5'); // 品牌紫
const C1 = hexToRgb('#a5b4fc'); // 浅紫
const WHITE = [255, 255, 255];

/* 圆角方形 */
function inRoundSquare(u, v, r) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  const cx = [r, 1 - r, r, 1 - r];
  const cy = [r, r, 1 - r, 1 - r];
  const dx = [u - cx[0], u - cx[1], u - cx[2], u - cx[3]];
  const dy = [v - cy[0], v - cy[1], v - cy[2], v - cy[3]];
  for (let i = 0; i < 4; i++) {
    const inCornerX = i < 2 ? u < cx[i] : u > cx[i];
    const inCornerY = i < 2 ? v < cy[i] : v > cy[i];
    if (inCornerX && inCornerY) return dx[i] * dx[i] + dy[i] * dy[i] <= r * r;
  }
  return true;
}

/* 凸多边形命中（射线法，与顶点顺序无关，可靠） */
function inPoly(P, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersects = ((yi > P[1]) !== (yj > P[1])) &&
      (P[0] < (xj - xi) * (P[1] - yi) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

/* 1) 定位针（大头定位图标）：上圆 + 下尖 */
function inPin(u, v) {
  const cx = 0.5, cy = 0.38;
  // 上半圆
  if (Math.hypot(u - cx, v - cy) < 0.16 && v <= cy) return true;
  // 下半尖（倒三角）
  const tipY = 0.58;
  if (v > cy && v < tipY) {
    const t = (v - cy) / (tipY - cy);
    const halfW = 0.16 * (1 - t);
    return Math.abs(u - cx) < halfW;
  }
  return false;
}
/* 定位针内的小圆孔（挖掉） */
function inPinHole(u, v) {
  return Math.hypot(u - 0.5, v - 0.36) < 0.05;
}

/* 2) 上升箭头：斜杆 + 三角头，位于定位针右上方 */
function inArrow(u, v) {
  const p1 = [0.60, 0.48], p2 = [0.78, 0.24];
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const t = Math.max(0, Math.min(1, ((u - p1[0]) * dx + (v - p1[1]) * dy) / (dx * dx + dy * dy)));
  const qx = p1[0] + t * dx, qy = p1[1] + t * dy;
  const inShaft = Math.hypot(u - qx, v - qy) < 0.026;
  const tip = [0.80, 0.22];
  const a1 = [0.68, 0.22];
  const a2 = [0.78, 0.33];
  const inHead = inPoly([u, v], [tip, a1, a2]);
  return inShaft || inHead;
}

/* 3) 校园建筑：教学楼（主体矩形 + 屋顶 + 门洞 + 窗户）位于底部 */
function inCampus(u, v) {
  // 主体
  const inBody = u > 0.32 && u < 0.68 && v > 0.68 && v < 0.86;
  // 屋顶（梯形，射线法）
  const inRoof = inPoly([u, v], [
    [0.32, 0.68],
    [0.68, 0.68],
    [0.62, 0.60],
    [0.38, 0.60]
  ]);
  // 门（挖掉）
  const inDoor = u > 0.46 && u < 0.54 && v > 0.76 && v < 0.86;
  // 窗户（挖掉 2 个，增强建筑识别度）
  const inWinL = u > 0.36 && u < 0.42 && v > 0.70 && v < 0.76;
  const inWinR = u > 0.58 && u < 0.64 && v > 0.70 && v < 0.76;
  return (inBody || inRoof) && !inDoor && !inWinL && !inWinR;
}

/* ---------- 超采样绘制（4x） ---------- */
function render(size) {
  const SS = 4;
  const S = size * SS;
  const rgba = Buffer.alloc(S * S * 4);
  const radius = 0.22;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = (x + 0.5) / S;
      const v = (y + 0.5) / S;
      if (!inRoundSquare(u, v, radius)) {
        rgba[i + 3] = 0;
        continue;
      }
      // 对角渐变（左上深、右下浅）
      const t = (u + v) / 2;
      let r = Math.round(C0[0] + (C1[0] - C0[0]) * t);
      let g = Math.round(C0[1] + (C1[1] - C0[1]) * t);
      let b = Math.round(C0[2] + (C1[2] - C0[2]) * t);
      // 顶部柔和高光
      const gloss = Math.max(0, 1 - v / 0.45) * 0.10;
      r = Math.min(255, Math.round(r + 255 * gloss));
      g = Math.min(255, Math.round(g + 255 * gloss));
      b = Math.min(255, Math.round(b + 255 * gloss));

      // 图形：定位针 + 上升箭头 + 校园建筑
      const inShape = inPin(u, v) || inArrow(u, v) || inCampus(u, v);
      if (inShape && !inPinHole(u, v)) {
        r = WHITE[0]; g = WHITE[1]; b = WHITE[2];
      }
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  // 4x 盒式降采样（含 alpha 抗锯齿）
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const si = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const a = rgba[si + 3];
          rr += rgba[si] * a;
          gg += rgba[si + 1] * a;
          bb += rgba[si + 2] * a;
          aa += a;
        }
      }
      const o = (y * size + x) * 4;
      const alpha = Math.round(aa / (SS * SS));
      if (alpha <= 0) { out[o + 3] = 0; continue; }
      out[o] = Math.round(rr / (aa || 1));
      out[o + 1] = Math.round(gg / (aa || 1));
      out[o + 2] = Math.round(bb / (aa || 1));
      out[o + 3] = alpha;
    }
  }
  return encodePNG(size, out);
}

mkdirSync(join(root, 'assets'), { recursive: true });
for (const size of [192, 512, 1024]) {
  const buf = render(size);
  const out = join(root, 'assets', `icon-${size}.png`);
  writeFileSync(out, buf);
  console.log('✓', out, (buf.length / 1024).toFixed(1) + ' KB');
}
console.log('✓ 图标生成完成（定位针 + 上升箭头 + 校园建筑，4x 抗锯齿）');
