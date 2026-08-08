"""Generate macOS menu-bar tray icons with the rounded brand mark.

light: black rounded square + white EQ bars (for light menu bars)
dark:  white rounded square + black EQ bars (matches in-app dark BrandMark)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons"

# app-icon.svg: rx=256 on 1024 canvas; bars after scale(1.185185185) translate(-80 -80)
SCALE = 1.185185185
BARS = [
    (220, 467, 64, 90),
    (324, 347, 64, 330),
    (428, 242, 64, 540),
    (532, 407, 64, 210),
    (636, 317, 64, 390),
    (740, 467, 64, 90),
]


def draw_mark(size: int, bg: tuple[int, int, int, int], fg: tuple[int, int, int, int]) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024.0
    radius = 256 * s
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)
    for x, y, w, h in BARS:
        x2 = (x - 80) * SCALE
        y2 = (y - 80) * SCALE
        w2 = w * SCALE
        h2 = h * SCALE
        left = x2 * s
        top = y2 * s
        right = (x2 + w2) * s
        bottom = (y2 + h2) * s
        rx = (w2 * s) / 2
        d.rounded_rectangle([left, top, right, bottom], radius=rx, fill=fg)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    variants = {
        "tray-light": ((0, 0, 0, 255), (255, 255, 255, 255)),
        "tray-dark": ((255, 255, 255, 255), (0, 0, 0, 255)),
    }
    for name, (bg, fg) in variants.items():
        for size, suffix in [(32, ""), (64, "@2x")]:
            path = OUT / f"{name}{suffix}.png"
            draw_mark(size, bg, fg).save(path, "PNG")
            print(f"wrote {path}")


if __name__ == "__main__":
    main()
