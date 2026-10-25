"""One image from OpenAI's image API (tools/art/raw is where the game's raw pictures go).

  python3 tools/art/openai.py OUT.png SIZE PROMPT_FILE [--transparent] [--ref IMG ...] [--mask MASK.png]

IMAGE_MODEL picks the model (default gpt-image-2); OPENAI_API_KEY comes from the root .env.
With --ref the picture(s) go to the edits endpoint; --mask (transparent where to paint) goes with them."""
import base64
import json
import os
import sys
import urllib.request
import uuid

out, size, prompt_file = sys.argv[1:4]
rest = sys.argv[4:]
transparent = "--transparent" in rest
refs = [rest[i + 1] for i, a in enumerate(rest) if a == "--ref"]
mask = next((rest[i + 1] for i, a in enumerate(rest) if a == "--mask"), None)
prompt = open(prompt_file, encoding="utf-8").read().strip()
key = os.environ["OPENAI_API_KEY"]
model = os.environ.get("IMAGE_MODEL", "gpt-image-2")

if refs:
    boundary = uuid.uuid4().hex
    parts = []

    def field(name, value):
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())

    field("model", model)
    field("prompt", prompt)
    field("size", size)
    field("quality", "high")
    if transparent:
        field("background", "transparent")
    for ref in refs:
        data = open(ref, "rb").read()
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"{os.path.basename(ref)}\"\r\nContent-Type: image/png\r\n\r\n".encode() + data + b"\r\n")
    if mask:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"mask\"; filename=\"mask.png\"\r\nContent-Type: image/png\r\n\r\n".encode() + open(mask, "rb").read() + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body, headers={
        "Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
else:
    payload = {"model": model, "prompt": prompt, "size": size, "quality": "high", "n": 1}
    if transparent:
        payload["background"] = "transparent"
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(payload).encode(), headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req, timeout=600) as res:
        answer = json.load(res)
except urllib.error.HTTPError as error:
    print(error.read().decode()[:1000], file=sys.stderr)
    sys.exit(1)
with open(out, "wb") as f:
    f.write(base64.b64decode(answer["data"][0]["b64_json"]))
print(out)
