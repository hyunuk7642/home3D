// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/walk.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(PAGE); await p.waitForFunction(() => window.__home3d);
  const w = () => p.evaluate(() => { const { walk, camera, state } = window.__home3d; return { mode: state.mode, x: +walk.x.toFixed(2), z: +walk.z.toFixed(2), yaw: +(walk.yaw*180/Math.PI).toFixed(0), camY: +camera.position.y.toFixed(2) }; });
  const hold = async (k, ms) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); await p.waitForTimeout(80); };
  const log = (k, v) => console.log(k, JSON.stringify(v));
  await p.click('#exhibits'); await p.waitForTimeout(1500);
  await p.click('#walk'); await p.waitForTimeout(300);
  log('시작(입구 안쪽)', await w()); log('hint', await p.textContent('#hint')); log('button', await p.textContent('#walk'));
  await p.screenshot({ path: OUT + '/k1.png' });
  await hold('w', 1000); log('1초 전진(약 1.4 m)', await w());
  await hold('s', 3000); log('뒤로 3초: 유리벽에 막힘(z<4)', await w());
  // 문으로 나가기: 뒤로 계속 = 문 방향. 문은 x=-3.8. 정확히 문 앞이라 통과해야 함
  await hold('s', 1500); log('문 통과 후 밖(z>4)', await w());
  await hold('w', 3500); log('다시 안으로', await w());
  await hold('ArrowLeft', 560); log('왼쪽으로 돌기(약 +50도)', await w());
  await hold('w', 4000); log('왼쪽 벽에 막힘(x>-4.9)', await w());
  // 끌어서 둘러보기
  await p.mouse.move(500, 500); await p.mouse.down(); await p.mouse.move(300, 500, { steps: 5 }); await p.mouse.up(); log('왼쪽으로 끌기(yaw 증가)', await w());
  await p.mouse.move(500, 500); await p.mouse.wheel(0, 300); await p.waitForTimeout(100); log('두 손가락 쓸기', await w());
  // 보기 좋은 곳으로 옮겨 찍기
  await p.evaluate(() => { const { walk } = window.__home3d; walk.x = -3.2; walk.z = -0.4; walk.yaw = Math.PI / 2 + 0.15; walk.pitch = 0; });
  await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/k2.png' });
  await p.evaluate(() => { const { walk } = window.__home3d; walk.x = 0.3; walk.z = 1.9; walk.yaw = 0.25; walk.pitch = 0; });
  await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/k3.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const st = await p.evaluate(() => { const s = window.__home3d.state; const me = s.objects.find(o => o.type === 'person'); return { mode: s.mode, person: [me.x, me.z, me.rot], visible: window.__home3d.meshes.get(me.id).visible, fov: window.__home3d.camera.fov }; });
  log('끝낸 뒤', st);
  await p.screenshot({ path: OUT + '/k4.png' });
  // 사람 추가 단추 + 다시 걷기는 같은 사람에서
  await p.click('#walk'); log('다시 시작 = 사람 자리', await w()); await p.click('#walk');
  await p.click('[data-add=person]'); log('사람 수', await p.evaluate(() => window.__home3d.state.objects.filter(o => o.type === 'person').length));
  // 걷는 중 모두 지우기 -> 자동 종료
  await p.click('#walk'); await p.click('#clear'); await p.waitForTimeout(200); log('걷는 중 모두 지우기 뒤 mode', await p.evaluate(() => window.__home3d.state.mode));
  console.log('errors', errs); await b.close();
})();
