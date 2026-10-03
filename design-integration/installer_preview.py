"""See the real Windows installer pages without building Rust or touching this PC.

Renders app/src-tauri/installer/installer.nsi the way tauri-bundler does (a small Handlebars subset,
enough for this template), compiles it with the NSIS 3.11 that tauri-cli downloads to
%LOCALAPPDATA%\\tauri\\NSIS, then:

  python design-integration/installer_preview.py --check   compile the real installer (dummy
                                                            payload) to prove the template builds
  python design-integration/installer_preview.py           compile with -DKF_PREVIEW (the sections
                                                            do nothing), walk every page with the
                                                            keyboard and screenshot each window into
                                                            docs/log/assets/installer/real-*.png
  ... --dpi 144,168                                         the same, drawn as Windows would at 150%
                                                            and 175% (our pages only: the title bar
                                                            stays at this PC's scale)

KF_PREVIEW installs nothing, writes no registry, makes no shortcuts and never starts the app; its
only trace is a throwaway uninstaller in %TEMP% (deleted at the end) so the uninstall pages can be
walked too. Screenshots are taken at this PC's Windows scale.
"""
import ctypes
import ctypes.wintypes as wt
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INST = ROOT / 'app/src-tauri/installer'
SHOTS = ROOT / 'docs/log/assets/installer'
NSIS = Path(os.environ['LOCALAPPDATA']) / 'tauri/NSIS'
TAG = 'tauri-cli-v2.12.0'  # app/package-lock.json's @tauri-apps/cli
UPSTREAM = f'https://raw.githubusercontent.com/tauri-apps/tauri/{TAG}/crates/tauri-bundler/src/bundle/windows/nsis'
TITLE = 'Kai’s Flow'


def render(template: str, data: dict) -> str:
    """The Handlebars this template uses: {{#each}} / {{#if}} blocks (innermost first) and {{var}}."""
    def each(m):
        head, body = m.group(1).split(), m.group(2)
        items = data.get(head[0]) or []
        return ''.join(body.replace('{{this}}', str(i)) for i in items)
    def cond(m):
        return m.group(2) if data.get(m.group(1)) else ''
    inner = r'((?:(?!\{\{#each|\{\{#if).)*?)'
    while True:
        out = re.sub(r'\{\{#each ([^}]*?)~?\}\}' + inner + r'\{\{/each\}\}', each, template, flags=re.S)
        out = re.sub(r'\{\{#if (\w+)\}\}' + inner + r'\{\{/if\}\}', cond, out, flags=re.S)
        if out == template:
            break
        template = out
    return re.sub(r'\{\{(\w+)\}\}', lambda m: str(data.get(m.group(1), '')), template)


