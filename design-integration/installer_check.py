"""Compile the Windows installer locally - no Rust, and nothing is ever run.

Renders app/src-tauri/installer/installer.nsi the way tauri-bundler does (the small Handlebars
subset this template uses) and compiles it, with a dummy payload, using the NSIS 3.11 that
tauri-cli downloads to %LOCALAPPDATA%\\tauri\\NSIS. It proves the template and kaisflow.nsh build;
the compiled exe is deleted unopened. Never run a built installer, uninstaller or app on Kai's
machine: the real check is the desktop.yml build on GitHub's Windows runner, and page previews
come from design-integration/render_installer.mjs --previews (mockups).

  python design-integration/installer_check.py
"""
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INST = ROOT / 'app/src-tauri/installer'
NSIS = Path(os.environ['LOCALAPPDATA']) / 'tauri/NSIS'
TAG = 'tauri-cli-v2.12.0'  # app/package-lock.json's @tauri-apps/cli
UPSTREAM = f'https://raw.githubusercontent.com/tauri-apps/tauri/{TAG}/crates/tauri-bundler/src/bundle/windows/nsis'


def render(template: str, data: dict) -> str:
    """The Handlebars this template uses: {{#each}} / {{#if}} blocks (innermost first) and {{var}}."""
    def each(m):
        items = data.get(m.group(1).split()[0]) or []
        return ''.join(m.group(2).replace('{{this}}', str(i)) for i in items)
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


def main():
    if not (NSIS / 'makensis.exe').exists():
        sys.exit(f'No NSIS at {NSIS} - it appears after one `npx tauri build --bundles nsis` (or let CI build it).')
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for f in ['utils.nsh', 'FileAssociation.nsh', 'languages/English.nsh']:
            urllib.request.urlretrieve(f'{UPSTREAM}/{f}', work / Path(f).name)
        payload = work / 'kais-flow.exe'
        payload.write_bytes(b'MZ' + b'\0' * 4096)
        out = work / 'check-setup.exe'
        icon = str(ROOT / 'app/src-tauri/icons/icon.ico')
        data = dict(
            compression='lzma', installer_hooks=str(INST / 'kaisflow.nsh'), manufacturer='kaisflow',
            product_name='Kai’s Flow', version='1.0.15', version_with_build='1.0.15.0', install_mode='currentUser',
            installer_icon=icon, uninstaller_icon=icon, main_binary_name='kais-flow', main_binary_path=str(payload),
            bundle_id='com.kaisflow.garden', out_file=str(out), arch='x64',
            additional_plugins_path=str(NSIS / 'Plugins/x86-unicode/additional'), allow_downgrades='true',
            display_language_selector='false', install_webview2_mode='downloadBootstrapper',
            webview2_installer_args='/silent', estimated_size='12000',
            languages=['English'], language_files=[str(work / 'English.nsh')],
        )
        nsi = work / 'installer.nsi'
        nsi.write_text(render((INST / 'installer.nsi').read_text(encoding='utf-8'), data), encoding='utf-8-sig')
        r = subprocess.run([str(NSIS / 'makensis.exe'), '-INPUTCHARSET', 'UTF8', '-OUTPUTCHARSET', 'UTF8', '-V2', str(nsi)],
                           cwd=work, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(r.stdout[-3000:], r.stderr[-3000:])
        if r.returncode:
            sys.exit('makensis failed')
        print(f'compiles: {out.stat().st_size / 1e6:.2f} MB (deleted unopened)')


if __name__ == '__main__':
    main()
