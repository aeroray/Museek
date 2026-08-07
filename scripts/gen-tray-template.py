"""Generate macOS menu-bar tray template icons (black glyph, transparent bg)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons"


def draw_tray(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024.0
    # Bars after SVG transform scale(1.185185185) translate(-80 -80) in app-icon.svg
    scale = 1.185185185
    bars = [
        (220, 467, 64, 90),
        (324, 347, 64, 330),
        (428, 242, 64, 540),
        (532, 407, 64, 210),
        (636, 317, 64, 390),
        (740, 467, 64, 90),
    ]
    for x, y, w, h in bars:
        x2 = (x - 80) * scale
        y2 = (y - 80) * scale
        w2 = w * scale
        h2 = h * scale
        left = x2 * s
        top = y2 * s
        right = (x2 + w2) * s
        bottom = (y2 + h2) * s
        rx = (w2 * s) / 2
        d.rounded_rectangle([left, top, right, bottom], radius=rx, fill=(0, 0, 0, 255))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name in [(32, "tray-template.png"), (64, "tray-template@2x.png")]:
        path = OUT / name
        draw_tray(size).save(path, "PNG")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