def build(work: Path, preview: bool, dpi: int = 0) -> Path:
    if not (NSIS / 'makensis.exe').exists():
        sys.exit(f'No NSIS at {NSIS} - run `npx tauri build --bundles nsis` once, or point NSIS at an NSIS 3.11 install.')
    for f in ['utils.nsh', 'FileAssociation.nsh', 'languages/English.nsh']:
        urllib.request.urlretrieve(f'{UPSTREAM}/{f}', work / Path(f).name)
    payload = work / 'kais-flow.exe'
    payload.write_bytes(b'MZ' + b'\0' * 4096)  # never run: --check only compiles, preview never extracts it
    out = work / ('preview-setup.exe' if preview else 'check-setup.exe')
    data = dict(
        compression='lzma', installer_hooks=str(INST / 'kaisflow.nsh'), manufacturer='kaisflow',
        product_name=TITLE, version='1.0.15', version_with_build='1.0.15.0', install_mode='currentUser',
        installer_icon=str(ROOT / 'app/src-tauri/icons/icon.ico'), uninstaller_icon=str(ROOT / 'app/src-tauri/icons/icon.ico'),
        main_binary_name='kais-flow', main_binary_path=str(payload), bundle_id='com.kaisflow.garden',
        out_file=str(out), arch='x64', additional_plugins_path=str(NSIS / 'Plugins/x86-unicode/additional'),
        allow_downgrades='true', display_language_selector='false', install_webview2_mode='downloadBootstrapper',
        webview2_installer_args='/silent', estimated_size='12000',
        languages=['English'], language_files=[str(work / 'English.nsh')],
    )
    nsi = work / 'installer.nsi'
    nsi.write_text(render((INST / 'installer.nsi').read_text(encoding='utf-8'), data), encoding='utf-8-sig')
    args = [str(NSIS / 'makensis.exe'), '-INPUTCHARSET', 'UTF8', '-OUTPUTCHARSET', 'UTF8', '-V2']
    if preview:
        args.append('-DKF_PREVIEW')
    if dpi:
        args.append(f'-DKF_PREVIEW_DPI={dpi}')
    r = subprocess.run(args + [str(nsi)], cwd=work, capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(r.stdout[-3000:], r.stderr[-3000:])
    if r.returncode:
        sys.exit('makensis failed')
    print('built', out, f'{out.stat().st_size / 1e6:.2f} MB')
    return out


# ── Driving the windows ──────────────────────────────────────────────────────────────────────────
user32, gdi32, dwmapi = ctypes.windll.user32, ctypes.windll.gdi32, ctypes.windll.dwmapi
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # per-monitor v2: physical pixels
FORCED_DPI = 0
WM_KEYDOWN, WM_KEYUP, VK_RETURN, VK_ESCAPE, BM_CLICK = 0x100, 0x101, 0x0D, 0x1B, 0x00F5


def window(timeout=15.0):
    end = time.time() + timeout
    while time.time() < end:
        h = user32.FindWindowW('#32770', TITLE)
        if h and user32.IsWindowVisible(h):
            return h
        time.sleep(0.1)
    return 0


def shot(hwnd, name):
    if user32.IsIconic(hwnd):  # someone minimised it meanwhile
        user32.ShowWindow(hwnd, 9)
    time.sleep(0.6)
    wr = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    r = wt.RECT()
    if dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r)) or r.right <= r.left:
        r = wr  # no DWM frame bounds: the whole window
    w, h = r.right - r.left, r.bottom - r.top
    ww, wh = wr.right - wr.left, wr.bottom - wr.top
    hdc = user32.GetWindowDC(hwnd)
    mdc = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, ww, wh)
    gdi32.SelectObject(mdc, bmp)
    user32.PrintWindow(hwnd, mdc, 2)  # PW_RENDERFULLCONTENT
    bi = (ctypes.c_int32 * 10)(40, ww, -wh, 1 | (32 << 16), 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(ww * wh * 4)
    gdi32.GetDIBits(mdc, bmp, 0, wh, buf, bi, 0)
    gdi32.DeleteObject(bmp); gdi32.DeleteDC(mdc); user32.ReleaseDC(hwnd, hdc)
    from PIL import Image
    img = Image.frombuffer('RGB', (ww, wh), buf, 'raw', 'BGRX', 0, 1)
    ox, oy = r.left - wr.left, r.top - wr.top
    img = img.crop((ox, oy, ox + w, oy + h))
    pct = round((FORCED_DPI or user32.GetDpiForWindow(hwnd)) * 100 / 96)
    SHOTS.mkdir(parents=True, exist_ok=True)
    path = SHOTS / f'real-{name}-{pct}.png'
    img.save(path)
    print('shot', path.name, img.size)


def key(hwnd, vk):
    tid = user32.GetWindowThreadProcessId(hwnd, None)
    class GUI(ctypes.Structure):
        _fields_ = [('cb', wt.DWORD), ('flags', wt.DWORD), ('active', wt.HWND), ('focus', wt.HWND), ('capture', wt.HWND),
                    ('menu', wt.HWND), ('move', wt.HWND), ('caret', wt.HWND), ('rc', wt.RECT)]
    g = GUI(cb=ctypes.sizeof(GUI))
    user32.GetGUIThreadInfo(tid, ctypes.byref(g))
    target = g.focus or hwnd
    user32.PostMessageW(target, WM_KEYDOWN, vk, 0)
    user32.PostMessageW(target, WM_KEYUP, vk, 0)


def child(hwnd, text):
    found = []
    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(h, _):
        buf = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(h, buf, 256)
        if buf.value == text:
            found.append(h)
        return True
    user32.EnumChildWindows(hwnd, cb, 0)
    return found[0] if found else 0


def walk(exe: Path):
    p = subprocess.Popen([str(exe)])
    h = window()
    assert h, 'installer window never appeared'
    shot(h, 'welcome')
    key(h, VK_RETURN)  # Enter = the CTA
    time.sleep(0.4)
    shot(h, 'planting')
    time.sleep(3.5)
    shot(h, 'planted')
    user32.SendMessageW(child(h, f'Open {TITLE} now'), BM_CLICK, 0, 0)
    shot(h, 'planted-off')
    key(h, VK_RETURN)
    p.wait(10)

    un = Path(tempfile.gettempdir()) / 'kf-preview-uninstall.exe'
    subprocess.Popen([str(un)])
    h = window()
    assert h, 'uninstaller window never appeared'
    shot(h, 'uproot')
    user32.SendMessageW(child(h, 'Also forget this PC’s sign-in and cache'), BM_CLICK, 0, 0)
    shot(h, 'uproot-on')
    key(h, VK_RETURN)
    time.sleep(0.4)
    shot(h, 'uprooting')
    time.sleep(3.5)
    shot(h, 'uprooted')
    key(h, VK_RETURN)
    time.sleep(1.5)
    assert not user32.IsWindow(h), 'Enter on Uprooted did not close it'

    subprocess.Popen([str(un)])  # Esc = Cancel
    h = window()
    key(h, VK_ESCAPE)
    time.sleep(1.5)
    assert not user32.IsWindow(h), 'Esc did not cancel the uninstaller'
    print('Enter walks every page; Esc cancels')
    time.sleep(1)
    un.unlink(missing_ok=True)


if __name__ == '__main__':
    if '--check' in sys.argv:
        with tempfile.TemporaryDirectory() as tmp:
            build(Path(tmp), preview=False)
        sys.exit()
    dpis = [int(d) for d in sys.argv[sys.argv.index('--dpi') + 1].split(',')] if '--dpi' in sys.argv else [0]
    for FORCED_DPI in dpis:
        tmp = Path(tempfile.mkdtemp())
        walk(build(tmp, preview=True, dpi=FORCED_DPI))
        shutil.rmtree(tmp, ignore_errors=True)
