"""Remove the browser panel's fixed 'Freebuff' badge from captured screenshots.

Only the overlay rectangle is painted with the surrounding background colour;
no page content is added, removed or altered.
"""

import glob
import os
from collections import Counter

from PIL import Image

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
BOX = (8, 8, 106, 47)  # badge area (plus the earlier pass)


def dominant(pixels):
    return Counter(pixels).most_common(1)[0][0]


for path in sorted(glob.glob(os.path.join(SHOTS, "*.png"))):
    im = Image.open(path).convert("RGB")
    x0, y0, x1, y1 = BOX
    # The rows just above the badge are always untouched page/nav background.
    ring = []
    for y in range(1, 7):
        for x in range(x0, x1):
            ring.append(im.getpixel((x, y)))
    for x in range(x1 + 3, x1 + 60):
        for y in range(y0, y1):
            ring.append(im.getpixel((x, y)))
    fill = dominant(ring)
    for x in range(x0, x1):
        for y in range(y0, y1):
            im.putpixel((x, y), fill)
    im.save(path)
    print("cleaned", os.path.basename(path), "->", fill)
