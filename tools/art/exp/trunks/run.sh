#!/bin/zsh
# Draws the 14 sheets of bare trees (4 each), four at a time. Needs OPENAI_API_KEY (root .env).
cd "$(dirname "$0")/../../../.."
export IMAGE_MODEL=${IMAGE_MODEL:-gpt-image-2.5-sunburst}
for i in $(seq -w 0 13); do
  [ -s tools/art/raw/trunks/$i.png ] && continue
  python3 tools/art/openai.py tools/art/raw/trunks/$i.png 1024x1536 tools/art/exp/trunks/$i.txt --ref public/assets/scene.png > tools/art/exp/trunks/$i.log 2>&1 &
  while [ $(jobs -r | wc -l) -ge 4 ]; do sleep 5; done
done
wait
ls -la tools/art/raw/trunks
