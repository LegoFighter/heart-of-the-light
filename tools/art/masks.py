"""What moves in the glade and how: two pictures the shader (lib/stage.ts) reads beside the scene.

  public/assets/masks.png   R  leaves: how far a leaf sways (more high in a crown, less low)
                            G  grass and flowers of the meadow: 255; the path: 128
                            B  water: 255 open water, 150 foam
                            A  the falling water of the falls
  public/assets/flow.png    RG which way the water runs (128 is still): down the falls, along the
                            stream; B how far a pixel is from the stream's centre (for its foam)

The kinds come from the scene's colours inside regions traced by hand over it (in the scene's
pixels, like game/world.ts). Run after process.py:

  python3 tools/art/masks.py [CHECK.png]

CHECK.png shows the kinds over the scene: leaves red, grass green, the path yellow, water blue,
foam cyan, falls white, flow as short lines; what stays still keeps its own colours, dimmed.
"""
import colorsys
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "..", "public", "assets")
W, H = 1024, 576

# Above this line (the cliffs, the crowns on them) no field patch is looked for; a patch counts
# from this many pixels.
FIELD_TOP, FIELD_PATCH = 200, 150
# The open meadow, a little wider than where feet may go.
MEADOW = [(0, 271), (77, 246), (143, 225), (287, 195), (389, 179), (512, 169), (614, 159), (707, 133), (758, 108), (799, 82), (896, 72), (1024, 82), (1024, 576), (0, 576)]
# The cottage's yard and garden: their plants sway, their fences and barrels do not.
GARDEN = [(666, 200), (748, 246), (973, 241), (1024, 276), (1024, 317), (911, 338), (819, 328), (727, 297), (666, 246)]
# What never sways: the cottage (roof, walls, chimney, woodshed), the fallen log, the stump.
STILL = [
    [(727, 154), (742, 97), (860, 87), (901, 61), (922, 61), (922, 246), (840, 256), (737, 246)],
]
CLIFF = [(0, 0), (1024, 0), (1024, 77), (896, 67), (799, 77), (758, 102), (707, 128), (614, 154), (512, 164), (389, 174), (307, 174), (287, 195), (215, 205), (143, 220), (77, 241), (0, 266)]
FALLS = [(154, 0), (266, 0), (266, 225), (154, 225)]
POOL = [(128, 225), (205, 220), (287, 215), (358, 230), (379, 256), (358, 287), (307, 297), (220, 302), (169, 287), (128, 256)]
STREAM = [(143, 302), (215, 307), (184, 333), (164, 374), (184, 410), (225, 451), (266, 492), (307, 532), (333, 576), (271, 576), (246, 532), (205, 492), (164, 451), (123, 410), (102, 369), (118, 338)]
# The stream's middle, from the pool down to the foot of the picture.
STREAM_LINE = [(174, 297), (154, 328), (128, 358), (154, 399), (195, 440), (236, 481), (276, 517), (307, 576)]


def region(points):
    image = Image.new("L", (W, H), 0)
    ImageDraw.Draw(image).polygon(points, fill=255)
    return np.asarray(image) > 0


