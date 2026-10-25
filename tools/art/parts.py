"""Cuts the wanderer's exploded part sheets (tools/art/raw/parts-<view>.png, from OpenAI, on
magenta) into one atlas and a rig: public/assets/hero-parts.png and public/assets/hero-rig.json.

The technique: each sheet shows the figure from one side (front, side, back) pulled apart into its
pieces, each piece in its natural place. A piece is found by a seed point inside it; it is joined
back by two points from the same sheet: its joint (where it turns) and the place on its parent
where that joint sits. PROPORTION grows or shrinks a piece about its joint (the sheets draw a child
with a big head; the glade wants a smaller head on longer legs). Every piece is brought to SCALE
times the size the sprite has on screen, without a drawn rim: the game's pixel filter
(lib/puppet.ts: SCALE x SCALE blocks, each taking the palette colour that covers most of it, edges hard,
the silhouette's edge a shade darker in its own colour) makes the sprite, with soft dark edges like the
painted glade's, not black lines.

  python3 tools/art/parts.py [PREVIEW_DIR]

With PREVIEW_DIR it also writes each view put together, large and through the pixel filter.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "..", "public", "assets")

SCALE = 4
FIGURE_H = 30  # the sprite's height on screen, head to heel: below the cottage door
OUTLINE = (34, 22, 20)
PAD = 2
# Drawn lines in the sheets: darker than this (luminance) is line, not colour.
LINE = 48
# The silhouette's edge, a shade darker in its own colour (lib/puppet.ts uses the same).
EDGE = 0.55
# Grown-up proportions from the sheets' childlike ones: (across, along) about the joint.
PROPORTION = {
    "head": (0.78, 0.78),
    "legL": (1.0, 1.2), "legR": (1.0, 1.2), "legNear": (1.0, 1.2), "legFar": (1.0, 1.2),
    "armL": (1.0, 1.1), "armR": (1.0, 1.1), "armNear": (1.0, 1.1), "armFar": (1.0, 1.1),
    "flap": (1.0, 1.12),
    "lantern": (0.85, 0.85),
    "satchel": (0.72, 0.72),
}
PALETTE = 26
# Kept whatever the cut finds: the lantern's glass and glow, and the eyes.
KEEP = [(255, 236, 160), (255, 196, 80), (214, 140, 40), (70, 150, 60)]

# Per view, per piece: a seed inside it, its joint, its parent and where on the parent the joint
# sits (all in the sheet's pixels), and the order they are drawn in (low first).
RIG = {
    "front": {
        "torso": {"seed": (510, 470), "joint": (511, 590), "z": 4},
        "head": {"seed": (510, 150), "joint": (511, 280), "parent": "torso", "at": (511, 345), "z": 6},
        "armL": {"seed": (200, 500), "joint": (245, 350), "parent": "torso", "at": (380, 365), "z": 2},
        "armR": {"seed": (850, 500), "joint": (780, 350), "parent": "torso", "at": (642, 365), "z": 3},
        "legL": {"seed": (390, 800), "joint": (381, 670), "parent": "torso", "at": (452, 585), "z": 1},
        "legR": {"seed": (640, 800), "joint": (643, 670), "parent": "torso", "at": (570, 585), "z": 1},
        "lantern": {"seed": (167, 800), "joint": (167, 700), "parent": "armL", "at": (172, 645), "z": 1.5},
        "satchel": {"seed": (880, 840), "joint": (905, 760), "parent": "torso", "at": (610, 565), "z": 5},
    },
    "side": {
        "torso": {"seed": (520, 500), "joint": (505, 610), "z": 5},
        "head": {"seed": (510, 200), "joint": (515, 300), "parent": "torso", "at": (505, 365), "z": 6},
        "armNear": {"seed": (770, 500), "joint": (755, 395), "parent": "torso", "at": (553, 405), "z": 8},
        "armFar": {"seed": (935, 500), "joint": (910, 395), "parent": "torso", "at": (540, 400), "z": 0},
        "legNear": {"seed": (440, 850), "joint": (450, 700), "parent": "torso", "at": (515, 610), "z": 4},
        "legFar": {"seed": (620, 850), "joint": (620, 700), "parent": "torso", "at": (495, 605), "z": 1},
        "flap": {"seed": (180, 520), "joint": (285, 365), "parent": "torso", "at": (445, 372), "z": 3},
        "satchel": {"seed": (170, 850), "joint": (240, 770), "parent": "torso", "at": (455, 560), "z": 2},
        "lantern": {"seed": (855, 880), "joint": (855, 740), "parent": "armNear", "at": (792, 622), "z": 7},
    },
    "back": {
        "torso": {"seed": (510, 470), "joint": (511, 590), "z": 4},
        "head": {"seed": (510, 150), "joint": (512, 268), "parent": "torso", "at": (511, 340), "z": 6},
        "armL": {"seed": (200, 470), "joint": (232, 350), "parent": "torso", "at": (375, 370), "z": 2},
        "armR": {"seed": (830, 470), "joint": (790, 350), "parent": "torso", "at": (647, 370), "z": 3},
        "legL": {"seed": (390, 820), "joint": (384, 680), "parent": "torso", "at": (452, 590), "z": 0},
        "legR": {"seed": (640, 820), "joint": (640, 680), "parent": "torso", "at": (570, 590), "z": 0},
        "lantern": {"seed": (155, 800), "joint": (156, 692), "parent": "armR", "at": (850, 605), "z": 1},
        "satchel": {"seed": (860, 820), "joint": (900, 720), "parent": "torso", "at": (440, 545), "z": 5},
    },
}


def keyed(path):
    """The sheet without its magenta, and without its drawn black lines: those are filled from the
    colours beside them, so the small sprite gets its edges from the filter, as the glade has them,
    and no stray dark specks where lines met."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    tinted = (r > g + 28) & (b > g + 28)
    ground = tinted & (np.maximum(r, b) >= 120)
    solid = ~ground
    line = solid & ((0.3 * r + 0.59 * g + 0.11 * b < LINE) | tinted)
    known = solid & ~line
    kernel = np.ones((3, 3))
    for _ in range(12):
        if not line.any():
            break
        weight = ndimage.convolve(known.astype(float), kernel, mode="constant")
        sums = np.stack([ndimage.convolve(a[..., c] * known, kernel, mode="constant") for c in range(3)], -1)
        fill = line & (weight > 0)
        a[fill] = sums[fill] / weight[fill][:, None]
        known = known | fill
        line = line & ~fill
    return np.clip(a, 0, 255).astype(np.uint8), solid


