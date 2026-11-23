// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/xmas.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(PAGE); await p.waitForFunction(() => window.__home3d);
  const n = () => p.evaluate(() => { const o = window.__home3d.state.objects; return { all: o.length, deco: o.filter(x => x.deco).length, unique: new Set(o.map(x => x.name)).size === o.length }; });
  const log = (k, v) => console.log(k, JSON.stringify(v));
  await p.click('#exhibits'); await p.waitForTimeout(1500);
  await p.click('#xmas'); await p.waitForTimeout(600); log('꾸미기', await n()); log('hint', await p.textContent('#hint'));
  await p.screenshot({ path: OUT + '/x1.png' });
  await p.click('#view-top'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/x2.png' });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  // 걸어서 보기
  await p.click('#walk'); await p.waitForTimeout(300);
  const at = async (x, z, yawDeg, pitch, name) => { await p.evaluate(([x, z, yaw, pitch]) => { const { walk } = window.__home3d; walk.x = x; walk.z = z; walk.yaw = yaw * Math.PI / 180; walk.pitch = pitch; }, [x, z, yawDeg, pitch]); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/' + name }); };
  await at(-3.8, 3.2, -35, -0.05, 'x3.png');   // 입구에서
  await at(-4.2, -2.4, -90, 0, 'x4.png');      // 복도
  await at(1.2, 3.3, -75, -0.1, 'x5.png');     // 이야기 자리 쪽
  await at(-3.8, 6.2, -20, 0, 'x6.png');       // 밖에서 입구 쪽
  await p.keyboard.press('Escape');
  // 걷기: 카펫 위를 지나갈 수 있고 지팡이 기둥에는 막힘
  await p.click('#xmas'); log('빼기', await n());
  await p.click('#undo'); log('되돌리기', await n());
  await p.click('#clear'); await p.setInputFiles('#file', await dl.path()); await p.waitForTimeout(600); log('불러오기', await n());
  // 직접 추가
  for (const t of ['cone', 'sphere', 'lights', 'wreath']) await p.click(`[data-add=${t}]`);
  await p.fill('#f-w', '2'); await p.press('#f-w', 'Tab');
  log('직접 추가 뒤', await n());
  await p.click('#clear'); console.log('errors', errs); await b.close();
})();
