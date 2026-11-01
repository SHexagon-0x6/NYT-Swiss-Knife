#!/usr/bin/env python3
"""Create a deterministic, runtime-only Chrome Web Store upload ZIP."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "LICENSE", "icons/LICENSE-lucide.txt", "manifest.json", "shared.js", "content.js", "ui.css", "games/connections-rating.js",
    "popup.html", "popup.css", "popup.js", "help.html", "help.css",
    *[f"games/{name}.js" for name in ("connections", "sudoku", "strands", "wordle", "crossword")],
    *[f"icons/games/{name}.{ext}" for name,ext in (("connections","svg"),("sudoku","svg"),("strands","png"),("wordle","png"),("crossword","svg"))],
    *[f"icons/{size}.png" for size in (16, 32, 48, 128)],
]


def main() -> None:
    subprocess.run(["node", str(ROOT / "scripts/check.cjs")], cwd=ROOT, check=True)
    version = json.loads((ROOT / "manifest.json").read_text())["version"]
    destination = ROOT / "publish" / "nyt-games-swiss-knife-upload.zip"
    destination.parent.mkdir(exist_ok=True)
    temporary = destination.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(FILES):
            source = ROOT / name
            if not source.resolve().is_relative_to(ROOT) or not source.is_file():
                raise ValueError(f"Not a regular project file: {name}")
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(temporary) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(FILES):
            raise ValueError("Package verification failed")
        if "manifest.json" not in archive.namelist():
            raise ValueError("manifest.json must be at the ZIP root")
        packaged = json.loads(archive.read("manifest.json"))
        if packaged["version"] != version or packaged["manifest_version"] != 3:
            raise ValueError("Packaged manifest is invalid")
        if any(name.endswith(".zip") or name.startswith(("/", "../")) for name in archive.namelist()):
            raise ValueError("Nested archive or unsafe path in upload package")
        for name in FILES:
            if archive.read(name) != (ROOT / name).read_bytes():
                raise ValueError(f"Package differs from current source: {name}")
    temporary.replace(destination)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    print(f"Packaged {len(FILES)} runtime files: {destination}")
    print(f"SHA-256 {digest}")
    print(f"Upload this ZIP directly. manifest.json is at the root; version {version}.")


if __name__ == "__main__":
    main()
