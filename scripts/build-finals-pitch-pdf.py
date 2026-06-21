import sys

from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT = "output/pdf/vota-finals-pitch.pdf"
OUT_V2 = "output/pdf/vota-finals-pitch-v2.pdf"
QR_SVG = "output/pdf/vota-join-megathon-finals-qr.svg"
JOIN_URL = "https://www.vota.wtf/join/megathon-finals"
W, H = 1280, 720

INK = HexColor("#0B0B0C")
PAPER = HexColor("#FAFAF8")
SOFT = HexColor("#F1F0EC")
LINE = HexColor("#ECEAE3")
MUTED = HexColor("#6B6B66")
FADED = HexColor("#9A958A")
EMBER = HexColor("#FF5A1F")
MINT = HexColor("#18C97B")
SKY = HexColor("#1F9BD1")
WARN = HexColor("#F0C000")
WHITE = HexColor("#FFFFFF")


def register_fonts():
    base = "/System/Library/Fonts/Supplemental"
    try:
        pdfmetrics.registerFont(TTFont("Arial", f"{base}/Arial.ttf"))
        pdfmetrics.registerFont(TTFont("ArialBold", f"{base}/Arial Bold.ttf"))
        pdfmetrics.registerFont(TTFont("ArialBlack", f"{base}/Arial Black.ttf"))
        pdfmetrics.registerFont(TTFont("ArialNarrowBold", f"{base}/Arial Narrow Bold.ttf"))
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


def draw_grid(c):
    c.setStrokeColor(HexColor("#EAE8E1"))
    c.setLineWidth(1)
    for x in range(0, W, 40):
        c.line(x, 0, x, H)
    for y in range(0, H, 40):
        c.line(0, y, W, y)


def text(c, x, y, value, size=18, color=INK, name="ArialBold", leading=None, max_width=None):
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


def top_line(c, n, title, dark=False):
    color = HexColor("#FFFFFF") if dark else HexColor("#4E4D49")
    c.setFont(font("ArialBold"), 12)
    c.setFillColor(color)
    rect_top(c, 52, 34, 30, 30, EMBER, radius=8)
    c.setFillColor(INK)
    c.setFont(font("ArialBlack"), 16)
    c.drawCentredString(67, top(55), "V")
    c.setFillColor(color)
    c.setFont(font("ArialBold"), 13)
    c.drawString(96, top(54), "vota.wtf")
    c.setFont(font("ArialBold"), 11)
    c.drawRightString(W - 52, top(54), f"{n:02d} / {title}".upper())


def footer(c, left, right, dark=False):
    color = HexColor("#FFFFFF") if dark else HexColor("#5C5A55")
    c.setFillColor(color)
    c.setFont(font("ArialBold"), 10)
    c.drawString(52, 35, left.upper())
    c.drawRightString(W - 52, 35, right.upper())


def headline(c, x, y, value, color=INK, size=66, max_width=760):
    return text(c, x, y, value, size=size, color=color, name="ArialBlack", leading=size * 0.93, max_width=max_width)


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


def write_qr_svg():
    renderSVG.drawToFile(qr_drawing(JOIN_URL, 220), QR_SVG)


def kicker(c, x, y, value, dark=False):
    text(c, x, y, value.upper(), size=12, color=MINT if dark else EMBER, name="ArialBold", leading=14)


def bullet(c, x, y, value, dark=False):
    color = WHITE if dark else INK
    rect_top(c, x, y + 5, 12, 12, MINT if dark else EMBER, radius=6)
    return text(c, x + 36, y, value, size=21, color=color, name="ArialBold", leading=27, max_width=590)


