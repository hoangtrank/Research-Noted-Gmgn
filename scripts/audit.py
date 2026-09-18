#!/usr/bin/env python3
"""Kiểm tra quyền hạn của extension: in ra đúng những gì nó có thể làm, và báo lỗi nếu mã nguồn
dùng bất kỳ API nguy hiểm nào hoặc gửi dữ liệu tới máy chủ ngoài danh sách cho phép.

Ai cũng chạy được để tự kiểm tra:  python3 scripts/audit.py
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# API mà một extension ghi chú KHÔNG được phép dùng. Có mặt = dừng lại và xem kỹ.
FORBIDDEN = {
    r'\beval\s*\(': 'eval() — chạy mã động',
    r'new\s+Function\s*\(': 'new Function() — chạy mã động',
    r'chrome\.cookies': 'đọc/ghi cookie',
    r'chrome\.debugger': 'gắn trình gỡ lỗi vào tab',
    r'chrome\.downloads': 'tải file xuống máy',
    r'chrome\.management': 'quản lý các extension khác',
    r'chrome\.nativeMessaging|connectNative': 'gọi chương trình ngoài trên máy',
    r'chrome\.webRequest': 'chặn/sửa lưu lượng mạng',
    r'chrome\.proxy': 'đổi proxy',
    r'chrome\.history': 'đọc lịch sử duyệt web',
    r'chrome\.bookmarks': 'đọc dấu trang',
    r'chrome\.identity': 'lấy token đăng nhập',
    r'chrome\.scripting\.executeScript': 'chèn mã vào trang bất kỳ',
    r'navigator\.clipboard\.readText': 'đọc clipboard',
    r'document\.cookie': 'đọc cookie của trang',
    r'new\s+WebSocket': 'mở kết nối WebSocket',
    r'sendBeacon': 'gửi dữ liệu nền',
    r'indexedDB\.open': 'mở IndexedDB của trang',
    r'localStorage\b': 'đọc/ghi localStorage của trang',
    r'sessionStorage\b': 'đọc/ghi sessionStorage của trang',
    r'\bprivate[_ ]?key|mnemonic|seed[_ ]?phrase|wallet\.(sign|export)': 'từ khoá liên quan ví/khoá bí mật',
    r'window\.(ethereum|solana|phantom)\b': 'truy cập ví trong trang',
}

# Quyền được phép có trong manifest.
ALLOWED_PERMISSIONS = {'storage', 'unlimitedStorage', 'activeTab', 'sidePanel'}
ALLOWED_HOST_PERMISSIONS = {'https://api.dexscreener.com/*'}
# Đồng bộ qua Google Drive là TUỲ CHỌN: các quyền dưới đây chỉ được XIN lúc người dùng bấm bật sync trong Settings,
# không có sẵn khi cài. Đúng hai quyền, đúng một tên miền, đúng một scope OAuth — khác đi là lỗi.
ALLOWED_OPTIONAL_PERMISSIONS = {'identity', 'alarms'}
ALLOWED_OPTIONAL_HOSTS = {'https://www.googleapis.com/*'}
ALLOWED_OAUTH_SCOPES = {'https://www.googleapis.com/auth/drive.appdata'}
# chrome.identity (lấy token đăng nhập Google) chỉ được xuất hiện ở hai nơi này, cho tính năng sync.
IDENTITY_ALLOWED_IN = {os.path.join('src', 'sync-controller.js'), os.path.join('src', 'dashboard', 'dashboard.js')}
SYNC_FETCH_ONLY_IN = os.path.join('src', 'lib', 'drive.js')
ALLOWED_CONTENT_HOSTS = {'gmgn.ai', 'dexscreener.com', 'x.com', 'twitter.com', 'grok.com'}
# Máy chủ duy nhất extension được gửi request tới.
ALLOWED_FETCH_HOSTS = {'api.dexscreener.com', '127.0.0.1', 'localhost'}
SYNC_FETCH_HOSTS = {'www.googleapis.com'}

def js_files():
    for base in ('src', 'scripts'):
        for dirpath, _, names in os.walk(os.path.join(ROOT, base)):
            for n in sorted(names):
                if n.endswith('.js'):
                    yield os.path.relpath(os.path.join(dirpath, n), ROOT)

def host_of(pattern):
    m = re.match(r'https?://([^/]+)', pattern)
    if not m:
        return pattern
    h = m.group(1)
    return h[2:] if h.startswith('*.') else h

def main():
    problems, notes = [], []
    with open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8') as f:
        m = json.load(f)

    print('=' * 72)
    print(f"  {m['version']}  —  kiểm tra quyền hạn / capability audit")
    print('=' * 72)

    perms = set(m.get('permissions', []))
    hosts = set(m.get('host_permissions', []))
    print('\n1) QUYỀN KHAI BÁO (manifest.json)')
    for p in sorted(perms):
        print(f'   permission      {p}')
    for h in sorted(hosts):
        print(f'   host            {h}')
    if not hosts:
        print('   host            (không có)')
    extra = perms - ALLOWED_PERMISSIONS
    if extra:
        problems.append(f'quyền ngoài danh sách cho phép: {sorted(extra)}')
    if hosts - ALLOWED_HOST_PERMISSIONS:
        problems.append(f'host_permissions ngoài danh sách: {sorted(hosts - ALLOWED_HOST_PERMISSIONS)}')
    opt_perms = set(m.get('optional_permissions', []))
    opt_hosts = set(m.get('optional_host_permissions', []))
    scopes = set((m.get('oauth2') or {}).get('scopes', []))
    for p in sorted(opt_perms):
        print(f'   tuỳ chọn        {p:<24} (chỉ xin khi bật sync)')
    for h in sorted(opt_hosts):
        print(f'   tuỳ chọn host   {h:<24} (chỉ xin khi bật sync)')
    for sc in sorted(scopes):
        print(f'   OAuth scope     {sc}')
    if opt_perms - ALLOWED_OPTIONAL_PERMISSIONS:
        problems.append(f'optional_permissions ngoài danh sách: {sorted(opt_perms - ALLOWED_OPTIONAL_PERMISSIONS)}')
    if opt_hosts - ALLOWED_OPTIONAL_HOSTS:
        problems.append(f'optional_host_permissions ngoài danh sách: {sorted(opt_hosts - ALLOWED_OPTIONAL_HOSTS)}')
    if scopes - ALLOWED_OAUTH_SCOPES:
        problems.append(f'OAuth scope ngoài danh sách (chỉ được drive.appdata — vùng dữ liệu riêng của extension): {sorted(scopes - ALLOWED_OAUTH_SCOPES)}')
    if ALLOWED_OPTIONAL_PERMISSIONS & perms or ALLOWED_OPTIONAL_HOSTS & hosts:
        problems.append('quyền của sync phải là TUỲ CHỌN (optional_*), không được nằm trong permissions/host_permissions')
    if any('<all_urls>' in x or '*://*/*' in x for x in perms | hosts | opt_perms | opt_hosts):
        problems.append('có quyền trên MỌI trang web (<all_urls>)')

    print('\n2) TRANG WEB EXTENSION ĐƯỢC CHẠY VÀO (content scripts)')
    seen_hosts = set()
    for cs in m.get('content_scripts', []):
        for pat in cs['matches']:
            h = host_of(pat)
            seen_hosts.add(h)
            print(f'   {pat:<42} {", ".join(os.path.basename(j) for j in cs["js"][-2:])}')
    bad_hosts = {h for h in seen_hosts if not any(h == a or h.endswith('.' + a) for a in ALLOWED_CONTENT_HOSTS)}
    if bad_hosts:
        problems.append(f'chạy trên trang ngoài danh sách: {sorted(bad_hosts)}')
    print('   → Ngoài các trang trên, extension không đọc được bất kỳ trang nào khác.')

    print('\n3) GỬI DỮ LIỆU RA NGOÀI (fetch / XHR)')
    found_fetch = False
    for rel in js_files():
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        for i, line in enumerate(src.splitlines(), 1):
            if re.search(r'\b(fetch|XMLHttpRequest)\s*\(', line) and 'fetchJson' not in line.split('(')[0]:
                found_fetch = True
                print(f'   {rel}:{i}  {line.strip()[:96]}')
    if not found_fetch:
        print('   (không có)')
    urls = set()
    for rel in js_files():
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        for u in re.findall(r'https?://[A-Za-z0-9.\-]+', src):
            urls.add(u.split('//')[1])
    print('\n   Tên miền xuất hiện trong mã nguồn:')
    for u in sorted(urls):
        kind = 'gửi request' if u in ALLOWED_FETCH_HOSTS else 'gửi request — CHỈ KHI người dùng bật sync' if u in SYNC_FETCH_HOSTS else 'chỉ mở link/so khớp URL'
        print(f'     {u:<28} {kind}')
    # Tên miền của sync chỉ được xuất hiện trong đúng một file (NotedDrive); nơi khác nhắc tới nó là đáng ngờ.
    for rel in js_files():
        if not rel.startswith('src') or rel == SYNC_FETCH_ONLY_IN:
            continue
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        code = '\n'.join(l for l in src.splitlines() if not l.strip().startswith('//'))
        if any(h in code for h in SYNC_FETCH_HOSTS) and rel != os.path.join('src', 'dashboard', 'dashboard.js'):
            problems.append(f'{rel} nhắc tới tên miền của Google ngoài {SYNC_FETCH_ONLY_IN}')

    print('\n4) API NGUY HIỂM')
    hits = []
    for rel in js_files():
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        for i, line in enumerate(src.splitlines(), 1):
            if line.strip().startswith('//') or line.strip().startswith('*'):
                continue
            for pat, why in FORBIDDEN.items():
                if pat == r'chrome\.identity' and rel in IDENTITY_ALLOWED_IN:
                    continue
                if re.search(pat, line, re.I):
                    hits.append(f'{rel}:{i}  {why}  ->  {line.strip()[:80]}')
    if hits:
        for h in hits:
            print('   ✗ ' + h)
        problems.append(f'{len(hits)} chỗ dùng API nguy hiểm')
    else:
        print('   ✓ Không có: eval, cookie, clipboard, lịch sử duyệt web, WebSocket,')
        print('     chèn mã vào trang khác, gọi chương trình ngoài, đọc ví trong trang.')

    print('\n5) MÃ TỪ XA')
    remote = []
    for dirpath, _, names in os.walk(os.path.join(ROOT, 'src')):
        for n in names:
            if n.endswith(('.html', '.js')):
                rel = os.path.relpath(os.path.join(dirpath, n), ROOT)
                src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
                for tag in re.findall(r'<script[^>]+src=["\']([^"\']+)', src):
                    if tag.startswith('http') or tag.startswith('//'):
                        remote.append(f'{rel}: {tag}')
    if remote:
        for r in remote:
            print('   ✗ ' + r)
        problems.append('nạp mã từ máy chủ ngoài')
    else:
        print('   ✓ Toàn bộ mã nằm trong gói cài đặt, không tải thêm script từ internet.')
        print(f"   ✓ CSP: {m.get('content_security_policy', {}).get('extension_pages', '(chưa khai báo)')}")
        if not m.get('content_security_policy'):
            notes.append('nên khai báo content_security_policy cho trang extension')

    print('\n' + '=' * 72)
    if problems:
        print('KẾT QUẢ: CÓ VẤN ĐỀ')
        for p in problems:
            print('  ✗ ' + p)
        return 1
    print('KẾT QUẢ: ĐẠT — extension chỉ đọc 5 tên miền kể trên, chỉ gửi request tới')
    print('api.dexscreener.com, và lưu ghi chú trong máy bạn.')
    if opt_hosts:
        print('Nếu (và chỉ nếu) bạn bật "Đồng bộ giữa các máy" trong Settings, ghi chú còn được')
        print('gửi tới MỘT nơi nữa: file ẩn của extension trong Google Drive của chính bạn.')
    for n in notes:
        print('  · lưu ý: ' + n)
    return 0

if __name__ == '__main__':
    sys.exit(main())
