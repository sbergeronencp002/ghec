#!/usr/bin/env python3
"""Optimisation sans perte des images GHEC. Les pixels et les noms sont conservés.

JPEG : jpegtran (transformée sans réencodage DCT).
PNG : optipng (recompression sans perte).
Seuls les gains >= 3 % et >= 2 Ko sont conservés.
Les originaux restent récupérables dans l'historique Git.
"""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1] / "images"
SAVED = 0
CHANGED = []
FAILED = []
for path in sorted(ROOT.iterdir()):
    suffix = path.suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png"}:
        continue
    before = path.stat().st_size
    if before <= 0:
        continue
    with tempfile.TemporaryDirectory(prefix="ghec-opt-") as tmp:
        output = Path(tmp) / path.name
        if suffix in {".jpg", ".jpeg"}:
            cmd = ["jpegtran", "-copy", "all", "-optimize", "-progressive",
                   "-outfile", str(output), str(path)]
        else:
            cmd = ["optipng", "-quiet", "-o2", "-out", str(output), str(path)]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            if result.returncode != 0 or not output.is_file():
                FAILED.append((path.name, result.stderr[-250:]))
                continue
            after = output.stat().st_size
            if before - after >= max(2048, round(before * 0.03)):
                # Remplacement atomique : aucune image partiellement écrite.
                output.replace(path)
                SAVED += before - after
                CHANGED.append((path.name, before, after))
        except (OSError, subprocess.TimeoutExpired) as exc:
            FAILED.append((path.name, str(exc)))
print(f"Images optimisées : {len(CHANGED)}, gain total : {SAVED / 1024 / 1024:.2f} Mo")
for name, before, after in CHANGED:
    print(f"  {name}: {before // 1024} -> {after // 1024} Ko")
for name, message in FAILED:
    print(f"  ERREUR {name}: {message}")
if FAILED:
    raise SystemExit(f"{len(FAILED)} erreur(s) pendant l'optimisation ; vérifier les journaux")