def main(check):
    rgb = np.asarray(Image.open(os.path.join(ASSETS, "scene.png")).convert("RGB")).astype(float) / 255
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hsv = np.vectorize(colorsys.rgb_to_hsv, otypes=[float, float, float])(r, g, b)
    hue, sat, val = hsv[0] * 360, hsv[1], hsv[2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    grey = sat < 0.2

    meadow, garden, cliff = region(MEADOW), region(GARDEN), region(CLIFF)
    still = np.zeros((H, W), bool)
    for points in STILL:
        still |= region(points)
    falls_zone, pool, stream = region(FALLS), region(POOL), region(STREAM)
    wet = pool | stream

    teal = (b > r + 0.06) & (g > r + 0.03)
    foam = (lum > 0.66) & (sat < 0.25)
    falls = falls_zone & (foam | (teal & (lum > 0.35)))
    water = wet & teal & ~foam
    foam_wet = wet & foam

    # Path: warm and pale; rocks: grey. Neither sways.
    path = (hue > 18) & (hue < 48) & (sat > 0.22) & (sat < 0.6) & (val > 0.45) & (g < r)
    # The open field goes on between and behind the trees (owner, 2026-10-24: snow lay on the meadow
    # and stopped hard at its edge): patches of the meadow's own olive green, big enough to be
    # ground and not a lit tree top, below the cliffs, are grass as well.
    olive = (hue > 42) & (hue < 88) & (sat > 0.25) & (val > 0.38)
    field = ndimage.uniform_filter(olive.astype(float), 9) > 0.5
    field &= np.mgrid[0:H, 0:W][0] >= FIELD_TOP
    labels, count = ndimage.label(field & ~meadow)
    sizes = ndimage.sum(np.ones_like(labels), labels, range(count + 1))
    field &= meadow | (sizes[labels] >= FIELD_PATCH)
    grass = (meadow | field & ~cliff & ~garden & ~wet & ~falls_zone) & ~grey & ~path & ~still
    # Leaves are green, or the vivid yellow, orange and red of autumn. Bark, wood and stone are
    # browns and greys of little colour: they stay. The darkest pixels in a crown (the shade
    # between its leaves) go with the leaves round them.
    green = (hue > 55) & (hue < 175) & (sat > 0.2)
    autumn = ((hue < 55) | (hue > 340)) & (sat > 0.5) & (val > 0.35)
    plant = green | autumn
    plant |= (val < 0.2) & (ndimage.uniform_filter(plant.astype(float), 7) > 0.6)
    leaves = ~grass & ~meadow & ~wet & ~falls_zone & ~still & plant

    # Depth in the crown: leaves above more leaves sway more than leaves at a crown's foot.
    below = np.zeros((H, W), float)
    run = np.zeros(W, float)
    for y in range(H - 1, -1, -1):
        run = np.where(leaves[y], run + 1, 0)
        below[y] = run
    sway = np.where(leaves, 0.3 + 0.7 * np.clip(below / 26, 0, 1), 0)
    sway = np.where(cliff, sway * 0.4, sway)
    sway = np.where(garden, np.minimum(sway, 0.55), sway)

    masks = np.zeros((H, W, 4), np.uint8)
    masks[..., 0] = np.round(sway * 255)
    masks[..., 1] = np.where(grass & plant | grass & ~path & ~grey & (val > 0.3), 255, np.where((meadow | field) & path & ~still, 128, 0))
    masks[..., 2] = np.where(water, 255, np.where(foam_wet, 150, 0))
    masks[..., 3] = np.where(falls, 255, 0)
    Image.fromarray(masks, "RGBA").save(os.path.join(ASSETS, "masks.png"), optimize=True)

    # Flow: down the falls; along the stream's middle line (the nearest segment's direction).
    flow = np.zeros((H, W, 2), float)
    middle = np.full((H, W), 1e9)
    ys, xs = np.mgrid[0:H, 0:W]
    for (x0, y0), (x1, y1) in zip(STREAM_LINE, STREAM_LINE[1:]):
        d = np.array((x1 - x0, y1 - y0), float)
        length = np.hypot(*d)
        t = np.clip(((xs - x0) * d[0] + (ys - y0) * d[1]) / length**2, 0, 1)
        dist = np.hypot(xs - (x0 + t * d[0]), ys - (y0 + t * d[1]))
        closer = dist < middle
        middle = np.where(closer, dist, middle)
        flow[closer] = d / length
    flow[~(stream | (pool & (ys > 270) & (xs < 200)))] = 0
    flow[falls_zone] = (0, 1)
    out = np.zeros((H, W, 4), np.uint8)
    out[..., 0] = np.round(128 + flow[..., 0] * 127)
    out[..., 1] = np.round(128 + flow[..., 1] * 127)
    out[..., 2] = np.round(np.clip(middle / 40, 0, 1) * 255)
    out[..., 3] = 255
    Image.fromarray(out, "RGBA").save(os.path.join(ASSETS, "flow.png"), optimize=True)
    print("masks.png and flow.png written:", int(leaves.sum()), "leaf,", int(grass.sum()), "grass,",
          int(water.sum()), "water,", int(foam_wet.sum()), "foam,", int(falls.sum()), "falls pixels")

    if check:
        view = (rgb * 255 * 0.45).astype(np.uint8)
        paint = {(255, 60, 40): sway > 0, (60, 230, 60): grass, (230, 220, 40): masks[..., 1] == 128, (40, 90, 255): water, (60, 240, 240): foam_wet, (255, 255, 255): falls}
        for colour, where in paint.items():
            share = (sway[..., None] if colour == (255, 60, 40) else 1) * 0.55
            view[where] = (view[where] * (1 - 0.55) + np.array(colour) * share[where] if colour == (255, 60, 40) else view[where] * 0.45 + np.array(colour) * 0.55).astype(np.uint8)
        image = Image.fromarray(view).resize((W * 2, H * 2), Image.NEAREST)
        draw = ImageDraw.Draw(image)
        for y in range(4, H, 12):
            for x in range(4, W, 12):
                fx, fy = flow[y, x]
                if fx or fy:
                    draw.line([(x * 2, y * 2), (x * 2 + fx * 14, y * 2 + fy * 14)], fill=(255, 255, 0), width=2)
        image.save(check)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
