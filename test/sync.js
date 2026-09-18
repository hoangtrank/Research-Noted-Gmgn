// Test sync giữa HAI MÁY: hai trình duyệt, hai hồ sơ riêng, cùng nạp extension thật, cùng sync qua một Google Drive
// giả lập (test/mock-drive.js). Mục 1–13 gọi thẳng bộ máy (src/lib/sync.js, drive.js) từ trang Dashboard cho nhanh;
// mục 14 đi đường thật: nút trong Settings -> service worker (src/sync-controller.js) -> Drive giả lập.
//   node test/sync.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('./pw');
const driveMock = require('./mock-drive');

const EXT = path.resolve(__dirname, '..');
let pass = 0;
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); pass++; console.log('  ✓', msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const A1 = '0xaa40e79e987517f7462bf79315b8a118799b04e3', KEY1 = 'robinhood:' + A1;
const A2 = '0x2222222222222222222222222222222222222222', KEY2 = 'robinhood:' + A2;

async function machine(name, base) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), `noted-sync-${name}-`)), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  [${name}] PAGE ERROR`, e.message));
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/src/dashboard/dashboard.html`);
  for (const f of ['sync.js', 'drive.js']) await page.addScriptTag({ url: `chrome-extension://${new URL(sw.url()).host}/src/lib/${f}` });
  await page.evaluate(b => { window.__drive = (token = 'test-token') => new NotedDrive({ base: b, token: async () => token }); }, base);
  const m = {
    name, ctx, page,
    sync: (token) => page.evaluate(t => NotedSync.syncOnce(window.__drive(t)), token),
    project: key => page.evaluate(k => NotedStore.get(k), key),
    all: () => page.evaluate(async () => (await NotedStore.getAll()).map(p => p.key).sort()),
    texts: async key => ((await m.project(key)) || { timeline: [] }).timeline.map(e => e.text).sort(),
    addEntry: (key, text, type = 'note') => page.evaluate(async ([k, t, ty]) => { const [chain, address] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]; const p = (await NotedStore.get(k)) || NotedStore.emptyProject(chain, address); const e = NotedStore.newEntry(ty, t); p.timeline.push(e); await NotedStore.save(p); return e.id; }, [key, text, type]),
    removeEntry: (key, text) => page.evaluate(async ([k, t]) => { const p = await NotedStore.get(k); const e = p.timeline.find(x => x.text === t); p.timeline = p.timeline.filter(x => x !== e); await NotedStore.save(p, { removedIds: [e.id] }); }, [key, text]),
    patch: (key, fields) => page.evaluate(async ([k, f]) => { const p = await NotedStore.get(k); Object.assign(p, f); await NotedStore.save(p); }, [key, fields]),
    removeProject: key => page.evaluate(k => NotedStore.remove(k), key),
    raw: () => page.evaluate(async () => { const all = await chrome.storage.local.get(null); return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('p:') || k === 'deleted')); }),
  };
  return m;
}

