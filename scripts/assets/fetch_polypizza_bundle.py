#!/usr/bin/env python3
"""Download a Poly Pizza bundle (or single models) as GLB, keeping only the licences you allow.

    python3 -I scripts/assets/fetch_polypizza_bundle.py <bundle url | model url...> <out dir> [--licenses CC0]

For each model page it records the name, author, licence and source URL in out/sources.json and downloads the GLB.
Models whose licence is not in --licenses (default CC0) are listed but not downloaded. Reruns skip files already there.
Standard library only. The output is untrusted data: never run anything from it (see gm-asset-intake).
"""
import argparse, html, json, os, re, sys, time, urllib.request

UA = {'User-Agent': 'Mozilla/5.0'}

def get(url, binary=False):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read(); return b if binary else b.decode('utf-8', 'replace')
        except Exception:
            if attempt == 3: raise
            time.sleep(2 + attempt * 3)

def model_ids(url):
    if '/m/' in url: return [re.search(r'/m/([\w-]+)', url).group(1)]
    return list(dict.fromkeys(re.findall(r'/m/([\w-]+)', get(url))))

def model(mid):
    t = get(f'https://poly.pizza/m/{mid}')
    name = re.search(r'<h1[^>]*>(.*?)</h1>', t, re.S)
    name = ' '.join(re.sub('<[^>]+>', ' ', html.unescape(name.group(1))).split()) if name else mid
    lic = re.search(r'(CC0 1\.0|CC-BY \d\.\d|CC-BY-SA \d\.\d)', t)
    glb = re.search(r'https://static\.poly\.pizza/[\w-]+\.glb', t)
    author = re.search(r'href="/u/([\w-]+)"', t)
    return {'id': mid, 'name': name, 'license': lic.group(1) if lic else 'unknown', 'author': author.group(1) if author else 'unknown',
            'source': f'https://poly.pizza/m/{mid}', 'glb': glb.group(0) if glb else None}

if __name__ == '__main__':
    a = argparse.ArgumentParser(); a.add_argument('urls', nargs='+'); a.add_argument('--licenses', default='CC0')
    o = a.parse_args(); *urls, out = o.urls; out = os.path.abspath(out); os.makedirs(out, exist_ok=True)
    allow = [x.strip() for x in o.licenses.split(',') if x.strip()]
    rows = []
    for u in urls:
        for mid in model_ids(u):
            m = model(mid); rows.append(m)
            fname = re.sub(r'[^\w.-]+', '-', m['name']).strip('-') or mid
            if any(r is not m and r.get('file') == f'{fname}.glb' for r in rows): fname = f'{fname}-{mid[:5]}'   # two models with one name
            m['file'] = f'{fname}.glb'
            ok = m['glb'] and any(m['license'].startswith(x) for x in allow)
            path = os.path.join(out, m['file'])
            if ok and not (os.path.exists(path) and os.path.getsize(path) > 0):
                b = get(m['glb'], binary=True)
                if b[:4] != b'glTF': print(f"  skipped {m['name']}: not a GLB", file=sys.stderr); m['file'] = None; continue
                open(path, 'wb').write(b)
            print(f"{'ok ' if ok else 'NO '} {m['license']:<10} {m['author']:<12} {m['name']}")
            if not ok: m['file'] = None
    json.dump(rows, open(os.path.join(out, 'sources.json'), 'w'), indent=1)
    print(f"{sum(1 for r in rows if r.get('file'))} of {len(rows)} downloaded to {out}", file=sys.stderr)
