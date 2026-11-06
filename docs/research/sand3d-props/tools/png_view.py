#!/usr/bin/env python3
"""Print a PNG as a coarse colour grid so an agent without eyes can read silhouette and palette."""
import sys
from PIL import Image


def classify(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    sat = 0 if mx == 0 else (mx - mn) / mx
    if mx < 60:
        return 'K'          # near-black / steel in shadow
    if sat < 0.12:
        return 's' if mx > 110 else 'g'   # stone light / grey mid
    if r > g > b:
        return 'w' if mx < 190 else 'c'   # wood brown / cream cloth
    if g >= r and g >= b:
        return 'v'          # green
    if b >= r and b >= g:
        return 'b'          # blue
    return '?'


def main(path, cols=88, rows=30):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    small = im.resize((cols, rows), Image.LANCZOS)
    bg = small.getpixel((0, 0))
    lum_chars = ' .:-=+*#%@'
    lum_rows, hue_rows = [], []
    for y in range(rows):
        lum_row, hue_row = '', ''
        for x in range(cols):
            p = small.getpixel((x, y))
            if sum(abs(a - b) for a, b in zip(p, bg)) < 18:
                lum_row += ' '; hue_row += '.'
                continue
            lum = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255
            lum_row += lum_chars[min(len(lum_chars) - 1, int((1 - lum) * (len(lum_chars) - 1) + 0.5))]
            hue_row += classify(*p)
        lum_rows.append(lum_row); hue_rows.append(hue_row)
    print(f'{path} {w}x{h} bg={bg}')
    print('--- luminance (dark = dense) ---')
    print('\n'.join(lum_rows))
    print('--- hue (w wood, c cream/cloth, s stone, g grey, K black, v green, b blue) ---')
    print('\n'.join(hue_rows))
    counts = {}
    total = cols * rows
    for y in range(rows):
        for x in range(cols):
            p = small.getpixel((x, y))
            if sum(abs(a - b) for a, b in zip(p, bg)) < 18:
                continue
            key = (p[0] // 16 * 16, p[1] // 16 * 16, p[2] // 16 * 16)
            counts[key] = counts.get(key, 0) + 1
    fg = sum(counts.values())
    print(f'foreground {fg}/{total} = {100 * fg / total:.0f}%')
    for p, c in sorted(counts.items(), key=lambda kv: -kv[1])[:10]:
        print(f'  #{p[0]:02x}{p[1]:02x}{p[2]:02x} {100 * c / total:.1f}%  ({classify(*p)})')


if __name__ == '__main__':
    main(sys.argv[1], *(int(a) for a in sys.argv[2:4]))
