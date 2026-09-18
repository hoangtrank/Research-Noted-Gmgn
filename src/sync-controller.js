// Điều khiển sync trong service worker. Sync là TUỲ CHỌN và mặc định TẮT: chừng nào settings.sync chưa bật thì
// không dòng nào dưới đây chạm tới Google — quyền "identity", "alarms" và tên miền googleapis.com cũng chỉ được xin
// (ở trang Settings) vào lúc người dùng bấm bật sync.
//
// Khi bật: ghi chú được gộp với MỘT file trong vùng dữ liệu riêng của extension trên Google Drive của chính người
// dùng (NotedDrive), bằng NotedSync. Thời điểm sync: mở trình duyệt, vài giây sau lần sửa ghi chú cuối, mỗi 15 phút,
// và khi bấm "Sync ngay".
'use strict';

const SYNC_ALARM = 'noted-sync';
const SYNC_PERIOD_MIN = 15;
const SYNC_DEBOUNCE_MS = 8000;
let syncTimer = 0, syncDirty = false, syncBusy = false;

async function syncSettings() {
  const st = (await chrome.storage.local.get('settings')).settings || {};
  // Test: Drive giả lập trên máy cục bộ + token giả. Chỉ nhận địa chỉ máy cục bộ; NotedDrive cũng tự kiểm tra lại.
  const base = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(st.driveApiBase || '')) ? st.driveApiBase : '';
  return { enabled: st.sync === true, base, testToken: base ? String(st.syncTestToken || '') : '' };
}

let lastToken = '';
async function googleToken() {
  if (!chrome.identity) return '';                       // chưa được cấp quyền "identity"
  try {
    const r = await chrome.identity.getAuthToken({ interactive: false });
    lastToken = (r && typeof r === 'object' ? r.token : r) || '';
  } catch (_) { lastToken = ''; }
  return lastToken;
}

async function makeDrive() {
  const cfg = await syncSettings();
  return new NotedDrive(cfg.base ? { base: cfg.base, token: async () => cfg.testToken } : { token: googleToken });
}

async function runSync() {
  const cfg = await syncSettings();
  if (!cfg.enabled) return { ok: false, code: 'off' };
  if (syncBusy) { syncDirty = true; return { ok: false, code: 'busy' }; }
  syncBusy = true; syncDirty = false;
  try {
    let res = await NotedSync.syncOnce(await makeDrive());
    // Token trong bộ nhớ đệm của Chrome đã bị thu hồi/hết hạn: bỏ nó đi và thử lại một lần với token mới.
    if (!res.ok && res.code === 'signed-out' && lastToken && chrome.identity) {
      try { await chrome.identity.removeCachedAuthToken({ token: lastToken }); } catch (_) {}
      res = await NotedSync.syncOnce(await makeDrive());
    }
    return res;
  } finally {
    syncBusy = false;
    if (syncDirty) scheduleSync();                        // người dùng sửa ghi chú trong lúc đang sync
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { runSync().catch(() => {}); }, SYNC_DEBOUNCE_MS);
}

async function applyAlarm() {
  if (!chrome.alarms) return;
  const { enabled } = await syncSettings();
  if (enabled) chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MIN, delayInMinutes: SYNC_PERIOD_MIN });
  else chrome.alarms.clear(SYNC_ALARM);
}

function hookAlarms() {
  if (!chrome.alarms || hookAlarms.done) return;
  hookAlarms.done = true;
  chrome.alarms.onAlarm.addListener(a => { if (a.name === SYNC_ALARM) runSync().catch(() => {}); });
  applyAlarm();
}
hookAlarms();
// Quyền tuỳ chọn vừa được cấp trong lúc worker đang chạy: API mới xuất hiện, gắn listener ngay.
chrome.permissions.onAdded.addListener(() => hookAlarms());

chrome.runtime.onStartup.addListener(() => { runSync().catch(() => {}); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) { applyAlarm(); return; }
  if (!Object.keys(changes).some(k => k.startsWith(NotedStore.PREFIX) || k === NotedStore.DELETED_KEY)) return;
  if (syncBusy) { syncDirty = true; return; }             // gồm cả những lần ghi của chính lượt sync đang chạy
  syncSettings().then(cfg => { if (cfg.enabled) scheduleSync(); });
});

// Lệnh từ trang Settings. Chỉ nhận từ trang của chính extension, không nhận từ content script.
function fromExtensionPage(sender) {
  return !!sender && sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL(''));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('noted:sync-')) return;
  if (!fromExtensionPage(sender)) { sendResponse({ ok: false, code: 'forbidden' }); return; }
  (async () => {
    if (msg.type === 'noted:sync-now') return runSync();
    if (msg.type === 'noted:sync-set') {
      const r = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(r.settings || {}), sync: !!msg.enabled } });
      await applyAlarm();
      if (msg.enabled) return runSync();
      clearTimeout(syncTimer);
      if (chrome.identity && chrome.identity.clearAllCachedAuthTokens) { try { await chrome.identity.clearAllCachedAuthTokens(); } catch (_) {} }
      return { ok: true, code: 'off' };
    }
    if (msg.type === 'noted:sync-wipe') { await (await makeDrive()).wipe(); return { ok: true }; }
    return { ok: false, code: 'unknown' };
  })().then(sendResponse, err => sendResponse({ ok: false, code: (err && err.code) || 'error', error: String((err && err.message) || err) }));
  return true;
});
