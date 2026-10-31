#!/usr/bin/env python3
"""A pixel saucer after Kevin's reference (2026-10-30): a wide lens of khaki metal, the same depth above and below the
rim (Kevin, 2026-10-31: the reference only looks deeper underneath because it is seen from below), radial panels, a small
dome on top and a small pod underneath, shaded with ordered dithering in a muted ramp. Drawn from scratch.

    <python with Pillow> -I tools/ufo_sprite.py models/sprites/ufo

Writes ufo_a.png (khaki, the reference), ufo_b.png (steel), ufo_c.png (bronze with a glowing pod): 8 frames of the hull
spinning, 112x32 cells side by side, the pod's tip at (56, 28).
"""
import math, os, sys
from PIL import Image

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
W, H, CX, RIM = 112, 32, 56, 13
A, BT, BB = 54, 8, 8             # hull half-width, top and underside heights: symmetric
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
RAMPS = {   # dark to light
    'a': ['#24231a', '#3f3d2a', '#5e5b3c', '#7f7c52', '#a39f72', '#c7c29a', '#e6e0c2', '#f8f4e6'],
    'b': ['#1c1f26', '#343a46', '#4f5766', '#6f7889', '#949dae', '#b9c1cf', '#dde3ec', '#f6f8fb'],
    'c': ['#25170f', '#43291a', '#663e24', '#8a5730', '#b07a45', '#cf9e66', '#e8c595', '#fbebd0'],
}
UNDER = {   # the underside's second panel colour, alternating with the hull's ramp
    'a': ['#26271c', '#3a3d2c', '#4f5340', '#666a55', '#80836c', '#9c9e86', '#babba4', '#d8d8c4'],
    'b': ['#16181e', '#272b34', '#3a404c', '#505866', '#6a7282', '#868ea0', '#a6aec0', '#c8cedb'],
    'c': ['#1e120c', '#341f14', '#4e2f1e', '#6a412a', '#88573a', '#a6704c', '#c48e66', '#e0b088'],
}
GLOW = {'a': None, 'b': None, 'c': ['#7a2a10', '#d0581e', '#ff9a40', '#ffe0a0']}

def frame(ramp, under, glow, f):
    im = Image.new('RGBA', (W, H)); px = im.load(); n = len(ramp) - 1
    def put(x, y, s, r=ramp):   # s in 0..1, ordered-dithered onto the ramp
        v = max(0, min(1, s)) * (len(r) - 1); lo = int(v); fr = v - lo
        i = min(len(r) - 1, lo + (1 if fr * 16 > BAYER[y % 4][x % 4] + .5 else 0)); px[x, y] = hexrgb(r[i]) + (255,)
    spin = f / 8 * (2 * math.pi / 16)   # 16 wedges to the turn; 8 frames move one wedge along
    for y in range(H):
        for x in range(W):
            dx = (x + .5 - CX) / A
            if abs(dx) > 1: continue
            taper = (1 - dx * dx) ** 1.4   # a lens with pointed tips
            if y < RIM:   # the top, seen at a shallow angle: pale, faint radial seams
                top = RIM - BT * taper
                if y + .5 < top: continue
                k = (RIM - y) / max(1e-3, BT * taper)
                th = math.atan2((RIM - y) / BT, dx)
                seam = abs(math.sin((th + spin) * 8)) < .12 and k > .15
                put(x, y, .5 + .35 * k - .25 * dx + (-.18 if seam else 0))
            elif y == RIM:   # the rim: a bright edge
                put(x, y, .95 - .25 * dx)
            else:            # the underside, seen from below: panels of two colours radiating from the pod
                bot = RIM + 1 + BB * (1 - dx * dx) ** 1.4
                if y + .5 > bot: continue
                th = math.atan2(RIM + BB - y, (x + .5 - CX) * BB / A * 2.2)
                w = math.sin((th - spin) * 8)
                k = (y - RIM) / BB
                put(x, y, .62 - .3 * k - .2 * dx - .1 * abs(dx) + (.08 if abs(w) < .2 else 0), ramp if w > 0 else under)
    # the dome on top
    for y in range(RIM - BT - 5, RIM - BT + 3):
        for x in range(CX - 7, CX + 7):
            dx, dy = (x + .5 - CX) / 7, (y + .5 - (RIM - BT + 2)) / 6
            if dx * dx + dy * dy <= 1 and dy < .5: put(x, y, .6 - .45 * dx - .3 * dy + (.3 if -.6 < dx < -.15 and -.8 < dy < -.35 else 0))
    # the pod underneath, where the lightning leaves
    PT = RIM + BB
    for y in range(PT, min(H, PT + 5)):
        for x in range(CX - 7, CX + 7):
            dx, dy = (x + .5 - CX) / 7, (y + .5 - PT) / 5
            if dx * dx + dy * dy <= 1:
                if glow and dy > .4: put(x, y, 1 - dy * .5 - abs(dx) * .5, glow)
                else: put(x, y, .45 - .25 * dy - .3 * dx)
    # a dark lip under the rim so the lens edge reads against a pale sky
    for x in range(W):
        if px[x, RIM + 1][3]: px[x, RIM + 1] = hexrgb(ramp[1]) + (255,)
    return im

for v, ramp in RAMPS.items():
    sheet = Image.new('RGBA', (W * 8, H))
    for f in range(8): sheet.paste(frame(ramp, UNDER[v], GLOW[v], f), (f * W, 0))
    sheet.save(f'{out}/ufo_{v}.png')
print(out)