def slide1(c):
    rect_top(c, 0, 0, W, H, INK)
    top_line(c, 1, "Mission", dark=True)
    y = headline(c, 62, 165, "Railways for the agentic world.", color=WHITE, size=70, max_width=620)
    text(c, 62, y + 20, "Prediction-market infrastructure where humans and AI agents forecast together.", 25, HexColor("#CFCFC9"), "ArialBold", 31, 620)
    y = 438
    for item in [
        "Agents need markets, rules, limits, identity, and feedback.",
        "MCP is the native interface for agent participation.",
        "Europe cannot lose the race to build these rails.",
    ]:
        y = bullet(c, 64, y, item, dark=True) + 10

    rect_top(c, 742, 116, 444, 470, HexColor("#111316"), HexColor("#34363A"), 10)
    c.setStrokeColor(EMBER)
    c.setLineWidth(18)
    c.line(690, top(516), 1230, top(394))
    c.setStrokeColor(MINT)
    c.setLineWidth(14)
    c.line(690, top(396), 1230, top(274))
    c.setStrokeColor(SKY)
    c.setLineWidth(28)
    c.circle(1010, top(192), 104, stroke=1, fill=0)
    for x, y, label, fill in [
        (790, 190, "Humans", PAPER),
        (980, 445, "AI agents", PAPER),
        (902, 306, "Market", EMBER),
    ]:
        rect_top(c, x, y, 150, 54, fill, radius=10)
        text(c, x + 27, y + 33, label.upper(), 13, INK, "ArialBold")
    text(c, 780, 548, "SHARED RAILS: SIGNAL - RULES - FEEDBACK", 11, HexColor("#8C8C88"), "ArialBold")
    c.showPage()


def slide2(c):
    rect_top(c, 0, 0, W, H, PAPER)
    draw_grid(c)
    top_line(c, 2, "MCP")
    y = headline(c, 62, 156, "Agents do not scrape the app. They use tools.", size=59, max_width=610)
    text(c, 62, y + 18, "A real MCP surface lets agents discover markets, inspect limits, and place idempotent predictions.", 24, MUTED, "ArialBold", 30, 610)
    for i, item in enumerate(["Same market rules as humans", "Bearer-scoped write access", "No backdoors, no hidden odds"]):
        y0 = 430 + i * 72
        rect_top(c, 62, y0, 520, 54, WHITE, HexColor("#DFDDD4"), 10)
        rect_top(c, 82, y0 + 10, 36, 34, INK, radius=8)
        c.setFillColor(WHITE)
        c.setFont(font("ArialBold"), 11)
        c.drawCentredString(100, top(y0 + 32), f"0{i + 1}")
        text(c, 136, y0 + 34, item, 20, INK, "ArialBold")

    rect_top(c, 690, 120, 494, 448, HexColor("#111316"), HexColor("#2A2C30"), 10)
    rect_top(c, 690, 120, 494, 54, HexColor("#111316"), HexColor("#2A2C30"), 10)
    for i, col in enumerate([HexColor("#FF5A5A"), WARN, MINT]):
        rect_top(c, 716 + i * 22, 141, 12, 12, col, radius=6)
    rect_top(c, 1070, 136, 86, 26, MINT, radius=13)
    text(c, 1084, 153, "MCP TOOLS", 9, INK, "ArialBold")
    code_y = 215
    code = [
        ("tools/list", EMBER),
        ("  list_markets", MINT),
        ("  get_wallet", MINT),
        ("  preview_prediction", MINT),
        ("  place_prediction", MINT),
        ("", WHITE),
        ("{ amountCredits: 100,", WHITE),
        ('  requestId: "agent-run-001" }', WHITE),
    ]
    for line, color in code:
        text(c, 724, code_y, line, 23, color, "ArialBold")
        code_y += 40
    footer(c, "https://vota.wtf/mcp", "2025-06-18")
    c.showPage()


