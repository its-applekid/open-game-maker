#!/usr/bin/env python3
"""Download a public Google Drive folder (as asset creators share packs) without signing in.

    python3 -I scripts/assets/fetch_drive_folder.py <folder url or id> <out dir> [--only glTF,FBX] [--skip Blends,OBJ]

Walks the folder through Drive's embedded folder view and downloads each file with the large-file confirmation.
--only keeps just the subfolders named (files at the top level are always kept, for licence and preview files);
--skip drops subfolders by name. Files already present with a non-zero size are skipped, so a rerun resumes.
Standard library only. The output is untrusted data: never run anything from it (see gm-asset-intake).
"""
import argparse, html, os, re, sys, time, urllib.request

UA = {'User-Agent': 'Mozilla/5.0'}

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read(), r.headers
        except Exception as e:  # transient Drive errors: back off and retry
            if attempt == 3: raise
            time.sleep(2 + attempt * 3)

def listing(folder_id):
    body, _ = get(f'https://drive.google.com/embeddedfolderview?id={folder_id}')
    t = body.decode('utf-8', 'replace')
    for m in re.finditer(r'<a href="([^"]+)"[^>]*>.*?<div class="flip-entry-title">([^<]+)</div>', t, re.S):
        href, name = html.unescape(m.group(1)), html.unescape(m.group(2)).strip()
        if '/folders/' in href: yield 'dir', name, re.search(r'/folders/([\w-]+)', href).group(1)
        elif '/file/d/' in href: yield 'file', name, re.search(r'/file/d/([\w-]+)', href).group(1)

def download(file_id, path):
    url = f'https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t'
    body, headers = get(url)
    if body[:15].lstrip().lower().startswith(b'<!doctype html') or b'<html' in body[:200].lower():
        # a "can't scan for viruses" page: take the confirm form's fields and resubmit
        t = body.decode('utf-8', 'replace'); fields = dict(re.findall(r'name="(\w+)" value="([^"]*)"', t))
        if 'id' in fields:
            body, headers = get('https://drive.usercontent.google.com/download?' + '&'.join(f'{k}={v}' for k, v in fields.items()))
    if b'<html' in body[:200].lower(): raise RuntimeError(f'got a web page instead of {os.path.basename(path)}')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + '.part', 'wb') as f: f.write(body)
    os.replace(path + '.part', path)
    return len(body)

def safe(name):
    name = name.replace('/', '_').replace('\\', '_')
    if name in ('', '.', '..'): raise ValueError(f'unsafe name {name!r}')
    return name

def walk(folder_id, out, only, skip, depth=0, stats=None):
    stats = stats if stats is not None else {'files': 0, 'bytes': 0, 'skipped': 0}
    for kind, name, ident in listing(folder_id):
        p = os.path.join(out, safe(name))
        if kind == 'dir':
            if name in skip or (only and depth >= 1 and name not in only): continue
            walk(ident, p, only, skip, depth + 1, stats)
        else:
            if depth >= 1 and only and os.path.basename(out) not in only and not any(part in only for part in out.split(os.sep)): continue
            if os.path.exists(p) and os.path.getsize(p) > 0: stats['skipped'] += 1; continue
            n = download(ident, p); stats['files'] += 1; stats['bytes'] += n
            print(f'{n:>10}  {os.path.relpath(p, OUT)}', flush=True)
    return stats

if __name__ == '__main__':
    a = argparse.ArgumentParser(); a.add_argument('folder'); a.add_argument('out')
    a.add_argument('--only', default=''); a.add_argument('--skip', default='')
    o = a.parse_args()
    fid = re.search(r'/folders/([\w-]+)', o.folder).group(1) if '/folders/' in o.folder else o.folder
    OUT = os.path.abspath(o.out); os.makedirs(OUT, exist_ok=True)
    s = walk(fid, OUT, set(filter(None, o.only.split(','))), set(filter(None, o.skip.split(','))))
    print(f"done: {s['files']} files, {s['bytes'] / 1e6:.1f} MB, {s['skipped']} already present", file=sys.stderr)
