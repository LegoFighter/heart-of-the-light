"""The glade's trees as painted bare trunks (owner, 2026-10-25: "ersetze alle Bäume mit der neuen
Baumart, erstelle jeden Baum einen individuellen Stamm").

  venv/bin/python tools/art/trunks.py

Reads the sheets tools/art/raw/trunks/NN.png (1024x1536 from OpenAI, four bare trees each on
magenta, prompts tools/art/exp/trunks/NN.txt, not checked in) and writes
  public/assets/trunks.png   every tree keyed and boxed down to the glade's size, in its 96 colours
  public/assets/trunks.json  per tree: its box in the atlas, its foot, the trunk's width at the
                             ground, the tips of its twigs and points along its thin branches
                             (lib/tree.ts grows twigs and leaves on them)
The same as tools/art/trunk.py for the study's one big tree, for many small ones.
"""
import glob
import json
import os
import random

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "assets")
# The glade's trees stood 71..130 px tall (flora.json); the new ones about as tall, each its own.
HEIGHTS = (100, 134)

scene = np.asarray(Image.open(os.path.join(OUT, "scene.png")).convert("RGB")).reshape(-1, 3)
PALETTE = np.unique(scene, axis=0).astype(int)


def keyed(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    magenta = (r + b - 2 * g) > 240
    # Magenta bleeds into the averaged edge; paint it with the nearest tree colour first.
    idx = ndimage.distance_transform_edt(magenta, return_distances=False, return_indices=True)
    rgb = np.where(magenta[..., None], rgb[idx[0], idx[1]], rgb)
    return rgb, ~magenta


def snap(arr):
    flat = arr.reshape(-1, 3)
    out = np.empty_like(flat)
    for i in range(0, len(flat), 20000):
        chunk = flat[i:i + 20000]
        d = ((chunk[:, None, :] - PALETTE[None, :, :]) ** 2).sum(-1)
        out[i:i + 20000] = PALETTE[d.argmin(1)]
    return out.reshape(arr.shape)


def analyse(a):
    """The foot, the trunk's width, the twig tips and the twig points of a keyed small tree."""
    h, w = a.shape
    bottom = a[h - 6:h]
    cols = np.where(bottom.any(0))[0]
    foot_x = int(np.round(np.where(bottom)[1].mean()))
    # The trunk's width at the ground: the run of filled columns about the foot a little up from
    # the roots' tips.
    row = a[max(0, h - 10)]
    left = foot_x
    while left > 0 and row[left - 1]:
        left -= 1
    right = foot_x
    while right < w - 1 and row[right + 1]:
        right += 1
    trunk = right - left + 1
    skel = skeletonize(a)
    thick = ndimage.distance_transform_edt(a)
    ky, kx = np.where(skel)
    neighbours = ndimage.convolve(skel.astype(int), np.ones((3, 3), int), mode="constant") - 1
    tips = []
    for y, x in zip(ky, kx):
        if neighbours[y, x] != 1 or y > h * 0.72 or thick[y, x] > 2.5:
            continue
        py, px = y, x
        seen = {(y, x)}
        for _ in range(5):
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
        tips.append({"x": int(x), "y": int(y), "dir": round(float(np.arctan2(dx, -dy)), 3)})
    twigs = []
    taken = np.zeros_like(a)
    for y, x in zip(ky, kx):
        if y > h * 0.66 or thick[y, x] > 2.6 or taken[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any():
            continue
        taken[y, x] = True
        twigs.append([int(x), int(y)])
    return {"foot": {"x": foot_x, "y": int(h - 1)}, "trunk": int(trunk), "tips": tips, "twigs": twigs}


trees = []
rng = random.Random(7)
for path in sorted(glob.glob(os.path.join(HERE, "raw", "trunks", "*.png"))):
    rgb, mask = keyed(path)
    labels, n = ndimage.label(mask)
    boxes = ndimage.find_objects(labels)
    found = []
    for i, box in enumerate(boxes, start=1):
        if box is None:
            continue
        size = (labels[box] == i).sum()
        if size < 20000:
            continue  # a speck, not a tree
        found.append((box, i))
    # Two rows of two: order by row, then column.
    found.sort(key=lambda f: (round(f[0][0].start / 600), f[0][1].start))
    for box, i in found:
        part = rgb[box]
        alpha = (labels[box] == i)
        height = rng.randint(*HEIGHTS)
        scale = height / part.shape[0]
        width = max(1, round(part.shape[1] * scale))
        rgba = np.dstack([part.clip(0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
        small = Image.fromarray(rgba, "RGBA").resize((width, height), Image.BOX)
        arr = np.asarray(small).astype(int)
        a = arr[..., 3] >= 128
        if a.sum() < 400:
            continue
        ys, xs = np.where(a)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        colours = snap(arr[y0:y1, x0:x1, :3])
        a = a[y0:y1, x0:x1]
        out = np.dstack([colours.astype(np.uint8), (a * 255).astype(np.uint8)])
        info = analyse(a)
        info["sheet"] = os.path.basename(path)
        trees.append((out, info))
print(len(trees), "trees")

# The atlas: rows of trees, each box a pixel apart.
MAXW = 1024
x = y = rowh = 0
places = []
for out, info in trees:
    h, w = out.shape[:2]
    if x + w > MAXW:
        x = 0
        y += rowh + 1
        rowh = 0
    places.append((x, y))
    x += w + 1
    rowh = max(rowh, h)
atlas = np.zeros((y + rowh, MAXW, 4), np.uint8)
data = []
for (out, info), (px, py) in zip(trees, places):
    h, w = out.shape[:2]
    atlas[py:py + h, px:px + w] = out
    data.append({"x": px, "y": py, "w": int(w), "h": int(h), **info})
Image.fromarray(atlas, "RGBA").save(os.path.join(OUT, "trunks.png"))
with open(os.path.join(OUT, "trunks.json"), "w") as f:
    json.dump({"trees": data}, f, separators=(",", ":"))
print("atlas", atlas.shape[1], "x", atlas.shape[0])
