"""widgets-build (2026-10-26): a consistency check for the home-screen widgets when no Android SDK is at hand.

    python docs/log/assets/widgets-build/check.py

It reads app/native/android (java/, debug/, res/, widgets-manifest.xml) and fails on:
  - an XML file that isn't well-formed (aapt refuses it);
  - an R.<type>.<name> in the Java, or an @<type>/<name> in the XML, that no resource defines;
  - an R.id.<x> in the Java that no layout declares;
  - a layout-v31/ or layout-night/ variant whose ids differ from its base layout;
  - a picker entry (KfWidget.ALL) without its receiver, provider info, label, description or preview, or the reverse;
  - a resource no Java, XML or manifest uses (drawables, layouts, colours, dimens, styles) — dead weight.
The real build (gradle, CI's android job) still has the last word; this catches the slips that would break it.
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../app/native/android'))
RES = os.path.join(ROOT, 'res')
errors = []


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


java = {}
for d in ('java', 'debug/java'):
    for dp, _, fs in os.walk(os.path.join(ROOT, d)):
        for f in fs:
            if f.endswith('.java'):
                java[os.path.join(dp, f)] = read(os.path.join(dp, f))
java[os.path.join(ROOT, 'MainActivity.java')] = read(os.path.join(ROOT, 'MainActivity.java'))

# ── what res/ defines ──
defined = {t: set() for t in ('drawable', 'layout', 'color', 'dimen', 'string', 'style', 'xml', 'mipmap', 'id', 'integer', 'bool')}
xml_files = {}
ids_by_layout = {}
for dp, _, fs in os.walk(RES):
    folder = os.path.basename(dp)
    kind = folder.split('-')[0]
    for f in fs:
        name, ext = os.path.splitext(f)
        p = os.path.join(dp, f)
        if kind in ('drawable', 'layout', 'xml', 'mipmap'):
            defined[kind].add(name)
        if ext == '.xml':
            text = read(p)
            try:
                ET.fromstring(text.encode('utf-8'))  # aapt refuses what isn't well-formed (a "--" in a comment …)
            except ET.ParseError as e:
                errors.append(f'{os.path.relpath(p, ROOT)}: not well-formed XML: {e}')
            xml_files[p] = text
            if kind == 'values':
                for t, n in re.findall(r'<(color|dimen|string|style|integer|bool)\s+name="([^"]+)"', text):
                    defined[t].add(n)
            ids = set(re.findall(r'@\+id/(\w+)', text))
            defined['id'] |= ids
            if kind == 'layout':
                ids_by_layout.setdefault(name, {})[folder] = ids
# styles: KfW.Body.Square is R.style.KfW_Body_Square
style_names = {s.replace('.', '_') for s in defined['style']} | defined['style']

# ── Java references ──
for p, text in java.items():
    for t, n in re.findall(r'\bR\.(drawable|layout|color|dimen|string|style|xml|mipmap|id|integer|bool)\.(\w+)', text):
        ok = n in style_names if t == 'style' else n in defined[t]
        if not ok:
            errors.append(f'{os.path.relpath(p, ROOT)}: R.{t}.{n} is not defined')

# ── XML references ──
ANDROID_OK = {'id', 'dimen', 'color', 'drawable', 'style', 'attr', 'string'}
for p, text in xml_files.items():
    for t, n in re.findall(r'@(drawable|layout|color|dimen|string|style|xml|mipmap|integer|bool)/([\w.]+)', text):
        ok = n in style_names or n in defined['style'] if t == 'style' else n in defined[t]
        if not ok and n in ('colorPrimary', 'colorPrimaryDark', 'colorAccent'):
            continue  # the theme's colours come with the project `cap add android` generates
        if not ok:
            errors.append(f'{os.path.relpath(p, ROOT)}: @{t}/{n} is not defined')
    for n in re.findall(r'style="@style/([\w.]+)"', text):
        parts = n.split('.')
        for i in range(1, len(parts)):
            parent = '.'.join(parts[:i])
            if parent not in defined['style']:
                errors.append(f'{os.path.relpath(p, ROOT)}: style {n} has no parent {parent}')

# ── qualifier variants keep the same ids ──
for name, variants in ids_by_layout.items():
    base = variants.get('layout')
    for folder, ids in variants.items():
        if folder != 'layout' and base is not None and ids != base:
            errors.append(f'{folder}/{name}.xml ids {sorted(ids ^ base)} differ from layout/{name}.xml')
        if base is None:
            errors.append(f'{folder}/{name}.xml has no layout/{name}.xml')

# ── picker entries ↔ receivers ↔ infos ↔ strings ↔ previews ──
kf = read(os.path.join(ROOT, 'java/com/kaisflow/garden/widgets/KfWidget.java'))
classes = re.findall(r'public static class (W\d+) extends KfWidget', kf)
all_list = re.findall(r'(W\d+)\.class', kf.split('static final Class<?>[] ALL')[1].split('};')[0])
manifest = read(os.path.join(ROOT, 'widgets-manifest.xml'))
receivers = re.findall(r'KfWidget\$(W\d+)"', manifest)
if sorted(classes) != sorted(all_list):
    errors.append(f'KfWidget.ALL {sorted(set(classes) ^ set(all_list))} out of step with the classes')
if sorted(classes) != sorted(receivers):
    errors.append(f'widgets-manifest receivers {sorted(set(classes) ^ set(receivers))} out of step with KfWidget')
for w in classes:
    n = w[1:]
    for t, name in (('xml', f'kfw_w{n}'), ('string', f'kfw_label_{n}'), ('string', f'kfw_desc_{n}'), ('drawable', f'kfw_preview_w{n}')):
        if name not in defined[t]:
            errors.append(f'{w}: no {t} {name}')
    if f'android:resource="@xml/kfw_w{n}"' not in manifest:
        errors.append(f'{w}: its receiver does not point at @xml/kfw_w{n}')

# ── each builder's ids are in the layouts it draws (includes expanded) ──
layout_text = {}
for p, text in xml_files.items():
    if os.path.basename(os.path.dirname(p)).startswith('layout'):
        layout_text.setdefault(os.path.splitext(os.path.basename(p))[0], []).append(text)


def ids_of(name, seen=None):
    seen = seen or set()
    if name in seen or name not in layout_text:
        return set()
    seen.add(name)
    out = set()
    for text in layout_text[name]:
        out |= set(re.findall(r'@\+id/(\w+)', text))
        for inc in re.findall(r'<include layout="@layout/(\w+)"', text):
            out |= ids_of(inc, seen)
    return out


# a container of the caller's layout that a helper fills
PARENT = {'weekDays': {'days'}}
for p, text in java.items():
    for m in re.finditer(r'\n    (?:private )?static [\w<>\[\], ]+ (\w+)\([^)]*\) \{', text):
        depth, i = 0, m.end() - 1
        while True:
            depth += {'{': 1, '}': -1}.get(text[i], 0)
            i += 1
            if depth == 0:
                break
        body = text[m.end():i]
        layouts = set(re.findall(r'R\.layout\.(\w+)', body))
        if not layouts:
            continue
        allowed = set().union(*(ids_of(l) for l in layouts)) | PARENT.get(m.group(1), set())
        for n in sorted(set(re.findall(r'R\.id\.(\w+)', body)) - allowed):
            errors.append(f'{os.path.basename(p)} {m.group(1)}(): R.id.{n} is in none of its layouts {sorted(layouts)}')

# ── dead resources (the widgets' own: kfw_*) ──
everything = '\n'.join(java.values()) + '\n'.join(xml_files.values()) + manifest
for t in ('drawable', 'layout', 'color', 'dimen'):
    for n in sorted(defined[t]):
        if not n.startswith('kfw_') or n.startswith('kfw_preview_') or n.startswith('kfw_art_') or n.startswith('kfw_blk_'):
            continue  # previews are named by the infos, art by its snapshot key, palette C by Render.res
        if not re.search(rf'(R\.{t}\.{n}\b|@{t}/{n}\b)', everything):
            errors.append(f'unused {t} {n}')

if errors:
    print('\n'.join(errors))
    print(f'{len(errors)} problem(s)')
    sys.exit(1)
print(f'ok: {len(classes)} widgets, {len(defined["layout"])} layouts, {len(defined["drawable"])} drawables, ids and references consistent')
