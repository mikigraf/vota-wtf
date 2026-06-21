from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


OUT = "output/pdf/vota-megathon-finals-forecast-cta.pdf"
QR_SVG = "output/pdf/vota-megathon-finals-forecast-qr.svg"
TARGET_URL = "https://www.vota.wtf/e/megathon-finals"
DISPLAY_URL = "https://www.vota.wtf/e/megathon-finals"
W, H = 1280, 720

INK = HexColor("#08090B")
INK_2 = HexColor("#11141A")
PAPER = HexColor("#FAFAF7")
WHITE = HexColor("#FFFFFF")
MUTED = HexColor("#B8B8AE")
MUTED_DARK = HexColor("#575A61")
LINE = HexColor("#272A32")
EMBER = HexColor("#FF5A1F")
MINT = HexColor("#18C97B")
SKY = HexColor("#1F9BD1")
WARN = HexColor("#F0C000")


def register_fonts():
    base = "/System/Library/Fonts/Supplemental"
    for name, filename in [
        ("Arial", "Arial.ttf"),
        ("ArialBold", "Arial Bold.ttf"),
        ("ArialBlack", "Arial Black.ttf"),
    ]:
        try:
            pdfmetrics.registerFont(TTFont(name, f"{base}/{filename}"))
        except Exception:
            pass


def font(name):
    if name in pdfmetrics.getRegisteredFontNames():
        return name
    return "Helvetica-Bold" if "Bold" in name or "Black" in name else "Helvetica"


def top(y):
    return H - y


def rect_top(c, x, y, w, h, fill, stroke=None, radius=0, stroke_width=1):
    c.setLineWidth(stroke_width)
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    if radius:
        c.roundRect(x, top(y + h), w, h, radius, fill=1, stroke=1 if stroke else 0)
    else:
        c.rect(x, top(y + h), w, h, fill=1, stroke=1 if stroke else 0)


def text(c, x, y, value, size=18, color=WHITE, name="ArialBold", leading=None, max_width=None):
    c.setFillColor(color)
    c.setFont(font(name), size)
    leading = leading or size * 1.15
    if not max_width:
        c.drawString(x, top(y), value)
        return y + leading

    words = value.split()
    lines = []
    current = ""
    for word in words:
        attempt = f"{current} {word}".strip()
        if c.stringWidth(attempt, font(name), size) <= max_width:
            current = attempt
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    for i, line in enumerate(lines):
        c.drawString(x, top(y + i * leading), line)
    return y + len(lines) * leading


def centered_text(c, x, y, w, value, size=18, color=INK, name="ArialBold", leading=None, max_width=None):
    c.setFillColor(color)
    c.setFont(font(name), size)
    leading = leading or size * 1.15
    max_width = max_width or w
    words = value.split()
    lines = []
    current = ""
    for word in words:
        attempt = f"{current} {word}".strip()
        if c.stringWidth(attempt, font(name), size) <= max_width:
            current = attempt
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    for i, line in enumerate(lines):
        c.drawCentredString(x + w / 2, top(y + i * leading), line)
    return y + len(lines) * leading


def qr_drawing(value, size):
    widget = qr.QrCodeWidget(value)
    bounds = widget.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(widget)
    return drawing


def draw_qr(c, value, x, y, size):
    renderPDF.draw(qr_drawing(value, size), c, x, top(y + size))
    c.linkURL(value, (x, top(y + size), x + size, top(y)), thickness=0, relative=0)


def draw_background(c):
    rect_top(c, 0, 0, W, H, INK)
    c.setStrokeColor(HexColor("#151820"))
    c.setLineWidth(1)
    for x in range(0, W + 1, 40):
        c.line(x, 0, x, H)
    for y in range(0, H + 1, 40):
        c.line(0, y, W, y)
    c.setStrokeColor(EMBER)
    c.setLineWidth(24)
    c.line(-70, top(655), 520, top(526))
    c.setStrokeColor(MINT)
    c.setLineWidth(18)
    c.line(640, top(92), 1320, top(236))
    c.setStrokeColor(SKY)
    c.setLineWidth(12)
    c.line(602, top(674), 1290, top(518))


