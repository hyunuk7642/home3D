// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/gallery.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__home3d);
  const st = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__home3d.state)));
  const log = (k, v) => console.log(k, JSON.stringify(v));
  const scr = (x, y, z) => p.evaluate(([x, y, z]) => {
    const { camera } = window.__home3d; const c = document.getElementById('canvas').getBoundingClientRect();
    const e = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
    const mul = (m, v) => [0,1,2,3].map(i => m[i]*v[0]+m[i+4]*v[1]+m[i+8]*v[2]+m[i+12]*v[3]);
    const q = mul(pe, mul(e, [x, y, z, 1]));
    return [c.left + (q[0]/q[3]+1)/2*c.width, c.top + (1-q[1]/q[3])/2*c.height];
  }, [x, y, z]);
  await p.click('#gallery'); await p.waitForTimeout(400);
  let s = await st();
  log('count', s.objects.length); log('names unique', new Set(s.objects.map(o=>o.name)).size === s.objects.length);
  log('groups', [...new Set(s.objects.map(o=>o.group).filter(Boolean))]);
  const top = s.objects.filter(o=>o.group==='트리 1').map(o=>o.y+o.h); log('tree top', Math.max(...top));
  await p.screenshot({ path: OUT + '/g1.png' });
  await p.click('#view-top'); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/g2.png' });
  // drag tree 1 by clicking its base in top view
  let a = await scr(-2, 2.5, 1.15); await p.mouse.click(a[0], a[1]);
  s = await st(); log('selected', s.objects.find(o=>o.id===s.selectedId)?.name); log('group row visible', await p.isVisible('#group-row'));
  let c = await scr(-2.5, 2.5, 1.65);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0]+c[0])/2,(a[1]+c[1])/2,{steps:3}); await p.mouse.move(c[0], c[1], {steps:3}); await p.mouse.up();
  s = await st(); log('tree1 after drag', s.objects.filter(o=>o.group==='트리 1').map(o=>[o.x,o.z]));
  await p.keyboard.press('Control+d'); s = await st(); log('dup groups', [...new Set(s.objects.map(o=>o.group).filter(g=>g&&g.startsWith('트리')))], s.objects.length);
  await p.keyboard.press('Delete'); s = await st(); log('after delete', s.objects.length);
  await p.click('#undo'); await p.click('#undo'); await p.click('#undo');
  // ungroup
  await p.click('#list li:has-text("탁자") button'); await p.click('#ungroup'); s = await st(); log('ungrouped', s.objects.filter(o=>o.group==='이야기 자리').length);
  await p.click('#undo');
  // inside views
  await p.keyboard.press('Escape');
  const shot = async (pos, tgt, name) => { await p.evaluate(([pos,tgt]) => { const { camera, controls } = window.__home3d; controls.target.set(...tgt); camera.position.set(...pos); }, [pos,tgt]); await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/' + name }); };
  await shot([-3.8,1.6,3.6],[0.5,1.1,-2],'g3.png');
  await shot([4.2,1.6,-2.4],[-3,1.1,-2.4],'g4.png');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  await p.click('#clear'); await p.setInputFiles('#file', await dl.path()); await p.waitForTimeout(300);
  s = await st(); log('imported', s.objects.length, ); log('groups kept', s.objects.filter(o=>o.group).length);
  await p.click('#clear');
  console.log('errors', errs);
  await b.close();
})();
