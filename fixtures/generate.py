#!/usr/bin/env python3
"""Generate the Appendix B fixture corpus with line ground truth known by construction.

Usage:  python fixtures/generate.py [--large]
Needs:  PyMuPDF >= 1.24 (pip install pymupdf)
Writes: fixtures/pdfs/*.pdf and fixtures/pdfs/truth/*.json

Every text line is placed explicitly (baseline origin + font + size), so its text and
rectangle are known exactly. Truth rects use the text-layer box convention
(top = baseline - 0.8 * size, height = size), normalised 0..1 in the page's displayed
(intrinsically rotated) space, top-left origin -- the same canonical space as the engine.
"""
import json
import random
import sys
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).parent
OUT = ROOT / "pdfs"
TRUTH = OUT / "truth"
ASC = 0.8

WORDS = """the of and to in is that for it as was with be by on not he this are or his from at
which but have an they you were her she there would their we him been has when who will more if
no out so said what up its about into than them can only other new some could time these two may
then do first any my now such like our over man me even most made after also did many before must
through back years where much your way well down should because each just those people how too
little state good very make world still own see men work long get here between both life being under
never day same another know while last might us great old year off come since against go came right
used take three reading line page margin note colour quiet evening river window letter garden""".split()
LONG = """understanding particularly consideration development responsibility interpretation
international organization communication transformation acknowledgement characteristic
nevertheless circumstances extraordinary concentration recommendation""".split()


def tl(text, font, fs):
    return fitz.get_text_length(text, fontname=font, fontsize=fs)


class Corpus:
    def __init__(self, seed):
        self.rng = random.Random(seed)

    def sentence(self, lo=8, hi=20):
        r = self.rng
        n = r.randint(lo, hi)
        ws = [r.choice(LONG) if r.random() < 0.09 else r.choice(WORDS) for _ in range(n)]
        ws[0] = ws[0].capitalize()
        for i in range(2, n - 2):
            if r.random() < 0.06:
                ws[i] += ","
        return " ".join(ws) + r.choice([".", ".", ".", "?"])

    def paragraph(self, lo=3, hi=6):
        return " ".join(self.sentence() for _ in range(self.rng.randint(lo, hi)))


def break_lines(text, font, fs, width, first_indent=0.0, hyphenate=False):
    """Greedy line breaking -> list of (indent, [words]). Hyphenated heads end with '-'."""
    words = text.split()
    space = tl(" ", font, fs)
    out, cur, cur_w, i = [], [], 0.0, 0
    indent = first_indent
    while i < len(words):
        w = words[i]
        need = (cur_w + space if cur else 0.0) + tl(w, font, fs)
        if need <= width - indent:
            cur.append(w)
            cur_w = need
            i += 1
            continue
        if hyphenate and len(w) >= 8 and w.isalpha() and w.islower():
            for k in range(len(w) - 3, 2, -1):
                head = w[:k] + "-"
                if (cur_w + space if cur else 0.0) + tl(head, font, fs) <= width - indent:
                    cur.append(head)
                    words[i] = w[k:]
                    break
        if not cur:
            cur.append(w)
            i += 1
        out.append((indent, cur))
        cur, cur_w, indent = [], 0.0, 0.0
    if cur:
        out.append((indent, cur))
    return out


