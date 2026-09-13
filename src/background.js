// Service worker: chuyển tiếp lệnh mở dashboard và phím tắt tới content script.
'use strict';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'noted:open-dashboard') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-note') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !/^https:\/\/([a-z0-9-]+\.)?gmgn\.ai\//i.test(tab.url || '')) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'noted:toggle' });
  } catch (_) {
    // Content script chưa được nạp vào tab này (ví dụ tab mở trước khi cài extension).
  }
});
