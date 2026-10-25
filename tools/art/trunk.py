"""The bare tree of the tree study (owner, 2026-10-25: "den Stamm generier mit OpenAI Bildern").

  venv/bin/python tools/art/trunk.py

Reads tools/art/raw/trunk.png (1024x1536 from OpenAI on magenta, prompt tools/art/exp/trunk.txt,
not checked in) and writes
  public/assets/trunk.png   the bare tree, keyed, HEIGHT pixels tall, in the glade's 96 colours
  public/assets/trunk.json  its size, its foot, the tips of its twigs (where the code grows
                            twigs and leaves on) and points along its thin branches (where
                            leaves sit directly on the picture)
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "assets")
HEIGHT = 300

raw = Image.open(os.path.join(HERE, "raw", "trunk.png")).convert("RGB")
rgb = np.asarray(raw).astype(int)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
magenta = (r + b - 2 * g) > 240
# The picture, with the magenta made transparent, boxed down to the study's size: the tree's own
# pixels averaged where they are, so the thin twigs keep a trace instead of dropping out.
alpha = (~magenta).astype(np.uint8) * 255
rgba = np.dstack([rgb.clip(0, 255).astype(np.uint8), alpha])
# Magenta bleeds into the averaged edge; paint it with the nearest tree colour first.
idx = ndimage.distance_transform_edt(magenta, return_distances=False, return_indices=True)
filled = rgb[idx[0], idx[1]]
rgba[..., :3] = np.where(magenta[..., None], filled, rgb).astype(np.uint8)
image = Image.fromarray(rgba, "RGBA")
scale = HEIGHT / image.height
small = image.resize((round(image.width * scale), HEIGHT), Image.BOX)
arr = np.asarray(small).astype(int)
a = arr[..., 3] >= 128

# The glade's 96 colours.
scene = np.asarray(Image.open(os.path.join(OUT, "scene.png")).convert("RGB")).reshape(-1, 3)
palette = np.unique(scene, axis=0).astype(int)
flat = arr[..., :3].reshape(-1, 3)
d = ((flat[:, None, :] - palette[None, :, :]) ** 2).sum(-1)
snapped = palette[d.argmin(1)].reshape(arr.shape[0], arr.shape[1], 3)
out = np.dstack([snapped.astype(np.uint8), (a * 255).astype(np.uint8)])

# Cut to the tree's box.
ys, xs = np.where(a)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
out = out[y0:y1, x0:x1]
a = a[y0:y1, x0:x1]
h, w = a.shape
Image.fromarray(out, "RGBA").save(os.path.join(OUT, "trunk.png"))

# The foot: the middle of the trunk in the bottom rows, where the roots meet.
bottom = a[h - 12:h]
foot_x = int(np.round(np.where(bottom)[1].mean()))

# The skeleton of the tree and how thick it is at each point.
skel = skeletonize(a)
thick = ndimage.distance_transform_edt(a)
ky, kx = np.where(skel)
neighbours = ndimage.convolve(skel.astype(int), np.ones((3, 3), int), mode="constant") - 1
# A tip: a skeleton end in the crown (not a root), on a thin branch.
tips = []
for y, x in zip(ky, kx):
    if neighbours[y, x] != 1 or y > h * 0.72 or thick[y, x] > 2.5:
        continue
    # Its direction: from a skeleton point some steps back along the branch.
    py, px = y, x
    seen = {(y, x)}
    for _ in range(7):
        found = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = py + dy, px + dx
                if (ny, nx) not in seen and 0 <= ny < h and 0 <= nx < w and skel[ny, nx]:
                    found = (ny, nx)
        if not found:
            break
        seen.add(found)
        py, px = found
    dx, dy = x - px, y - py
    if dx == 0 and dy == 0:
        continue
    direction = float(np.arctan2(dx, -dy))  # 0 up, positive right, as lib/tree.ts has it
    tips.append({"x": int(x), "y": int(y), "dir": round(direction, 3)})
# Points along the thin branches of the crown, a leaf's anchor each, thinned to every few pixels.
twigs = []
taken = np.zeros_like(a)
for y, x in zip(ky, kx):
    if y > h * 0.66 or thick[y, x] > 3.2 or taken[max(0, y - 2):y + 3, max(0, x - 2):x + 3].any():
        continue
    taken[y, x] = True
    twigs.append([int(x), int(y)])
data = {"w": int(w), "h": int(h), "foot": {"x": foot_x, "y": int(h - 1)}, "tips": tips, "twigs": twigs}
with open(os.path.join(OUT, "trunk.json"), "w") as f:
    json.dump(data, f, separators=(",", ":"))
print(w, h, "foot", foot_x, "tips", len(tips), "twigs", len(twigs))
