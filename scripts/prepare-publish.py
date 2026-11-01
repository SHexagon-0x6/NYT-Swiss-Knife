#!/usr/bin/env python3
"""Build the upload ZIP and its checksum."""
from pathlib import Path
import hashlib
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(ROOT / 'scripts/package.py')], check=True)
archive = ROOT / 'publish/nyt-swiss-knife-upload.zip'
archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
print('Prepared publish/nyt-swiss-knife-upload.zip and its SHA-256 checksum.')
