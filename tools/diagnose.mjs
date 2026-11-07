/** 诊断线上 PWA 资源：node tools/diagnose.mjs */
import https from 'node:https';

function get(host, path) {
  return new Promise((r) => {
    https.get(
      { host, path, headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => r({ status: res.statusCode, ct: res.headers['content-type'], text: d, len: d.length }));
      }
    ).on('error', (e) => r({ err: e.message }));
  });
}

const base = 'zhouks-byte.github.io';
const repo = '/graduate-aptitude-test/';

async function main() {
  const idx = await get(base, repo + 'index.html');
  console.log('=== index.html ===');
  console.log('status:', idx.status, 'bytes:', idx.len || idx.err);
  if (idx.err) return;
  const mLink = (idx.text.match(/<link[^>]*manifest[^>]*>/i) || ['(未找到)'])[0];
  console.log('manifest link:', mLink);
  console.log('apple-mobile-web-app meta:', idx.text.match(/<meta[^>]*apple-mobile[^>]*>/gi));
  console.log('theme-color:', (idx.text.match(/<meta[^>]*theme-color[^>]*>/i) || ['(未找到)'])[0]);
  console.log('viewport:', (idx.text.match(/<meta[^>]*viewport[^>]*>/i) || ['(未找到)'])[0]);
  console.log('含 serviceWorker:', idx.text.includes('serviceWorker'));
  console.log('含 sw-register 引用:', idx.text.includes('sw-register'));

  const man = await get(base, repo + 'manifest.webmanifest');
  console.log('\n=== manifest.webmanifest ===');
  console.log('status:', man.status, 'ct:', man.ct);
  console.log(man.text.slice(0, 500));

  for (const s of [192, 512, 1024]) {
    const ic = await get(base, repo + 'assets/icon-' + s + '.png');
    console.log('\nicon-' + s + ':', ic.status, ic.ct, ic.len || 0 + ' bytes', ic.err || '');
  }

  const sw = await get(base, repo + 'sw.js');
  console.log('\nsw.js:', sw.status, sw.ct, sw.len || 0, sw.err || '');

  const reg = await get(base, repo + 'sw-register.js');
  console.log('sw-register.js:', reg.status, reg.len || 0, reg.err || '');
}
main();
