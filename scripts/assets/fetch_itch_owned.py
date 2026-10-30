#!/usr/bin/env python3
"""Download itch.io packs the creator bought, through the itch.io API (no browser, no login page).

    python3 -I scripts/assets/fetch_itch_owned.py --list
    python3 -I scripts/assets/fetch_itch_owned.py <out root> [--match REGEX] [--skip REGEX]

The API key (itch.io Settings -> API keys) is read from ~/.config/ogm/itch-api-key and never printed. Each pack goes
to <out root>/<author>-<slug>/ with sources.json (title, page, files, date). Resumable: finished files are skipped.
Downloads are untrusted data: never run anything from them.
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request

ap = argparse.ArgumentParser(); ap.add_argument('out', nargs='?'); ap.add_argument('--list', action='store_true')
ap.add_argument('--match'); ap.add_argument('--skip', default=r'godot|unity|gamemaker|rpg ?maker|\.exe$|\.apk$')
a = ap.parse_args()
KEY = open(os.path.expanduser('~/.config/ogm/itch-api-key')).read().strip()
def api(path):
    r = urllib.request.Request('https://api.itch.io' + path, headers={'Authorization': 'Bearer ' + KEY, 'User-Agent': 'ogm-fetch'})
    return json.load(urllib.request.urlopen(r, timeout=60))
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a): return None
NOREDIR = urllib.request.build_opener(_NoRedirect)
owned, page = [], 1
while True:
    d = api(f'/profile/owned-keys?page={page}')
    ks = d.get('owned_keys', [])
    if 'errors' in d: sys.exit(f'itch.io API: {d["errors"]}')
    owned += ks
    if len(ks) < d.get('per_page', 50) or not ks: break
    page += 1
for k in owned:
    g = k['game']; label = f"{g['title']}  ({g.get('url', '')})"
    if a.match and not re.search(a.match, label, re.I): continue
    if a.list or not a.out: print(label); continue
    slug = re.sub(r'[^a-z0-9]+', '-', (g.get('url', '').split('//')[-1].split('.')[0] + '-' + g.get('url', '').rstrip('/').split('/')[-1]).lower()).strip('-')
    dest = os.path.join(a.out, slug); os.makedirs(dest, exist_ok=True); got = []
    for u in api(f"/games/{g['id']}/uploads?download_key_id={k['id']}").get('uploads', []):
        name = u.get('filename') or f"{u['id']}.bin"
        if a.skip and re.search(a.skip, name, re.I): print('  skip', name); continue
        f = os.path.join(dest, os.path.basename(name))
        if not (os.path.exists(f) and os.path.getsize(f) == u.get('size', -1)):
            # the API answers with a redirect to a signed file URL, which rejects our Authorization header
            r = urllib.request.Request(f"https://api.itch.io/uploads/{u['id']}/download?download_key_id={k['id']}", headers={'Authorization': 'Bearer ' + KEY, 'User-Agent': 'ogm-fetch'})
            try: loc = NOREDIR.open(r, timeout=60).headers.get('Location')
            except urllib.error.HTTPError as e: loc = e.headers.get('Location')
            with urllib.request.urlopen(urllib.request.Request(loc, headers={'User-Agent': 'ogm-fetch'}), timeout=300) as s, open(f + '.part', 'wb') as o:
                while (b := s.read(1 << 20)): o.write(b)
            os.replace(f + '.part', f); time.sleep(1)
        got.append(name); print(f"  {g['title']}: {name} {os.path.getsize(f) // 1024} KB")
    json.dump({'title': g['title'], 'page': g.get('url'), 'files': got, 'fetched': time.strftime('%Y-%m-%d')}, open(os.path.join(dest, 'sources.json'), 'w'), indent=1)
