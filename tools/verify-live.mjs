/** 验证线上 gh-pages 是否更新到最新：node tools/verify-live.mjs */
import https from 'node:https';

function get(host, path) {
  return new Promise((r) => {
    https.get({ host, path, headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => r({ status: res.statusCode, text: d }));
    }).on('error', (e) => r({ err: e.message }));
  });
}

const host = 'zhouks-byte.github.io';
const p = '/graduate-aptitude-test/';

(async () => {
  const idx = await get(host, p + 'index.html');
  console.log('index.html', idx.status, '含 styles-mobile-ux:', idx.text.includes('styles-mobile-ux'), '含 sheet-overlay:', idx.text.includes('sheet-overlay'));

  const m = await get(host, p + 'manifest.webmanifest');
  console.log('manifest', m.status, '含绝对 id:', m.text.includes('https://zhouks-byte.github.io'));

  const ux = await get(host, p + 'styles-mobile-ux.css');
  console.log('styles-mobile-ux.css', ux.status, ux.err ? ux.err : 'ok ' + ux.text.length + ' bytes');

  const sw = await get(host, p + 'sw.js');
  console.log('sw.js', sw.status, 'VERSION kp-v3:', sw.text.includes('kp-v3'));
})();
