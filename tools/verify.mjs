import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const s = readFileSync(join(root, '考研备考-离线版.html'), 'utf8');

console.log('外部 <script src= 引用:', (s.match(/<script src=/g) || []).length, '(应为 0)');
console.log('外部 stylesheet 引用:', (s.match(/<link[^>]*rel="stylesheet"/g) || []).length, '(应为 0)');
console.log('manifest link:', (s.match(/rel="manifest"/g) || []).length, '(应为 0)');
console.log('icon link:', (s.match(/rel="icon"/g) || []).length, '(应为 0)');
console.log('内联 <style> 数量:', (s.match(/<style>/g) || []).length);
console.log('内联 <script> 数量:', (s.match(/<script>/g) || []).length);
console.log('包含 KP_APP:', s.includes('KP_APP'), '| KP_STORE:', s.includes('KP_STORE'), '| KP_CONTENT:', s.includes('KP_CONTENT'));
console.log('包含 KP_MODEL:', s.includes('KP_MODEL'), '| KP_CHARTS:', s.includes('KP_CHARTS'));
console.log('包含 serviceWorker.register:', s.includes('serviceWorker.register'));
console.log('首字符:', JSON.stringify(s[0]), '(应为 "<")');
console.log('总大小:', (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1), 'KB');
