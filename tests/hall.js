// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/hall.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(PAGE); await p.waitForFunction(() => window.__home3d);
  const n = () => p.evaluate(() => { const o = window.__home3d.state.objects; return { all: o.length, letters: o.filter(x => x.decal).length, deco: o.filter(x => x.deco).length, unique: new Set(o.map(x => x.name)).size === o.length, loaded: Object.keys(window.POSTERS).filter(k => k.startsWith('hall-')).length }; });
  const log = (k, v) => console.log(k, JSON.stringify(v));
  await p.click('#hall'); await p.waitForTimeout(3000); log('복도공간 전시회', await n());
  await p.screenshot({ path: OUT + '/h1.png' });
  await p.click('#view-top'); await p.waitForTimeout(500); await p.screenshot({ path: OUT + '/h2.png' });
  const cam = async (pos, tgt, name) => { await p.evaluate(([pos,tgt]) => { const { camera, controls } = window.__home3d; controls.target.set(...tgt); camera.position.set(...pos); }, [pos,tgt]); await p.waitForTimeout(500); await p.screenshot({ path: OUT + '/' + name }); };
  await cam([-22, 9, 13], [-6, 0, 0], 'h3.png');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  await p.click('#walk'); await p.waitForTimeout(300);
  log('걷기 시작', await p.evaluate(() => { const { walk, camera } = window.__home3d; return [walk.x, walk.z, Math.round(walk.yaw * 180 / Math.PI), +camera.position.y.toFixed(2)]; }));
  const at = async (x, z, yawDeg, pitch, name) => { await p.evaluate(([x, z, yaw, pitch]) => { const { walk } = window.__home3d; walk.x = x; walk.z = z; walk.yaw = yaw * Math.PI / 180; walk.pitch = pitch; }, [x, z, yawDeg, pitch]); await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/' + name }); };
  await p.screenshot({ path: OUT + '/h4.png' });         // 들머리
  await at(-9.6, 0.6, 0, 0, 'h5.png');     // 제1관 가벽 안쪽 면을 가운데 길에서(가벽 z=-1.6, 보는 방향 -z)
  await at(-12, 0, -78, -0.03, 'h6.png');   // 가운데 길을 따라
  await at(-4.6, 3.3, 0, 0, 'h7.png');     // 제2관 바깥 면을 앞쪽 길에서
  await at(13.2, 2.6, -110, -0.12, 'h8.png');  // 이야기 자리
  // 가벽에 막히는지: 가운데 길에서 뒤쪽 가벽으로 직진
  await p.evaluate(() => { const { walk } = window.__home3d; walk.x = -9.75; walk.z = 0; walk.yaw = 0; });
  await p.keyboard.down('w'); await p.waitForTimeout(2500); await p.keyboard.up('w');
  log('가벽 앞에서 멈춤(z > -1.6)', await p.evaluate(() => +window.__home3d.walk.z.toFixed(2)));
  await p.keyboard.press('Escape');
  await p.click('#xmas'); log('장식 빼기', await n()); await p.click('#xmas'); log('다시 꾸미기', await n());
  await p.click('#exhibits'); log('전시 자료 빼기', await p.evaluate(() => window.__home3d.state.objects.filter(o => o.image).length)); await p.click('#exhibits');
  await p.click('#clear'); await p.setInputFiles('#file', await dl.path()); await p.waitForTimeout(800); log('불러오기', await n());
  // 새로 열었을 때도(저장된 장면) 벽 글씨 파일을 스스로 불러오는지
  await p.reload(); await p.waitForFunction(() => window.__home3d); await p.waitForTimeout(2500); log('새로 고침 뒤', await n());
  await p.click('#gallery'); await p.click('#xmas'); await p.waitForTimeout(300); log('전시 공간 + 꾸미기(기존)', await n());
  await p.click('#clear'); console.log('errors', errs); await b.close();
})();
