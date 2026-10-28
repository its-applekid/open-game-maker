"""Pack previews for the Art step popover: a Kenney sample scene when the pack has one, else its preview or icon (480 px webp)."""
import glob, sys
from PIL import Image

P, A = sys.argv[1], sys.argv[2]
for p in sys.argv[3:]:
    fs = sorted(glob.glob(f"{P}/{p}/*/extracted/**/[Ss]ample*.png", recursive=True), key=len) \
        or glob.glob(f"{P}/{p}/*/extracted/[Pp]review.png") or glob.glob(f"{P}/{p}/icon.png")
    im = Image.open(fs[0]).convert("RGB")
    if im.width < 360:  # tiny pixel samples: scale up crisply first
        k = max(1, 480 // im.width); im = im.resize((im.width * k, im.height * k), Image.NEAREST)
    im.thumbnail((480, 360), Image.LANCZOS)
    im.save(f"{A}/{p}.webp", quality=84)
