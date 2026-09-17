#!/usr/bin/env python3
"""Sinh icons/icon{16,32,48,128}.png không cần thư viện ngoài (chỉ zlib + struct) và khai báo vào manifest.json.
Icon tối giản: nền vuông bo góc tối, một trục timeline với ba mốc; mốc mới nhất màu vàng, hai mốc cũ xám."""
import struct, zlib, os, math

SIZE = 512  # vẽ ở độ phân giải cao rồi thu nhỏ để có khử răng cưa

def rounded_rect(px, py, x0, y0, x1, y1, r):
    # signed distance <= 0 khi nằm trong hình chữ nhật bo góc
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return math.hypot(px - cx, py - cy) - r

def circle(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r

def render():
    BG = (20, 22, 28)
    RAIL = (58, 65, 80)     # trục timeline
    DIM = (91, 100, 117)    # các mốc cũ
    NOW = (250, 204, 21)    # mốc mới nhất
    # (tâm y, bán kính chấm, mép phải của dòng chữ, màu) — dòng ngắn dần về quá khứ
    ROWS = ((136, 36, 408, NOW), (256, 28, 368, DIM), (376, 28, 328, DIM))
    img = [[(0, 0, 0, 0)] * SIZE for _ in range(SIZE)]
    for y in range(SIZE):
        for x in range(SIZE):
            px, py = x + 0.5, y + 0.5
            if rounded_rect(px, py, 0, 0, SIZE, SIZE, 112) > 0:
                continue
            col = BG
            if rounded_rect(px, py, 166, 136, 186, 376, 10) <= 0:
                col = RAIL
            for cy, r, x1, c in ROWS:
                if circle(px, py, 176, cy, r) <= 0 or rounded_rect(px, py, 244, cy - 18, x1, cy + 18, 18) <= 0:
                    col = c
            img[y][x] = (col[0], col[1], col[2], 255)
    return img

def downsample(img, n):
    f = SIZE // n
    out = []
    for y in range(n):
        row = []
        for x in range(n):
            acc = [0, 0, 0, 0]
            for dy in range(f):
                for dx in range(f):
                    p = img[y * f + dy][x * f + dx]
                    a = p[3]
                    acc[0] += p[0] * a; acc[1] += p[1] * a; acc[2] += p[2] * a; acc[3] += a
            if acc[3]:
                row.append((acc[0] // acc[3], acc[1] // acc[3], acc[2] // acc[3], acc[3] // (f * f)))
            else:
                row.append((0, 0, 0, 0))
        out.append(row)
    return out

def png(img, path):
    n = len(img)
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in img)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'icons')
    os.makedirs(out, exist_ok=True)
    big = render()
    for n in (16, 32, 48, 128):
        png(downsample(big, n), os.path.join(out, f'icon{n}.png'))
        print('wrote', f'icon{n}.png')
    # Khai báo icon trong manifest.json (idempotent)
    import json
    mpath = os.path.join(here, '..', 'manifest.json')
    with open(mpath, encoding='utf-8') as f:
        m = json.load(f)
    icons = {str(n): f'icons/icon{n}.png' for n in (16, 32, 48, 128)}
    m['icons'] = icons
    m.setdefault('action', {})['default_icon'] = icons
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('updated manifest.json icons')
