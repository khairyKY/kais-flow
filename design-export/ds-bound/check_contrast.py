"""Contrast gate for the design system: every text token >= 4.5:1 and every non-text
token >= 3:1 on every ground, day and night (WCAG 2.x).

Run:  python check_contrast.py            (this copy's tokens)
      python check_contrast.py ../ds/tokens  (any other token folder)
Exits 1 on a failure. Only plain #rrggbb values are checked; rgba tokens are skipped.
"""
import pathlib
import re
import sys

TOKENS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent / "tokens"

GROUNDS = ["paper-linen", "paper-parchment", "paper-bone", "paper-sidebar", "paper-goal", "page-paper"]
TEXT = ["ink-body", "ink-muted", "ink-faint", "ink-hand", "acc-gold", "acc-lavender-deep",
        "acc-lavender-text", "acc-sage-text", "acc-hydrangea-deep", "acc-clover-text",
        "acc-buttercream-text", "acc-blossom-text", "acc-terra-ink", "sig-overdue"]
NON_TEXT = ["ink-hairline", "line-control", "check-border", "star-on", "star-empty"]
# Pairs colors.css documents as "never used there".
NEVER = {("acc-gold", "paper-sidebar"), ("acc-clover-text", "paper-sidebar")}


def read(*files):
    d = {}
    for f in files:
        d.update(re.findall(r"--([\w-]+):\s*([^;]+);", (TOKENS / f).read_text(encoding="utf-8")))
    return {k: v.strip() for k, v in d.items()}


def hex_of(d, name):
    v = d.get(name)
    while v and v.startswith("var("):
        v = d.get(v[6:-1])
    return v if v and re.fullmatch(r"#[0-9a-fA-F]{6}", v) else None


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


fails = 0
for theme, d in (("day", read("colors.css")), ("night", read("colors.css", "colors.dark.css"))):
    grounds = [g for g in GROUNDS if hex_of(d, g)]
    for need, group in ((4.5, TEXT), (3.0, NON_TEXT)):
        for t in group:
            fg = hex_of(d, t)
            if not fg:
                continue
            for g in grounds:
                if (t, g) in NEVER:
                    continue
                r = ratio(fg, hex_of(d, g))
                if r < need:
                    fails += 1
                    print(f"FAIL {theme}: --{t} on --{g} = {r:.2f} (needs {need})")

print("all pass" if not fails else f"{fails} failure(s)")
sys.exit(1 if fails else 0)
