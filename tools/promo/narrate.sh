#!/bin/sh
# Lays the narration recorded in narrate.html under the making-of video.
#   tools/promo/narrate.sh ~/Downloads/narration.wav [tools/promo/making-of.mp4] [tools/promo/making-of-voice.mp4]
set -e
cd "$(dirname "$0")"
WAV=${1:?narration.wav}
IN=${2:-making-of.mp4}
OUT=${3:-making-of-voice.mp4}
"${FFMPEG:-/opt/homebrew/bin/ffmpeg}" -v error -y -i "$IN" -i "$WAV" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -af "loudnorm=I=-16:TP=-1.5" -shortest -movflags +faststart "$OUT"
echo "$OUT"
