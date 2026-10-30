"""Every 2D pack's main sheet on one page, pixel art shown at 3x with hard pixels, characters first.

    scripts/audio/.venv/bin/python -I scripts/assets/sprite_libraries.py assets-local/catalog.json assets-local out.html
"""
import base64, io, json, os, re, sys, glob
from PIL import Image
cat = json.load(open(sys.argv[1])); A = sys.argv[2]; out = sys.argv[3]
PREF = ['tilemap-characters_packed.png', 'roguelikeChar_transparent.png', 'tilemap_packed.png', 'colored_tilemap_packed.png', 'colored-transparent_packed.png', 'colored_packed.png', 'ships_packed.png', 'spritesheet_default.png', 'sheet.png', 'spritesheet.png', 'Preview.png', 'Sample.png']
PIXEL = re.compile(r'pixel|tiny|micro|1-bit|pico|monochrome|roguelike|rpg-urban|shmup|platformer-pack|8-bit|retro|bit')
CHAR = re.compile(r'character|roguelike|tiny|pixel-platformer|micro|1-bit|pico|monochrome|rpg-urban|shmup|creature|monster|animal|toon|platformer|robot|alien|ufo|space|battle|dungeon|town')
rows = []
for p in cat['packs']:
    if p.get('category') != '2d' and not re.search(r'pixel|sprite|tiny|micro|1-bit', p['id']): continue
    root = os.path.join(A, p['path'])
    files = [f for f in glob.glob(os.path.join(root, '**', '*.png'), recursive=True)]
    pick = next((f for name in PREF for f in files if os.path.basename(f) == name and 'magenta' not in f.lower()), None)
    if not pick: continue
    im = Image.open(pick).convert('RGBA'); w, h = im.size
    is_px = bool(PIXEL.search(p['id'])) and max(w, h) <= 1200
    b = io.BytesIO()
    if is_px: im.save(b, 'PNG', optimize=True)
    else: im.thumbnail((520, 340)); im.save(b, 'WEBP', quality=72)
    rows.append((0 if (is_px and CHAR.search(p['id'])) else 1 if is_px else 2 if CHAR.search(p['id']) else 3, p['id'], p.get('title', p['id']), os.path.relpath(pick, root), base64.b64encode(b.getvalue()).decode(), is_px, im.size))
rows.sort(key=lambda r: (r[0], r[1]))
names = ['Pixel art: characters, creatures, ships', 'Pixel art: tiles and props', '2D (vector and painted): characters, creatures, ships', '2D: everything else']
css = """:root{--bg:#fbf1c7;--fg:#3c3836;--mute:#7c6f64;--card:#f2e5bc;--line:#d5c4a1}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}}
:root[data-theme="dark"]{--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,-apple-system,sans-serif}main{max-width:1400px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}.lede{color:var(--mute);margin:0}
figure{margin:0 0 14px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto}
figcaption{font-size:13px;margin-bottom:6px}figcaption small{color:var(--mute)}img{display:block;background:#e9e1cc;max-width:none}img.px{image-rendering:pixelated}"""
html = [f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>2D Sprite Libraries</title><style>{css}</style></head><body><main>',
        f'<h1>2D sprite libraries</h1><p class="lede">{len(rows)} packs. Pixel-art sheets are shown at 3x with hard pixels (scroll sideways on a phone); vector and painted packs show their preview.</p>']
cur = None
for g, pid, title, rel, data, px, (w, h) in rows:
    if g != cur: cur = g; html.append(f'<h2>{names[g]} ({sum(1 for r in rows if r[0] == g)})</h2>')
    scale = 3 if px and w <= 420 else 2 if px else 1
    html.append(f'<figure><figcaption><b>{title}</b> <small>{pid} · {rel}</small></figcaption><img class="{"px" if px else ""}" alt="{pid}" width="{w*scale}" height="{h*scale}" src="data:image/{'png' if px else 'webp'};base64,{data}"></figure>')
html.append('</main></body></html>'); open(out, 'w').write(''.join(html))
print(len(rows), [sum(1 for r in rows if r[0] == g) for g in range(4)], round(os.path.getsize(out) / 1e6, 1), 'MB')
