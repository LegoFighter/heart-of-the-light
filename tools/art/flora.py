"""The experiment of 2026-10-24: the glade as a ground with no plants, and the trees and bushes as
objects of their own (cut from sprite sheets on magenta), placed where the old painting had its
forest, rigged and sorted in code (lib/flora.ts).

  python3 tools/art/flora.py

Reads tools/art/exp/{ground,conifers,broadleaf,bushes}.png (2048x1152 from OpenAI, not checked in)
and the old forest's leaf mask (FOREST_MASK) and writes
  public/assets/scene.png   the ground, halved and cut to 96 colours
  public/assets/flora.png   the plants' atlas, in the ground's palette
  public/assets/flora.json  the sprites (box, foot, trunk width) and where each stands
"""
import json
import os
import random

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "exp")
OUT = os.path.join(HERE, "..", "..", "public", "assets")
# The old painting's masks: its leaf channel says where the forest stood.
FOREST_MASK = os.path.expanduser("~/privat/minigames-world/packages/heart-of-the-light/public/assets/masks.png")
W, H = 1024, 576
PALETTE = 96
SHEETS = {"conifers": "conifer", "broadleaf": "broadleaf", "bushes": "bush"}
# The painted rocks of the meadow get a rock object laid over them (tools/art/exp/rocks.png, ten
# rocks), each cut at the size of the rock it covers, so the wanderer walks behind them.
import colorsys
WALK = [(338, 575), (312, 532), (271, 492), (230, 451), (189, 410), (169, 374), (189, 333), (220, 302),
        (287, 300), (358, 287), (379, 256), (358, 230), (317, 215), (389, 184), (436, 182), (438, 108), (468, 108), (470, 180), (512, 169), (614, 159),
        (707, 133), (758, 108), (799, 82), (896, 72), (1023, 82), (1023, 575)]
# The sheets draw a tree at half the picture's height; on the ground a tree is about the
# cottage's height and a bush comes to the wanderer's shoulder.
SCALE = {"conifer": 0.5, "broadleaf": 0.5, "bush": 0.38}

# Regions of the new ground, traced over exp/ground.png at its shown size (2000 wide) and scaled.
D = 0.512


def scaled(points):
    return [(round(x * D), round(y * D)) for x, y in points]


WATER = scaled([(250, 440), (400, 430), (560, 420), (700, 450), (740, 500), (700, 560), (600, 580), (430, 590),
                (420, 600), (360, 650), (320, 730), (360, 800), (440, 880), (520, 960), (600, 1040), (650, 1125),
                (530, 1125), (480, 1040), (400, 960), (320, 880), (240, 800), (200, 720), (230, 660), (280, 590), (250, 500)])
FALLS = scaled([(300, 0), (520, 0), (520, 440), (300, 440)])
COTTAGE = scaled([(1420, 300), (1450, 190), (1680, 170), (1760, 120), (1800, 120), (1800, 480), (1640, 500), (1440, 480)])
GARDEN = scaled([(1300, 390), (1460, 480), (1900, 470), (2000, 540), (2000, 620), (1780, 660), (1600, 640), (1420, 580), (1300, 480)])
CAVE = scaled([(800, 60), (980, 60), (1000, 300), (780, 300)])


def region(points, w=W, h=H):
    image = Image.new("L", (w, h), 0)
    ImageDraw.Draw(image).polygon(points, fill=255)
    return np.asarray(image) > 0


def ground():
    image = Image.open(os.path.join(EXP, "ground.png")).convert("RGB")
    small = image.resize((W, H), Image.BOX)
    cut = small.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    cut.save(os.path.join(OUT, "scene.png"), optimize=True)
    return cut


def keyed(path, scale):
    """The sheet with magenta made transparent, halved, hard-edged."""
    rgba = np.asarray(Image.open(path).convert("RGBA")).astype(int)
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    magenta = (r + b - 2 * g) > 240
    rgba[..., 3] = np.where(magenta, 0, 255)
    full_w, full_h = rgba.shape[1], rgba.shape[0]
    image = Image.fromarray(rgba.astype(np.uint8), "RGBA").resize((round(full_w * scale / 2), round(full_h * scale / 2)), Image.BOX)
    arr = np.asarray(image).copy()
    arr[..., 3] = np.where(arr[..., 3] >= 128, 255, 0)
    return arr


def greys(cut):
    """Grey pixels of the ground (rock, stone), by colour."""
    rgb = np.asarray(cut.convert("RGB")).astype(float) / 255
    hsv = np.vectorize(colorsys.rgb_to_hsv, otypes=[float, float, float])(rgb[..., 0], rgb[..., 1], rgb[..., 2])
    return (hsv[1] < 0.2) & (hsv[2] > 0.22) & (hsv[2] < 0.9)


