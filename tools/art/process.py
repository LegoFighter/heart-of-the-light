"""Turns the raw pictures from OpenAI (tools/art/raw, not checked in) into the game's pixel art.

  scene.png (2048x1152)  -> public/assets/scene.png: the smoke painted out (SMOKE), halved to
                            1024x576 and cut to a palette of PALETTE colours without dithering, so
                            every pixel is a hard square.

The wanderer is cut from its part sheets by parts.py; what moves in the scene comes from masks.py.

Run with Pillow:  python3 tools/art/process.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "..", "public", "assets")

SCENE_W, SCENE_H = 1024, 576
PALETTE = 96


# Where the painted chimney smoke was: taken from scene-nosmoke.png (the same picture with the smoke
# painted out by OpenAI's edit with a mask), because the game draws its own smoke. Raw pixels.
SMOKE = [(1700, 0), (1880, 0), (1860, 120), (1810, 196), (1748, 200), (1700, 120)]


def scene():
    image = Image.open(os.path.join(RAW, "scene.png")).convert("RGB")
    clean = os.path.join(RAW, "scene-nosmoke.png")
    if os.path.exists(clean):
        mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(mask).polygon(SMOKE, fill=255)
        image.paste(Image.open(clean).convert("RGB"), (0, 0), mask.filter(ImageFilter.GaussianBlur(4)))
    small = image.resize((SCENE_W, SCENE_H), Image.BOX)
    cut = small.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    cut.save(os.path.join(OUT, "scene.png"), optimize=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    scene()
    print("scene.png written to", os.path.normpath(OUT))