class Fixture:
    def __init__(self, name, layout, note=""):
        self.name, self.layout, self.note = name, layout, note
        self.doc = fitz.open()
        self.pages = []

    def page(self, w, h, rotate=0):
        p = self.doc.new_page(width=w, height=h)
        if rotate:
            p.set_rotation(rotate)
        self.pages.append({"page": p.number + 1, "width": p.rect.width, "height": p.rect.height,
                           "hasText": True, "lines": []})
        return p

    # -- low level -------------------------------------------------------------------------
    def put(self, page, x, base, text, font="tiro", fs=11, color=(0, 0, 0), render_mode=0, rotate_text=0):
        """Place one run with its baseline origin at displayed coords (x, base)."""
        pt = fitz.Point(x, base) * page.derotation_matrix
        page.insert_text(pt, text, fontname=font, fontsize=fs, color=color, render_mode=render_mode,
                         rotate=(page.rotation + rotate_text) % 360)

    def record(self, page, text, x0, y0, x1, y1, score=True, tag=None):
        W, H = page.rect.width, page.rect.height
        entry = {"text": text, "rect": [round(x0 / W, 5), round(y0 / H, 5), round((x1 - x0) / W, 5),
                                        round((y1 - y0) / H, 5)], "score": score}
        if tag:
            entry["tag"] = tag
        self.pages[page.number]["lines"].append(entry)

    # -- line helpers -------------------------------------------------------------------------
    def line(self, page, x, base, words, font="tiro", fs=11, width=None, justify=False, color=(0, 0, 0),
             score=True, tag=None, render_mode=0, record=True):
        lens = [tl(w, font, fs) for w in words]
        gap = tl(" ", font, fs)
        if justify and width and len(words) > 1:
            gap = (width - sum(lens)) / (len(words) - 1)
        cx = x
        for w, L in zip(words, lens):
            self.put(page, cx, base, w, font, fs, color, render_mode)
            cx += L + gap
        x1 = cx - gap
        if record:
            self.record(page, " ".join(words), x, base - ASC * fs, x1, base + (1 - ASC) * fs, score, tag)
        return x1

    def runs(self, page, x, base, runs, score=True, tag=None):
        """Mixed runs on one visual line: (text, font, fs, rise, space_before)."""
        cx, text = x, ""
        y0, y1 = float("inf"), float("-inf")
        main_fs = max(r[2] for r in runs)
        for (t, font, fs, rise, space) in runs:
            if space:
                cx += tl(" ", "tiro", main_fs)
                text += " "
            self.put(page, cx, base - rise, t, font, fs)
            y0 = min(y0, base - rise - ASC * fs)
            y1 = max(y1, base - rise + (1 - ASC) * fs)
            cx += tl(t, font, fs)
            text += t
        self.record(page, text, x, y0, cx, y1, score, tag)
        return cx

    def row(self, page, base, cells, score=True, tag=None):
        """Cells [(x, text, font, fs)] on one baseline, recorded as one truth line (tables = rows)."""
        for (x, t, font, fs) in cells:
            self.put(page, x, base, t, font, fs)
        fs = max(c[3] for c in cells)
        self.record(page, " ".join(c[1] for c in cells), min(c[0] for c in cells), base - ASC * fs,
                    max(c[0] + tl(c[1], c[2], c[3]) for c in cells), base + (1 - ASC) * fs, score, tag)

    def centered(self, page, cx, base, text, font, fs, **kw):
        w = tl(text, font, fs)
        return self.line(page, cx - w / 2, base, text.split(), font, fs, **kw)

    def flow(self, page, x, base, text, font, fs, width, lead, justify=True, indent=0.0, hyphenate=False,
             color=(0, 0, 0), **kw):
        """Set a paragraph; returns the next baseline."""
        lines = break_lines(text, font, fs, width, indent, hyphenate)
        for n, (ind, words) in enumerate(lines):
            last = n == len(lines) - 1
            self.line(page, x + ind, base, words, font, fs, width - ind, justify and not last, color, **kw)
            base += lead
        return base

    def save(self):
        OUT.mkdir(parents=True, exist_ok=True)
        TRUTH.mkdir(parents=True, exist_ok=True)
        self.doc.save(OUT / self.name, garbage=3, deflate=True)
        truth = {"fixture": self.name, "layout": self.layout, "note": self.note, "pages": self.pages}
        (TRUTH / (Path(self.name).stem + ".json")).write_text(json.dumps(truth, indent=1, ensure_ascii=False),
                                                             encoding="utf-8")
        n = sum(len(p["lines"]) for p in self.pages)
        print(f"  {self.name}: {len(self.pages)} pages, {n} truth lines")


