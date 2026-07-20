"""Replace white background in device photos with app theme greys."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "public" / "images"
SOURCE = ROOT / "app" / "images"

DARK_BG = (0x1A, 0x1A, 0x1A)
LIGHT_BG = (0xE8, 0xEA, 0xED)
WHITE = (0xFF, 0xFF, 0xFF)
WHITE_THRESHOLD = 240
# Background white is split by connector lines; UI glyphs stay well below this size.
BACKGROUND_MIN_PIXELS = 10_000


def is_near_white(rgb: tuple[int, ...]) -> bool:
    return rgb[0] >= WHITE_THRESHOLD and rgb[1] >= WHITE_THRESHOLD and rgb[2] >= WHITE_THRESHOLD


def white_components(im: Image.Image) -> list[list[tuple[int, int]]]:
    w, h = im.size
    pixels = im.load()
    visited = bytearray(w * h)
    components: list[list[tuple[int, int]]] = []

    for sy in range(h):
        for sx in range(w):
            idx = sy * w + sx
            if visited[idx] or not is_near_white(pixels[sx, sy][:3]):
                continue

            q: deque[tuple[int, int]] = deque([(sx, sy)])
            visited[idx] = 1
            cells: list[tuple[int, int]] = []

            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not visited[nidx] and is_near_white(pixels[nx, ny][:3]):
                            visited[nidx] = 1
                            q.append((nx, ny))

            components.append(cells)

    return components


def replace_background(src_path: Path, dst_path: Path, bg_rgb: tuple[int, int, int]) -> None:
    src = Image.open(src_path)
    rgba = src.mode == "RGBA"
    im = src if rgba else src.convert("RGB")
    out = im.copy()
    src_px = im.load()
    out_px = out.load()
    w, h = im.size

    replaced = 0
    preserved = 0

    for cells in white_components(im):
        target = bg_rgb if len(cells) >= BACKGROUND_MIN_PIXELS else WHITE
        for x, y in cells:
            src_alpha = src_px[x, y][3] if rgba else 255
            if rgba:
                out_px[x, y] = (*target, src_alpha)
            else:
                out_px[x, y] = target
            if target == bg_rgb:
                replaced += 1
            else:
                preserved += 1

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst_path, optimize=True)
    print(
        f"{dst_path.name}: bg={replaced:,} px ({100 * replaced / (w * h):.1f}%), "
        f"ui white={preserved:,} px"
    )


def process_pair(name: str, ext: str) -> None:
    src = SOURCE / f"{name}.{ext}"
    if not src.exists():
        src = IMAGES / f"{name}.{ext}"
    if not src.exists():
        raise FileNotFoundError(src)

    replace_background(src, IMAGES / f"{name}.{ext}", DARK_BG)
    replace_background(src, IMAGES / f"{name}-light.{ext}", LIGHT_BG)


if __name__ == "__main__":
    process_pair("onlykey-photo", "png")
    process_pair("duo-photo", "jpg")