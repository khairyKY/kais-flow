"""3-way token merge: July archive (A) -> Claude Design export (E) onto the app's tokens (P).
Per (context, --name): export changed it (E != A) or it is new in the export -> take E;
otherwise keep the app's value (the app's own post-July fixes). New export tokens are inserted
into the matching block. New @keyframes from the export are appended. Nothing is removed."""
import re, sys

ROOT = r'D:/Coding/kais-flow'
EXP = ROOT + '/design-export/ds/tokens/'
ARC = ROOT + '/design-export/_archive/tokens-2026-07/'
APP = ROOT + '/app/src/styles/tokens/'
FILES = ['colors', 'colors.dark', 'typography', 'spacing', 'motion', 'effects']

decl = re.compile(r'(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);')

def norm(v):
    v = re.sub(r'/\*.*?\*/', '', v, flags=re.S)
    return re.sub(r'\s+', ' ', v).strip().lower()

def parse(text):
    """-> dict[(ctx, name)] = value ; ctx is 'phone' inside a max-width:767px media block else 'root'."""
    out, ctx, depth, media_depth = {}, 'root', 0, None
    i = 0
    for line in text.splitlines():
        if re.search(r'@media\s*\(max-width:\s*767px\)', line):
            media_depth = depth
            ctx = 'phone'
        for m in decl.finditer(line):
            out[(ctx, m.group(1))] = m.group(2).strip()
        depth += line.count('{') - line.count('}')
        if media_depth is not None and depth <= media_depth:
            ctx, media_depth = 'root', None
    return out

def keyframes(text):
    names = re.findall(r'@keyframes\s+([A-Za-z0-9_-]+)', text)
    blocks = {}
    for n in names:
        m = re.search(r'@keyframes\s+' + re.escape(n) + r'\s*\{', text)
        start, depth, j = m.start(), 0, m.end() - 1
        while True:
            c = text[j]
            depth += (c == '{') - (c == '}')
            j += 1
            if depth == 0:
                break
        blocks[n] = text[start:j]
    return blocks

report = []
for f in FILES:
    E_txt = open(EXP + f + '.css', encoding='utf-8').read()
    try:
        A_txt = open(ARC + f + '.css', encoding='utf-8').read()
    except FileNotFoundError:
        A_txt = ''
    P_path = APP + f + '.css'
    P_txt = open(P_path, encoding='utf-8').read()
    E, A, P = parse(E_txt), parse(A_txt), parse(P_txt)
    new_root, new_phone = [], []
    for (ctx, name), ev in E.items():
        av, pv = A.get((ctx, name)), P.get((ctx, name))
        take_e = av is None or norm(ev) != norm(av)
        if pv is None:
            (new_phone if ctx == 'phone' else new_root).append(f'  --{name[2:]}: {ev};')
            report.append(f'{f}: ADD   [{ctx}] {name} = {ev}')
        elif take_e and norm(ev) != norm(pv):
            # replace the value in the right context (first match after/before media as appropriate)
            pat = re.compile(r'(' + re.escape(name) + r'\s*:\s*)([^;]+)(;)')
            if ctx == 'phone':
                mi = P_txt.find('@media (max-width: 767px)')
                P_txt = P_txt[:mi] + pat.sub(lambda m: m.group(1) + ev + m.group(3), P_txt[mi:], count=1)
            else:
                mi = P_txt.find('@media (max-width: 767px)')
                head, tail = (P_txt[:mi], P_txt[mi:]) if mi >= 0 else (P_txt, '')
                P_txt = pat.sub(lambda m: m.group(1) + ev + m.group(3), head, count=1) + tail
            report.append(f'{f}: SET   [{ctx}] {name}: {pv} -> {ev}')
        elif not take_e and norm(ev) != norm(pv):
            report.append(f'{f}: KEEP  [{ctx}] {name} = {pv} (app diverged; export unchanged since July)')
    if new_root:
        block = '\n  /* Added from the 2026-09-28 design-system refresh (design-export/DS-CHANGELOG.md §2). */\n' + '\n'.join(new_root) + '\n'
        # insert before the closing brace of the first top-level block (":root {" or the night selector)
        m = re.search(r'\n\}', P_txt)
        P_txt = P_txt[:m.start()] + block + P_txt[m.start():]
    if new_phone:
        body = '\n'.join('  ' + l for l in new_phone)
        if '@media (max-width: 767px)' in P_txt:
            P_txt = P_txt.rstrip('\n') + '\n\n/* Phone tokens from the 2026-09-28 design-system refresh (DS-CHANGELOG.md §1-2). */\n@media (max-width: 767px) {\n  :root {\n' + body + '\n  }\n}\n'
        else:
            P_txt = P_txt.rstrip('\n') + '\n\n/* Phone tokens from the 2026-09-28 design-system refresh (DS-CHANGELOG.md §1-2). */\n@media (max-width: 767px) {\n  :root {\n' + body + '\n  }\n}\n'
    if f == 'motion':
        ek, pk = keyframes(E_txt), keyframes(P_txt)
        add = [b for n, b in ek.items() if n not in pk]
        if add:
            P_txt = P_txt.rstrip('\n') + '\n\n/* Keyframes from the 2026-09-28 design-system refresh (sheets, toasts, skeleton, recording). */\n' + '\n'.join(add) + '\n'
            report.append(f'motion: ADD keyframes {[n for n in ek if n not in pk]}')
    if f == 'colors.dark':
        P_txt = P_txt.replace('[data-theme="night"] {', '[data-theme="night"], :root[data-theme="night"] {', 1)
        report.append('colors.dark: selector -> [data-theme="night"], :root[data-theme="night"]')
    if '--dry' not in sys.argv:
        open(P_path, 'w', encoding='utf-8', newline='\n').write(P_txt)

print('\n'.join(report))
