# UI pass: before | after pairs (WebP) and one overview image, from shoot.mjs output.
#   python pairs.py <beforeDir> <afterDir> <outDir> screen-size-theme ...
# Each name is a shot basename (e.g. settings-d1920-day). Pairs are scaled so a desktop pair is
# 1600 wide and a phone pair 780 wide; overview.webp stacks every pair's thumbnail with its name.
import sys, os
from PIL import Image, ImageDraw

before, after, out = sys.argv[1:4]
names = sys.argv[4:]
os.makedirs(out, exist_ok=True)
BG, INK = (42, 36, 32), (251, 246, 233)
thumbs = []
for n in names:
    b = Image.open(os.path.join(before, n + '.jpg')).convert('RGB')
    a = Image.open(os.path.join(after, n + '.jpg')).convert('RGB')
    w = 780 if '-p390-' in n else 1600
    cw = (w - 12) // 2
    def fit(im):
        return im.resize((cw, int(im.height * cw / im.width)))
    b, a = fit(b), fit(a)
    h = max(b.height, a.height) + 28
    pair = Image.new('RGB', (cw * 2 + 12, h), BG)
    d = ImageDraw.Draw(pair)
    d.text((6, 7), f'BEFORE  {n}', fill=INK)
    d.text((cw + 18, 7), 'AFTER', fill=INK)
    pair.paste(b, (0, 28))
    pair.paste(a, (cw + 12, 28))
    pair.save(os.path.join(out, f'{n}.webp'), quality=72, method=6)
    tw = 720 if '-p390-' not in n else 360
    thumbs.append(pair.resize((tw, int(pair.height * tw / pair.width))))

# overview: two columns of thumbnails, desktop pairs full width, phone pairs side by side
rows, row, rw = [], [], 0
for t in thumbs:
    if rw + t.width > 1460 and row:
        rows.append(row)
        row, rw = [], 0
    row.append(t)
    rw += t.width + 10
rows.append(row)
H = sum(max(t.height for t in r) + 10 for r in rows) + 10
ov = Image.new('RGB', (1470, H), BG)
y = 10
for r in rows:
    x = 10
    for t in r:
        ov.paste(t, (x, y))
        x += t.width + 10
    y += max(t.height for t in r) + 10
# keep the overview a sane size for a quick look
if ov.height > 16000:
    ov = ov.resize((int(ov.width * 16000 / ov.height), 16000))
ov.save(os.path.join(out, 'overview.webp'), quality=70, method=6)
print('pairs', len(thumbs), 'overview', ov.size)
