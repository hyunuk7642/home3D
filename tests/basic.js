// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/basic.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__home3d);
  const st = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__home3d.state)));
  // project world point to screen
  const scr = (x, y, z) => p.evaluate(([x, y, z]) => {
    const { camera } = window.__home3d; const c = document.getElementById('canvas').getBoundingClientRect();
    const e = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
    const mul = (m, v) => [0,1,2,3].map(i => m[i]*v[0]+m[i+4]*v[1]+m[i+8]*v[2]+m[i+12]*v[3]);
    const q = mul(pe, mul(e, [x, y, z, 1]));
    return [c.left + (q[0]/q[3]+1)/2*c.width, c.top + (1-q[1]/q[3])/2*c.height];
  }, [x, y, z]);
  const log = (k, v) => console.log(k, JSON.stringify(v));

  // add box
  await p.click('[data-add=box]');
  let s = await st(); log('after add', s.objects.map(o => [o.name, o.x, o.z]));
  // edit size & color
  await p.fill('#f-w', '2'); await p.press('#f-w', 'Tab');
  await p.fill('#f-color', '#ff0000');
  s = await st(); log('edited', [s.objects[0].w, s.objects[0].color]);
  // drag selected box
  await p.click('#view-top');
  let a = await scr(0, 1, 0), c = await scr(2, 1, 1);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0]+c[0])/2, (a[1]+c[1])/2, {steps:3}); await p.mouse.move(c[0], c[1], {steps:3}); await p.mouse.up();
  s = await st(); log('dragged to (expect 2,1)', [s.objects[0].x, s.objects[0].z]);
  // click empty -> deselect; click box -> select
  let e = await scr(-4, 0, -3); await p.mouse.click(e[0], e[1]);
  log('deselected', (await st()).selectedId);
  await p.mouse.click(c[0], c[1]); log('reselected', !!(await st()).selectedId);
  // wall drawing
  await p.click('#tool-wall');
  for (const [x, z] of [[-3,-2],[1,-2],[1,2]]) { const q = await scr(x, 0, z); await p.mouse.move(q[0], q[1]); await p.mouse.click(q[0], q[1]); }
  await p.keyboard.press('Escape');
  s = await st(); log('walls', s.objects.filter(o => o.type==='wall').map(o => [o.x,o.z,o.w,o.rot]));
  log('mode', s.mode);
  // undo x2 / redo
  await p.click('#undo'); await p.click('#undo'); log('after 2 undo', (await st()).objects.length);
  await p.click('#redo'); log('after redo', (await st()).objects.length);
  // duplicate/delete via keyboard
  await p.mouse.click(c[0], c[1]); await p.keyboard.press('Control+d'); log('dup', (await st()).objects.length);
  await p.keyboard.press('Delete'); log('del', (await st()).objects.length);
  // orbit drag on empty doesn't move objects
  // reload persistence
  await p.reload(); await p.waitForFunction(() => window.__home3d); log('persisted', (await st()).objects.length);
  // export/import roundtrip
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  const path = await dl.path();
  await p.click('#sample'); log('sample', (await st()).objects.length);
  await p.screenshot({ path: OUT + '/sample.png' });
  await p.click('#view-top'); await p.screenshot({ path: OUT + '/top.png' });
  await p.setInputFiles('#file', path); await p.waitForTimeout(300); log('imported', (await st()).objects.length);
  await p.click('#clear'); log('cleared', (await st()).objects.length);
  // mobile
  await p.setViewportSize({ width: 390, height: 780 }); await p.click('#sample'); await p.waitForTimeout(300);
  const li = await p.$('#list li button'); await li.click();
  await p.screenshot({ path: OUT + '/mobile.png' });
  console.log('errors', errs);
  await b.close();
})();
