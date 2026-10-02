"""Render predicted lines over PDF pages for human review (S1).
Usage: python scripts/line-overlay.py <pred.json> <pdf> <pages comma-separated|all> [dpi]
Line rects are outlined (colour cycles per region); the highlight band is a faint fill.
"""
import json
import sys
from pathlib import Path

import pymupdf as fitz

COLORS = [(0.9, 0.1, 0.1), (0.1, 0.5, 0.9), (0.1, 0.65, 0.2), (0.85, 0.5, 0.0), (0.6, 0.2, 0.8), (0.0, 0.6, 0.6)]

pred = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
doc = fitz.open(sys.argv[2])
want = None if sys.argv[3] == "all" else {int(x) for x in sys.argv[3].split(",")}
dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 100
out = Path(__file__).parent.parent / "test-results" / "line-engine" / "overlays"
out.mkdir(parents=True, exist_ok=True)

for pg in pred["pages"]:
    if want and pg["page"] not in want:
        continue
    page = doc[pg["page"] - 1]
    W, H = page.rect.width, page.rect.height  # displayed (rotated) space == canonical
    shape = page.new_shape()
    for ln in pg["lines"]:
        c = COLORS[ln["r"] % len(COLORS)]
        r, b = ln["rect"], ln["band"]
        # canonical (rotated) -> unrotated page coordinates for drawing
        band = fitz.Rect(b["x"] * W, b["y"] * H, (b["x"] + b["w"]) * W, (b["y"] + b["h"]) * H) * page.derotation_matrix
        rect = fitz.Rect(r["x"] * W, r["y"] * H, (r["x"] + r["w"]) * W, (r["y"] + r["h"]) * H) * page.derotation_matrix
        shape.draw_rect(band)
        shape.finish(color=None, fill=c, fill_opacity=0.12)
        shape.draw_rect(rect)
        shape.finish(color=c, width=0.6)
        shape.insert_text(fitz.Point(rect.x0 - 1, rect.y0 + 1) if page.rotation == 0 else rect.tl, str(ln["i"]),
                          fontsize=4.5, color=c)
    shape.commit()
    name = Path(pred["fixture"]).stem
    page.get_pixmap(dpi=dpi).save(str(out / f"{name}-p{pg['page']}.png"))
    print("wrote", out / f"{name}-p{pg['page']}.png")
