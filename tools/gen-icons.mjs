/**
 * tools/gen-icons.mjs — 无依赖生成美观 PWA 图标
 * 设计：圆角方形 + 品牌对角渐变 + 白色「翻开的书 + 上升箭头」
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

/* ---------- 几何命中（0..1 归一化坐标） ---------- */
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

const C0 = hexToRgb('#4f46e5');
const C1 = hexToRgb('#a5b4fc'); // 更浅的品牌色，渐变更柔和
const WHITE = [255, 255, 255];

// 圆角方形（0..1）
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

// 翻开的书：两个梯形叶（左/右），顶部外角高、中心书脊处略低（书自然合拢感）
function inBook(u, v) {
  const topOuterY = 0.34; // 叶顶部外角
  const topCenterY = 0.42; // 中心书脊处（略低于外角，书合拢）
  const bottomY = 0.70;    // 书底
  const halfW = 0.28;     // 书半宽
  const cx = 0.5;
  function inLeaf(left) {
    const s = left ? -1 : 1;
    // 四边形：外角 (cx+s*halfW, topOuterY)、中心 (cx, topCenterY)、中心底 (cx, bottomY)、外底 (cx+s*halfW, bottomY)
    const A = [cx + s * halfW, topOuterY];
    const B = [cx, topCenterY];
    const C = [cx, bottomY];
    const D = [cx + s * halfW, bottomY];
    // 点在凸四边形内：叉积一致性
    function sign(P1, P2, P3) {
      return (P2[0] - P1[0]) * (P3[1] - P1[1]) - (P3[0] - P1[0]) * (P2[1] - P1[1]);
    }
    const P = [u, v];
    const d1 = sign(P, A, B), d2 = sign(P, B, C), d3 = sign(P, C, D), d4 = sign(P, D, A);
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0 || d4 > 0;
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0 || d4 < 0;
    return !(hasPos && hasNeg);
  }
  return inLeaf(true) || inLeaf(false);
}

// 中央书脊缝隙（挖一条细缝，让左右叶分离）
function inSpine(u, v) {
  return Math.abs(u - 0.5) < 0.014 && v > 0.40 && v < 0.72;
}

// 上升箭头：斜杆（粗线段）+ 三角箭头，位置在书本右上方
function inArrow(u, v) {
  const p1 = [0.64, 0.44], p2 = [0.82, 0.22];
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const t = Math.max(0, Math.min(1, ((u - p1[0]) * dx + (v - p1[1]) * dy) / (dx * dx + dy * dy)));
  const qx = p1[0] + t * dx, qy = p1[1] + t * dy;
  const inShaft = Math.hypot(u - qx, v - qy) < 0.034;
  // 箭头三角：以 p2 为起点，沿箭杆方向
  const tip = [0.84, 0.18];
  const a1 = [0.74, 0.20];
  const a2 = [0.80, 0.30];
  function inTri(P, A, B, C) {
    function sign(P1, P2, P3) {
      return (P2[0] - P1[0]) * (P3[1] - P1[1]) - (P3[0] - P1[0]) * (P2[1] - P1[1]);
    }
    const Pt = [P[0], P[1]];
    const d1 = sign(Pt, A, B), d2 = sign(Pt, B, C), d3 = sign(Pt, C, A);
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    return !(hasPos && hasNeg);
  }
  return inShaft || inTri([u, v], tip, a1, a2);
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

      const inShape = inBook(u, v) || inArrow(u, v);
      if (inSpine(u, v)) {
        // 书脊缝隙：用略深底色
        const t2 = (u + v) / 2;
        r = Math.round((C0[0] + (C1[0] - C0[0]) * t2) * 0.88);
        g = Math.round((C0[1] + (C1[1] - C0[1]) * t2) * 0.88);
        b = Math.round((C0[2] + (C1[2] - C0[2]) * t2) * 0.88);
      } else if (inShape) {
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
console.log('✓ 图标生成完成（翻开的书 + 上升箭头，4x 抗锯齿）');
