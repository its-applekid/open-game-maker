#!/usr/bin/env python3
"""Ness (variant A, Kevin's pick 2026-10-30) from LimeZu Modern Interiors' character generator, plus a bat swing.

    <python with Pillow> -I tools/ness_sprite.py <Character_Generator dir> models/sprites/variants

Layers (read only, never re-saved): Body 02, Eyes 01, a recoloured copy of Outfit 25 (yellow stripes x3, red shoes),
Hairstyle 02/07, yellow Backpack 10, red Snapback 01 with its brim recoloured blue. Writes ness.png (the full generator sheet,
32x64 cells), ness_burnt.png (the same sheet without the cap, all black, hair standing up in spikes),
ness_bat.png (the 6 right-facing "hit" frames with a drawn bat, 64x64 cells, figure at x 16..48) and manifest.json.
"""
import json, os, sys
from PIL import Image

G, out = sys.argv[1], sys.argv[2]
assert not os.path.abspath(out).startswith(os.path.abspath(G)), 'refusing to write into the source pack'
os.makedirs(out, exist_ok=True)
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
L = lambda p: Image.open(f'{G}/{p}').convert('RGBA')

def recolor(im, mapping):
    px, m = im.load(), {hexrgb(k): hexrgb(v) for k, v in mapping.items()}
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in m: px[x, y] = m[p[:3]] + (p[3],)
    return im

def cells(im):
    for cy in range(0, im.height - 63, 64):
        for cx in range(0, im.width - 31, 32): yield cx, cy

def shoes(im, color='#c0392b', dark='#7a1f1f'):   # outline pixels in each figure's bottom 2 art rows become red shoes
    px, outline = im.load(), {hexrgb('#3a3a50'), hexrgb('#46465e')}
    for cx, cy in cells(im):
        ys = [y for y in range(cy, cy + 64) for x in range(cx, cx + 32) if px[x, y][3]]
        if not ys: continue
        b = max(ys)
        for y in range(b - 3, b + 1):
            for x in range(cx, cx + 32):
                if px[x, y][3] and px[x, y][:3] in outline: px[x, y] = hexrgb(color if y < b - 1 else dark) + (255,)
    return im