def stretch(name):
    return np.array(PROPORTION.get(name, (1.0, 1.0)), float)


def assembled(view):
    """Where each piece's joint lands when the figure is put together, in the sheet's pixels: the
    root's joint stays; a child's joint goes to its place on the parent, grown with the parent."""
    pieces = RIG[view]
    spot = {}

    def place(name):
        if name in spot:
            return spot[name]
        piece = pieces[name]
        if "parent" not in piece:
            spot[name] = np.array(piece["joint"], float)
        else:
            parent = pieces[piece["parent"]]
            spot[name] = place(piece["parent"]) + (np.array(piece["at"], float) - parent["joint"]) * stretch(piece["parent"])
        return spot[name]

    for name in pieces:
        place(name)
    return spot


def cut(view):
    rgb, solid = keyed(os.path.join(RAW, f"parts-{view}.png"))
    labels, _ = ndimage.label(solid, structure=np.ones((3, 3)))
    spot = assembled(view)
    masks = {}
    top, bottom = 1e9, -1e9
    for name, piece in RIG[view].items():
        x, y = piece["seed"]
        masks[name] = labels == labels[y, x]
        ys, _ = np.nonzero(masks[name])
        joint_y = piece["joint"][1]
        sy = stretch(name)[1]
        top = min(top, spot[name][1] + (ys.min() - joint_y) * sy)
        bottom = max(bottom, spot[name][1] + (ys.max() + 1 - joint_y) * sy)
    scale = FIGURE_H * SCALE / (bottom - top)
    pieces = {}
    for name, piece in RIG[view].items():
        mask = masks[name]
        ys, xs = np.nonzero(mask)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        own = stretch(name) * scale
        rgba = np.dstack([rgb, np.where(mask, 255, 0).astype(np.uint8)])[y0:y1, x0:x1]
        w, h = max(1, round((x1 - x0) * own[0])), max(1, round((y1 - y0) * own[1]))
        # Shrink on premultiplied colour, so the magenta ground adds nothing to the edge.
        pre = rgba.astype(float)
        pre[..., :3] *= pre[..., 3:] / 255
        small = np.asarray(Image.fromarray(pre.astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)).astype(float)
        alpha = small[..., 3]
        colour = np.clip(small[..., :3] * 255 / np.maximum(alpha, 1)[..., None], 0, 255)
        canvas = np.zeros((h + 2 * PAD, w + 2 * PAD, 4), np.uint8)
        canvas[PAD:PAD + h, PAD:PAD + w, :3] = colour.astype(np.uint8)
        canvas[PAD:PAD + h, PAD:PAD + w, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
        joint = ((piece["joint"][0] - x0) * own[0] + PAD, (piece["joint"][1] - y0) * own[1] + PAD)
        pieces[name] = {"image": Image.fromarray(canvas, "RGBA"), "joint": joint, "origin": (x0, y0), "own": own}
    for name, piece in RIG[view].items():
        if "parent" in piece:
            parent = pieces[piece["parent"]]
            px0, py0 = parent["origin"]
            pieces[name]["at"] = ((piece["at"][0] - px0) * parent["own"][0] + PAD, (piece["at"][1] - py0) * parent["own"][1] + PAD)
    pieces["torso"]["hip"] = (bottom - spot["torso"][1]) * scale
    return pieces


def pack(images):
    """Shelf packing, tallest first. Returns the atlas and each image's rectangle."""
    order = sorted(images, key=lambda k: -images[k].height)
    width = 512
    x = y = shelf = 0
    rects = {}
    for key in order:
        im = images[key]
        if x + im.width > width:
            x, y, shelf = 0, y + shelf + 2, 0
        rects[key] = (x, y, im.width, im.height)
        x += im.width + 2
        shelf = max(shelf, im.height)
    atlas = Image.new("RGBA", (width, y + shelf), (0, 0, 0, 0))
    for key, (x, y, _, _) in rects.items():
        atlas.paste(images[key], (x, y))
    return atlas, rects


def palette_of(images):
    pixels = np.concatenate([np.asarray(im)[np.asarray(im)[..., 3] == 255][:, :3] for im in images])
    strip = Image.fromarray(pixels.reshape(1, -1, 3), "RGB")
    cut = strip.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    colours = np.array(cut.getpalette()[: PALETTE * 3]).reshape(-1, 3).tolist()
    for colour in KEEP:
        if list(colour) not in colours:
            colours.append(list(colour))
    # A darker shade of each, for the silhouette's edge.
    return colours + [[round(c * EDGE) for c in colour] for colour in colours]


def main(preview):
    views = {view: cut(view) for view in RIG}
    images = {f"{view}/{name}": piece["image"] for view, pieces in views.items() for name, piece in pieces.items()}
    atlas, rects = pack(images)
    rig = {"scale": SCALE, "height": FIGURE_H, "edge": EDGE, "palette": palette_of(list(images.values())), "views": {}}
    for view, pieces in views.items():
        parts = []
        for name, piece in sorted(pieces.items(), key=lambda kv: RIG[view][kv[0]]["z"]):
            entry = {"name": name, "rect": list(rects[f"{view}/{name}"]), "joint": [round(v, 2) for v in piece["joint"]], "z": RIG[view][name]["z"]}
            if "at" in piece:
                entry["parent"] = RIG[view][name]["parent"]
                entry["at"] = [round(v, 2) for v in piece["at"]]
            parts.append(entry)
        rig["views"][view] = {"hip": round(pieces["torso"]["hip"], 2), "parts": parts}
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, "hero-parts.png"), optimize=True)
    with open(os.path.join(OUT, "hero-rig.json"), "w") as f:
        json.dump(rig, f, indent=1)
    print("hero-parts.png", atlas.size, "and hero-rig.json written")
    if preview:
        os.makedirs(preview, exist_ok=True)
        for view, pieces in views.items():
            big = Image.new("RGBA", (48 * SCALE, 40 * SCALE), (0, 0, 0, 0))
            feet = (24 * SCALE, 37 * SCALE)
            spots = {}

            def where(name):
                if name in spots:
                    return spots[name]
                piece = RIG[view][name]
                if "parent" not in piece:
                    spots[name] = (feet[0], feet[1] - pieces["torso"]["hip"])
                else:
                    px, py = where(piece["parent"])
                    spots[name] = (px - pieces[piece["parent"]]["joint"][0] + pieces[name]["at"][0], py - pieces[piece["parent"]]["joint"][1] + pieces[name]["at"][1])
                return spots[name]

            for name in sorted(pieces, key=lambda n: RIG[view][n]["z"]):
                x, y = where(name)
                im = pieces[name]["image"]
                big.alpha_composite(im, (round(x - pieces[name]["joint"][0]), round(y - pieces[name]["joint"][1])))
            big.save(os.path.join(preview, f"{view}-big.png"))
            small = pixel_filter(big, rig["palette"])
            small.resize((small.width * 8, small.height * 8), Image.NEAREST).save(os.path.join(preview, f"{view}-sprite.png"))


