// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/trackpad.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium, webkit } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__home3d);
  await p.click('#sample');
  const cam = () => p.evaluate(() => { const { camera, controls } = window.__home3d; const o = camera.position.clone().sub(controls.target);
    return { dist: +o.length().toFixed(2), az: +Math.atan2(o.x, o.z).toFixed(3), el: +Math.asin(o.y / o.length()).toFixed(3), tx: +controls.target.x.toFixed(2), tz: +controls.target.z.toFixed(2) }; });
  console.log('trackpad on?', await p.isChecked('#trackpad'), '| undo title:', await p.getAttribute('#undo', 'title'), '| hint:', await p.textContent('#hint'));
  await p.mouse.move(500, 500);
  console.log('start      ', JSON.stringify(await cam()));
  await p.mouse.wheel(100, 0); await p.waitForTimeout(400); console.log('swipe x    ', JSON.stringify(await cam()));
  await p.mouse.wheel(0, 60); await p.waitForTimeout(400); console.log('swipe y    ', JSON.stringify(await cam()));
  await p.keyboard.down('Control'); await p.mouse.wheel(0, -40); await p.keyboard.up('Control'); await p.waitForTimeout(400); console.log('pinch out  ', JSON.stringify(await cam()));
  await p.keyboard.down('Shift'); await p.mouse.wheel(100, 0); await p.keyboard.up('Shift'); await p.waitForTimeout(400); console.log('shift swipe', JSON.stringify(await cam()));
  await p.uncheck('#trackpad'); await p.mouse.move(500, 500);
  await p.mouse.wheel(0, 300); await p.waitForTimeout(600); console.log('mouse wheel', JSON.stringify(await cam()), '| hint:', await p.textContent('#hint'));
  await p.reload(); await p.waitForFunction(() => window.__home3d); console.log('pref kept off:', !(await p.isChecked('#trackpad')));
  await p.check('#trackpad'); await p.click('#view-3d');
  await p.screenshot({ path: OUT + '/mac.png' });
  await p.click('#clear');
  console.log('errors', errs);
  await b.close();
})();
