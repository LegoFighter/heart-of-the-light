"""Draws game/world.ts over the scene, twice the size, to check the outline against the picture.

  python3 tools/art/overlay.py OUT.png
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
Z = 2

world = json.loads(subprocess.check_output(
    ["node", "--input-type=module", "-e",
     "const w = await import(process.argv[1]); console.log(JSON.stringify(w));",
     os.path.join(ROOT, "game", "world.ts")]))
scene = Image.open(os.path.join(ROOT, "public", "assets", "scene.png")).convert("RGBA")
scene = scene.resize((scene.width * Z, scene.height * Z), Image.NEAREST)
layer = Image.new("RGBA", scene.size, (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
d.polygon([(x * Z, y * Z) for x, y in world["WALK"]], fill=(0, 160, 255, 60), outline=(0, 220, 255, 255))
for b in world["BLOCKS"]:
    d.ellipse([(b["x"] - b["rx"]) * Z, (b["y"] - b["ry"]) * Z, (b["x"] + b["rx"]) * Z, (b["y"] + b["ry"]) * Z], fill=(255, 0, 0, 110))
for x, y in world["MOTES"]:
    d.ellipse([(x - 4) * Z, (y - 4) * Z, (x + 4) * Z, (y + 4) * Z], fill=(255, 230, 80, 255))
for p in world["PLACES"]:
    d.ellipse([(p["x"] - p["r"]) * Z, (p["y"] - p["r"]) * Z, (p["x"] + p["r"]) * Z, (p["y"] + p["r"]) * Z], outline=(255, 255, 255, 220), width=2)
cave = world["CAVE"]
d.line([(cave["x"] - 30) * Z, cave["threshold"] * Z, (cave["x"] + 30) * Z, cave["threshold"] * Z], fill=(255, 120, 0, 255), width=2)
x, y = world["SPAWN"]
d.rectangle([(x - 3) * Z, (y - 3) * Z, (x + 3) * Z, (y + 3) * Z], fill=(255, 0, 255, 255))
Image.alpha_composite(scene, layer).save(sys.argv[1])
print(sys.argv[1])