def pixel_filter(big, palette):
    """The same filter as lib/puppet.ts, to look at: each block takes the palette colour that covers
    most of it (no mixing), is kept when half of it is covered, and the silhouette's edge is a shade
    darker."""
    pal = np.array(palette, float)
    a = np.asarray(big).astype(float)
    h, w = a.shape[0] // SCALE, a.shape[1] // SCALE
    a = a[: h * SCALE, : w * SCALE]
    index = ((a[..., None, :3] - pal[None, None]) ** 2).sum(-1).argmin(-1)
    opaque = a[..., 3] >= 128
    blocks_i = index.reshape(h, SCALE, w, SCALE).transpose(0, 2, 1, 3).reshape(h, w, -1)
    blocks_o = opaque.reshape(h, SCALE, w, SCALE).transpose(0, 2, 1, 3).reshape(h, w, -1)
    counts = np.zeros((h, w, len(pal)))
    for k in range(SCALE * SCALE):
        np.add.at(counts, (slice(None), slice(None), blocks_i[..., k]), 0)
        counts[np.arange(h)[:, None], np.arange(w)[None, :], blocks_i[..., k]] += blocks_o[..., k]
    solid = blocks_o.sum(-1) * 2 >= SCALE * SCALE
    rgb = pal[counts.argmax(-1)]
    edge = solid & ~(np.roll(solid, 1, 0) & np.roll(solid, -1, 0) & np.roll(solid, 1, 1) & np.roll(solid, -1, 1))
    darker = rgb * EDGE
    rgb[edge] = pal[((darker[edge][:, None, :] - pal[None]) ** 2).sum(-1).argmin(-1)]
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = rgb
    out[..., 3] = np.where(solid, 255, 0)
    return Image.fromarray(out, "RGBA")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
