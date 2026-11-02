#!/usr/bin/env python3
"""Prepare a stable, unpacked local build without tagging, pushing or publishing."""
import json
import base64
import hashlib
from pathlib import Path
import shutil
import subprocess
from package import FILES, ROOT

subprocess.run(['node', str(ROOT / 'scripts/check.cjs')], cwd=ROOT, check=True)
version = json.loads((ROOT / 'manifest.json').read_text())['version']
destination = ROOT / 'local-build' / ('nyt-games-swiss-knife-' + version)
destination.mkdir(parents=True, exist_ok=True)
# Remove retired runtime files when refreshing an existing unpacked build.
for existing in destination.rglob('*'):
    if existing.is_file() and existing.relative_to(destination).as_posix() not in FILES:
        existing.unlink()
for name in FILES:
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / name, target)
# A public manifest key gives local testers the same extension ID on every
# machine. It is not a credential, and is never included in the store package.
manifest_path = destination / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['key'] = (ROOT / 'scripts/local-preview-public-key.txt').read_text().strip()
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
digest = hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
extension_id = ''.join(chr(ord('a') + int(c, 16)) for c in digest)
print(f'Local build ready: {destination}')
print(f'Local preview extension ID: {extension_id}')
print('Open chrome://extensions, enable Developer mode, choose Load unpacked, and select this folder.')
print('For later changes, rerun npm run prepare:local, then click Reload in Chrome and refresh puzzle tabs.')