(async () => {
  const drive = await driveMock.start();
  const A = await machine('A', drive.base), B = await machine('B', drive.base);
  const remote = () => { const f = [...drive.state.files.values()][0]; return f ? JSON.parse(f.body) : null; };

  console.log('1) Máy A có ghi chú, máy B trống: sync xong hai máy giống nhau');
  await A.addEntry(KEY1, 'A: thread của founder'); await wait(15);
  await A.patch(KEY1, { symbol: 'PROLOG', summary: 'Launchpad cho AI agent', tags: ['ai', 'launchpad'], status: 'researching', rating: 4, pinned: true });
  let r = await A.sync();
  assert(r.ok && r.pushed && drive.state.files.size === 1, 'A đẩy lên: tạo đúng một file trong appDataFolder');
  assert(remote().app === 'research-noted-gmgn-sync' && remote().projects.length === 1, 'file có định dạng sync, chứa 1 dự án');
  r = await B.sync();
  assert(r.ok && r.pulled === 1 && !r.pushed, 'B kéo về 1 dự án và KHÔNG đẩy lại (không có gì mới)');
  const pb = await B.project(KEY1);
  assert(pb && pb.symbol === 'PROLOG' && pb.summary === 'Launchpad cho AI agent' && pb.pinned && pb.rating === 4 && pb.tags.join() === 'ai,launchpad' && pb.timeline.length === 1, 'B có đủ tóm tắt, tag, ghim, điểm, timeline');

  console.log('2) Hai máy cùng thêm mốc vào một dự án khi chưa sync: không mất mốc nào');
  await A.addEntry(KEY1, 'A: mua 0.2 ETH', 'buy'); await wait(15);
  await B.addEntry(KEY1, 'B: tin hợp tác mới', 'news');
  await A.sync(); await B.sync(); await A.sync();
  const want2 = ['A: mua 0.2 ETH', 'A: thread của founder', 'B: tin hợp tác mới'];
  assert(JSON.stringify(await A.texts(KEY1)) === JSON.stringify(want2) && JSON.stringify(await B.texts(KEY1)) === JSON.stringify(want2), 'cả hai máy có đủ 3 mốc');

  console.log('3) Đã khớp rồi thì sync tiếp không ghi gì thêm (không đẩy qua đẩy lại)');
  const up0 = drive.state.uploads;
  const rawA = JSON.stringify(await A.raw());
  for (let i = 0; i < 3; i++) { await A.sync(); await B.sync(); }
  assert(drive.state.uploads === up0, 'thêm 6 lượt sync: 0 lần đẩy lên');
  assert(JSON.stringify(await A.raw()) === rawA, 'dữ liệu trong máy A không bị ghi lại');

  console.log('4) Xoá một mốc ở máy A: mốc biến mất ở B và KHÔNG sống lại');
  await A.removeEntry(KEY1, 'A: mua 0.2 ETH');
  await A.sync(); await B.sync();
  assert(!(await B.texts(KEY1)).includes('A: mua 0.2 ETH'), 'B mất mốc đã bị xoá ở A');
  await B.addEntry(KEY1, 'B: ghi chú sau khi xoá'); await B.sync(); await A.sync(); await B.sync();
  assert(!(await A.texts(KEY1)).includes('A: mua 0.2 ETH') && !(await B.texts(KEY1)).includes('A: mua 0.2 ETH'), 'sau thêm vài lượt sync, mốc đã xoá vẫn không quay lại ở máy nào');
  assert((await A.texts(KEY1)).includes('B: ghi chú sau khi xoá'), 'trong khi mốc mới của B vẫn sang được A');

  console.log('5) Sửa ở hai máy: bản sửa SAU thắng cả cụm tóm tắt/trạng thái/tag (giới hạn đã thống nhất), timeline nguyên vẹn');
  await A.patch(KEY1, { summary: 'A sửa tóm tắt' }); await wait(20);
  await B.patch(KEY1, { status: 'holding', tags: ['ai'] });
  await A.sync(); await B.sync(); await A.sync();
  const [pa5, pb5] = [await A.project(KEY1), await B.project(KEY1)];
  assert(pa5.status === 'holding' && pb5.status === 'holding' && pa5.tags.join() === 'ai' && pb5.tags.join() === 'ai', 'trạng thái và tag của B (sửa sau) có ở cả hai máy — xoá tag cũng lan đi');
  assert(pa5.summary === pb5.summary, 'hai máy thống nhất một tóm tắt: ' + JSON.stringify(pa5.summary));
  assert(pa5.timeline.length === 3 && pb5.timeline.length === 3, 'timeline vẫn đủ 3 mốc ở cả hai máy');

  console.log('6) Xoá cả dự án ở A: B cũng mất; nhưng nếu B sửa SAU khi A xoá thì dự án sống lại ở cả hai');
  await A.addEntry(KEY2, 'dự án thứ hai'); await A.sync(); await B.sync();
  assert((await B.all()).includes(KEY2), 'B nhận dự án thứ hai');
  await A.removeProject(KEY2); await A.sync(); await B.sync();
  assert(!(await B.all()).includes(KEY2) && !(await A.all()).includes(KEY2), 'A xoá dự án -> B cũng mất, và nó không quay lại A');
  await A.addEntry(KEY2, 'tạo lại'); await A.sync(); await B.sync();
  await A.removeProject(KEY2); await wait(20);
  await B.addEntry(KEY2, 'B sửa sau khi A xoá');
  await A.sync(); await B.sync(); await A.sync();
  assert((await A.all()).includes(KEY2) && (await B.all()).includes(KEY2) && (await A.texts(KEY2)).includes('B sửa sau khi A xoá'), 'B sửa sau khi A xoá -> dự án sống lại ở cả hai máy, kèm mốc của B');

  console.log('7) Hai máy ghi cùng lúc: máy đến sau nhận "conflict", gộp lại rồi mới ghi — không ai đè mất của ai');
  await A.addEntry(KEY1, 'A: ghi lúc tranh chấp'); await B.addEntry(KEY1, 'B: ghi lúc tranh chấp');
  await A.page.exposeFunction('__bSyncNow', async () => { await B.sync(); });
  const rc = await A.page.evaluate(async () => {
    const d = window.__drive(); let hooked = false, conflicts = 0;
    const remote = { download: () => d.download(), upload: async (data, rev) => { if (!hooked) { hooked = true; await window.__bSyncNow(); } try { return await d.upload(data, rev); } catch (e) { if (e.code === 'conflict') conflicts++; throw e; } } };
    return { res: await NotedSync.syncOnce(remote), conflicts };
  });
  assert(rc.conflicts === 1 && rc.res.ok, 'A gặp đúng 1 lần conflict rồi sync thành công');
  await B.sync();
  const t7 = await B.texts(KEY1);
  assert(t7.includes('A: ghi lúc tranh chấp') && t7.includes('B: ghi lúc tranh chấp') && JSON.stringify(t7) === JSON.stringify(await A.texts(KEY1)), 'cả hai mốc có mặt ở cả hai máy');

  console.log('8) Drive trục trặc: báo lỗi rõ ràng, ghi chú trong máy không bị đụng tới');
  const before8 = JSON.stringify(await A.raw());
  const f8 = [...drive.state.files.values()][0]; const good = f8.body;
  f8.body = '{ đây không phải JSON'; f8.version++;
  r = await A.sync();
  assert(!r.ok && r.code === 'bad-remote' && JSON.stringify(await A.raw()) === before8, 'file trên Drive hỏng -> lỗi bad-remote, dữ liệu máy A nguyên vẹn');
  assert(f8.body === '{ đây không phải JSON', 'và KHÔNG ghi đè file hỏng (tránh phá thêm khi chưa hiểu chuyện gì)');
  f8.body = JSON.stringify({ hello: 'world' }); f8.version++;
  r = await A.sync();
  assert(!r.ok && r.code === 'bad-remote', 'file JSON nhưng không phải của extension -> cũng từ chối');
  f8.body = good; f8.version++;
  r = await A.sync('wrong-token');
  assert(!r.ok && r.code === 'signed-out', 'token hết hạn -> lỗi signed-out');
  await A.addEntry(KEY1, 'A: ghi lúc Drive đầy');
  drive.state.failWith = 'quota';
  r = await A.sync();
  assert(!r.ok && r.code === 'quota' && (await A.texts(KEY1)).includes('A: ghi lúc Drive đầy'), 'Drive đầy -> lỗi quota, mốc vừa ghi vẫn còn trong máy');
  drive.state.failWith = 'forbidden';
  r = await A.sync();
  assert(!r.ok && r.code === 'forbidden', 'quản trị viên chặn Drive -> lỗi forbidden');
  drive.state.failWith = null;
  r = await A.sync(); await B.sync();
  assert(r.ok && (await B.texts(KEY1)).includes('A: ghi lúc Drive đầy'), 'Drive chạy lại -> mốc bị kẹt lúc nãy sang được máy B');
  const st8 = await A.page.evaluate(() => NotedSync.getState());
  assert(st8.lastAt > 0 && st8.lastResult.ok && st8.error === '', 'trạng thái sync được ghi lại cho giao diện: ' + JSON.stringify({ ok: st8.lastResult.ok, projects: st8.lastResult.projects }));

  console.log('9) Dữ liệu từ Drive là dữ liệu không tin cậy: được làm sạch như file import');
  const f9 = [...drive.state.files.values()][0]; const j9 = JSON.parse(f9.body);
  j9.projects.push({ chain: 'robinhood', address: '0x9999999999999999999999999999999999999999', symbol: '<img src=x onerror=alert(1)>'.repeat(5), status: 'hacked', rating: 99, timeline: [{ text: 'ok' }, { nope: true }, 'rác'], updatedAt: Date.now() });
  j9.projects.push({ chain: '../../etc', address: 'x' });
  f9.body = JSON.stringify(j9); f9.version++;
  r = await B.sync();
  const evil = await B.project('robinhood:0x9999999999999999999999999999999999999999');
  assert(r.ok && evil && evil.symbol.length <= 32 && evil.status === 'watching' && evil.rating === 5 && evil.timeline.length === 1, 'bản ghi lạ bị cắt gọt về đúng kiểu và giới hạn');
  assert(!(await B.all()).some(k => k.includes('etc')), 'bản ghi có khoá không hợp lệ bị bỏ qua');

  console.log('10) Sao lưu tự động trước khi dữ liệu máy khác chạm vào ghi chú, và khôi phục thắng cả sync');
  const backups = await B.page.evaluate(() => NotedStore.listBackups());
  assert(backups.length >= 1 && backups.some(b => b.reason === 'sync'), 'máy B có bản sao lưu lý do "sync": ' + backups.map(b => b.reason + ':' + b.count).join(', '));
  await B.removeEntry(KEY1, 'A: thread của founder'); await B.sync(); await A.sync();
  assert(!(await A.texts(KEY1)).includes('A: thread của founder'), 'B lỡ tay xoá một mốc, việc xoá lan sang A');
  const bk = (await B.page.evaluate(() => NotedStore.listBackups()))[0];
  await B.page.evaluate(ts => NotedStore.restoreBackup(ts), bk.ts);
  assert((await B.texts(KEY1)).includes('A: thread của founder'), 'B khôi phục bản sao lưu: mốc quay lại');
  await B.sync(); await A.sync(); await B.sync();
  assert((await A.texts(KEY1)).includes('A: thread của founder') && (await B.texts(KEY1)).includes('A: thread của founder'), 'sau khi sync, mốc được khôi phục có ở CẢ HAI máy (dấu vết xoá cũ không xoá nó lần nữa)');

  console.log('11) Export/Import thủ công cũng hết cảnh "mốc đã xoá sống lại"');
  const C = await machine('C', drive.base);
  await C.page.evaluate(d => NotedStore.importJSON(d), await A.page.evaluate(() => NotedStore.exportJSON()));
  assert((await C.texts(KEY1)).includes('B: tin hợp tác mới'), 'máy C nhận ghi chú của A qua file export (có mốc "B: tin hợp tác mới")');
  await C.addEntry(KEY1, 'C: mốc riêng của máy C');
  await A.removeEntry(KEY1, 'B: tin hợp tác mới');
  const before11 = (await C.page.evaluate(() => NotedStore.listBackups())).length;
  const ir = await C.page.evaluate(d => NotedStore.importJSON(d), await A.page.evaluate(() => NotedStore.exportJSON()));
  const t11 = await C.texts(KEY1);
  assert(ir.merged >= 1 && t11.includes('C: mốc riêng của máy C'), 'import lần hai: gộp, giữ mốc riêng của máy nhận');
  assert(!t11.includes('B: tin hợp tác mới'), 'mốc A đã xoá cũng biến mất ở C sau khi import — trước đây nó sống lại');
  assert((await C.page.evaluate(() => NotedStore.listBackups())).length === before11 + 1, 'import tự sao lưu trước khi gộp');
  await C.page.evaluate(d => NotedStore.importJSON(d), await C.page.evaluate(() => NotedStore.exportJSON()));
  assert(!(await C.texts(KEY1)).includes('B: tin hợp tác mới'), 'import lại chính file của mình cũng không làm mốc đã xoá quay lại');
  await C.ctx.close();

  console.log('12) "Xoá bản trên Drive": máy nào sync trước sẽ tạo lại từ dữ liệu của nó');
  await A.page.evaluate(() => window.__drive().wipe());
  assert(drive.state.files.size === 0, 'file sync đã bị xoá khỏi appDataFolder');
  r = await B.sync(); await A.sync(); await B.sync();
  assert(r.ok && r.pushed && drive.state.files.size === 1 && JSON.stringify(await A.texts(KEY1)) === JSON.stringify(await B.texts(KEY1)), 'B tạo lại file, hai máy vẫn khớp nhau');

  console.log('13) NotedDrive chỉ chịu nói chuyện với Google hoặc máy cục bộ');
  const bad = await A.page.evaluate(() => { try { new NotedDrive({ base: 'https://evil.example.com', token: async () => 'x' }); return 'accepted'; } catch (e) { return e.code; } });
  assert(bad === 'bad-base', 'địa chỉ lạ bị từ chối ngay khi khởi tạo');

  console.log('14) Đường thật: nút trong Settings -> background -> Drive. Tắt thì không có request nào ra ngoài');
  await A.page.evaluate(() => window.__drive().wipe());
  const useMock = m => m.page.evaluate(async b => { const st = (await chrome.storage.local.get('settings')).settings || {}; await chrome.storage.local.set({ settings: { ...st, lang: 'en', driveApiBase: b, syncTestToken: 'test-token' } }); }, drive.base);
  await useMock(A); await useMock(B);
  for (const m of [A, B]) { await m.page.reload(); await m.page.waitForSelector('#open-settings'); await m.page.click('#open-settings'); await m.page.waitForSelector('#settings:not([hidden])'); }
  const stateOf = m => m.page.evaluate(() => ({ text: document.querySelector('#sync-state').textContent, cls: document.querySelector('#sync-state').className, on: !document.querySelector('#sync-on').hidden, now: !document.querySelector('#sync-now').hidden }));
  assert((await stateOf(A)).on && /off/i.test((await stateOf(A)).text), 'mặc định: đồng bộ TẮT, chỉ có nút bật');
  const req0 = drive.state.requests;
  await A.addEntry(KEY1, 'A: sửa khi sync đang tắt');
  await wait(10500);
  assert(drive.state.requests === req0, 'sync tắt: sửa ghi chú xong chờ 10 giây, KHÔNG có request nào tới Drive');
  await A.page.evaluate(() => chrome.storage.local.remove('sync'));   // bỏ trạng thái của các mục trước, để "Last sync" chỉ có thể đến từ lượt sync thật
  await B.page.evaluate(() => chrome.storage.local.remove('sync'));
  await A.page.click('#sync-on');
  await A.page.waitForFunction(() => /Last sync/.test(document.querySelector('#sync-state').textContent) && !document.querySelector('#sync-now').hidden, null, { timeout: 15000 });
  assert(drive.state.files.size === 1 && (await stateOf(A)).now, 'A bấm bật: background sync ngay, Drive có file, giao diện hiện "Last sync" + nút Sync now');
  await B.page.click('#sync-on');
  await B.page.waitForFunction(() => /Last sync/.test(document.querySelector('#sync-state').textContent), null, { timeout: 15000 });
  assert((await B.texts(KEY1)).includes('A: sửa khi sync đang tắt'), 'B bấm bật: nhận luôn ghi chú của A');
  const up14 = drive.state.uploads;
  await A.addEntry(KEY1, 'A: tự động sync sau khi sửa');
  for (let i = 0; i < 40 && drive.state.uploads === up14; i++) await wait(500);
  assert(drive.state.uploads === up14 + 1, 'A sửa ghi chú: vài giây sau background TỰ đẩy lên (đúng 1 lần)');
  await wait(9500);
  assert(drive.state.uploads === up14 + 1, 'lần ghi của chính lượt sync không kích hoạt thêm lượt đẩy nào');
  await B.page.click('#sync-now');
  await B.page.waitForFunction(() => /Last sync/.test(document.querySelector('#sync-state').textContent), null, { timeout: 15000 });
  for (let i = 0; i < 20 && !(await B.texts(KEY1)).includes('A: tự động sync sau khi sửa'); i++) await wait(300);
  assert((await B.texts(KEY1)).includes('A: tự động sync sau khi sửa'), 'B bấm Sync now: nhận mốc mới của A');
  drive.state.failWith = 'quota';
  await B.addEntry(KEY1, 'B: ghi lúc Drive đầy (UI)');
  await B.page.click('#sync-now');
  await B.page.waitForFunction(() => /Drive is full/i.test(document.querySelector('#sync-state').textContent), null, { timeout: 15000 });
  assert(/err/.test((await stateOf(B)).cls), 'Drive đầy: Settings báo lỗi dễ hiểu, tô đỏ — ' + (await stateOf(B)).text);
  drive.state.failWith = null;
  await B.page.click('#sync-now');             // B đẩy nốt mốc bị kẹt, rồi chờ B yên hẳn: bộ đếm request của Drive giả lập là chung
  await B.page.waitForFunction(() => /Last sync/.test(document.querySelector('#sync-state').textContent), null, { timeout: 15000 });
  await wait(10000);
  await A.page.click('#sync-off');
  await A.page.waitForFunction(() => !document.querySelector('#sync-on').hidden, null, { timeout: 8000 });
  const req1 = drive.state.requests;
  await A.addEntry(KEY1, 'A: sửa sau khi tắt sync');
  await wait(10500);
  assert(drive.state.requests === req1, 'A tắt sync: sửa tiếp cũng không còn request nào tới Drive');
  B.page.once('dialog', d => d.accept());
  await B.page.click('#sync-wipe');
  await B.page.waitForFunction(() => /deleted/i.test(document.querySelector('#sync-state').textContent), null, { timeout: 15000 });
  assert(drive.state.files.size === 0, 'B bấm "Delete the copy on Drive": file sync biến mất khỏi Drive, ghi chú trong máy vẫn còn (' + (await B.all()).length + ' dự án)');
  const swA = A.ctx.serviceWorkers()[0];
  const gate = await swA.evaluate(() => ({ page: fromExtensionPage({ id: chrome.runtime.id, url: chrome.runtime.getURL('src/dashboard/dashboard.html') }), content: fromExtensionPage({ id: chrome.runtime.id, url: 'https://gmgn.ai/sol/token/x', tab: { id: 1 } }), other: fromExtensionPage({ id: 'abcdefghijklmnopabcdefghijklmnop', url: chrome.runtime.getURL('x.html') }) }));
  assert(gate.page === true && gate.content === false && gate.other === false, 'lệnh bật/tắt/xoá sync chỉ nhận từ trang của chính extension, không nhận từ content script hay extension khác');

  await A.ctx.close(); await B.ctx.close(); drive.server.close();
  console.log(`\nALL PASSED — ${pass} phép thử`);
})().catch(e => { console.error(e); process.exit(1); });
