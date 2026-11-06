/**
 * tools/build.mjs — 构建单文件离线版「考研备考-离线版.html」
 * 对齐 cet4 的离线构建方式：把 styles.css 与 src/*.js 内联进单文件 HTML。
 *
 * 用法：node tools/build.mjs
 * 输出：考研备考-离线版.html（双击即可离线打开，数据仍存本机 localStorage）
 *
 * 内联顺序：
 *   <style>  styles.css
 *   <script>  content → model → store → charts → app → sw-register（全部内联，无外部请求）
 * 单文件版在 file:// 下 sw-register.js 自动跳过 SW 注册，不影响离线使用。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new Error('缺少文件：' + rel);
  // 去掉 UTF-8 BOM：带 BOM 的单文件 HTML 会让浏览器提前结束解析，整页变成纯文本
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

const css = read('styles.css');

const jsFiles = [
  'src/content.js',
  'src/model.js',
  'src/store.js',
  'src/charts.js',
  'src/app.js',
  'sw-register.js'
];
const js = jsFiles.map(read).join('\n\n');

/* 防止脚本/样式内容中出现提前闭合标签 */
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
const safeCss = css.replace(/<\/style>/gi, '<\\/style>');

/* 读取 index.html，去掉外部资源引用，注入内联 CSS/JS */
const html = read('index.html')
  .replace(/\s*<link[^>]*rel="manifest"[^>]*>/, '')
  .replace(/\s*<link[^>]*rel="icon"[^>]*>/, '')
  .replace(/\s*<link[^>]*rel="apple-touch-icon"[^>]*>/, '')
  .replace(/<link rel="stylesheet" href="styles.css" \/>/g, '')
  .replace(/<script src="src\/content\.js"><\/script>\s*/g, '')
  .replace(/<script src="src\/model\.js"><\/script>\s*/g, '')
  .replace(/<script src="src\/store\.js"><\/script>\s*/g, '')
  .replace(/<script src="src\/charts\.js"><\/script>\s*/g, '')
  .replace(/<script src="src\/app\.js"><\/script>\s*/g, '')
  .replace(/<script src="sw-register\.js"><\/script>\s*/g, '')
  .replace('</head>', '<style>\n' + safeCss + '\n</style>\n</head>')
  .replace('</body>', '<script>\n' + safeJs + '\n</script>\n</body>');

const out = join(root, '考研备考-离线版.html');
const finalHtml = html.replace(/^\uFEFF/, '');
writeFileSync(out, finalHtml, 'utf8');

if (finalHtml.charCodeAt(0) !== 0x3c) {
  throw new Error('构建产物首字符异常：' + JSON.stringify(finalHtml.slice(0, 20)));
}

const kb = (Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1);
console.log(`✓ 考研备考-离线版.html 已生成（${kb} KB，CSS ${(css.length / 1024).toFixed(1)}K / JS ${(js.length / 1024).toFixed(1)}K）`);
console.log('  双击即可离线打开；导出/导入与离线能力在 http(s) 下生效。');
