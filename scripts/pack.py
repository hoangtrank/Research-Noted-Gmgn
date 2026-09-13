#!/usr/bin/env python3
"""Đóng gói extension thành file ZIP để tải lên Chrome Web Store.

Chỉ gồm những file cần để chạy (manifest.json, icons/, src/), manifest.json nằm ngay ở gốc ZIP
như Web Store yêu cầu. Chạy: python3 scripts/pack.py  ->  dist/noted-for-gmgn-<version>.zip
"""
import json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE = ['manifest.json', 'icons', 'src']
SKIP = {'.DS_Store', 'Thumbs.db'}

def main():
    with open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8') as f:
        m = json.load(f)
    problems = []
    if len(m.get('name', '')) > 45:
        problems.append('name dài quá 45 ký tự')
    if len(m.get('description', '')) > 132:
        problems.append(f"description dài {len(m['description'])} ký tự, Web Store cho tối đa 132")
    for size, path in (m.get('icons') or {}).items():
        if not os.path.exists(os.path.join(ROOT, path)):
            problems.append(f'thiếu icon {path} (chạy python3 scripts/make_icons.py)')
    if problems:
        print('Không đóng gói được:\n - ' + '\n - '.join(problems))
        sys.exit(1)

    out_dir = os.path.join(ROOT, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"noted-for-gmgn-{m['version']}.zip")
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            full = os.path.join(ROOT, item)
            if os.path.isfile(full):
                z.write(full, item); count += 1
                continue
            for dirpath, dirnames, filenames in os.walk(full):
                dirnames[:] = sorted(d for d in dirnames if not d.startswith('.'))
                for fn in sorted(filenames):
                    if fn in SKIP or fn.startswith('.'):
                        continue
                    p = os.path.join(dirpath, fn)
                    z.write(p, os.path.relpath(p, ROOT).replace(os.sep, '/'))
                    count += 1
    print(f'Đã tạo {os.path.relpath(out, ROOT)} ({count} file, {os.path.getsize(out) // 1024} KB), version {m["version"]}')
    print('Tải lên: https://chrome.google.com/webstore/devconsole -> New item -> chọn file ZIP này')

if __name__ == '__main__':
    main()
