"""Resolve the Supabase *public* config (project URL + anon/publishable key) for a native build.

Order: the repo variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY if set; otherwise read them
from the live web app's own bundle, so the APK talks to exactly the backend the web app does.
Both values are public by design (they ship in every browser's copy of the app; RLS guards the
data), but the key is still never printed. Writes them to $GITHUB_ENV for the build step.
"""
import base64
import json
import os
import re
import sys
import urllib.request

app = os.environ['APP_URL'].rstrip('/')
url = os.environ.get('VARS_URL', '').strip()
key = os.environ.get('VARS_KEY', '').strip()
source = 'repo variables'


def get(path: str) -> str:
    with urllib.request.urlopen(app + path, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')


def anon_jwt(js: str) -> str:
    for token in re.findall(r'eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+', js):
        try:
            payload = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
        except Exception:
            continue
        if payload.get('role') == 'anon':
            return token
    m = re.search(r'sb_publishable_[\w-]+', js)
    return m.group(0) if m else ''


if not (url and key):
    source = f'the live web app ({app})'
    html = get('/')
    assets = set(re.findall(r'/assets/[\w.-]+\.js', html))
    try:  # the service worker's precache manifest lists every chunk
        assets |= {'/' + a for a in re.findall(r'assets/[\w.-]+\.js', get('/sw.js'))}
    except Exception:
        pass
    for path in sorted(assets):
        js = get(path)
        key = key or anon_jwt(js)
        if not url:
            m = re.search(r'https://[a-z0-9]{20}\.supabase\.co', js)
            url = m.group(0) if m else ''
        if url and key:
            break

if not (url and key):
    sys.exit('::error::Could not resolve the Supabase public config. Set the repository variables '
             'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Settings → Secrets and variables → Actions → Variables).')

with open(os.environ['GITHUB_ENV'], 'a') as env:
    env.write(f'VITE_SUPABASE_URL={url}\nVITE_SUPABASE_ANON_KEY={key}\n')
print(f'Supabase public config from {source}: {url} (key found, not printed)')
