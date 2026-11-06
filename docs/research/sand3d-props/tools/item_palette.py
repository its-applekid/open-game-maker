#!/usr/bin/env python3
"""Compare the colours each item in a lineup render actually shows, cropped by its known world x band.

    python3 item_palette.py <png> <cam_l> <cam_r> <label>:<x_centre>:<width> ...

Prints the dominant colours per item so "does the palette match the pack" is a number, not an impression.
"""
import sys
from collections import Counter
from PIL import Image

W = 1440


def classify(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    sat = 0 if mx == 0 else (mx - mn) / mx
    if mx < 60:
        return 'K'
    if sat < 0.12:
        return 's'
    if r > g > b:
        return 'w'
    if g >= r and g >= b:
        return 'v'
    if b >= r and b >= g:
        return 'b'
    return '?'


def main():
    path = sys.argv[1]
    cam_l, cam_r = float(sys.argv[2]), float(sys.argv[3])
    im = Image.open(path).convert('RGB')
    w, h = im.size
    for spec in sys.argv[4:]:
        label, xc, width = spec.rsplit(':', 2)
        xc, width = float(xc), float(width)
        px0 = int((xc - width / 2 - cam_l) / (cam_r - cam_l) * w)
        px1 = int((xc + width / 2 - cam_l) / (cam_r - cam_l) * w)
        crop = im.crop((max(0, px0), 0, min(w, px1), h))
        bg = im.getpixel((2, 2))
        counts = Counter()
        total = 0
        for y in range(0, crop.size[1], 2):
            for x in range(0, crop.size[0], 2):
                p = crop.getpixel((x, y))
                if sum(abs(a - b) for a, b in zip(p, bg)) < 20:
                    continue
                total += 1
                counts[(p[0] // 12 * 12, p[1] // 12 * 12, p[2] // 12 * 12)] += 1
        print(f'{label} ({crop.size[0]}px band, {total} object px)')
        for p, n in counts.most_common(6):
            print(f'   #{p[0]:02x}{p[1]:02x}{p[2]:02x} {100 * n / max(1, total):5.1f}%  {classify(*p)}')


if __name__ == '__main__':
    main()