def slide3(c):
    rect_top(c, 0, 0, W, H, PAPER)
    draw_grid(c)
    top_line(c, 3, "Signal")
    y = headline(c, 62, 156, "Polls count clicks. Markets reveal conviction.", size=59, max_width=570)
    text(c, 62, y + 18, "Separate human belief, agent belief, whale-resistant conviction, and odds over time.", 24, MUTED, "ArialBold", 31, 570)

    for i, (label, color, width) in enumerate([
        ("Human signal", EMBER, 350),
        ("Agent signal", SKY, 275),
        ("Conviction signal", MINT, 404),
    ]):
        y0 = 116 + i * 118
        rect_top(c, 676, y0, 506, 92, WHITE, HexColor("#DFDDD4"), 10)
        text(c, 700, y0 + 34, label, 18, INK, "ArialBlack")
        rect_top(c, 700, y0 + 57, 430, 18, SOFT, radius=9)
        rect_top(c, 700, y0 + 57, width, 18, color, radius=9)

    rect_top(c, 676, 478, 506, 160, WHITE, HexColor("#DFDDD4"), 10)
    text(c, 1028, 506, "ODDS OVER TIME", 10, MUTED, "ArialBold")
    for gx in range(705, 1150, 62):
        c.setStrokeColor(HexColor("#ECEAE3"))
        c.setLineWidth(1)
        c.line(gx, top(610), gx, top(520))
    c.setLineWidth(7)
    c.setStrokeColor(EMBER)
    c.bezier(710, top(598), 790, top(575), 830, top(538), 894, top(552))
    c.bezier(894, top(552), 958, top(570), 1010, top(500), 1150, top(514))
    c.setStrokeColor(SKY)
    c.bezier(710, top(530), 800, top(544), 846, top(610), 918, top(590))
    c.bezier(918, top(590), 994, top(570), 1058, top(605), 1150, top(586))
    c.setStrokeColor(MINT)
    c.bezier(710, top(586), 780, top(612), 860, top(592), 930, top(618))
    c.bezier(930, top(618), 1005, top(645), 1074, top(560), 1150, top(555))
    c.showPage()


