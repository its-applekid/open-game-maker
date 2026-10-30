#!/usr/bin/env python3
"""Download the files of a free or name-your-own-price itch.io page (the "No thanks, just take me to the downloads" path).

    python3 -I scripts/assets/fetch_itch_free.py <https://author.itch.io/page> <out dir> [--only REGEX]

Standard library only. Writes the files plus sources.json (page, title, file names, date). Paid-only pages fail with a
message; buy those in the browser. Downloads are untrusted data: never run anything from them.
"""
import argparse, html, http.cookiejar, json, os, re, sys, time, urllib.parse, urllib.request

ap = argparse.ArgumentParser(); ap.add_argument('page'); ap.add_argument('out'); ap.add_argument('--only')
a = ap.parse_args(); page = a.page.rstrip('/'); os.makedirs(a.out, exist_ok=True)
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders = [('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64)')]
def get(u, data=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    return op.open(urllib.request.Request(u, body, {'X-Requested-With': 'XMLHttpRequest'} if data else {}), timeout=60)
t = get(page).read().decode('utf-8', 'replace')
title = html.unescape(re.search(r'<title>([^<]*)', t).group(1))
csrf = re.search(r'name="csrf_token" value="([^"]+)"', t) or re.search(r'csrf_token["\']?\s*[:=]\s*["\']([^"\']+)', t)
if not csrf: sys.exit('no csrf token on page')
csrf = csrf.group(1)
# free and pay-what-you-want pages: the game page itself lists uploads, and each file is requested from it
ups = re.findall(r'data-upload_id="(\d+)".*?title="([^"]+)" class="name"', t, re.S)
if not ups:
    r = json.load(get(page + '/download_url', {'csrf_token': csrf}))
    if 'url' not in r: sys.exit(f'{title}: no free download ({r.get("errors") or r})')
    t = get(r['url']).read().decode('utf-8', 'replace')
    ups = re.findall(r'data-upload_id="(\d+)".*?title="([^"]+)" class="name"', t, re.S)
got = []
for uid, name in dict(ups).items():
    name = html.unescape(name)
    if a.only and not re.search(a.only, name, re.I): continue
    dest = os.path.join(a.out, os.path.basename(name))
    if os.path.exists(dest) and os.path.getsize(dest) > 0: got.append(name); continue
    r = json.load(get(f'{page}/file/{uid}?source=view_game&as_props=1&after_download_lightbox=true', {'csrf_token': csrf}))
    if 'url' not in r: print('skip', name, r.get('errors')); continue
    u = r['url']
    with get(u) as s, open(dest + '.part', 'wb') as f:
        while (b := s.read(1 << 20)): f.write(b)
    os.replace(dest + '.part', dest); got.append(name); print('got', name, os.path.getsize(dest) // 1024, 'KB'); time.sleep(1)
json.dump({'page': page, 'title': title, 'files': got, 'fetched': time.strftime('%Y-%m-%d')}, open(os.path.join(a.out, 'sources.json'), 'w'), indent=1)
print(title, '->', len(got), 'files')