def rocks(cut, palette):
    """The rocks painted on the walkable meadow, each covered by a rock sprite of its size."""
    grey = greys(cut)
    inside_walk = ndimage.binary_erosion(region(WALK), iterations=8)
    inside_walk &= ~ndimage.binary_dilation(region(COTTAGE) | region(GARDEN), iterations=6)
    blobs = ndimage.binary_opening(grey & inside_walk, iterations=1)
    labels, count = ndimage.label(blobs)
    raw = np.asarray(Image.open(os.path.join(EXP, "rocks.png")).convert("RGBA")).astype(int)
    r, g, b = raw[..., 0], raw[..., 1], raw[..., 2]
    raw[..., 3] = np.where((r + b - 2 * g) > 240, 0, 255)
    sheet_labels, sheet_count = ndimage.label(raw[..., 3] > 0)
    models = []
    for i in range(1, sheet_count + 1):
        ys, xs = np.where(sheet_labels == i)
        if len(xs) < 2000:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        models.append({"box": raw[y0:y1, x0:x1], "aspect": (y1 - y0) / (x1 - x0)})
    found, placed = [], []
    rng = random.Random(3)
    for i in range(1, count + 1):
        ys, xs = np.where(labels == i)
        if len(xs) < 45:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        w, h = x1 - x0, y1 - y0
        if w < 9 or h < 6:
            continue
        aspect = h / w
        model = sorted(models, key=lambda m: abs(m["aspect"] - aspect) + rng.random() * 0.1)[0]
        target_w = int(round(w * 1.25)) + 2
        scale = target_w / model["box"].shape[1]
        image = Image.fromarray(model["box"].astype(np.uint8), "RGBA").resize((target_w, max(4, int(round(model["box"].shape[0] * scale)))), Image.BOX)
        arr = np.asarray(image).copy()
        arr[..., 3] = np.where(arr[..., 3] >= 128, 255, 0)
        rgb = Image.fromarray(arr[..., :3], "RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
        arr[..., :3] = np.asarray(rgb)
        sprite = {"kind": "rock", "w": arr.shape[1], "h": arr.shape[0], "foot": arr.shape[1] // 2, "trunk": arr.shape[1], "pixels": arr, "cy": 0, "cx": 0}
        found.append(sprite)
        placed.append({"x": int((x0 + x1) // 2), "y": int(y1 + 1), "w": w, "h": h})
    return found, placed


def sprites(kind, arr, palette):
    """Each connected plant on the sheet: its box, foot and trunk width, its pixels in the palette."""
    alpha = arr[..., 3] > 0
    joined = ndimage.binary_dilation(alpha, iterations=2)
    labels, count = ndimage.label(joined)
    found = []
    for i in range(1, count + 1):
        ys, xs = np.where((labels == i) & alpha)
        if len(xs) < 150:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        box = arr[y0:y1, x0:x1].copy()
        box[..., 3] = np.where((labels[y0:y1, x0:x1] == i) & alpha[y0:y1, x0:x1], 255, 0)
        # The foot: the middle of the lowest rows; the trunk: how wide the bottom rows are.
        bottom = box[-3:, :, 3].any(axis=0)
        cols = np.where(bottom)[0]
        foot = int(round((cols.min() + cols.max()) / 2))
        trunk = int(cols.max() - cols.min() + 1)
        rgb = Image.fromarray(box[..., :3], "RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
        box[..., :3] = np.asarray(rgb)
        found.append({"kind": kind, "w": int(x1 - x0), "h": int(y1 - y0), "foot": foot, "trunk": trunk, "pixels": box, "cy": (y0 + y1) / 2, "cx": x0})
    found.sort(key=lambda s: (round(s["cy"] / 80), s["cx"]))
    return found


def atlas(all_sprites):
    """Shelf-packed, one row per sheet kind."""
    x = y = 0
    row_h = 0
    width = 1024
    for s in all_sprites:
        if x + s["w"] > width:
            x, y, row_h = 0, y + row_h + 1, 0
        s["x"], s["y"] = x, y
        x += s["w"] + 1
        row_h = max(row_h, s["h"])
    height = y + row_h
    sheet = np.zeros((height, width, 4), np.uint8)
    for s in all_sprites:
        sheet[s["y"]:s["y"] + s["h"], s["x"]:s["x"] + s["w"]] = s["pixels"]
    Image.fromarray(sheet, "RGBA").save(os.path.join(OUT, "flora.png"), optimize=True)


def placements(all_sprites):
    """Trees where the old painting had its forest, bushes along that forest's edge."""
    old = np.asarray(Image.open(FOREST_MASK).convert("RGBA"))[..., 0] > 0
    forest = ndimage.binary_closing(old, iterations=6)
    forest = ndimage.binary_opening(forest, iterations=3)
    keep_out = region(WATER) | region(FALLS) | region(COTTAGE) | region(GARDEN) | region(CAVE)
    keep_out = ndimage.binary_dilation(keep_out, iterations=6)
    # No trunk on a rock (owner: "ein Baum auf dem Stein ist schlecht").
    keep_out |= ndimage.binary_dilation(greys(Image.open(os.path.join(OUT, "scene.png"))), iterations=2)
    forest &= ~keep_out
    # A crown is some 50 pixels wide, so a trunk stands that far inside the old forest's edge:
    # the crowns overhang the meadow as they did, the trunks do not stand on it.
    edge = forest & ~ndimage.binary_erosion(forest, iterations=16)
    trunks = ndimage.binary_erosion(forest, iterations=34)
    deep = ndimage.binary_erosion(forest, iterations=50)
    # The way in at the south stays open.
    ys_, xs_ = np.mgrid[0:H, 0:W]
    trunks &= (xs_ - 589) ** 2 + ((ys_ - 566) * 0.6) ** 2 > 90 ** 2
    edge &= (xs_ - 589) ** 2 + ((ys_ - 566) * 0.6) ** 2 > 40 ** 2
    rng = random.Random(7)
    by_kind = {k: [i for i, s in enumerate(all_sprites) if s["kind"] == k] for k in SHEETS.values()}
    placed = []
    taken = []

    def free(x, y, r):
        return all((x - px) ** 2 + ((y - py) * 1.6) ** 2 > (r + pr) ** 2 for px, py, pr in taken)

    # Bushes at the edge, in front of the trunks.
    for _ in range(400):
        x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
        if edge[y, x] and free(x, y, 14):
            placed.append({"sprite": rng.choice(by_kind["bush"]), "x": x, "y": y})
            taken.append((x, y, 14))
    # Trees on a jittered grid, denser than they are wide so the crowns overlap like a wood.
    for gy in range(-20, H + 60, 26):
        for gx in range(-20, W + 20, 34):
            x = gx + rng.randint(-10, 10)
            y = gy + rng.randint(-8, 8)
            if not (0 <= x < W and 0 <= y < H) or not trunks[y, x] or not free(x, y, 10):
                continue
            autumn = y > H - 70 or (x < 120 and y > 420) or (x > W - 120 and y > 400)
            if deep[y, x] and rng.random() < 0.55 and not autumn:
                sprite = rng.choice(by_kind["conifer"])
            else:
                choices = by_kind["broadleaf"]
                if autumn:
                    choices = [i for i in choices if all_sprites[i].get("autumn")] or choices
                else:
                    choices = [i for i in choices if not all_sprites[i].get("autumn")] or choices
                sprite = rng.choice(choices)
            placed.append({"sprite": sprite, "x": int(x), "y": int(y)})
            taken.append((x, y, 10))
    placed.sort(key=lambda p: p["y"])
    return placed


def main():
    palette = ground()
    all_sprites = []
    for sheet, kind in SHEETS.items():
        found = sprites(kind, keyed(os.path.join(EXP, f"{sheet}.png"), SCALE[kind]), palette)
        if kind == "broadleaf":
            # The sheet's bottom row is the autumn trees.
            for s in found:
                s["autumn"] = s["cy"] > H * SCALE[kind] / 2
        all_sprites.extend(found)
        print(sheet, len(found), "plants")
    rock_sprites, rock_placed = rocks(palette, palette)
    first_rock = len(all_sprites)
    all_sprites.extend(rock_sprites)
    print(len(rock_sprites), "rocks on the meadow")
    atlas(all_sprites)
    placed = placements(all_sprites)
    for i, r in enumerate(rock_placed):
        placed.append({"sprite": first_rock + i, "x": r["x"], "y": r["y"]})
    placed.sort(key=lambda p: p["y"])
    out = {
        "sprites": [{k: s[k] for k in ("kind", "x", "y", "w", "h", "foot", "trunk")} | ({"autumn": True} if s.get("autumn") else {}) for s in all_sprites],
        "placed": placed,
    }
    with open(os.path.join(OUT, "flora.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(len(placed), "plants placed; scene.png, flora.png and flora.json written")


if __name__ == "__main__":
    main()
