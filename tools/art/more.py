"""0.3.1 (owner, 2026-10-24: "paar mehr Nadelpflanzen rauf, keine Pflanzen wegnehmen, alle Steine
auf der Wiese wegnehmen"). The sheets of 0.2.0 are gone, so this works on flora.json as it is:
  python3 tools/art/more.py conifers   adds conifers in the old forest's zone, keeps every plant,
                                       drops the rock objects, writes raw/rock-mask.png (2x)
  python3 tools/art/more.py ground     takes raw/ground-norocks-2x.png (the masked edit) into
                                       public/assets/scene.png
Needs raw/old-masks.png: the first painting's masks (git show 2cbd393d^:…/masks.png)."""
import colorsys
import json
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "..", "public", "assets")
W, H = 1024, 576
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


def region(points):
    image = Image.new("L", (W, H), 0)
    ImageDraw.Draw(image).polygon(points, fill=255)
    return np.asarray(image) > 0


def greys(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(float) / 255
    hsv = np.vectorize(colorsys.rgb_to_hsv, otypes=[float, float, float])(rgb[..., 0], rgb[..., 1], rgb[..., 2])
    return (hsv[1] < 0.2) & (hsv[2] > 0.22) & (hsv[2] < 0.9)


def conifers():
    data = json.load(open(os.path.join(OUT, "flora.json")))
    sprites, placed = data["sprites"], data["placed"]
    rocks = [p for p in placed if sprites[p["sprite"]]["kind"] == "rock"]
    # The rocks' places, for the mask that paints the painted rocks out (at twice the size).
    mask = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 255))
    draw = ImageDraw.Draw(mask)
    for r in rocks:
        s = sprites[r["sprite"]]
        x0, x1 = r["x"] - s["w"] // 2 - 5, r["x"] + s["w"] // 2 + 5
        y0, y1 = r["y"] - s["h"] - 4, r["y"] + 5
        draw.rectangle([x0 * 2, y0 * 2, x1 * 2, y1 * 2], fill=(0, 0, 0, 0))
    mask.save(os.path.join(RAW, "rock-mask.png"))
    kept = [p for p in placed if sprites[p["sprite"]]["kind"] != "rock"]

    old = np.asarray(Image.open(os.path.join(RAW, "old-masks.png")).convert("RGBA"))[..., 0] > 0
    forest = ndimage.binary_opening(ndimage.binary_closing(old, iterations=6), iterations=3)
    keep_out = region(WATER) | region(FALLS) | region(COTTAGE) | region(GARDEN) | region(CAVE)
    keep_out = ndimage.binary_dilation(keep_out, iterations=6)
    keep_out |= ndimage.binary_dilation(greys(os.path.join(OUT, "scene.png")), iterations=2)
    trunks = ndimage.binary_erosion(forest & ~keep_out, iterations=30)
    ys, xs = np.mgrid[0:H, 0:W]
    trunks &= (xs - 589) ** 2 + ((ys - 566) * 0.6) ** 2 > 90 ** 2
    rng = random.Random(11)
    conifer_ids = [i for i, s in enumerate(sprites) if s["kind"] == "conifer"]
    taken = [(p["x"], p["y"]) for p in kept]
    added = 0
    for _ in range(4000):
        if added >= 45:
            break
        x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
        if not trunks[y, x]:
            continue
        if any((x - px) ** 2 + ((y - py) * 1.6) ** 2 < 15 ** 2 for px, py in taken):
            continue
        kept.append({"sprite": rng.choice(conifer_ids), "x": x, "y": y})
        taken.append((x, y))
        added += 1
    kept.sort(key=lambda p: p["y"])
    data["placed"] = kept
    json.dump(data, open(os.path.join(OUT, "flora.json"), "w"), separators=(",", ":"))
    print(len(rocks), "rocks dropped,", added, "conifers added,", len(kept), "plants now")


def ground():
    # The edit repaints more than the mask asks (the stream's rocks went too), so only the
    # masked boxes are taken from it; the rest stays the picture as it was.
    old = Image.open(os.path.join(OUT, "scene.png"))
    new = Image.open(os.path.join(RAW, "ground-norocks-2x.png")).convert("RGB").resize((W, H), Image.BOX)
    mask = Image.open(os.path.join(RAW, "rock-mask.png")).resize((W, H), Image.NEAREST).split()[3].point(lambda a: 255 - a)
    merged = old.convert("RGB")
    merged.paste(new, (0, 0), mask)
    merged.quantize(palette=old, dither=Image.Dither.NONE).save(os.path.join(OUT, "scene.png"), optimize=True)
    print("scene.png written")


WALK = [(338, 575), (312, 532), (271, 492), (230, 451), (189, 410), (169, 374), (189, 333), (220, 302),
        (287, 300), (358, 287), (379, 256), (358, 230), (317, 215), (389, 184), (436, 182), (438, 108), (468, 108), (470, 180), (512, 169), (614, 159),
        (707, 133), (758, 108), (799, 82), (896, 72), (1023, 82), (1023, 575)]
MOTES = [(461, 358), (512, 486), (768, 435), (410, 256), (640, 287)]


def rocks():
    """Rock objects set anew on the open meadow (owner: "und Steine drauf setzen"): a dozen, the
    bigger ones few, off the path, the lights, the way in and the plants."""
    data = json.load(open(os.path.join(OUT, "flora.json")))
    sprites, placed = data["sprites"], data["placed"]
    placed = [p for p in placed if sprites[p["sprite"]]["kind"] != "rock"]
    masks = np.asarray(Image.open(os.path.join(OUT, "masks.png")).convert("RGBA"))
    path = ndimage.binary_dilation(masks[..., 1] == 128, iterations=10)
    meadow = ndimage.binary_erosion(region(WALK), iterations=16) & ~path
    meadow &= ~ndimage.binary_dilation(region(COTTAGE) | region(GARDEN), iterations=14)
    ys, xs = np.mgrid[0:H, 0:W]
    meadow &= (xs - 589) ** 2 + ((ys - 566) * 0.6) ** 2 > 70 ** 2
    for mx, my in MOTES:
        meadow &= (xs - mx) ** 2 + (ys - my) ** 2 > 28 ** 2
    rock_ids = sorted([i for i, s in enumerate(sprites) if s["kind"] == "rock"], key=lambda i: -sprites[i]["w"])
    big, small = rock_ids[:6], rock_ids[6:]
    rng = random.Random(5)
    taken = [(p["x"], p["y"], 14) for p in placed]
    added = 0
    for _ in range(6000):
        if added >= 12:
            break
        x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
        if not meadow[y, x]:
            continue
        sprite = rng.choice(big if added < 4 else small)
        r = sprites[sprite]["w"] * 0.6 + 10
        if any((x - px) ** 2 + ((y - py) * 1.6) ** 2 < (r + pr) ** 2 for px, py, pr in taken):
            continue
        placed.append({"sprite": sprite, "x": x, "y": y})
        taken.append((x, y, r))
        added += 1
    placed.sort(key=lambda p: p["y"])
    data["placed"] = placed
    json.dump(data, open(os.path.join(OUT, "flora.json"), "w"), separators=(",", ":"))
    print(added, "rocks set on the meadow,", len(placed), "objects now")


if __name__ == "__main__":
    {"conifers": conifers, "ground": ground, "rocks": rocks}[sys.argv[1]]()