def draw_brand(c):
    rect_top(c, 58, 40, 34, 34, EMBER, radius=8)
    c.setFillColor(INK)
    c.setFont(font("ArialBlack"), 18)
    c.drawCentredString(75, top(63), "V")
    text(c, 108, 63, "vota.wtf", 14, WHITE, "ArialBold")
    c.setFillColor(MUTED)
    c.setFont(font("ArialBold"), 11)
    c.drawRightString(W - 58, top(63), "MEGATHON FINALS FORECASTING MARKETS")


def draw_question_row(c, y, number, question, accent, detail=None):
    row_h = 44 if detail is None else 58
    rect_top(c, 70, y, 676, row_h, INK_2, LINE, 10)
    rect_top(c, 90, y + 11, 30, 22, accent, radius=8)
    c.setFillColor(INK)
    c.setFont(font("ArialBlack"), 10)
    c.drawCentredString(105, top(y + 27), number)
    text(c, 136, y + 28, question, 17, WHITE, "ArialBold", max_width=570)
    if detail:
        text(c, 136, y + 49, detail, 12, MUTED, "ArialBold", max_width=560)


def build():
    register_fonts()
    c = canvas.Canvas(OUT, pagesize=(W, H))

    draw_background(c)
    draw_brand(c)

    text(c, 64, 128, "SPECIAL MARKETS ARE OPEN", 13, MINT, "ArialBold")
    y = text(
        c,
        64,
        190,
        "Forecast the finals before they begin.",
        60,
        WHITE,
        "ArialBlack",
        leading=58,
        max_width=690,
    )
    text(
        c,
        66,
        y + 18,
        "Grab your MBucks, make your calls, and climb the leaderboard.",
        22,
        MUTED,
        "ArialBold",
        leading=27,
        max_width=650,
    )

    text(c, 70, 394, "CURRENT QUESTIONS", 13, EMBER, "ArialBold")
    draw_question_row(c, 420, "01", "Will one team finish #1 in two or more categories?", EMBER)
    draw_question_row(c, 470, "02", "Highest revenue any finalist claims during the weekend?", WARN, "0 EUR / less than 1,000 EUR / more than 1,000 EUR")
    draw_question_row(c, 534, "03", "Will a solo founder win one of the tracks?", MINT)
    draw_question_row(c, 584, "04", 'Will a finalist say "the European version" of another company?', SKY)
    draw_question_row(c, 634, "05", 'Will someone say "AI agent" more than 5 times in one pitch?', EMBER)

    card_x, card_y, card_w, card_h = 812, 108, 410, 538
    rect_top(c, card_x - 10, card_y - 10, card_w + 20, card_h + 20, HexColor("#000000"), radius=22)
    rect_top(c, card_x, card_y, card_w, card_h, PAPER, HexColor("#E3E0D8"), 18)
    centered_text(c, card_x + 34, card_y + 62, card_w - 68, "Scan to forecast", 34, INK, "ArialBlack")
    centered_text(c, card_x + 48, card_y + 100, card_w - 96, "Make your predictions before the finals begin.", 16, MUTED_DARK, "ArialBold", max_width=300)

    qr_size = 286
    qr_x = card_x + (card_w - qr_size) / 2
    qr_y = card_y + 154
    rect_top(c, qr_x - 17, qr_y - 17, qr_size + 34, qr_size + 34, WHITE, HexColor("#D8D5CC"), 14)
    draw_qr(c, TARGET_URL, qr_x, qr_y, qr_size)

    centered_text(c, card_x + 28, card_y + 478, card_w - 56, DISPLAY_URL, 16, INK, "ArialBold", max_width=360)
    c.linkURL(TARGET_URL, (card_x + 28, top(card_y + 494), card_x + card_w - 28, top(card_y + 460)), thickness=0, relative=0)

    rect_top(c, card_x + 60, card_y + 502, card_w - 120, 48, EMBER, radius=24)
    centered_text(c, card_x + 60, card_y + 532, card_w - 120, "MAKE YOUR PREDICTIONS", 14, WHITE, "ArialBlack")

    text(c, 64, 695, "Crowd signal vs. judges. The leaderboard is live.", 12, MUTED, "ArialBold")

    c.showPage()
    c.save()

    renderSVG.drawToFile(qr_drawing(TARGET_URL, 360), QR_SVG)


if __name__ == "__main__":
    build()
