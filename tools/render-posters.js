// 아티팩트의 각 장(794×1123)을 세로 그림(PNG)으로 만든다. 방 형식 전시판용.
// 사용: node tools/render-posters.js <장 폴더> <PNG 를 둘 빈 폴더> <@fontsource 폴더>
// 받은 마크업은 데이터로만 다루고 스크립트는 실행하지 않는다.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [src, out, fonts] = process.argv.slice(2);
const css = ['noto-sans-kr/400', 'noto-sans-kr/500', 'noto-sans-kr/700', 'noto-serif-kr/500', 'noto-serif-kr/700', 'noto-serif-kr/900']
  .map((f) => `<link rel="stylesheet" href="file://${fonts}/${f}.css">`).join('');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.25, javaScriptEnabled: false });
  const p = await ctx.newPage();
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.dc.html')).sort()) {
    const html = fs.readFileSync(path.join(src, f), 'utf8');
    let body = html.slice(html.indexOf('<x-dc>') + 6, html.indexOf('</x-dc>'));
    body = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
    const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${css}<style>body{margin:0}</style></head><body>${body}</body></html>`;
    const tmp = path.join(out, '_page.html');
    fs.writeFileSync(tmp, page);
    await p.goto('file://' + tmp, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const name = f.replace('.dc.html', '').toLowerCase();
    await p.screenshot({ path: path.join(out, name + '.png') });
  }
  fs.unlinkSync(path.join(out, '_page.html'));
  await b.close();
})();
