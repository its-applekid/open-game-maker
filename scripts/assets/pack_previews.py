#!/usr/bin/env python3
"""A phone-friendly preview page of candidate packs, built from their store pages only (nothing is downloaded).

    python3 -I scripts/assets/pack_previews.py <out.html> "<title>" <url>="<one line: why it fits>" ...

Works for itch.io pages (and most store pages with img.itch.zone or og:image screenshots). For each page: title, price
line, licence sentences, up to 3 screenshots inlined. Publish the page, let the creator pick, then download.
"""
import base64, html, re, sys, urllib.request

out, title, *specs = sys.argv[1:]
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)'}
fetch = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
cards = []
for spec in specs:
    url, _, why = spec.partition('=')
    try: t = fetch(url).decode('utf-8', 'replace')
    except Exception as e: cards.append(f'<figure><figcaption><b>{html.escape(url)}</b><small>could not load: {e}</small></figcaption></figure>'); continue
    name = html.unescape(re.search(r'<title>([^<]*)', t).group(1)) if '<title>' in t else url
    price = [html.unescape(re.sub(r'<[^>]+>|\s+', ' ', p)).strip() for p in re.findall(r'class="buy_message"[^>]*>(.*?)</div>', t, re.S)][:1]
    dollars = re.findall(r'<span class="dollars[^"]*"[^>]*>([^<]+)</span>', t)[:1]
    text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t)))
    lic = re.findall(r'[^.]{0,90}(?:CC0|Creative Commons|commercial|licen[cs]e|attribution|credit)[^.]{0,90}\.', text, re.I)[:2]
    box = re.search(r'class="screenshot_list".*?</div>', t, re.S)
    shots = re.findall(r'href="(https://img\.itch\.zone/[^"]+)"', box.group(0)) if box else []
    shots = shots or re.findall(r'property="og:image" content="([^"]+)"', t)
    imgs = ''
    for s in shots[:3]:
        try:
            b = fetch(s); ext = s.rsplit('.', 1)[-1].lower(); ext = 'jpeg' if ext in ('jpg', 'jpeg') else ext
            if len(b) < 3_000_000: imgs += f'<img src="data:image/{ext};base64,{base64.b64encode(b).decode()}">'
        except Exception: pass
    meta = ' · '.join(x for x in [' '.join(dollars + price).strip(), *[l.strip() for l in lic]] if x)
    cards.append(f'<figure><figcaption><b>{html.escape(name)}</b><small>{html.escape(why)}</small><small>{html.escape(meta)}</small>'
                 f'<small><a href="{html.escape(url)}">{html.escape(url)}</a></small></figcaption>{imgs}</figure>')
    print(name, '|', meta[:120])
css = """:root{--bg:#fbf1c7;--fg:#3c3836;--mute:#7c6f64;--card:#f2e5bc;--line:#d5c4a1}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}}
:root[data-theme="dark"]{--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,sans-serif}main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0 0 16px}figure{margin:0 0 14px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}
figcaption{margin-bottom:8px}small{display:block;color:var(--mute)}a{color:inherit}img{max-width:100%;max-height:340px;margin:0 6px 6px 0;image-rendering:pixelated}"""
open(out, 'w').write(f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{css}</style></head><body><main><h1>{html.escape(title)}</h1>{"".join(cards)}</main></body></html>')
