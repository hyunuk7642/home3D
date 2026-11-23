// 각 장을 "벽에 직접 쓴 글" 느낌의 가로 구성(1200×680, 투명 바탕)으로 다시 짜서 그림으로 만든다. 복도 벽 글씨용.
// 사용: node tools/render-hall.js <장 폴더> <PNG 를 둘 빈 폴더> <@fontsource 폴더>
// 받은 마크업의 스크립트는 지우고, 배치를 바꾸는 내 코드만 실행한다.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [src, out, fonts] = process.argv.slice(2);
const css = ['noto-sans-kr/400', 'noto-sans-kr/500', 'noto-sans-kr/700', 'noto-serif-kr/500', 'noto-serif-kr/700', 'noto-serif-kr/900']
  .map((f) => `<link rel="stylesheet" href="file://${fonts}/${f}.css">`).join('');
const GREEN = '#1F5A3A', RED = '#8F2A25', CREAM = '#F3EAD9';
const zoneOf = (n) => (n <= 4 ? 0 : n <= 8 ? 1 : n <= 12 ? 2 : n <= 17 ? 3 : 4);
function wallColor(name) {
  if (name === 'main') return CREAM;
  const zone = name.startsWith('zone') ? +name.slice(4) - 1 : zoneOf(+name.slice(4));
  return zone % 2 ? RED : GREEN;
}
function recolor(html, wall) {
  if (wall === CREAM) return html.replace(/#F6F5F1/gi, wall);
  const map = { '#161616': '#FFFFFF', '#5A5A5A': '#E6ECE6', '#3E3E3E': '#F2F5F2', '#F6F5F1': wall, '#DCDAD3': 'rgba(255,255,255,0.28)', '#3A3A3A': 'rgba(255,255,255,0.7)' };
  return html.replace(/#[0-9A-Fa-f]{6}\b/g, (c) => map[c.toUpperCase()] || c);
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 680 }, deviceScaleFactor: 1.3 });
  const p = await ctx.newPage();
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.dc.html')).sort()) {
    const name = f.replace('.dc.html', '').toLowerCase();
    const html = fs.readFileSync(path.join(src, f), 'utf8');
    let body = html.slice(html.indexOf('<x-dc>') + 6, html.indexOf('</x-dc>'));
    body = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/\son\w+="[^"]*"/g, '');
    body = recolor(body, wallColor(name));
    const tmp = path.join(out, '_page.html');
    fs.writeFileSync(tmp, `<!doctype html><html lang="ko"><head><meta charset="utf-8">${css}<style>html,body{margin:0;background:transparent}</style></head><body>${body}</body></html>`);
    await p.goto('file://' + tmp, { waitUntil: 'networkidle' });
    const fit = await p.evaluate((kind) => {
      const root = document.body.firstElementChild, kids = [...root.children];
      const col = (items, style) => { const d = document.createElement('div'); d.style.cssText = 'display:flex;flex-direction:column;min-width:0;min-height:0;' + (style || ''); items.forEach((k) => d.append(k)); return d; };
      const plan = {
        room: { left: [1, 7], right: [2, 3, 4, 5, 6], cols: '470px 1fr' },
        zone: { left: [1, 2, 3, 4], right: [5], cols: '1fr 500px' },
        main: { left: [1, 2, 3, 7], right: [4, 5, 6], cols: '520px 1fr' },
      }[kind];
      const left = col(plan.left.map((i) => kids[i])), right = col(plan.right.map((i) => kids[i]));
      root.style.cssText += ';width:1200px;height:680px;padding:34px 44px 30px;background:transparent;display:grid;overflow:visible;' +
        `grid-template-columns:${plan.cols};grid-template-rows:auto 1fr;column-gap:56px;row-gap:22px`;
      kids[0].style.gridColumn = '1 / -1';
      root.append(left, right);
      for (const el of [...left.children, ...right.children]) if (parseFloat(el.style.marginTop) > 30) el.style.marginTop = '22px';
      if (left.firstElementChild) left.firstElementChild.style.marginTop = '0';
      if (right.firstElementChild) right.firstElementChild.style.marginTop = '0';
      const svg = root.querySelector('figure svg');
      if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = 'auto'; svg.closest('figure').style.margin = '0 0 18px'; }
      if (kind === 'room') kids[7].style.marginTop = 'auto';
      if (kind === 'main') { kids[1].style.fontSize = '84px'; kids[7].style.marginTop = 'auto'; kids[3].style.marginTop = '18px'; }
      if (kind === 'zone') { kids[2].style.fontSize = '60px'; kids[5].style.marginTop = '0'; }
      // 넘치면 그 단의 글자를 조금씩 줄여 맞춘다.
      const shrink = [];
      for (const c of [left, right]) {
        let z = 1;
        while (c.scrollHeight > c.clientHeight + 1 && z > 0.7) { z -= 0.02; c.style.zoom = z; }
        shrink.push(+z.toFixed(2));
      }
      return shrink;
    }, name.startsWith('room') ? 'room' : name.startsWith('zone') ? 'zone' : 'main');
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(out, `hall-${name}.png`), omitBackground: true });
    if (fit.some((z) => z < 1)) console.log(name, 'shrunk to', fit);
  }
  fs.unlinkSync(path.join(out, '_page.html'));
  await b.close();
})();
