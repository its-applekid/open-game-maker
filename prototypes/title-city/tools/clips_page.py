#!/usr/bin/env python3
"""Build a phone-friendly page of video clips to publish as an artifact (one section per clip, poster frames).

    python3 -I tools/clips_page.py <out dir> "<title>" "<one-paragraph intro>" <clip.mp4>="<heading>|<one line>" ...

Each clip is copied next to index.html with a poster taken 40% of the way in (ffmpeg). The first clip autoplays.
Publish the folder's files with the artifact publisher; re-encode smaller if the files pass the per-call limit.
"""
import html, os, shutil, subprocess, sys

out, title, intro, *clips = sys.argv[1:]
os.makedirs(out, exist_ok=True)
css = """:root{--bg:#fbf1c7;--fg:#3c3836;--mute:#7c6f64;--card:#f2e5bc;--line:#d5c4a1}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}}
:root[data-theme="dark"]{--bg:#1d2021;--fg:#ebdbb2;--mute:#a89984;--card:#282828;--line:#3c3836}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}.lede{color:var(--mute);margin:0 0 24px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 20px}h2{font-size:20px;margin:0 0 4px}p{margin:0 0 12px}
video{width:100%;aspect-ratio:16/9;border-radius:8px;display:block;background:#000}"""
parts = []
for i, spec in enumerate(clips):
    src, _, label = spec.partition('=')
    head, _, line = label.partition('|')
    name = os.path.basename(src); shutil.copy(src, os.path.join(out, name)) if os.path.abspath(src) != os.path.abspath(os.path.join(out, name)) else None
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout or 1)
    poster = os.path.splitext(name)[0] + '.jpg'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{dur * .4:.2f}', '-i', src, '-frames:v', '1', '-q:v', '3', os.path.join(out, poster)], check=True)
    parts.append(f'<section><h2>{html.escape(head)}</h2><p>{html.escape(line)}</p><video src="{name}" poster="{poster}" {"autoplay " if i == 0 else ""}muted loop playsinline controls></video></section>')
open(os.path.join(out, 'index.html'), 'w').write(f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{css}</style></head><body><main><h1>{html.escape(title)}</h1><p class="lede">{html.escape(intro)}</p>{"".join(parts)}</main></body></html>')
print(os.path.join(out, 'index.html'))
