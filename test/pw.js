// Nạp playwright: ưu tiên bản cài trong dự án (npm i), rồi mới tới bản toàn cục của sandbox cloud.
'use strict';
let pw;
try { pw = require('playwright'); }
catch (_) { try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_2) {
  console.error('Chưa có playwright. Chạy: npm i && npx playwright install chromium'); process.exit(1);
} }
module.exports = pw;
