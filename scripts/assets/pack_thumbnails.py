#!/usr/bin/env python3
"""One HTML page of thumbnails for every visual asset pack (audio packs skipped), building and town packs first.

    scripts/audio/.venv/bin/python -I scripts/assets/pack_thumbnails.py assets-local/packs prototypes/studio-v0/art/packs out.html

Kenney packs show their Preview sheet, Synty their pack icon (or a studio render when one exists). Needs Pillow."""
import base64, io, json, pathlib, re, sys
from PIL import Image
packs, studio, out = map(pathlib.Path, sys.argv[1:4])
BUILD = re.compile(r'city|town|building|house|castle|medieval|urban|suburb|industrial|modular|shop|plaza|road|hexagon|village|fantasy|graveyard|holiday|market|furniture|space-station|station|dungeon')
def thumb(pack):
    s = studio / (pack.name + '.webp')
    cands = [s] if s.exists() else []
    ver = sorted(p for p in pack.iterdir() if p.is_dir())
    for v in ver:
        e = v / 'extracted'
        if e.exists():
            for pat in ['Preview.png', 'Preview*.png', 'preview*.png', 'Sample.png', 'sample*.png', '*creenshot*.png', '*review*.jpg']:
                cands += sorted(e.glob(pat))
    if (pack / 'icon.png').exists(): cands.append(pack / 'icon.png')
    if not cands:
        cands = sorted(pack.rglob('*.png'), key=lambda p: -p.stat().st_size)[:1]
    if not cands: return None
    im = Image.open(cands[0]).convert('RGB'); im.thumbnail((360, 260))
    b = io.BytesIO(); im.save(b, 'WEBP', quality=78); return base64.b64encode(b.getvalue()).decode()
groups = {'Buildings, towns and places': [], '3D kits': [], '2D sprites, tiles and UI': []}
for pack in sorted(packs.iterdir()):
    if not pack.is_dir() or pack.name.startswith('sidetrax'): continue
    t = thumb(pack)
    if not t: continue
    n = pack.name
    g = 'Buildings, towns and places' if BUILD.search(n) else '3D kits' if re.search(r'kit|synty|3d|voxel|model', n) else '2D sprites, tiles and UI'
    groups[g].append((n, t))
css = """:root{--bg:#fbf1c7;--fg:#3c3836;--mute:#7c6f64;--card:#f2e5bc;--line:#d5c4a1}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}}
:root[data-theme="dark"]{--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,-apple-system,sans-serif}
main{max-width:1200px;margin:0 auto;padding:20px 16px 40px}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}
.lede{color:var(--mute);margin:0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
img{width:100%;aspect-ratio:4/3;object-fit:contain;display:block;background:#e9e1cc}figcaption{padding:6px 8px;font-size:12px;word-break:break-word}"""
total = sum(len(v) for v in groups.values())
h = [f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Asset Pack Library</title><style>{css}</style></head><body><main>',
     f'<h1>Asset pack library</h1><p class="lede">{total} visual packs (128 Sidetrax music packs left out). Building and town packs first. Kenney packs show their own preview sheet; Synty packs show their pack icon, or a render where one exists.</p>']
for g, items in groups.items():
    h.append(f'<h2>{g} ({len(items)})</h2><div class="grid">')
    h += [f'<figure><img loading="lazy" alt="{n}" src="data:image/webp;base64,{t}"><figcaption>{n.replace("kenney-", "Kenney · ").replace("synty-", "Synty · ")}</figcaption></figure>' for n, t in items]
    h.append('</div>')
h.append('</main></body></html>')
out.write_text(''.join(h)); print(total, {g: len(v) for g, v in groups.items()}, round(out.stat().st_size / 1e6, 1), 'MB')
