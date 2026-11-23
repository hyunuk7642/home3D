// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/exhibits.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(PAGE); await p.waitForFunction(() => window.__home3d);
  const n = () => p.evaluate(() => { const o = window.__home3d.state.objects; return [o.length, o.filter(x => x.slot).length, o.filter(x => x.image).length]; });
  const hint = () => p.textContent('#hint');
  await p.click('#exhibits'); await p.waitForTimeout(2000);
  console.log('빈 화면에서 전시 자료 배치 ->', await n(), '|', await hint());
  await p.screenshot({ path: OUT + '/e1.png' });
  await p.click('#exhibits'); console.log('다시 누름(빼기) ->', await n(), '|', await hint());
  await p.click('#gallery'); await p.waitForTimeout(500); console.log('전시 공간 ->', await n());
  await p.screenshot({ path: OUT + '/e0.png' });
  // 전시판 하나를 옮긴 뒤 배치해도 자리가 유지되는지
  await p.evaluate(() => { const o = window.__home3d.state.objects.find(x => x.slot === 'room07'); o.y = 0.6; });
  await p.click('#exhibits'); await p.waitForTimeout(1500); console.log('전시 자료 배치 ->', await n(), '| room07 y:', await p.evaluate(() => window.__home3d.state.objects.find(x => x.slot === 'room07').y));
  await p.click('#undo'); console.log('되돌리기 ->', await n());
  await p.click('#redo');
  await p.evaluate(() => { const { camera, controls } = window.__home3d; controls.target.set(-4.93,0.75,1.6); camera.position.set(-3.9,0.75,1.6); });
  await p.waitForTimeout(600); await p.screenshot({ path: OUT + '/e2.png' });
  await p.click('#clear'); console.log('errors', errs); await b.close();
})();
