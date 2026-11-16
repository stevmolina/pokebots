#!/bin/bash
# Renders <workdir>/svg/*.svg to 384px webp in <workdir>/out (2x render, downsampled with Pillow)
# and writes light and dark contact sheets to <workdir>. Needs Google Chrome and uv.
# Usage: node draw-bots.mjs <workdir>/svg && ./render.sh <workdir>
D="$(cd "${1:?usage: render.sh <workdir>}" && pwd)"; mkdir -p "$D/png" "$D/out"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in "$D"/svg/*.svg; do
  n=$(basename "$f" .svg)
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=384,384 \
    --default-background-color=00000000 --user-data-dir="$D/.chrome/$n" --screenshot="$D/png/$n.png" "file://$f" >/dev/null 2>&1 &
  while [ "$(jobs -r | wc -l)" -ge 6 ]; do sleep 0.2; done
done; wait
uv run --quiet --with pillow python - "$D" <<'PY'
import sys, glob, os
from PIL import Image
D=sys.argv[1]; names=[]
for f in sorted(glob.glob(f"{D}/png/*.png")):
    n=os.path.basename(f)[:-4]; im=Image.open(f).convert("RGBA").resize((384,384),Image.LANCZOS)
    im.save(f"{D}/out/bot-{n}.webp","WEBP",quality=90,method=6); names.append(n)
s=192; cols=6; rows=(len(names)+cols-1)//cols
for bgc,tag in (((236,236,236),"light"),((28,28,36),"dark")):
    sheet=Image.new("RGB",(cols*s,rows*s),bgc)
    for i,n in enumerate(names):
        im=Image.open(f"{D}/out/bot-{n}.webp").convert("RGBA").resize((s,s),Image.LANCZOS); sheet.paste(im,((i%cols)*s,(i//cols)*s),im)
    sheet.save(f"{D}/sheet-{tag}.png")
print(len(names))
PY