# ---------------------------------------------------------------------------------------------
def f01_prose():
    f = Fixture("01-single-column-prose.pdf", "single", "6x9in book, justified Times 11/14.5, hyphenation")
    c = Corpus(1)
    W, H, L, R = 432, 648, 54, 54
    width, lead = W - L - R, 14.5
    paras = [c.paragraph() for _ in range(40)]
    quote_at = 9
    pi = 0
    for pno in range(6):
        p = f.page(W, H)
        if pno == 0:
            f.centered(p, W / 2, 140, "Chapter One", "tibo", 20)
            f.centered(p, W / 2, 166, "On Reading Slowly", "tiit", 13)
            base = 214
        else:
            f.centered(p, W / 2, 50, "THE LINE AND THE PAGE", "tiit", 9)
            base = 90
        carried = pno > 0
        while base < 590 and pi < len(paras):
            if pi == quote_at and base < 440:  # indented block quote, smaller type, extra space around
                base = f.flow(p, L + 24, base + 6, paras[pi], "tiro", 10, width - 48, 12.5, hyphenate=True) + 6
                pi += 1
                continue
            indent = 0 if (pno == 0 and base == 214) or carried else 18
            carried = False
            lines = break_lines(paras[pi], "tiro", 11, width, indent, True)
            room = int((590 - base) // lead) + 1
            for n, (ind, words) in enumerate(lines[:room]):
                f.line(p, L + ind, base, words, "tiro", 11, width - ind, n != len(lines) - 1)
                base += lead
            if room < len(lines):  # carry the rest of the paragraph to the next page
                # re-join hyphen heads so the carried text re-breaks cleanly
                paras[pi] = " ".join(w for _, ws in lines[room:] for w in ws).replace("- ", "")
                break
            pi += 1
        f.centered(p, W / 2, 618, str(pno + 1), "tiro", 9)
    f.save()


def two_column(name, W, H, M, gutter, fs, lead, title_fs, note):
    f = Fixture(name, "two-column", note)
    c = Corpus(2 if "ieee" in name else 3)
    colw = (W - 2 * M - gutter) / 2
    xs = [M, M + colw + gutter]
    top, bottom = 72, H - 64
    queue = []  # (kind, payload)
    for s in range(1, 7):
        queue.append(("head", f"{s}  {c.sentence(2, 4).rstrip('.?').title()}"))
        for _ in range(3):
            queue.append(("para", c.paragraph(3, 5)))
    queue.insert(5, ("figure", None))
    pno = 0
    fn_done = False
    while queue:
        p = f.page(W, H)
        y0 = top
        if pno == 0:
            b = f.centered(p, W / 2, 84, "Line-Level Reading as a First-Class Interaction", "tibo", title_fs)
            f.centered(p, W / 2, 112, "Ariz Roy and Ada Marginal", "tiro", fs + 1)
            f.centered(p, W / 2, 126, "Department of Careful Reading, Example University", "tiit", fs)
            y0 = 150
            f.line(p, M, y0, ["Abstract"], "tibo", fs)
            y0 = f.flow(p, M, y0 + lead, c.paragraph(4, 5), "tiro", fs - 1, W - 2 * M, lead - 1)
            y0 += lead
        for col in range(2):
            x, base = xs[col], y0 + fs
            limit = bottom - (40 if (pno == 0 and col == 0) else 0)
            while queue and base < limit:
                kind, payload = queue[0]
                if kind == "head":
                    if base > limit - 3 * lead:
                        break
                    base += lead * 0.6
                    f.line(p, x, base, payload.split(), "tibo", fs + 1)
                    base += lead * 1.5
                    queue.pop(0)
                elif kind == "figure":
                    if base + 150 > limit:
                        break
                    p.draw_rect(fitz.Rect(x, base - fs, x + colw, base + 110), color=(0.4, 0.4, 0.4),
                                fill=(0.85, 0.88, 0.92))
                    for k in range(8):
                        p.draw_line(fitz.Point(x + k * colw / 8, base + 110), fitz.Point(x + colw, base - fs + k * 12),
                                    color=(0.3, 0.5, 0.8), width=1.2)
                    base += 110 + lead + 4
                    base = f.flow(p, x, base, "Figure 1: " + c.sentence(14, 22), "tiro", fs - 1, colw, lead - 1)
                    base += lead * 0.5
                    queue.pop(0)
                else:
                    lines = break_lines(payload, "tiro", fs, colw, fs * 1.4, True)
                    room = max(0, int((limit - base) // lead) + 1)
                    for n, (ind, words) in enumerate(lines[:room]):
                        last = n == len(lines) - 1
                        if pno == 0 and col == 0 and not fn_done and n == 2 and not last:
                            # attach a footnote marker (superscript) to the end of this line
                            f.line(p, x + ind, base, words, "tiro", fs, colw - ind - fs * 0.5, True, record=False)
                            end = x + colw - fs * 0.5
                            f.put(p, end + 0.5, base - fs * 0.38, "1", "tiro", fs * 0.65)
                            f.record(p, " ".join(words) + "1", x + ind, base - fs * 0.38 - ASC * fs * 0.65,
                                     end + 0.5 + tl("1", "tiro", fs * 0.65), base + (1 - ASC) * fs)
                            fn_done = True
                        else:
                            f.line(p, x + ind, base, words, "tiro", fs, colw - ind, not last)
                        base += lead
                    if room < len(lines):
                        rest = [w for _, ws in lines[room:] for w in ws]
                        queue[0] = ("para", " ".join(rest).replace("- ", ""))
                        break
                    queue.pop(0)
            if pno == 0 and col == 0:
                fy = bottom - 28
                p.draw_line(fitz.Point(x, fy - 10), fitz.Point(x + 60, fy - 10), color=(0, 0, 0), width=0.4)
                f.runs(p, x, fy, [("1", "tiro", fs * 0.6, fs * 0.3, False),
                                  ("Footnote text that explains a small detail of the method.", "tiro", fs - 2, 0, True)])
                f.line(p, x, fy + lead - 2, "It wraps onto a second footnote line here.".split(), "tiro", fs - 2)
        f.centered(p, W / 2, H - 30, str(pno + 1), "tiro", 9)
        pno += 1
    f.save()


def f03_textbook():
    f = Fixture("03-textbook-sidebar-footnotes.pdf", "two-column", "main column + boxed sidebar + footnotes")
    c = Corpus(4)
    W, H = 612, 792
    mx, mw = 54, 320
    sx, sw = 400, 158
    lead = 14
    for pno in range(3):
        p = f.page(W, H)
        f.line(p, mx, 40, ["CHAPTER", "2"], "hebo", 8, score=False, tag="header")
        f.line(p, 470, 40, ["Lines", "and", "Pages"], "heit", 8, score=False, tag="header")
        sy = 120 if pno != 1 else 330
        p.draw_rect(fitz.Rect(sx - 8, sy - 18, sx + sw + 8, sy + 190), color=(0.55, 0.6, 0.7), fill=(0.93, 0.95, 0.98))
        side = c.paragraph(3, 4)
        base = 90
        if pno == 0:
            f.line(p, mx, base, ["2.1", "Lines", "and", "Pages"], "hebo", 15)
            base += 28
        marks = 0
        while base < 660:
            lines = break_lines(c.paragraph(3, 5), "tiro", 11, mw, 16, True)
            for n, (ind, words) in enumerate(lines):
                if base >= 660:
                    break
                last = n == len(lines) - 1
                if n == 1 and marks < 2 and not last:
                    marks += 1
                    end = f.line(p, mx + ind, base, words, "tiro", 11, mw - ind - 6, True, record=False)
                    f.put(p, end + 0.6, base - 4.2, str(marks), "tiro", 7)
                    f.record(p, " ".join(words) + str(marks), mx + ind, base - 4.2 - ASC * 7,
                             end + 0.6 + tl(str(marks), "tiro", 7), base + (1 - ASC) * 11)
                else:
                    f.line(p, mx + ind, base, words, "tiro", 11, mw - ind, not last)
                base += lead
            base += 4
        p.draw_line(fitz.Point(mx, 688), fitz.Point(mx + 90, 688), color=(0, 0, 0), width=0.5)
        fb = 702
        for k in range(1, marks + 1):
            f.runs(p, mx, fb, [(str(k), "tiro", 6, 3, False), (c.sentence(8, 11), "tiro", 8.5, 0, True)])
            fb += 11
        f.centered(p, W / 2, 760, str(pno + 21), "tiro", 9)
        f.line(p, sx, sy, ["Key", "Idea"], "hebo", 10)
        f.flow(p, sx, sy + 16, side, "helv", 9, sw, 11, justify=False)
    f.save()


def f04_slides():
    f = Fixture("04-slides-16x9.pdf", "other", "16:9 deck: large text, bullets, images, dark slide")
    c = Corpus(5)
    W, H = 960, 540
    # 1: dark title slide
    p = f.page(W, H)
    p.draw_rect(p.rect, fill=(0.07, 0.11, 0.22), color=None)
    f.centered(p, W / 2, 230, "Reading Lines, Not Pages", "hebo", 44, color=(1, 1, 1))
    f.centered(p, W / 2, 285, "A tour of the line engine", "helv", 24, color=(0.78, 0.82, 0.9))
    f.line(p, 40, 510, "Marginalia design review".split(), "helv", 12, color=(0.6, 0.65, 0.75))
    # 2: bullets with wrapped continuation lines
    p = f.page(W, H)
    f.line(p, 60, 90, "Why lines matter".split(), "hebo", 36)
    base = 160
    for _ in range(4):
        lines = break_lines(c.sentence(6, 16), "helv", 24, 780)
        for n, (_, words) in enumerate(lines):
            if n == 0:
                f.runs(p, 70, base, [("•", "helv", 24, 0, False)] + [(" ".join(words), "helv", 24, 0, True)])
            else:
                f.line(p, 70 + tl("• ", "helv", 24), base, words, "helv", 24)
            base += 34
        base += 12
    # 3: image-heavy
    p = f.page(W, H)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 240, 160), False)
    rng = random.Random(7)
    pix.set_rect(pix.irect, (200, 120, 60))
    for _ in range(40):
        x, y = rng.randrange(0, 220), rng.randrange(0, 140)
        pix.set_rect(fitz.IRect(x, y, x + 20, y + 20), (rng.randrange(256), rng.randrange(256), rng.randrange(256)))
    p.insert_image(fitz.Rect(500, 80, 920, 360), pixmap=pix)
    f.line(p, 500, 390, "Figure: a photograph that must not be inverted".split(), "heit", 16)
    f.line(p, 60, 90, "Images stay natural".split(), "hebo", 36)
    f.flow(p, 60, 160, c.paragraph(2, 3), "helv", 20, 400, 28, justify=False)
    # 4: two columns of bullets, coloured text
    p = f.page(W, H)
    f.line(p, 60, 90, "Trade-offs".split(), "hebo", 36)
    for col, (head, colr) in enumerate((("Pros", (0.1, 0.5, 0.2)), ("Cons", (0.7, 0.15, 0.15)))):
        x = 60 + col * 450
        f.line(p, x, 150, [head], "hebo", 26, color=colr)
        base = 200
        for _ in range(4):
            f.runs(p, x, base, [("•", "helv", 20, 0, False), (c.sentence(3, 5), "helv", 20, 0, True)])
            base += 40
    # 5: diagram labels inside boxes
    p = f.page(W, H)
    f.line(p, 60, 90, "Pipeline".split(), "hebo", 36)
    for k, label in enumerate(["PDF bytes", "Text items", "Regions", "Lines", "Anchors"]):
        r = fitz.Rect(60 + k * 175, 220, 60 + k * 175 + 140, 300)
        p.draw_rect(r, color=(0.2, 0.3, 0.6), fill=(0.9, 0.93, 1), width=1.5)
        if k:
            p.draw_line(fitz.Point(r.x0 - 35, 260), fitz.Point(r.x0, 260), color=(0.2, 0.3, 0.6), width=2)
        f.centered(p, r.x0 + 70, 266, label, "helv", 18)
    f.save()


def f05_tables():
    f = Fixture("05-tables.pdf", "other", "grid tables; truth = one line per table row (ADR 0001)")
    c = Corpus(6)
    W, H = 595, 842
    p = f.page(W, H)
    f.line(p, 56, 70, "Quarterly Reading Report".split(), "hebo", 16)
    base = f.flow(p, 56, 100, c.paragraph(2, 3), "helv", 10, W - 112, 13)
    cols = [56, 200, 290, 380, 470, 539]
    head = ["Region", "Q1", "Q2", "Q3", "Q4"]
    rng = random.Random(9)
    base += 20
    p.draw_line(fitz.Point(56, base - 14), fitz.Point(539, base - 14), color=(0, 0, 0), width=0.8)
    for r in range(13):
        cells = head if r == 0 else [rng.choice(["North", "South", "East", "West", "Central"]) + " " +
                                     rng.choice(["Coast", "Hills", "Plains", "Valley"])] + \
                                    [f"{rng.randint(100, 99999):,}" for _ in range(4)]
        font = "hebo" if r == 0 else "helv"
        f.row(p, base, [(cols[k] + 4 if k == 0 else cols[k + 1] - 6 - tl(txt, font, 10), txt, font, 10)
                        for k, txt in enumerate(cells)], tag="table")
        p.draw_line(fitz.Point(56, base + 5), fitz.Point(539, base + 5), color=(0.6, 0.6, 0.6), width=0.4)
        base += 19
    base += 30
    f.line(p, 56, base, "Table 2: Notes by reader".split(), "hebo", 11)
    base += 24
    for r in range(6):
        name = rng.choice(["Ada", "Ravi", "Mei", "Olu", "Ines"])
        lines = break_lines(c.sentence(10, 16), "helv", 10, 300)
        f.row(p, base, [(60, name, "helv", 10), (160, " ".join(lines[0][1]), "helv", 10),
                        (490, str(rng.randint(1, 400)), "helv", 10)], tag="table")
        b2 = base + 13
        for _, words in lines[1:]:
            f.line(p, 160, b2, words, "helv", 10, tag="table")
            b2 += 13
        base = b2 + 8
        p.draw_line(fitz.Point(56, base - 10), fitz.Point(539, base - 10), color=(0.7, 0.7, 0.7), width=0.4)
    f.save()


def f06_math():
    f = Fixture("06-math.pdf", "single", "inline super/subscripts, numbered display equations, a fraction")
    c = Corpus(8)
    W, H = 595, 842
    L, width, lead = 72, 451, 15
    for pno in range(2):
        p = f.page(W, H)
        base = 80
        eq = 1
        while base < 760:
            base = f.flow(p, L, base, c.paragraph(2, 3), "tiro", 11, width, lead, indent=16)
            if base > 740:
                break
            # inline math line: "where x2 + yi2 = r2 holds for every ak in the set"
            f.runs(p, L, base, [("where", "tiro", 11, 0, False), ("x", "tiit", 11, 0, True), ("2", "tiro", 7.5, 4, False),
                                ("+", "tiro", 11, 0, True), ("y", "tiit", 11, 0, True), ("i", "tiit", 7.5, -2.5, False),
                                ("2", "tiro", 7.5, 4, False), ("=", "tiro", 11, 0, True), ("r", "tiit", 11, 0, True),
                                ("2", "tiro", 7.5, 4, False), ("holds", "tiro", 11, 0, True), ("for", "tiro", 11, 0, True),
                                ("every", "tiro", 11, 0, True), ("a", "tiit", 11, 0, True), ("k", "tiit", 7.5, -2.5, False),
                                ("in", "tiro", 11, 0, True), ("the", "tiro", 11, 0, True), ("set.", "tiro", 11, 0, True)])
            base += lead + 10
            # display equation centred with a right-aligned number: one visual row
            runs = [("E", "tiit", 12, 0, False), ("=", "tiro", 12, 0, True), ("m", "tiit", 12, 0, True),
                    ("c", "tiit", 12, 0, False), ("2", "tiro", 8, 5, False), ("+", "tiro", 12, 0, True),
                    ("p", "tiit", 12, 0, True), ("n", "tiit", 8, -3, False)]
            wsum = sum(tl(t, fo, s) + (tl(" ", "tiro", 12) if sp else 0) for t, fo, s, _, sp in runs)
            x = W / 2 - wsum / 2
            cx = x
            for (t, fo, s, rise, sp) in runs:
                if sp:
                    cx += tl(" ", "tiro", 12)
                f.put(p, cx, base - rise, t, fo, s)
                cx += tl(t, fo, s)
            num = f"({pno * 10 + eq})"
            nx = L + width - tl(num, "tiro", 11)
            f.put(p, nx, base, num, "tiro", 11)
            f.record(p, "E = mc2 + pn " + num, x, base - 5 - ASC * 8, nx + tl(num, "tiro", 11), base + 3 + (1 - ASC) * 8)
            eq += 1
            base += lead + 12
            if eq == 2:  # display fraction: numerator / bar / denominator (best-effort, unscored)
                f.line(p, W / 2 - 20, base - 7, ["a", "+", "b"], "tiit", 10, score=False, tag="fraction")
                p.draw_line(fitz.Point(W / 2 - 24, base - 2), fitz.Point(W / 2 + 24, base - 2), color=(0, 0, 0), width=0.5)
                f.line(p, W / 2 - 8, base + 9, ["2c"], "tiit", 10, score=False, tag="fraction")
                base += lead + 18
    f.save()


def f07_code():
    f = Fixture("07-code.pdf", "single", "monospace listings, indentation, line numbers")
    W, H = 595, 842
    code = '''export function buildPageLines(page, items, size, cfg = {}) {
  const c = { ...LINE_ENGINE_CONFIG, ...cfg };
  const geo = items.filter((it) => it.str.trim() !== "");
  if (geo.length === 0) {
    return { engineVersion: ENGINE_VERSION, page, lines: [], text: "", hasTextLayer: false };
  }

  // Regions: recursive XY-cut, vertical cuts first so columns keep their reading order.
  const leaves = xyCut(geo, medianFontSize(geo), c);
  const lines = [];
  for (const [region, leaf] of leaves.entries()) {
    for (const group of groupByBaseline(leaf, c)) {
      lines.push(makeLine(page, region, group, c));
    }
  }
  return finish(page, lines, c);
}'''.split("\n")
    for pno in range(2):
        p = f.page(W, H)
        f.line(p, 56, 70, f"Listing {pno + 1}: the engine entry point".split(), "hebo", 11)
        p.draw_rect(fitz.Rect(50, 84, W - 50, 84 + 12 * len(code) + 12), color=None, fill=(0.95, 0.95, 0.95))
        base = 100
        for n, src in enumerate(code):
            stripped = src.lstrip(" ")
            indent = (len(src) - len(stripped)) * tl(" ", "cour", 9)
            num = f"{n + 1:>2}"
            if pno == 1:  # numbered listing: number + code are one visual row
                f.put(p, 56, base, num, "cour", 8, color=(0.5, 0.5, 0.5))
                if stripped:
                    f.put(p, 80 + indent, base, stripped, "cour", 9)
                    f.record(p, num.strip() + " " + stripped, 56 + tl(" " if n < 9 else "", "cour", 8),
                             base - ASC * 9, 80 + indent + tl(stripped, "cour", 9), base + (1 - ASC) * 9)
                else:
                    f.record(p, num.strip(), 56 + tl(" " if n < 9 else "", "cour", 8), base - ASC * 8,
                             56 + tl(num, "cour", 8), base + (1 - ASC) * 8)
            elif stripped:
                f.put(p, 60 + indent, base, stripped, "cour", 9)
                f.record(p, stripped, 60 + indent, base - ASC * 9, 60 + indent + tl(stripped, "cour", 9),
                         base + (1 - ASC) * 9)
            base += 12
        Corpus(10 + pno)
        f.flow(p, 56, base + 30, Corpus(11 + pno).paragraph(3, 4), "tiro", 11, W - 112, 14)
    f.save()


def render_page_image(src_pdf, pno, dpi=110):
    d = fitz.open(src_pdf)
    pix = d[pno].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    rect = d[pno].rect
    d.close()
    return pix, rect


def f08_scanned():
    f = Fixture("08-scanned-no-text.pdf", "scanned", "image-only pages: expect hasTextLayer=false")
    for pno in range(2):
        pix, rect = render_page_image(OUT / "01-single-column-prose.pdf", pno)
        p = f.page(rect.width, rect.height)
        p.insert_image(p.rect, pixmap=pix)
        f.pages[-1]["hasText"] = False
    f.save()


def f09_ocr():
    f = Fixture("09-scanned-hidden-ocr.pdf", "single", "page image + invisible OCR text offset by (+1.5, -1) pt")
    src = json.loads((TRUTH / "01-single-column-prose.json").read_text(encoding="utf-8"))
    pix, rect = render_page_image(OUT / "01-single-column-prose.pdf", 2)
    p = f.page(rect.width, rect.height)
    p.insert_image(p.rect, pixmap=pix)
    W, H = rect.width, rect.height
    for ln in src["pages"][2]["lines"]:
        x, y, w, h = ln["rect"]
        fs = h * H * 0.97
        base = y * H + ASC * h * H - 1.0
        f.line(p, x * W + 1.5, base, ln["text"].split(), "helv", fs, render_mode=3)
    f.save()


def f10_rotated():
    f = Fixture("10-rotated-mixed.pdf", "single", "/Rotate 90/180/270 with upright text + a vertical margin stamp")
    c = Corpus(12)
    for rot in (90, 0, 180, 270):
        p = f.page(612, 792, rotate=rot)
        W = p.rect.width
        f.line(p, 72, 80, f"Page displayed with rotation {rot}".split(), "hebo", 16)
        base = 120
        for _ in range(3):
            base = f.flow(p, 72, base, c.paragraph(2, 3), "tiro", 11, W - 144, 14, indent=14) + 6
        if rot == 0:  # arXiv-style stamp running up the left margin
            stamp = "arXiv:2610.00001v1 [cs.CL] 2 Oct 2026"
            fs = 14
            L = tl(stamp, "tiro", fs)
            # baseline origin at (36, 600), text direction = up; rotate_text=90 rotates counter-clockwise
            f.put(p, 36, 600, stamp, "tiro", fs, color=(0.5, 0.5, 0.5), rotate_text=90)
            f.record(p, stamp, 36 - ASC * fs, 600 - L, 36 + (1 - ASC) * fs, 600, tag="vertical")
    f.save()


def f11_scripts():
    f = Fixture("11-devanagari-cjk.pdf", "nonlatin", "no-crash guarantee; lines unscored")
    p = f.page(595, 842)
    html = """
    <h2>हिन्दी और देवनागरी</h2>
    <p>यह एक सरल वाक्य है जो पंक्ति इंजन की जाँच के लिए लिखा गया है। हर पंक्ति को सही क्रम में पढ़ा जाना चाहिए,
    भले ही अक्षरों के ऊपर और नीचे मात्राएँ हों। यह दूसरा वाक्य थोड़ा लंबा है ताकि पाठ अगली पंक्ति में जाए।</p>
    <h2>中文与日本語</h2>
    <p>这是用于测试行引擎的中文段落。每一行都应该被正确识别，并且不会导致程序崩溃。日本語の文もここにあります。
    行の境界は正しく検出されるべきです。한국어 문장도 여기에 있습니다.</p>
    <p>Mixed: English words, हिन्दी शब्द, 中文词语 and numbers 12345 on one line.</p>
    """
    p.insert_htmlbox(fitz.Rect(56, 56, 539, 786), html, css="* {font-size: 13px; line-height: 1.5}")
    f.pages[-1]["lines"] = []
    f.save()


def f12_large():
    print("  generating 12-large-500p.pdf (slow) ...")
    doc = fitz.open()
    c = Corpus(13)
    rng = random.Random(14)
    for pno in range(520):
        p = doc.new_page(width=595, height=842)
        if pno % 2 == 0:
            noise = fitz.Pixmap(fitz.csRGB, 340, 200, rng.randbytes(340 * 200 * 3), False)
            p.insert_image(fitz.Rect(56, 560, 539, 790), stream=noise.tobytes("jpeg", jpg_quality=92))
        base = 70
        text = c.paragraph(10, 12)
        for _, words in break_lines(text, "tiro", 11, 483)[:34]:
            p.insert_text((56, base), " ".join(words), fontname="tiro", fontsize=11)
            base += 14.5
        p.insert_text((290, 820), str(pno + 1), fontname="tiro", fontsize=9)
    doc.save(OUT / "12-large-500p.pdf", garbage=3, deflate=True)
    print(f"  12-large-500p.pdf: {(OUT / '12-large-500p.pdf').stat().st_size / 1e6:.1f} MB")


def f13_password():
    doc = fitz.open()
    for k in range(2):
        p = doc.new_page(width=595, height=842)
        p.insert_text((72, 100), f"Password protected page {k + 1}. The password is never stored.", fontname="helv",
                      fontsize=12)
    doc.save(OUT / "13-password.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="marginalia",
             owner_pw="marginalia-owner")
    print("  13-password.pdf (user password: marginalia)")


def f14_corrupt():
    data = (OUT / "01-single-column-prose.pdf").read_bytes()
    (OUT / "14-corrupt-truncated.pdf").write_bytes(data[: int(len(data) * 0.35)])
    (OUT / "14b-not-a-pdf.pdf").write_bytes(random.Random(15).randbytes(4096))
    print("  14-corrupt-truncated.pdf, 14b-not-a-pdf.pdf")


if __name__ == "__main__":
    print("Generating fixtures into", OUT)
    f01_prose()
    two_column("02-two-column-ieee.pdf", 612, 792, 54, 12.5, 10, 12, 22, "IEEE-like: 10pt, 1.25em gutter")
    two_column("02b-two-column-acl.pdf", 595, 842, 71, 17, 11, 13.6, 15, "ACL-like: 11pt, 1.55em gutter")
    f03_textbook()
    f04_slides()
    f05_tables()
    f06_math()
    f07_code()
    f08_scanned()
    f09_ocr()
    f10_rotated()
    f11_scripts()
    f13_password()
    f14_corrupt()
    if "--large" in sys.argv:
        f12_large()
