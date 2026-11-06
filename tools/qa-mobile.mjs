/**
 * tools/qa-mobile.mjs — 移动端 QA 批量检测（驱动 agent-browser）
 * 用法：node tools/qa-mobile.mjs
 *   在 375×667 / 390×844 / 414×896 三宽度下，逐页检测横向滚动条并截图到 qa/
 * 前提：本地服务器已运行（http://localhost:8899）且 agent-browser 已安装。
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const qa = join(root, 'qa');
mkdirSync(qa, { recursive: true });
const base = 'http://localhost:8899';

function ab(cmd) {
  return execSync('agent-browser ' + cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .split('\n')
    .slice(-2)
    .join(' ')
    .trim();
}

const pages = [
  ['dashboard', '仪表盘'],
  ['questions', '题库'],
  ['exam-past', '真题'],
  ['plan', '计划'],
  ['vocab', '单词'],
  ['mistakes', '错题'],
  ['review', '复习'],
  ['mock', '模考'],
  ['notes', '笔记']
];

const widths = [
  { w: 375, h: 667, tag: '375x667' },
  { w: 390, h: 844, tag: '390x844' },
  { w: 414, h: 896, tag: '414x896' }
];

// 打开浏览器（首次）
try {
  ab('open ' + base + '/index.html');
} catch (e) {
  console.log('open 失败:', e.message);
}
ab('wait 600');

let issues = 0;
for (const vw of widths) {
  ab(`set viewport ${vw.w} ${vw.h}`);
  ab('wait 400');
  console.log(`\n==== 宽度 ${vw.tag} ====`);
  for (const [hash, name] of pages) {
    ab(`eval "location.hash='#${hash}'"`);
    ab('wait 350');
    // 检测横向滚动
    const out = ab(`eval "var d=document.documentElement;JSON.stringify({sw:d.scrollWidth,cw:d.clientWidth})"`);
    let m = out.match(/\{[^}]*\}/g);
    let hScroll = false;
    if (m) {
      try {
        const o = JSON.parse(JSON.parse(m[m.length - 1]) || m[m.length - 1]);
        hScroll = o.sw > o.cw + 1;
      } catch (e) {}
    }
    const mark = hScroll ? '  ⚠ 横向滚动' : '  ok';
    if (hScroll) issues++;
    console.log(`  ${name} (${hash}) ${mark}`);
    if (hScroll) {
      ab(`screenshot "${qa}/${name}-${vw.tag}-hs.png"`);
    }
  }
  // 每个宽度截一张仪表盘 + 计划 + 模考（重点页）
  for (const [hash, name] of [['dashboard', '仪表盘'], ['plan', '计划'], ['mock', '模考']]) {
    ab(`eval "location.hash='#${hash}'"`);
    ab('wait 350');
    ab(`screenshot "${qa}/${name}-${vw.tag}.png"`);
  }
}

ab('close');
console.log(`\n完成。横向滚动问题页: ${issues} 个`);
