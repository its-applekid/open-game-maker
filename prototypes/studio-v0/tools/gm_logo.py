#!/usr/bin/env python3
"""The "GM" letters from the app icon without its splattered rounded-square background, for the small logo on the
studio's screens (Kevin, 2026-10-31). The letters have a dark outline all round: everything reachable from the edge
without crossing a dark pixel is background; the big pieces left are the letters.

    <python with Pillow and numpy> -I tools/gm_logo.py <icon-512.png> <out.webp>
"""
import sys
from collections import deque
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); a = np.asarray(im).astype(int); h, w = a.shape[:2]
lum = a[..., :3] @ np.array([.3, .59, .11]); dark = lum < 95
bg = np.zeros((h, w), bool); q = deque()
for x in range(w): q.extend([(0, x), (h - 1, x)])
for y in range(h): q.extend([(y, 0), (y, w - 1)])
while q:
    y, x = q.popleft()
    if bg[y, x] or dark[y, x]: continue
    bg[y, x] = True
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]: q.append((ny, nx))
fg = ~bg; lab = np.zeros((h, w), int); sizes = []
for y in range(h):
    for x in range(w):
        if fg[y, x] and not lab[y, x]:
            n = len(sizes) + 1; cnt = 0; q = deque([(y, x)]); lab[y, x] = n
            while q:
                cy, cx = q.popleft(); cnt += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
            sizes.append(cnt)
keep = [i + 1 for i, n in enumerate(sizes) if n > max(sizes) * .1]; mask = np.isin(lab, keep)   # the letters, not stray splatter
# light pockets shut in by the outline (between the G and the M) aren't letters: small light pieces become outline colour
light = mask & ~dark; lab2 = np.zeros((h, w), int); sizes2 = []
for y in range(h):
    for x in range(w):
        if light[y, x] and not lab2[y, x]:
            n = len(sizes2) + 1; cnt = 0; q = deque([(y, x)]); lab2[y, x] = n
            while q:
                cy, cx = q.popleft(); cnt += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not lab2[ny, nx]: lab2[ny, nx] = n; q.append((ny, nx))
            sizes2.append(cnt)
pocket = np.isin(lab2, [i + 1 for i, n in enumerate(sizes2) if n < max(sizes2) * .05]) & mask
a[pocket, :3] = np.median(a[mask & dark][:, :3], axis=0).astype(int)
a[..., 3] = np.where(mask, 255, 0)
res = Image.fromarray(a.astype(np.uint8)); res = res.crop(res.getbbox()); res.thumbnail((360, 360)); res.save(out, quality=92)
print(out, res.size)
