#!/usr/bin/env python3
"""Rasterize assets/icon-source.svg into the PNG sizes Expo/PWA need.

Uses macOS qlmanage (QuickLook) the same way ~/Claude/app-icons/build_icons.py
does — no extra Python deps required. Run manually if the icon changes:

    python3 apps/client/assets/build_icon.py
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).parent
SVG = HERE / "icon-source.svg"

# (output filename, size, transparent background?)
TARGETS = [
    ("icon.png", 1024, False),
    ("favicon.png", 48, False),
    ("splash-icon.png", 512, False),
    ("android-icon-foreground.png", 1024, False),
    ("android-icon-background.png", 1024, False),
    ("android-icon-monochrome.png", 1024, False),
]

WEB_TARGETS = [192, 512]


def rasterize(svg_path: Path, size: int, out: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ["qlmanage", "-t", "-s", str(size), "-o", tmp, str(svg_path)],
            check=True, capture_output=True,
        )
        produced = next(Path(tmp).glob("*.png"), None)
        if produced is None:
            raise RuntimeError(f"qlmanage produced no PNG for {svg_path}")
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(produced), str(out))


def main() -> None:
    for name, size, _ in TARGETS:
        rasterize(SVG, size, HERE / name)
        print(f"wrote {name} ({size}px)")

    web_dir = HERE.parent / "web"
    for size in WEB_TARGETS:
        out = web_dir / f"icon-{size}.png"
        rasterize(SVG, size, out)
        print(f"wrote web/{out.name} ({size}px)")


if __name__ == "__main__":
    main()