def stripes(im, shirt):   # two more yellow stripes, one art row pair above and below the outfit's own, on shirt pixels
    px, Y, sh = im.load(), {hexrgb('#ffd84a'), hexrgb('#e0a81c')}, {hexrgb(c) for c in shirt}
    for cx, cy in cells(im):
        rows = sorted({y for y in range(cy, cy + 64) for x in range(cx, cx + 32) if px[x, y][3] and px[x, y][:3] in Y})
        if not rows: continue
        y0 = rows[len(rows) // 2] & ~1
        for y in (y0 - 4, y0 - 3, y0 + 4, y0 + 5):
            for x in range(cx, cx + 32):
                if px[x, y][3] and px[x, y][:3] in sh: px[x, y] = hexrgb('#ffd84a') + (255,)
    return im

SKIN = '#f6c19a'
OUTFIT = ('Outfits/32x32/Outfit_25_32x32_01.png', {'#dd71a3': '#e0a81c', '#fbabc6': '#ffd84a', '#f7a8be': '#ffd84a', '#67697b': SKIN})
BRIM = {'#ebe4f2': '#5b8ff0', '#d8d0e0': '#3f6fd2', '#989ebe': '#2c529f', '#8b8bab': '#244489'}   # the snapback's pale brim, blue
LAYERS = ['Bodies/32x32/Body_32x32_02.png', 'Eyes/32x32/Eyes_32x32_01.png', OUTFIT[0], 'Hairstyles/32x32/Hairstyle_02_32x32_07.png',
          'Accessories/32x32/Accessory_03_Backpack_32x32_10.png', 'Accessories/32x32/Accessory_04_Snapback_32x32_01.png']
sheet = L(LAYERS[0]).copy()
for p in LAYERS[1:]:
    lay = shoes(stripes(recolor(L(p).copy(), OUTFIT[1]), ('#0092e3', '#0970d4'))) if p == OUTFIT[0] else recolor(L(p).copy(), BRIM) if 'Snapback' in p else L(p)
    pad = Image.new('RGBA', sheet.size); pad.paste(lay, (0, 0)); sheet.alpha_composite(pad)
    if 'Backpack' in p: capless = sheet.copy()
sheet.save(f'{out}/ness.png')

# Burnt (struck by lightning, or running into a wall), after Kevin's reference: flat black, no cap, white eyes and a white
# smile, hair standing up in short spikes
burnt = capless.copy(); bp = burnt.load()
eyes = L(LAYERS[1]).load()
from PIL import ImageDraw; hd = ImageDraw.Draw(burnt)
for y in range(burnt.height):
    for x in range(burnt.width):
        if bp[x, y][3]: bp[x, y] = (12, 12, 14, 255)
WHITE = (250, 250, 250, 255)
for cx, cy in cells(burnt):
    top = next((y for y in range(cy, cy + 64) if any(bp[x, y][3] for x in range(cx, cx + 32))), None)
    if top is None: continue
    xs = [x for x in range(cx, cx + 32) if bp[x, top + 4][3]]
    if len(xs) < 6: continue
    for i, sx in enumerate(range(min(xs) + 2, max(xs) - 1, 4)):   # short spikes rooted in the top of the head
        ht, lean = (5, 7, 6, 8, 5, 7)[i % 6], (sx - (min(xs) + max(xs)) / 2) * .25
        hd.polygon([(sx - 2, top + 3), (sx + 2, top + 3), (sx + lean, top + 2 - ht)], fill=(12, 12, 14, 255))
    ey = [(x, y) for y in range(cy, cy + 64) for x in range(cx, cx + 32) if eyes[x, y][3] and eyes[x, y][:3] != (0, 0, 0) or eyes[x, y][3] > 200]
    if not ey: continue
    for x, y in ey:   # big white eyes, 2 wide and 3 tall
        for j in ((0, 1) if x - cx < 16 else (-1, 0)):
            for k in (-1, 0, 1): bp[x + j, y + k] = WHITE
    ex0, ex1, eb = min(x for x, _ in ey), max(x for x, _ in ey), max(y for _, y in ey)
    if ex1 - ex0 >= 3:   # facing us: a flat smile under the eyes
        for x in range(ex0 + 1, ex1): bp[x, eb + 3] = WHITE
burnt.save(f'{out}/ness_burnt.png')

# The bat: a 15x5 art-pixel sprite (grip left, barrel right, dark outline), rotated per frame around the grip.
BAT = ['.oooo..........',
       'ogggwwwwwwooo..',
       'ogggwwwwwwwwwwo',
       '.ooodddddddddo.',
       '.......ooooo...']
COL = {'o': '#3a2a24', 'g': '#5a3a2a', 'w': '#e3b07a', 'd': '#a86c3f'}
bat_art = Image.new('RGBA', (15, 5))
for y, row in enumerate(BAT):
    for x, c in enumerate(row):
        if c != '.': bat_art.putpixel((x, y), hexrgb(COL[c]) + (255,))
# per "hit" frame (row 13, cells 0-5 face right): grip in art pixels of the 16x32 art cell, angle (0 = forward, 90 = up), behind?
SWING = [((6, 23), 140, True), ((5, 23), 160, True), ((5, 24), 180, True),   # wind-up: bat cocked back over the shoulder
         ((15, 25), 0, False), ((14, 24), 45, False), ((10, 23), 155, True)]   # contact, follow-through
def bat(grip, angle):
    big = Image.new('RGBA', (31, 31)); big.paste(bat_art, (15, 13))   # grip centre at (15, 15)
    rot = big.rotate(angle, resample=Image.NEAREST, center=(16, 15))
    im = Image.new('RGBA', (32, 32)); im.paste(rot, (grip[0] + 8 - 15, grip[1] - 15), rot)   # figure sits 8 art px in
    return im.resize((64, 64), Image.NEAREST)
strip = Image.new('RGBA', (64 * 6, 64))
for f, (grip, angle, behind) in enumerate(SWING):
    fig = Image.new('RGBA', (64, 64)); fig.paste(sheet.crop((f * 32, 13 * 64, f * 32 + 32, 14 * 64)), (16, 0))
    b = bat(grip, angle); cell = Image.alpha_composite(b, fig) if behind else Image.alpha_composite(fig, b)
    strip.paste(cell, (f * 64, 0))
strip.save(f'{out}/ness_bat.png')

json.dump({'note': 'Ness (variant A) for the EarthBound homage; rebuild with tools/ness_sprite.py', 'made': '2026-10-30', 'variants': [
    {'name': 'ness', 'op': 'sprite', 'from': ['limezu-modern-interiors/Character_Generator/' + p for p in LAYERS], 'file': 'ness.png', 'cell': [32, 64]},
    {'name': 'ness_burnt', 'op': 'sprite', 'from': ['ness.png layers without the cap', 'blackened', 'drawn hair spikes'], 'file': 'ness_burnt.png', 'cell': [32, 64]},
    {'name': 'ness_bat', 'op': 'sprite', 'from': ['ness.png row 13 (hit) cells 0-5', 'drawn bat'], 'file': 'ness_bat.png', 'cell': [64, 64]}]},
    open(f'{out}/manifest.json', 'w'), indent=1)
print(out, sheet.size, strip.size)