def slide4(c):
    rect_top(c, 0, 0, W, H, INK)
    top_line(c, 4, "Distribution", dark=True)
    y = headline(c, 62, 158, "Events, communities, livestreams, public predictions.", WHITE, 58, 600)
    text(c, 62, y + 18, "Soon: fantasy leagues that run over time, where humans and AI agents compete across many predictions.", 24, HexColor("#CFCFC9"), "ArialBold", 31, 590)

    cards = [
        ("NOW", "Live events", "Turn audience attention into an active market."),
        ("NOW", "Public rooms", "Let communities forecast outcomes in real time."),
        ("SOON", "Fantasy leagues", "Persistent leagues for humans and agents."),
        ("NEXT", "Agent leagues", "Model reasoning vs human judgment."),
    ]
    for i, (tag, title, body) in enumerate(cards):
        x = 690 + (i % 2) * 248
        y0 = 146 + (i // 2) * 216
        rect_top(c, x, y0, 224, 178, HexColor("#1A1B1E"), HexColor("#35363A"), 10)
        text(c, x + 22, y0 + 33, tag, 10, HexColor("#8C8C88"), "ArialBold")
        title_end = text(c, x + 22, y0 + 84, title, 25, WHITE, "ArialBlack", 27, 170)
        text(c, x + 22, max(title_end + 12, y0 + 128), body, 13, HexColor("#B8B8B3"), "ArialBold", 17, 170)
    c.showPage()


def slide5(c):
    rect_top(c, 0, 0, W, H, PAPER)
    draw_grid(c)
    top_line(c, 5, "Demo")
    y = headline(c, 62, 156, "Who predicts better: humans or AI agents?", size=60, max_width=560)
    text(c, 62, y + 18, "Shared markets where human judgment and agent reasoning meet.", 25, MUTED, "ArialBold", 32, 560)

    rect_top(c, 660, 136, 198, 210, WHITE, HexColor("#DFDDD4"), 10)
    text(c, 686, 178, "Humans", 18, INK, "ArialBlack")
    text(c, 686, 260, "62%", 68, EMBER, "ArialBlack")
    text(c, 686, 306, "ROOM CONVICTION", 10, MUTED, "ArialBold")
    rect_top(c, 880, 136, 74, 210, INK, radius=10)
    c.setFillColor(WHITE)
    c.setFont(font("ArialBlack"), 20)
    c.drawCentredString(917, top(250), "VS")
    rect_top(c, 976, 136, 198, 210, WHITE, HexColor("#DFDDD4"), 10)
    text(c, 1002, 178, "AI agents", 18, INK, "ArialBlack")
    text(c, 1002, 260, "49%", 68, SKY, "ArialBlack")
    text(c, 1002, 306, "MCP SIGNAL", 10, MUTED, "ArialBold")

    rect_top(c, 660, 380, 514, 174, INK, radius=10)
    c.setLineWidth(8)
    c.setStrokeColor(EMBER)
    c.bezier(692, top(508), 770, top(514), 825, top(444), 886, top(456))
    c.bezier(886, top(456), 950, top(468), 1015, top(414), 1140, top(420))
    c.setStrokeColor(SKY)
    c.bezier(692, top(434), 772, top(458), 830, top(462), 894, top(488))
    c.bezier(894, top(488), 968, top(520), 1040, top(478), 1140, top(474))
    for x, label in [(686, "SCAN"), (826, "PREDICT"), (970, "ODDS MOVE"), (1086, "WINNER")]:
        text(c, x, 586, label, 10, HexColor("#B8B8B3"), "ArialBold")
    footer(c, "vota.wtf", "humans x MCP agents")
    c.showPage()


def slide1_v2(c):
    rect_top(c, 0, 0, W, H, INK)
    top_line(c, 1, "Hook", dark=True)
    y = headline(c, 62, 132, "Enterprises are moving from copilots to autonomy.", color=WHITE, size=56, max_width=690)
    text(c, 62, y + 22, "But autonomy is blocked by missing infrastructure: identity, limits, evaluation, and accountability.", 24, HexColor("#CFCFC9"), "ArialBold", 30, 680)
    y = 430
    for item in [
        "Autonomous agents need measurable trust.",
        "Humans need to stay in the loop.",
        "Accuracy has to become reputation.",
        "We research the Human + AI interaction layer.",
    ]:
        y = bullet(c, 64, y, item, dark=True) + 8

    rect_top(c, 748, 124, 430, 450, HexColor("#111316"), HexColor("#34363A"), 10)
    text(c, 800, 178, "THE BLOCKER", 13, HexColor("#8C8C88"), "ArialBold")
    text(c, 800, 226, "AUTONOMY", 34, WHITE, "ArialBlack")
    text(c, 800, 272, "without infrastructure", 18, HexColor("#CFCFC9"), "ArialBold")
    c.setStrokeColor(EMBER)
    c.setLineWidth(16)
    c.line(812, top(344), 1114, top(266))
    c.setStrokeColor(SKY)
    c.setLineWidth(16)
    c.line(812, top(420), 1114, top(498))
    rect_top(c, 806, 372, 132, 52, PAPER, radius=10)
    text(c, 832, 405, "Identity", 14, INK, "ArialBlack")
    rect_top(c, 980, 338, 132, 52, PAPER, radius=10)
    text(c, 1008, 371, "Limits", 14, INK, "ArialBlack")
    rect_top(c, 894, 460, 132, 52, MINT, radius=10)
    text(c, 914, 493, "Evaluation", 14, INK, "ArialBlack")
    text(c, 800, 548, "Research lab for autonomy infrastructure.", 13, HexColor("#8C8C88"), "ArialBold")
    c.showPage()


def slide2_v2(c):
    rect_top(c, 0, 0, W, H, PAPER)
    draw_grid(c)
    top_line(c, 2, "Forecasting Network")
    y = headline(c, 62, 126, "Everyone is building AI agents. Nobody knows which agents are right.", size=49, max_width=720)
    text(c, 62, y + 22, "Vota is a forecasting network where humans and AI agents compete on future outcomes and earn reputation based on accuracy.", 23, MUTED, "ArialBold", 30, 690)

    cards = [
        ("HUMANS", "Forecast from the room"),
        ("AI AGENTS", "Forecast through MCP"),
        ("ACCURACY", "Builds reputation"),
        ("TRUST", "Compounds over time"),
    ]
    for i, (title, body) in enumerate(cards):
        x = 70 + (i % 2) * 330
        y0 = 420 + (i // 2) * 96
        rect_top(c, x, y0, 288, 72, WHITE, HexColor("#DFDDD4"), 10)
        rect_top(c, x + 18, y0 + 18, 36, 36, EMBER if i < 2 else MINT, radius=9)
        text(c, x + 70, y0 + 31, title, 13, INK, "ArialBlack")
        text(c, x + 70, y0 + 55, body, 13, MUTED, "ArialBold")

    rect_top(c, 780, 130, 360, 450, INK, radius=10)
    text(c, 818, 188, "HUMAN + AI", 13, HexColor("#8C8C88"), "ArialBold")
    text(c, 818, 236, "forecasting", 38, WHITE, "ArialBlack")
    text(c, 818, 286, "Collective intelligence for humans and AI agents.", 18, HexColor("#CFCFC9"), "ArialBold", 24, 280)
    c.setStrokeColor(SKY)
    c.setLineWidth(14)
    c.line(820, top(392), 1100, top(326))
    c.setStrokeColor(MINT)
    c.setLineWidth(14)
    c.line(820, top(460), 1100, top(394))
    c.setStrokeColor(EMBER)
    c.setLineWidth(14)
    c.line(820, top(528), 1100, top(462))
    footer(c, "decision intelligence platform", "accuracy - reputation - trust")
    c.showPage()


def slide3_v2(c):
    rect_top(c, 0, 0, W, H, PAPER)
    draw_grid(c)
    top_line(c, 3, "Trust Layer")
    y = headline(c, 62, 144, "A trust layer for AI decision-making.", size=57, max_width=720)
    text(c, 62, y + 20, "Forecasting is the first use case. The network reveals who makes better decisions over time.", 23, MUTED, "ArialBold", 30, 600)

    for i, item in enumerate(["Security: what can the agent do?", "Identity: who made the call?", "Compliance: was the action allowed?", "Receipts create an audit trail"]):
        y0 = 424 + i * 54
        rect_top(c, 62, y0, 536, 42, WHITE, HexColor("#DFDDD4"), 9)
        rect_top(c, 80, y0 + 10, 26, 24, EMBER if i < 2 else MINT, radius=7)
        c.setFillColor(INK)
        c.setFont(font("ArialBlack"), 11)
        c.drawCentredString(93, top(y0 + 27), str(i + 1))
        text(c, 124, y0 + 27, item, 16, INK, "ArialBold")

    rect_top(c, 724, 136, 420, 410, WHITE, HexColor("#DFDDD4"), 10)
    text(c, 756, 190, "DECISION SIGNAL", 13, MUTED, "ArialBold")
    text(c, 756, 242, "Humans", 24, INK, "ArialBlack")
    rect_top(c, 756, 270, 300, 18, SOFT, radius=9)
    rect_top(c, 756, 270, 222, 18, EMBER, radius=9)
    text(c, 756, 336, "AI agents", 24, INK, "ArialBlack")
    rect_top(c, 756, 364, 300, 18, SOFT, radius=9)
    rect_top(c, 756, 364, 174, 18, SKY, radius=9)
    text(c, 756, 430, "Risk signal", 24, INK, "ArialBlack")
    rect_top(c, 756, 458, 300, 18, SOFT, radius=9)
    rect_top(c, 756, 458, 252, 18, MINT, radius=9)
    text(c, 756, 512, "A live game today. Agentic trust infrastructure tomorrow.", 13, MUTED, "ArialBold", 18, 330)
    footer(c, "forecasting network", "security - identity - compliance")
    c.showPage()


def slide4_v2(c):
    rect_top(c, 0, 0, W, H, INK)
    top_line(c, 4, "Product + MCP", dark=True)
    y = headline(c, 62, 126, "Forecasting rooms grow into leagues.", WHITE, 54, 520)
    text(c, 62, y + 20, "Events, livestreams, fantasy leagues, agent leagues, and public forecasting rooms.", 23, HexColor("#CFCFC9"), "ArialBold", 30, 520)

    cards = [
        ("EVENTS", "Room signal on stage"),
        ("LIVESTREAMS", "Audience markets live"),
        ("FANTASY", "Communities over time"),
        ("AGENTS", "Models vs humans"),
    ]
    for i, (title, body) in enumerate(cards):
        x = 62 + (i % 2) * 232
        y0 = 390 + (i // 2) * 106
        rect_top(c, x, y0, 206, 84, HexColor("#1A1B1E"), HexColor("#35363A"), 10)
        text(c, x + 18, y0 + 34, title, 13, MINT if i >= 2 else WHITE, "ArialBlack")
        text(c, x + 18, y0 + 60, body, 12, HexColor("#B8B8B3"), "ArialBold", 16, 160)

    rect_top(c, 642, 96, 540, 548, HexColor("#111316"), HexColor("#2A2C30"), 10)
    rect_top(c, 642, 96, 540, 54, HexColor("#111316"), HexColor("#2A2C30"), 10)
    for i, col in enumerate([HexColor("#FF5A5A"), WARN, MINT]):
        rect_top(c, 668 + i * 22, 117, 12, 12, col, radius=6)
    rect_top(c, 1058, 112, 92, 26, MINT, radius=13)
    text(c, 1074, 129, "MCP CALL", 9, INK, "ArialBold")
    code_y = 182
    code = [
        ("{", HexColor("#CFCFC9")),
        ('  "method": "tools/call",', WHITE),
        ('  "params": {', WHITE),
        ('    "name": "place_prediction",', MINT),
        ('    "arguments": {', WHITE),
        ('      "marketId": "market_id_here",', SKY),
        ('      "outcomeId": "outcome_id_here",', SKY),
        ('      "amountCredits": 100,', WARN),
        ('      "requestId": "agent-run-001"', EMBER),
        ("    }", WHITE),
        ("  }", WHITE),
        ("}", HexColor("#CFCFC9")),
    ]
    for line, color in code:
        text(c, 676, code_y, line, 15, color, "ArialBold")
        code_y += 28
    text(c, 676, 570, "Agents use the same limits and rules as humans.", 15, HexColor("#CFCFC9"), "ArialBold")
    footer(c, "https://vota.wtf/mcp", "native agent interface", dark=True)
    c.showPage()


def slide5_v2(c):
    rect_top(c, 0, 0, W, H, PAPER)
    draw_grid(c)
    top_line(c, 5, "Join")
    y = headline(c, 62, 150, "Join the room.", size=66, max_width=520)
    text(c, 62, y + 22, "Scan the QR code, pick an outcome, and watch humans compete with AI agents live.", 24, MUTED, "ArialBold", 31, 530)

    for i, item in enumerate(["Enter Megathon Finals", "Make one prediction", "Watch the room signal move"]):
        y0 = 432 + i * 54
        rect_top(c, 62, y0, 436, 42, WHITE, HexColor("#DFDDD4"), 9)
        rect_top(c, 80, y0 + 10, 26, 24, EMBER if i < 2 else MINT, radius=7)
        c.setFillColor(INK)
        c.setFont(font("ArialBlack"), 11)
        c.drawCentredString(93, top(y0 + 27), str(i + 1))
        text(c, 124, y0 + 27, item, 16, INK, "ArialBold")

    rect_top(c, 622, 118, 560, 298, HexColor("#F5F4F0"), HexColor("#D8D5CC"), 10)
    rect_top(c, 646, 142, 512, 250, HexColor("#ECEAE3"), HexColor("#D8D5CC"), 8)
    c.setStrokeColor(HexColor("#C8C4BA"))
    c.setLineWidth(2)
    c.line(646, top(392), 1158, top(142))
    c.line(646, top(142), 1158, top(392))
    text(c, 816, 254, "TEAM PHOTO", 28, INK, "ArialBlack")
    text(c, 768, 288, "horizontal image placeholder", 15, MUTED, "ArialBold")

    rect_top(c, 622, 448, 286, 166, INK, radius=10)
    text(c, 648, 492, "MEGATHON FINALS", 13, HexColor("#8C8C88"), "ArialBold")
    text(c, 648, 536, "vota.wtf", 32, WHITE, "ArialBlack")
    text(c, 648, 570, "Humans x AI agents", 16, HexColor("#CFCFC9"), "ArialBold")

    rect_top(c, 936, 432, 246, 206, WHITE, HexColor("#DFDDD4"), 10)
    draw_qr(c, JOIN_URL, 970, 456, 142)
    text(c, 958, 620, "www.vota.wtf/join/megathon-finals", 10, MUTED, "ArialBold")
    footer(c, "vota.wtf", "scan to join")
    c.showPage()


def main():
    register_fonts()
    variant = sys.argv[1].lower() if len(sys.argv) > 1 else "v1"
    if variant in {"v2", "plain", "accessible"}:
        out = OUT_V2
        title = "vota.wtf Finals Pitch - Plain Language"
        slides = [slide1_v2, slide2_v2, slide3_v2, slide4_v2, slide5_v2]
        write_qr_svg()
    else:
        out = OUT
        title = "vota.wtf Finals Pitch"
        slides = [slide1, slide2, slide3, slide4, slide5]
    c = canvas.Canvas(out, pagesize=(W, H))
    c.setTitle(title)
    for slide in slides:
        slide(c)
    c.save()
    print(out)


if __name__ == "__main__":
    main()
