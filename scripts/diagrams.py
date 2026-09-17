"""
Generates the documentation diagrams in static/img/.

Run with:  python scripts/diagrams.py

Requires Pillow. Draws at 3x and downsamples to 2x the logical width, so text stays
sharp on high-DPI displays and edges come out cleanly antialiased.

Colours match the site's design tokens in src/css/custom.css. The site is locked to
dark mode (colorMode.disableSwitch), so one palette is enough.

Edit this script and rerun it rather than editing a PNG by hand. Pages reference the
output as `![alt](/img/name.png)`, which Docusaurus resolves against static/.
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "static", "img")
os.makedirs(OUT, exist_ok=True)

SS = 3  # supersampling factor: draw big, downsample to 2x logical
SCALE = 2  # logical pixel -> output pixel

# ---------------------------------------------------------------- palette

BG        = "#0a0f1e"   # --lithos-bg-1, matches the doc page background
SURFACE   = "#0f1629"   # --lithos-bg-2
SURFACE_2 = "#141d33"   # --lithos-bg-3
SKY       = "#38bdf8"   # --lithos-sky
SKY_DARK  = "#0ea5e9"
SKY_LT    = "#7dd3fc"   # --lithos-sky-light
PURPLE    = "#a855f7"   # --lithos-purple
PURPLE_LT = "#c084fc"
TEXT      = "#e2e8f0"   # --lithos-text
MUTED     = "#94a3b8"   # --lithos-text-muted
DIM       = "#64748b"   # --lithos-text-dim
LINE      = "#1e2b45"

# Font files, in preference order per role. The first that resolves wins, so the
# script runs on Windows, macOS and Linux without edits. The rendered PNGs in
# static/img/ were produced with the Windows set.
FONT_DIRS = [
    "C:/Windows/Fonts/",
    "/System/Library/Fonts/Supplemental/",
    "/Library/Fonts/",
    "/usr/share/fonts/truetype/dejavu/",
    "/usr/share/fonts/truetype/liberation/",
]

FONT_SETS = {
    "bold": ["segoeuib.ttf", "Arial Bold.ttf", "arialbd.ttf",
             "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"],
    "reg":  ["segoeui.ttf", "Arial.ttf", "arial.ttf",
             "DejaVuSans.ttf", "LiberationSans-Regular.ttf"],
    "mono": ["consola.ttf", "Menlo.ttc", "DejaVuSansMono.ttf",
             "LiberationMono-Regular.ttf"],
}

_resolved = {}


def _find(role):
    if role in _resolved:
        return _resolved[role]
    for name in FONT_SETS[role]:
        for d in FONT_DIRS:
            path = os.path.join(d, name)
            if os.path.exists(path):
                _resolved[role] = path
                return path
    sys.exit(
        "No %s font found. Add one to FONT_DIRS or FONT_SETS in scripts/diagrams.py."
        % role
    )


def font(role, size):
    return ImageFont.truetype(_find(role), int(size * SS * SCALE))


def bold(size):
    return font("bold", size)


def reg(size):
    return font("reg", size)


def mono(size):
    return font("mono", size)


# ---------------------------------------------------------------- canvas


class Canvas:
    """Drawing surface in logical pixels. Everything is scaled up internally."""

    def __init__(self, w, h, bg=BG):
        self.w, self.h = w, h
        self.k = SS * SCALE
        self.img = Image.new("RGB", (w * self.k, h * self.k), bg)
        self.d = ImageDraw.Draw(self.img)

    def _s(self, *vals):
        return [v * self.k for v in vals]

    def box(self, x, y, w, h, fill=SURFACE, outline=LINE, width=1, radius=8):
        x, y, w, h, radius, width = self._s(x, y, w, h, radius, width)
        self.d.rounded_rectangle(
            [x, y, x + w, y + h], radius=radius, fill=fill,
            outline=outline, width=max(1, int(width)),
        )

    def panel(self, x, y, w, h, accent=None, fill=SURFACE, outline=LINE,
              radius=8, stripe=3, width=1):
        """
        A rounded panel with an optional accent stripe on its left edge.

        Order matters: fill, then the stripe masked to the rounded shape, then the
        outline last. Painting the stripe after the outline is what used to eat the
        border at the two left corners.
        """
        px, py, pw, ph, r, sw, lw = self._s(x, y, w, h, radius, stripe, width)
        px, py, pw, ph = int(px), int(py), int(pw), int(ph)
        self.d.rounded_rectangle([px, py, px + pw, py + ph], radius=r, fill=fill)

        if accent:
            # Mask = the panel's rounded silhouette, minus everything right of the
            # stripe. The stripe then follows the corner radius exactly.
            mask = Image.new("L", (pw + 1, ph + 1), 0)
            md = ImageDraw.Draw(mask)
            md.rounded_rectangle([0, 0, pw, ph], radius=r, fill=255)
            md.rectangle([sw, 0, pw, ph], fill=0)
            self.img.paste(Image.new("RGB", (pw + 1, ph + 1), accent), (px, py), mask)

        if outline:
            self.d.rounded_rectangle(
                [px, py, px + pw, py + ph], radius=r,
                outline=outline, width=max(1, int(lw)),
            )

    def stacked_bar(self, x, y, w, h, segments, radius=6, gap=0):
        """
        One continuous bar divided into segments.

        Segments are drawn square onto a strip and the whole strip is then masked to
        a single rounded rectangle, so only the two outer ends are rounded and the
        interior joins are seamless. Rounding each segment separately is what made
        the bar look like disconnected chips.

        segments: [(value, colour), ...]. Widths are proportional to value.
        """
        bx, by, bw, bh, r, g = self._s(x, y, w, h, radius, gap)
        bx, by, bw, bh = int(bx), int(by), int(bw), int(bh)

        strip = Image.new("RGB", (bw + 1, bh + 1), BG)
        sd = ImageDraw.Draw(strip)
        total = sum(v for v, _ in segments)
        cx = 0.0
        for i, (val, colour) in enumerate(segments):
            seg = bw * val / total
            right = bw if i == len(segments) - 1 else cx + seg - g
            sd.rectangle([int(cx), 0, int(right), bh], fill=colour)
            cx += seg

        mask = Image.new("L", (bw + 1, bh + 1), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, bw, bh], radius=r, fill=255)
        self.img.paste(strip, (bx, by), mask)

    def text(self, x, y, s, f, fill=TEXT, anchor="mm", spacing=4):
        x, y = self._s(x, y)
        if "\n" in s:
            self.d.multiline_text(
                (x, y), s, font=f, fill=fill, anchor=anchor,
                spacing=spacing * self.k, align="center",
            )
        else:
            self.d.text((x, y), s, font=f, fill=fill, anchor=anchor)

    def line(self, x1, y1, x2, y2, fill=LINE, width=1):
        x1, y1, x2, y2, width = self._s(x1, y1, x2, y2, width)
        self.d.line([x1, y1, x2, y2], fill=fill, width=max(1, int(width)))

    def dashed(self, x1, y, x2, fill=LINE, width=1, dash=6, gap=6):
        x = x1
        while x < x2:
            self.line(x, y, min(x + dash, x2), y, fill=fill, width=width)
            x += dash + gap

    def arrow(self, x1, y1, x2, y2, fill=SKY, width=2, head=7):
        """Straight arrow, horizontal or vertical only."""
        self.line(x1, y1, x2, y2, fill=fill, width=width)
        hx, hy = self._s(x2, y2)
        h = head * self.k
        if y1 == y2:
            d = h if x2 > x1 else -h
            pts = [(hx, hy), (hx - d, hy - h * 0.55), (hx - d, hy + h * 0.55)]
        else:
            d = h if y2 > y1 else -h
            pts = [(hx, hy), (hx - h * 0.55, hy - d), (hx + h * 0.55, hy - d)]
        self.d.polygon(pts, fill=fill)

    def elbow(self, x1, y1, x2, y2, fill=SKY, width=2, head=7):
        """Vertical then horizontal, with the head on the horizontal leg."""
        self.line(x1, y1, x1, y2, fill=fill, width=width)
        self.arrow(x1, y2, x2, y2, fill=fill, width=width, head=head)

    def save(self, name):
        out = self.img.resize(
            (self.w * SCALE, self.h * SCALE), Image.LANCZOS
        )
        path = os.path.join(OUT, name)
        out.save(path, "PNG", optimize=True)
        print("  %-26s %d x %d" % (name, out.width, out.height))


def node(c, x, y, w, h, title, lines, accent=SKY, title_size=13, line_size=10.5):
    """A labelled box: accent stripe, bold title, muted detail lines."""
    c.panel(x, y, w, h, accent)
    cx = x + w / 2 + 2
    if not lines:
        c.text(cx, y + h / 2, title, bold(title_size), TEXT)
        return
    # centre the whole text block, so one detail line spaces the same as three
    title_h = title_size * 1.5
    line_h = line_size * 1.42
    top = y + (h - (title_h + len(lines) * line_h)) / 2
    c.text(cx, top + title_h / 2, title, bold(title_size), TEXT)
    for i, ln in enumerate(lines):
        c.text(cx, top + title_h + line_h * (i + 0.5), ln, reg(line_size), MUTED)


# ---------------------------------------------------------------- 1. rollup phases


def rollup_phases():
    W, H = 760, 196
    c = Canvas(W, H)

    y, bh = 52, 76
    bw, gap = 152, 34
    x0 = (W - (4 * bw + 3 * gap)) / 2

    cols = [
        ("Collateral box", ["spent by the finder", "when a block is found"], DIM, ""),
        ("Holding", ["miners submit", "one NISP each"], SKY, "360 blocks"),
        ("Evaluation", ["fraud proofs remove", "invalid NISPs"], SKY, "360 blocks"),
        ("Payout", ["each miner paid", "by their score"], PURPLE, ""),
    ]

    for i, (title, lines, accent, dur) in enumerate(cols):
        x = x0 + i * (bw + gap)
        node(c, x, y, bw, bh, title, lines, accent)
        if dur:
            c.text(x + bw / 2, y - 16, dur, bold(10), DIM)
        if i:
            px = x0 + (i - 1) * (bw + gap) + bw
            c.arrow(px + 9, y + bh / 2, x - 9, y + bh / 2, SKY_DARK, 2, 7)

    c.text(W / 2, H - 22,
           "One rollup per Lithos block.  360 blocks is about 12 hours on mainnet, 4.5 hours on testnet.",
           reg(10.5), DIM)
    c.save("rollup-phases.png")


# ---------------------------------------------------------------- 2. LFSM lifecycle


def lfsm_lifecycle():
    W, H = 780, 556
    c = Canvas(W, H)

    # ---- panel A: the queue side
    c.text(30, 30, "QUEUE SIDE", bold(10), DIM, anchor="lm")
    c.line(112, 30, W - 30, 30, LINE, 1)

    ay, ah = 56, 82
    node(c, 30, ay, 216, ah, "Emission box",
         ["singleton, holds the LIT supply,", "active lender set, queue counters"], PURPLE)
    node(c, 320, ay, 172, ah, "Queue box",
         ["principal + permit,", "waiting in line"], SKY)
    node(c, 566, ay, 184, ah, "Collateral box",
         ["live, spendable by", "any Lithos miner"], SKY)

    c.arrow(254, ay + ah / 2, 312, ay + ah / 2, SKY_DARK, 2, 7)
    c.text(283, ay + ah / 2 - 15, "Join", bold(10.5), SKY)
    c.text(283, ay + ah / 2 + 16, "op 0", reg(9.5), DIM)

    c.arrow(500, ay + ah / 2, 558, ay + ah / 2, SKY_DARK, 2, 7)
    c.text(529, ay + ah / 2 - 15, "Activate", bold(10.5), SKY)
    c.text(529, ay + ah / 2 + 16, "op 1", reg(9.5), DIM)

    c.arrow(406, ay + ah, 406, ay + ah + 34, "#475569", 2, 7)
    c.text(420, ay + ah + 22, "Clear (op 2): the box is forfeited,", reg(10), MUTED, anchor="lm")
    c.text(420, ay + ah + 36, "principal and permit both", reg(10), MUTED, anchor="lm")

    c.text(138, ay + ah + 22, "all three operations", reg(10), DIM)
    c.text(138, ay + ah + 36, "spend the emission box", reg(10), DIM)

    # ---- the join between the two halves
    jy = 226
    c.dashed(30, jy, W - 30, LINE, 1, 7, 7)
    c.box(176, jy - 15, 428, 30, SURFACE_2, LINE, 1, 15)
    c.text(390, jy, "a finder spends the collateral box, before proof-of-work",
           bold(10.5), SKY_DARK)

    # ---- panel B: the rollup side
    c.text(30, 276, "ROLLUP SIDE", bold(10), DIM, anchor="lm")
    c.line(122, 276, W - 30, 276, LINE, 1)

    by, bh = 302, 82
    bw = 216
    xs = [30, 282, 534]
    node(c, xs[0], by, bw, bh, "Holding box",
         ["360 blocks:", "miners insert NISPs"], SKY)
    node(c, xs[1], by, bw, bh, "Evaluation box",
         ["360 blocks:", "fraud proofs remove NISPs"], SKY)
    node(c, xs[2], by, bw, bh, "Payout box",
         ["pays each miner", "score / total score"], PURPLE)

    for i in range(2):
        c.arrow(xs[i] + bw + 9, by + bh / 2, xs[i + 1] - 9, by + bh / 2, SKY_DARK, 2, 7)

    # dictionary feeding the fraud proofs
    dy = 452
    node(c, 234, dy, 312, 62, "Miner dictionary + miner data",
         ["difficulty commitments, made in advance"], PURPLE_LT, 12, 10)
    c.arrow(390, dy - 6, 390, by + bh + 8, "#7c3aed", 2, 7)
    c.text(400, (dy + by + bh) / 2 + 2,
           "the commitment a score is checked against", reg(10), MUTED, anchor="lm")

    c.text(30, H - 18,
           "Registers, context variables and the checks on each path are covered in the sections below.",
           reg(10), DIM, anchor="lm")
    c.save("lfsm-lifecycle.png")


# ---------------------------------------------------------------- 3. genesis outputs

# Real testnet transaction, so the figures can be checked against an explorer:
# 85c37abb1612e787785c498c0db3a0619edfa0014c5c94ab17e55d283017ab8e at height 505,123.
GENESIS_TX = "85c37abb...17ab8e"
GENESIS_HEIGHT = "505,123"

# (index, recipient, nanoERG, LIT base units, note, accent)
GENESIS_OUTPUTS = [
    (0, "Holding box, which pays the miners", 2910900000, 480000000000, "", SKY),
    (1, "Founder 1", 1000000, 100000000000, "", "#7c3aed"),
    (2, "Founder 2", 1000000, 25000000000, "", "#7c3aed"),
    (3, "Founder 3", 1000000, 15000000000, "", "#7c3aed"),
    (4, "Lender, permit returned", 1000000, 1070000000000, "", PURPLE),
    (5, "Finder, this block's reward", 100000, 20000000000, "", SKY_LT),
    (6, "Proof-of-spend box", 150000, None, "1 collateral token", DIM),
]

IN_ERG, IN_LIT = 2915150000, 1710000000000


def erg(n):
    return ("%.6f" % (n / 1e9)).rstrip("0").rstrip(".")


def lit(n):
    return "{:,}".format(int(n / 1e9))


def genesis_outputs():
    W, H = 760, 486
    c = Canvas(W, H)

    X_IDX, X_NAME, X_ERG, X_LIT = 42, 66, 566, 730

    c.text(30, 26, "One collateral box becomes seven outputs", bold(13.5), TEXT, anchor="lm")
    c.text(W - 30, 26, "testnet block " + GENESIS_HEIGHT, mono(10), DIM, anchor="rm")

    # ---- the input
    c.panel(30, 46, W - 60, 44, PURPLE_LT)
    c.text(50, 68, "Collateral box, spent by the finder", bold(11), TEXT, anchor="lm")
    c.text(X_ERG, 68, erg(IN_ERG) + " ERG", mono(11), TEXT, anchor="rm")
    c.text(X_LIT, 68, lit(IN_LIT) + " LIT", mono(11), TEXT, anchor="rm")

    # ---- column headings
    hy = 110
    c.text(30, hy, "OUTPUTS", bold(9.5), DIM, anchor="lm")
    c.text(X_ERG, hy, "ERG", bold(9.5), DIM, anchor="rm")
    c.text(X_LIT, hy, "LIT", bold(9.5), DIM, anchor="rm")
    c.line(30, hy + 12, W - 30, hy + 12, LINE, 1)

    # ---- one row per output
    ry = 138
    for i, (idx, name, nerg, nlit, note, accent) in enumerate(GENESIS_OUTPUTS):
        y = ry + i * 28
        c.text(X_IDX, y, str(idx), mono(10.5), accent, anchor="rm")
        c.text(X_NAME, y, name, reg(11), TEXT if i == 0 else MUTED, anchor="lm")
        c.text(X_ERG, y, erg(nerg), mono(11), TEXT if i == 0 else MUTED, anchor="rm")
        if nlit is None:
            c.text(X_LIT, y, note, reg(10), DIM, anchor="rm")
        else:
            c.text(X_LIT, y, lit(nlit), mono(11), TEXT if i == 0 else MUTED, anchor="rm")
        if i < len(GENESIS_OUTPUTS) - 1:
            c.line(30, y + 14, W - 30, y + 14, "#16223a", 1)

    # ---- totals
    ty = ry + len(GENESIS_OUTPUTS) * 28 + 4
    c.line(30, ty - 12, W - 30, ty - 12, LINE, 1)
    c.text(X_NAME, ty, "Balances exactly. A genesis transaction pays no fee.",
           reg(10.5), DIM, anchor="lm")
    c.text(X_ERG, ty, erg(IN_ERG), mono(11), TEXT, anchor="rm")
    c.text(X_LIT, ty, lit(IN_LIT), mono(11), TEXT, anchor="rm")

    # ---- what the LIT column actually contains
    py = ty + 26
    ph = 92
    c.panel(30, py, W - 60, ph, SKY_DARK)
    c.text(50, py + 20, "Of the 1,710 LIT above, 640 is newly emitted. The other 1,070 is the lender's",
           reg(10.5), MUTED, anchor="lm")
    c.text(50, py + 36, "own permit coming back to them.", reg(10.5), MUTED, anchor="lm")

    segs = [(480, SKY), (140, PURPLE), (20, SKY_LT)]
    c.stacked_bar(50, py + 50, W - 100, 14, segs, radius=5)

    lx = 50
    for val, colour, label in [(480, SKY, "480 to miners"),
                               (140, PURPLE, "140 to founders"),
                               (20, SKY_LT, "20 to the finder")]:
        c.box(lx, py + 74, 8, 8, colour, colour, 1, 2)
        c.text(lx + 14, py + 78, label, reg(10), MUTED, anchor="lm")
        lx += 150

    c.save("genesis-outputs.png")


# ---------------------------------------------------------------- 4. rollup state machine


def loop_back(c, x1, x2, y_top, depth, colour, label_lines):
    """A rectangular self-loop under a node: down, across, and back up into it."""
    y_low = y_top + depth
    c.line(x1, y_top, x1, y_low, colour, 2)
    c.line(x1, y_low, x2, y_low, colour, 2)
    c.arrow(x2, y_low, x2, y_top + 6, colour, 2, 6)
    for i, ln in enumerate(label_lines):
        c.text((x1 + x2) / 2, y_low + 15 + i * 14, ln, reg(10), MUTED)


def rollup_state_machine():
    W, H = 780, 214
    c = Canvas(W, H)

    y, h, bw, gap = 56, 72, 128, 40
    xs = [20 + i * (bw + gap) for i in range(4)]
    specs = [
        ("Collateral box", ["spent by the finder"], DIM),
        ("Holding", ["360 blocks"], SKY),
        ("Evaluation", ["360 blocks"], SKY),
        ("Payout", ["until drained"], PURPLE),
    ]
    for x, (title, lines, accent) in zip(xs, specs):
        node(c, x, y, bw, h, title, lines, accent, 12.5, 10)

    edge_labels = ["genesis tx", "transform", "transform"]
    for i, lab in enumerate(edge_labels):
        x_from, x_to = xs[i] + bw, xs[i + 1]
        c.arrow(x_from + 6, y + h / 2, x_to - 6, y + h / 2, SKY_DARK, 2, 6)
        c.text((x_from + x_to) / 2, y - 14, lab, bold(10), SKY)

    # terminal
    tx = xs[3] + bw + gap
    c.arrow(xs[3] + bw + 6, y + h / 2, tx - 6, y + h / 2, "#475569", 2, 6)
    c.text((xs[3] + bw + tx) / 2, y - 14, "final / drain", bold(10), DIM)
    c.box(tx, y + h / 2 - 16, W - 20 - tx, 32, SURFACE_2, LINE, 1, 16)
    c.text(tx + (W - 20 - tx) / 2, y + h / 2, "consumed", reg(10), MUTED)

    # self-loops under the three rollup phases
    loops = [
        (1, ["submit NISP", "top-up, genesis block only"]),
        (2, ["apply a fraud proof"]),
        (3, ["partial payout"]),
    ]
    for idx, label in loops:
        x = xs[idx]
        loop_back(c, x + 26, x + bw - 26, y + h, 26, "#1f6f99", label)

    c.save("rollup-state-machine.png")


# ---------------------------------------------------------------- 5. genesis holding output


def genesis_holding_output():
    W, H = 760, 412
    c = Canvas(W, H)

    c.text(24, 22, "The holding output a genesis transaction must create", bold(13), TEXT, anchor="lm")

    # the input, kept above the tokens(0) row so the id connector can leave from beneath it
    node(c, 24, 48, 196, 84, "Collateral box",
         ["INPUTS(0)", "its box id becomes the NFT id"], DIM, 12.5, 10)

    # the output panel
    px, py, pw, ph = 268, 48, 468, 276
    c.panel(px, py, pw, ph, SKY)
    c.text(px + 22, py + 24, "OUTPUTS(0)", mono(11), SKY, anchor="lm")
    c.text(px + 112, py + 24, "Holding box", bold(12), TEXT, anchor="lm")
    c.line(px + 16, py + 42, px + pw - 16, py + 42, LINE, 1)

    rows = [
        ("script", "Holding_Guard, hash equal to collateral R8", MUTED),
        ("value", "at least the collateral value minus feeValue", MUTED),
        ("tokens(0)", "rollup NFT: id = collateral box id, amount 1", SKY_LT),
        ("tokens(1)", "pool LIT: this block's emission less 4%", MUTED),
        ("R4", "empty AVL tree, 32-byte keys", MUTED),
        ("R5", "0, no miners yet", MUTED),
        ("R6", "0, no score yet", MUTED),
        ("R7", "[HEIGHT, HEIGHT, 0]", MUTED),
        ("R8", "the finder's miner hash, 32 bytes", MUTED),
    ]
    ry = py + 62
    for i, (field, value, colour) in enumerate(rows):
        y = ry + i * 24
        c.text(px + 22, y, field, mono(10.5), SKY_LT if colour == SKY_LT else DIM, anchor="lm")
        c.text(px + 112, y, value, reg(10.5), TEXT if colour == SKY_LT else MUTED, anchor="lm")

    # input to output, and the id link
    c.arrow(220 + 6, 90, px - 6, 90, SKY_DARK, 2, 6)
    nft_y = ry + 2 * 24
    c.line(122, 132, 122, nft_y, SKY_LT, 1)
    c.arrow(122, nft_y, px - 6, nft_y, SKY_LT, 1, 5)
    c.text(132, (132 + nft_y) / 2, "same id", bold(9.5), SKY_LT, anchor="lm")

    # the other outputs
    oy = 346
    c.text(24, oy, "Other outputs, checked by existence rather than position:", reg(10.5), MUTED, anchor="lm")
    chips = ["3 founder boxes", "permit return", "finder's LIT", "proof-of-spend"]
    cw, cg = 170, 10
    for i, label in enumerate(chips):
        cx = 24 + i * (cw + cg)
        c.panel(cx, oy + 16, cw, 32, DIM)
        c.text(cx + cw / 2 + 2, oy + 32, label, reg(10.5), MUTED)

    c.save("genesis-holding-output.png")


# ---------------------------------------------------------------- 6. fraud proof transaction


def fraud_proof_tx():
    W, H = 760, 336
    c = Canvas(W, H)

    c.text(24, 22, "A fraud proof transaction", bold(13), TEXT, anchor="lm")

    # data input
    node(c, 280, 44, 200, 58, "FP_CONTROL",
         ["data input 0: whitelisted proof hashes"], PURPLE_LT, 12, 9.5)

    c.text(24, 132, "INPUTS", bold(9.5), DIM, anchor="lm")
    c.text(W - 24, 132, "OUTPUTS", bold(9.5), DIM, anchor="rm")

    lx, rx, cw = 24, 476, 260
    node(c, lx, 146, cw, 70, "Evaluation box",
         ["INPUTS(0)", "var 0: the fraud proof script"], SKY, 12.5, 10)
    node(c, lx, 232, cw, 84, "Prover's box",
         ["INPUTS(1)", "vars 0 to 2: miner, lookup, removal", "var 3: evidence, var 4: the NISP"],
         PURPLE, 12.5, 10)

    node(c, rx, 146, cw, 70, "Evaluation box",
         ["OUTPUTS(0)", "miner removed, bond slashed"], SKY, 12.5, 10)
    node(c, rx, 232, cw, 84, "Prover's reward",
         ["OUTPUTS(1)", "exactly the slashed bond", "same script as INPUTS(1)"], PURPLE, 12.5, 10)

    c.arrow(lx + cw + 6, 181, rx - 6, 181, SKY_DARK, 2, 6)
    c.arrow(lx + cw + 6, 274, rx - 6, 274, "#7c3aed", 2, 6)

    # FP_CONTROL is read, not spent
    c.line(380, 102, 380, 166, PURPLE_LT, 1)
    c.text(388, 134, "read, not spent", reg(9.5), MUTED, anchor="lm")

    c.save("fraud-proof-tx.png")


# ---------------------------------------------------------------- 7. payout paths


def payout_paths():
    W, H = 760, 336
    c = Canvas(W, H)

    cols = [
        ("Partial", "the remainder stays above 0.001 ERG", [
            ("OUTPUTS(0)  successor", "rollup NFT carried forward", PURPLE),
            ("OUTPUTS(1)  miner", "reward share + bond, exactly", SKY),
            ("OUTPUTS(2..n)  miners", "one output per named key", SKY),
        ]),
        ("Final", "everything left is paid out", [
            ("OUTPUTS(0)  miner", "reward share + bond, at least", SKY),
            ("OUTPUTS(1..n-1)  miners", "every key still in the tree", SKY),
            ("no successor", "rollup NFT burned", DIM),
        ]),
        ("Drain", "no miners remain", [
            ("any outputs", "except a miner fee output", DIM),
            ("no successor", "rollup NFT burned", DIM),
            ("bond total", "must already be zero", DIM),
        ]),
    ]

    cw, gap = 228, 18
    for i, (name, cond, outs) in enumerate(cols):
        x = 24 + i * (cw + gap)
        c.text(x, 24, name, bold(13), TEXT, anchor="lm")
        c.text(x, 44, cond, reg(10), MUTED, anchor="lm")

        c.panel(x, 64, cw, 40, PURPLE)
        c.text(x + 16, 84, "Payout box", bold(11.5), TEXT, anchor="lm")
        c.text(x + cw - 14, 84, "INPUTS(0)", mono(10), DIM, anchor="rm")

        c.arrow(x + cw / 2, 104 + 4, x + cw / 2, 128 - 4, "#475569", 2, 6)

        for j, (title, detail, accent) in enumerate(outs):
            oy = 132 + j * 64
            c.panel(x, oy, cw, 54, accent)
            c.text(x + 16, oy + 19, title, mono(10), TEXT if accent != DIM else MUTED, anchor="lm")
            c.text(x + 16, oy + 38, detail, reg(10), MUTED, anchor="lm")

    c.save("payout-paths.png")


if __name__ == "__main__":
    print("writing to %s" % OUT)
    rollup_phases()
    lfsm_lifecycle()
    genesis_outputs()
    rollup_state_machine()
    genesis_holding_output()
    fraud_proof_tx()
    payout_paths()
