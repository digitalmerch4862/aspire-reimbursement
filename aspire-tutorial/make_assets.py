import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1260, 992
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "premiere-assets")
CAP = os.path.join(OUT, "captions")

BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
REG  = r"C:\Windows\Fonts\segoeui.ttf"

AMBER = (245, 166, 35, 255)
WHITE = (255, 255, 255, 255)
BOX   = (11, 18, 32, 224)

def font(path, size):
    return ImageFont.truetype(path, size)

def text_w(draw, s, f, tracking=0):
    if tracking == 0:
        return draw.textlength(s, font=f)
    return sum(draw.textlength(c, font=f) + tracking for c in s) - (tracking if s else 0)

def draw_tracked(draw, xy, s, f, fill, tracking):
    x, y = xy
    for c in s:
        draw.text((x, y), c, font=f, fill=fill)
        x += draw.textlength(c, font=f) + tracking

def wrap(draw, words, f, maxw):
    lines, cur = [], ""
    for w in words.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

# ---------------- INTRO CARD ----------------
def make_intro():
    img = Image.new("RGB", (W, H))
    # diagonal-ish gradient #0b1220 -> #162038 -> #0b1220 vertical
    top = (11, 18, 32); mid = (22, 32, 56)
    for y in range(H):
        t = y / H
        # ease toward mid at center
        f = 1 - abs(t - 0.5) * 2  # 0 at edges, 1 center
        r = int(top[0] + (mid[0] - top[0]) * f)
        g = int(top[1] + (mid[1] - top[1]) * f)
        b = int(top[2] + (mid[2] - top[2]) * f)
        ImageDraw.Draw(img).line([(0, y), (W, y)], fill=(r, g, b))
    d = ImageDraw.Draw(img)

    cx = W // 2
    # title (fit to width 1100)
    parts = [("Aspire ", WHITE), ("Reimbursement", AMBER), (" Form", WHITE)]
    size = 64
    while size > 30:
        f = font(BOLD, size)
        total = sum(d.textlength(p, font=f) for p, _ in parts)
        if total <= 1100:
            break
        size -= 2
    f = font(BOLD, size)
    total = sum(d.textlength(p, font=f) for p, _ in parts)
    ascent, descent = f.getmetrics()
    th = ascent + descent
    title_y = H // 2 - 30
    # accent line above
    d.rounded_rectangle([cx - 40, title_y - 34, cx + 40, title_y - 30], radius=2, fill=AMBER)
    x = cx - total / 2
    for p, col in parts:
        d.text((x, title_y), p, font=f, fill=col)
        x += d.textlength(p, font=f)

    # subtitle
    sf = font(REG, 26)
    sub = "STEP-BY-STEP WALKTHROUGH"
    sw = text_w(d, sub, sf, tracking=3)
    draw_tracked(d, (cx - sw / 2, title_y + th + 18), sub, sf, (255, 255, 255, 170), 3)

    # logo text
    lf = font(BOLD, 18)
    logo = "ASPIRE HOMES"
    lw = text_w(d, logo, lf, tracking=4)
    draw_tracked(d, (cx - lw / 2, title_y + th + 80), logo, lf, (255, 255, 255, 90), 4)

    img.save(os.path.join(OUT, "intro_card.png"))
    print("intro_card.png", img.size)

# ---------------- CAPTIONS ----------------
CAPS = [
    ("STEP 1 · WELCOME", "This tutorial uses the Aspire Reimbursement Form Google Sheet. Follow these steps to make your own request."),
    ("STEP 2 · MAKE A COPY", "Open File, choose Make a copy, and save your own version of the reimbursement form."),
    ("STEP 3 · ALLOW ACCESS", "Click the Click here FORMS button. If Google asks for permission, review the prompt and allow the script."),
    ("STEP 4 · OPEN THE PANEL", "The Aspire Homes reimbursement panel opens on the right. Use Group when submitting for multiple people."),
    ("STEP 5 · ENTER DETAILS", "Set Date From, Date To, and Location. These values appear immediately in the live preview."),
    ("STEP 6 · ADD MEMBERS", "Enter each staff name, YP name, and amount. Use Add Group Row when you need more participants."),
    ("STEP 7 · REVIEW & SAVE", "Review the live preview, then click Sync to Sheet so the request is saved back into the spreadsheet."),
    ("STEP 8 · EXPORT JPEG", "Click Export Preview to JPEG. Open the downloaded image and confirm the final request form looks correct."),
]

def make_caption(idx, step, line):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box_w = 900
    pad_x, pad_top, pad_bot = 22, 12, 14
    step_f = font(BOLD, 13)
    line_f = font(REG, 22)
    inner_w = box_w - pad_x * 2 - 3  # minus accent bar
    lines = wrap(d, line, line_f, inner_w)
    la, ld = line_f.getmetrics()
    line_h = int((la + ld) * 1.05)
    sa, sd = step_f.getmetrics()
    step_h = sa + sd
    gap = 4
    content_h = step_h + gap + line_h * len(lines)
    box_h = pad_top + content_h + pad_bot
    bx = (W - box_w) // 2
    by = H - 32 - box_h
    # box
    d.rounded_rectangle([bx, by, bx + box_w, by + box_h], radius=8, fill=BOX)
    # left accent bar
    d.rounded_rectangle([bx, by + 6, bx + 3, by + box_h - 6], radius=2, fill=AMBER)
    tx = bx + 3 + pad_x
    ty = by + pad_top
    draw_tracked(d, (tx, ty), step, step_f, AMBER, 2)
    ty += step_h + gap
    for ln in lines:
        d.text((tx, ty), ln, font=line_f, fill=WHITE)
        ty += line_h
    img.save(os.path.join(CAP, f"caption_{idx}.png"))
    print(f"caption_{idx}.png", "lines:", len(lines))

make_intro()
for i, (s, l) in enumerate(CAPS, 1):
    make_caption(i, s, l)
print("done")
