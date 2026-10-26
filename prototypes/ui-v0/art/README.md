# Icon sources (Kevin's art)

- `gm-favicon-source.png`: the GM sticker, transparent background. Favicon source.
- `gm-favicon-square.png`: the sticker centred on a 1407×1407 transparent square. `site/favicon.ico` and `site/icons/favicon-16/32.png` are made from it.
- `gm-app-icon-source.webp`: the GM tile on a paint-splatter background. Kept for mobile: `site/icons/apple-touch-icon.png` and `icon-192/512.png` (used by the web manifest) are made from it, with the corners filled `#f7e9cf`.

Regenerate with ffmpeg, e.g. `ffmpeg -i gm-favicon-square.png -vf scale=32:32:flags=lanczos site/icons/favicon-32.png`.
