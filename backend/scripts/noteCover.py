#!/usr/bin/env python3
# 心签分享封面的像素级渲染器：Node 侧已完成排版（wrapText 折行），
# 本脚本按元素列表用 Pillow 绘制 1280×1024 PNG 并输出到 stdout。
# 用法: python3 noteCover.py  <  payload.json  >  cover.png
import json
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
FONT_CACHE = {}


def parse_color(c):
    c = str(c or "#000000").strip()
    if c.startswith("#"):
        h = c[1:]
        if len(h) == 6:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
        if len(h) == 8:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16))
    if c.startswith("rgba"):
        parts = [p.strip() for p in c[c.index("(") + 1 : c.rindex(")")].split(",")]
        r, g, b = (int(float(parts[0])), int(float(parts[1])), int(float(parts[2])))
        a = int(float(parts[3]) * 255) if float(parts[3]) <= 1 else int(float(parts[3]))
        return (r, g, b, a)
    if c.startswith("rgb"):
        parts = [p.strip() for p in c[c.index("(") + 1 : c.rindex(")")].split(",")]
        return (int(parts[0]), int(parts[1]), int(parts[2]), 255)
    return (0, 0, 0, 255)


def get_font(size):
    key = int(size)
    if key not in FONT_CACHE:
        FONT_CACHE[key] = ImageFont.truetype(FONT_PATH, key)
    return FONT_CACHE[key]


def main():
    payload = json.load(sys.stdin)
    w = int(payload.get("w", 1280))
    h = int(payload.get("h", 1024))
    img = Image.new("RGBA", (w, h), parse_color(payload.get("bg", "#fbfaf7")))
    draw = ImageDraw.Draw(img)

    for el in payload.get("elements", []):
        kind = el.get("t")
        if kind == "rect":
            x0, y0, x1, y1 = el["xy"]
            outline = parse_color(el.get("outline")) if el.get("outline") else None
            width = int(el.get("width", 1))
            draw.rectangle([x0, y0, x1, y1], outline=outline, width=width)
        elif kind == "circle":
            cx, cy, r = int(el["cx"]), int(el["cy"]), int(el["r"])
            outline = parse_color(el.get("outline")) if el.get("outline") else None
            width = int(el.get("width", 1))
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=outline, width=width)
        elif kind == "line":
            draw.line(
                [int(el["x1"]), int(el["y1"]), int(el["x2"]), int(el["y2"])],
                fill=parse_color(el.get("fill", "#000000")),
                width=int(el.get("width", 1)),
            )
        elif kind == "text":
            font = get_font(el.get("size", 28))
            fill = parse_color(el.get("fill", "#000000"))
            stroke = int(el.get("stroke", 0))
            draw.text(
                (int(el["x"]), int(el["y"])),
                str(el.get("text", "")),
                font=font,
                fill=fill,
                anchor=str(el.get("anchor", "la")),
                stroke_width=stroke,
                stroke_fill=fill if stroke else None,
            )
        elif kind == "textCenter":
            font = get_font(el.get("size", 28))
            fill = parse_color(el.get("fill", "#000000"))
            draw.text(
                (int(el["x"]), int(el["y"])),
                str(el.get("text", "")),
                font=font,
                fill=fill,
                anchor="mm",
            )

    img.convert("RGB").save(sys.stdout.buffer, format="PNG")


if __name__ == "__main__":
    main()
