# -*- coding: utf-8 -*-
"""Build CyberShield_Final_Project_Report.pdf and CyberShield_Project_Architecture.pdf."""

import os
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

import docmodel as dm

OUT = os.path.join(dm.HERE, "CyberShield_Final_Project_Report.pdf")
ARCH_OUT = os.path.join(dm.HERE, "CyberShield_Project_Architecture.pdf")

PAGE_W, PAGE_H = A4
MARGIN_L = 2.3 * cm
MARGIN_R = 2.1 * cm
MARGIN_T = 2.2 * cm
MARGIN_B = 2.0 * cm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

INK = colors.HexColor("#111111")
ACCENT = colors.HexColor("#1F3B54")
RULE = colors.HexColor("#B9C6D3")

S = {}
S["body"] = ParagraphStyle("body", fontName="Times-Roman", fontSize=10.7, leading=15.4,
                           alignment=TA_JUSTIFY, spaceAfter=5)
S["h1"] = ParagraphStyle("h1", fontName="Times-Bold", fontSize=16, leading=21, alignment=TA_CENTER,
                         textColor=ACCENT, spaceBefore=0, spaceAfter=14, keepWithNext=1)
S["h2"] = ParagraphStyle("h2", fontName="Times-Bold", fontSize=12.6, leading=16.4, textColor=ACCENT,
                         spaceBefore=11, spaceAfter=5, keepWithNext=1)
S["h3"] = ParagraphStyle("h3", fontName="Times-BoldItalic", fontSize=11.2, leading=15,
                         spaceBefore=8, spaceAfter=3, keepWithNext=1)
S["cap"] = ParagraphStyle("cap", fontName="Times-Italic", fontSize=9, leading=12, alignment=TA_CENTER,
                          spaceBefore=3, spaceAfter=11, textColor=colors.HexColor("#333333"))
S["tabcap"] = ParagraphStyle("tabcap", fontName="Times-Bold", fontSize=9.3, leading=12.5,
                             alignment=TA_LEFT, spaceBefore=7, spaceAfter=4, keepWithNext=1)
S["cell"] = ParagraphStyle("cell", fontName="Times-Roman", fontSize=8.2, leading=10.4, alignment=TA_LEFT)
S["cellh"] = ParagraphStyle("cellh", fontName="Times-Bold", fontSize=8.3, leading=10.6, alignment=TA_LEFT)
S["code"] = ParagraphStyle("code", fontName="Courier", fontSize=7.1, leading=9.2, alignment=TA_LEFT,
                           backColor=colors.HexColor("#F3F4F6"), borderPadding=(3, 4, 3, 4),
                           spaceBefore=2, spaceAfter=2)
S["bullet"] = ParagraphStyle("bullet", parent=S["body"], leftIndent=13, bulletIndent=2, spaceAfter=3)
S["num"] = ParagraphStyle("num", parent=S["body"], leftIndent=17, bulletIndent=0, spaceAfter=3)
S["toc"] = ParagraphStyle("toc", fontName="Times-Roman", fontSize=10.2, leading=13.6)
S["toc1"] = ParagraphStyle("toc1", parent=S["toc"], fontName="Times-Bold", fontSize=10.8, spaceBefore=5)
S["toc2"] = ParagraphStyle("toc2", parent=S["toc"], leftIndent=12)
S["toc3"] = ParagraphStyle("toc3", parent=S["toc"], leftIndent=26, fontSize=9.6)
S["front"] = ParagraphStyle("front", fontName="Times-Roman", fontSize=13, leading=19, alignment=TA_CENTER)
S["frontTitle"] = ParagraphStyle("frontTitle", fontName="Times-Bold", fontSize=20, leading=25,
                                 alignment=TA_CENTER, textColor=ACCENT, spaceAfter=14)
S["frontSmall"] = ParagraphStyle("frontSmall", fontName="Times-Roman", fontSize=10.5, leading=14,
                                 alignment=TA_CENTER)
S["cover"] = ParagraphStyle("cover", fontName="Times-Roman", fontSize=11.5, leading=16, alignment=TA_CENTER)


class NumberedCanvas(pdfcanvas.Canvas):
    """Draws 'Page n of m' once the total page count is known."""

    def __init__(self, *args, **kwargs):
        pdfcanvas.Canvas.__init__(self, *args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._draw_furniture(total)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _draw_furniture(self, total):
        page = self._pageNumber
        if page == 1:
            return
        self.saveState()
        self.setFont("Times-Italic", 8)
        self.setFillColor(colors.HexColor("#555555"))
        self.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 1.25 * cm,
                             "CyberShield - AI-Powered Cybersecurity Awareness and Protection Platform")
        self.setStrokeColor(RULE)
        self.setLineWidth(0.4)
        self.line(MARGIN_L, PAGE_H - 1.45 * cm, PAGE_W - MARGIN_R, PAGE_H - 1.45 * cm)
        self.setFont("Times-Roman", 9)
        self.drawCentredString(PAGE_W / 2.0, 1.25 * cm, "Page %d of %d" % (page, total))
        self.restoreState()


class Report(BaseDocTemplate):
    def __init__(self, filename, **kw):
        BaseDocTemplate.__init__(self, filename, pagesize=A4,
                                 leftMargin=MARGIN_L, rightMargin=MARGIN_R,
                                 topMargin=MARGIN_T, bottomMargin=MARGIN_B,
                                 title="CyberShield - Final Project Report",
                                 author=", ".join(n for n, _ in dm.TEAM),
                                 subject="AI-Powered Cybersecurity Awareness and Protection Platform",
                                 **kw)
        frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B, id="body",
                      leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="main", frames=[frame])])
        self.page_of = {}

    def afterFlowable(self, flowable):
        key = getattr(flowable, "_key", None)
        if key:
            self.page_of[key] = self.page


def P(text, style="body"):
    return Paragraph(escape(text).replace("\n", "<br/>"), S[style])


def headings_flowables():
    """Body flowables plus the keys used to resolve page numbers."""
    flow = []
    fig_i = 0
    tab_i = 0
    head_i = 0
    first = True

    for blk in dm.BLOCKS:
        kind = blk[0]
        if kind == "h1":
            if not first:
                flow.append(PageBreak())
            first = False
            p = Paragraph(escape(blk[1]), S["h1"])
            p._key = ("h", head_i)
            head_i += 1
            flow.append(p)
        elif kind == "h2":
            p = Paragraph(escape(blk[1]), S["h2"])
            p._key = ("h", head_i)
            head_i += 1
            flow.append(p)
        elif kind == "h3":
            p = Paragraph(escape(blk[1]), S["h3"])
            p._key = ("h", head_i)
            head_i += 1
            flow.append(p)
        elif kind == "p":
            flow.append(P(blk[1]))
        elif kind == "b":
            for item in blk[1]:
                flow.append(Paragraph(escape(item).replace("\n", "<br/>"), S["bullet"], bulletText="\u2022"))
        elif kind == "n":
            for i, item in enumerate(blk[1], 1):
                flow.append(Paragraph(escape(item).replace("\n", "<br/>"), S["num"], bulletText="%d." % i))
        elif kind == "table":
            cap = Paragraph(escape(blk[1]), S["tabcap"])
            cap._key = ("t", tab_i)
            tab_i += 1
            flow.append(cap)
            flow.append(make_table(blk[2], blk[3]))
            flow.append(Spacer(1, 8))
        elif kind == "fig":
            path, text, width = blk[1], blk[2], blk[3]
            from reportlab.lib.utils import ImageReader

            iw, ih = ImageReader(path).getSize()
            w = min(width * cm, CONTENT_W)
            h = w * ih / float(iw)
            max_h = PAGE_H - MARGIN_T - MARGIN_B - 3.2 * cm
            if h > max_h:
                h = max_h
                w = h * iw / float(ih)
            img = Image(path, width=w, height=h)
            img.hAlign = "CENTER"
            cap = Paragraph(escape(text), S["cap"])
            cap._key = ("f", fig_i)
            fig_i += 1
            flow.append(KeepTogether([img, cap]))
            flow.append(Spacer(1, 4))
        elif kind == "code":
            for line in blk[1].split("\n"):
                flow.append(Paragraph(escape(line if line else " ").replace(" ", "&nbsp;"), S["code"]))
            flow.append(Spacer(1, 6))
    return flow


def make_table(headers, rows):
    n = len(headers)
    longest = []
    for i in range(n):
        cells = [str(headers[i])] + [str(r[i]) for r in rows if i < len(r)]
        longest.append(max(5, min(max(len(c) for c in cells), 70)))
    weight = float(sum(longest))
    widths = [max(1.5 * cm, CONTENT_W * (w / weight)) for w in longest]
    scale = CONTENT_W / sum(widths)
    widths = [w * scale for w in widths]

    data = [[Paragraph(escape(str(h)), S["cellh"]) for h in headers]]
    for r in rows:
        data.append([Paragraph(escape(str(r[i])) if i < len(r) else "", S["cell"]) for i in range(n)])

    t = Table(data, colWidths=widths, repeatRows=1, hAlign="CENTER")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#9AA7B4")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EDF3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
    ]))
    return t


def front_matter(page_of, total_hint=None):
    p = dm.PLACEHOLDERS
    flow = []

    # ---------------- cover
    flow.append(Spacer(1, 1.6 * cm))
    flow.append(Paragraph("PROJECT REPORT", ParagraphStyle(
        "x", parent=S["frontSmall"], fontName="Times-Bold", fontSize=10.5, textColor=colors.HexColor("#444444"))))
    flow.append(Spacer(1, 0.5 * cm))
    flow.append(Paragraph("CyberShield", ParagraphStyle(
        "t", fontName="Times-Bold", fontSize=34, leading=40, alignment=TA_CENTER, textColor=INK)))
    flow.append(Spacer(1, 0.25 * cm))
    flow.append(Paragraph(dm.SUBTITLE, ParagraphStyle(
        "st", fontName="Times-Bold", fontSize=14.5, leading=19, alignment=TA_CENTER, textColor=ACCENT)))
    flow.append(Spacer(1, 0.6 * cm))
    flow.append(Paragraph(dm.REPORT_LABEL, ParagraphStyle(
        "rl", fontName="Times-Italic", fontSize=11.5, alignment=TA_CENTER)))
    flow.append(Spacer(1, 0.3 * cm))
    flow.append(Paragraph("Submitted in partial fulfilment of the requirements for the award of the degree",
                          ParagraphStyle("sb", fontSize=10, alignment=TA_CENTER, leading=13)))
    flow.append(Spacer(1, 0.15 * cm))
    flow.append(Paragraph("Bachelor of Technology", ParagraphStyle(
        "deg", fontName="Times-Bold", fontSize=13, alignment=TA_CENTER)))
    flow.append(Spacer(1, 0.7 * cm))
    for text, size, bold in [
        (p["department"], 10.8, False),
        (p["college"], 13.5, True),
        (p["university"], 10.8, False),
        (p["session"], 10.5, False),
    ]:
        flow.append(Paragraph(escape(text), ParagraphStyle(
            "c%s" % size, fontName="Times-Bold" if bold else "Times-Roman",
            fontSize=size, alignment=TA_CENTER, leading=size + 4)))
    flow.append(Spacer(1, 0.7 * cm))
    flow.append(Paragraph("Submitted by", ParagraphStyle(
        "sb2", fontName="Times-Italic", fontSize=10, alignment=TA_CENTER)))
    flow.append(Spacer(1, 0.2 * cm))

    data = [[Paragraph("<b>Name of the Student</b>", S["cellh"]),
             Paragraph("<b>Roll Number</b>", S["cellh"]),
             Paragraph("<b>Signature</b>", S["cellh"])]]
    for name, roll in dm.TEAM:
        data.append([Paragraph(name, S["cell"]), Paragraph(roll, S["cell"]), Paragraph("", S["cell"])])
    t = Table(data, colWidths=[6.6 * cm, 5.2 * cm, 5.0 * cm], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#9AA7B4")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EDF3")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 0.6 * cm))
    flow.append(Paragraph("Under the guidance of<br/><b>%s</b><br/>%s" % (
        escape(p["supervisor"]), escape(p["designation"])), S["cover"]))
    flow.append(Spacer(1, 0.6 * cm))
    flow.append(Paragraph("%s&nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;%s" % (
        escape(p["place"]), escape(p["month_year"])), S["cover"]))

    # ---------------- certificate
    flow.append(PageBreak())
    flow.append(Paragraph(escape(p["college"]).upper(), S["frontTitle"]))
    flow.append(Paragraph(escape(p["department"]), S["front"]))
    flow.append(Spacer(1, 0.8 * cm))
    flow.append(Paragraph("CERTIFICATE", ParagraphStyle(
        "ct", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=16)))
    flow.append(P(dm.CERTIFICATE.format(session=p["session"])))
    flow.append(Spacer(1, 1.4 * cm))
    sig = [[Paragraph("<br/><br/>____________________________<br/>Signature of the Supervisor", S["cell"]),
            Paragraph("<br/><br/>____________________________<br/>Signature of the Head of the Department", S["cell"])],
           [Paragraph(escape(p["supervisor"]), S["cell"]), Paragraph(escape(p["department"]), S["cell"])]]
    st = Table(sig, colWidths=[7.8 * cm, 7.8 * cm], hAlign="CENTER")
    st.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    flow.append(st)
    flow.append(Spacer(1, 1.2 * cm))
    flow.append(Paragraph("External Examiner: ______________________________", S["body"]))

    # ---------------- declaration
    flow.append(PageBreak())
    flow.append(Paragraph("DECLARATION", ParagraphStyle(
        "dt", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=16)))
    flow.append(P(dm.DECLARATION.format(**p)))
    flow.append(Spacer(1, 1.0 * cm))
    for name, roll in dm.TEAM:
        flow.append(Paragraph("%s &nbsp;&nbsp;(%s)&nbsp;&nbsp;&nbsp;____________________" % (
            escape(name), roll), S["body"]))
    flow.append(Spacer(1, 0.8 * cm))
    flow.append(Paragraph("Date: ______________ &nbsp;&nbsp;&nbsp;&nbsp; Place: %s" % escape(p["place"]), S["body"]))

    # ---------------- acknowledgement
    flow.append(PageBreak())
    flow.append(Paragraph("ACKNOWLEDGEMENT", ParagraphStyle(
        "at", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=16)))
    flow.append(P(dm.ACKNOWLEDGEMENT.format(**p)))

    # ---------------- abstract
    flow.append(PageBreak())
    flow.append(Paragraph("ABSTRACT", ParagraphStyle(
        "abt", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=16)))
    for para in dm.ABSTRACT.split("\n\n"):
        flow.append(P(para))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("<b>Keywords:</b> cybersecurity awareness, phishing detection, adaptive assessment, "
                          "large language model, Gemini API, MongoDB, Express, secure session management, "
                          "threat intelligence.", S["body"]))

    # ---------------- table of contents
    flow.append(PageBreak())
    flow.append(Paragraph("TABLE OF CONTENTS", ParagraphStyle(
        "tt", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=14)))
    flow.extend(index_table(dm.HEADINGS, page_of, "h"))

    # ---------------- list of figures
    flow.append(PageBreak())
    flow.append(Paragraph("LIST OF FIGURES", ParagraphStyle(
        "lf", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=14)))
    rows = []
    for i, (label, cap, _path) in enumerate(dm.FIGURES):
        page = page_of.get(("f", i), "00")
        rows.append((label, cap, page))
    flow.extend(plain_index(rows))

    # ---------------- list of tables
    flow.append(PageBreak())
    flow.append(Paragraph("LIST OF TABLES", ParagraphStyle(
        "lt", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=14)))
    rows = []
    for i, (label, cap) in enumerate(dm.TABLES):
        page = page_of.get(("t", i), "00")
        rows.append((label, cap, page))
    flow.extend(plain_index(rows))

    # ---------------- abbreviations
    flow.append(PageBreak())
    flow.append(Paragraph("LIST OF ABBREVIATIONS", ParagraphStyle(
        "la", fontName="Times-Bold", fontSize=17, alignment=TA_CENTER, spaceAfter=14)))
    abbr = [
        ("API", "Application Programming Interface"),
        ("CSRF", "Cross-Site Request Forgery"),
        ("CSS", "Cascading Style Sheets"),
        ("CVE", "Common Vulnerabilities and Exposures"),
        ("CVSS", "Common Vulnerability Scoring System"),
        ("CWE", "Common Weakness Enumeration"),
        ("HTTP / HTTPS", "Hypertext Transfer Protocol / Secure"),
        ("JSON", "JavaScript Object Notation"),
        ("KEV", "Known Exploited Vulnerabilities (CISA catalogue)"),
        ("KYC", "Know Your Customer"),
        ("LLM", "Large Language Model"),
        ("MFA", "Multi-Factor Authentication"),
        ("NVD", "National Vulnerability Database (NIST)"),
        ("OTP", "One-Time Password"),
        ("OWASP", "Open Worldwide Application Security Project"),
        ("SSRF", "Server-Side Request Forgery"),
        ("TOTP", "Time-based One-Time Password"),
        ("TTL", "Time To Live (index expiry)"),
        ("UPI", "Unified Payments Interface"),
        ("XSS", "Cross-Site Scripting"),
    ]
    data = [[Paragraph("<b>Abbreviation</b>", S["cellh"]), Paragraph("<b>Expansion</b>", S["cellh"])]]
    for a, full in abbr:
        data.append([Paragraph(a, S["cell"]), Paragraph(full, S["cell"])])
    t = Table(data, colWidths=[4.0 * cm, 11.6 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#9AA7B4")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EDF3")),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
    ]))
    flow.append(t)
    flow.append(PageBreak())
    return flow


def index_table(headings, page_of, prefix):
    data = []
    for i, (level, text) in enumerate(headings):
        page = page_of.get((prefix, i), "00")
        style = S["toc1"] if level == 1 else (S["toc2"] if level == 2 else S["toc3"])
        data.append([Paragraph(escape(text), style), Paragraph(str(page), ParagraphStyle(
            "pg", parent=style, alignment=TA_RIGHT))])
    t = Table(data, colWidths=[CONTENT_W - 1.5 * cm, 1.5 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 1.4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 1.4),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return [t]


def plain_index(rows):
    data = []
    for label, cap, page in rows:
        data.append([Paragraph("<b>%s</b>" % escape(label), S["toc"]),
                     Paragraph(escape(cap), S["toc"]),
                     Paragraph(str(page), ParagraphStyle("pg2", parent=S["toc"], alignment=TA_RIGHT))])
    t = Table(data, colWidths=[2.5 * cm, CONTENT_W - 4.1 * cm, 1.6 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 2)]))
    return [t]


def build_report():
    # pass 1: resolve page numbers (index pages already occupy their final space)
    tmp = OUT + ".pass1"
    doc = Report(tmp)
    doc.build(front_matter({}) + headings_flowables(), canvasmaker=NumberedCanvas)
    pages = dict(doc.page_of)

    # pass 2: identical layout, real numbers
    doc = Report(OUT)
    doc.build(front_matter(pages) + headings_flowables(), canvasmaker=NumberedCanvas)
    os.replace(OUT, OUT)
    try:
        os.remove(tmp)
    except OSError:
        pass
    print("saved", OUT, "| resolved entries:", len(pages))
    return OUT


def build_architecture_pdf():
    doc = BaseDocTemplate(ARCH_OUT, pagesize=A4, leftMargin=MARGIN_L, rightMargin=MARGIN_R,
                          topMargin=MARGIN_T, bottomMargin=MARGIN_B,
                          title="CyberShield - Project Architecture Diagrams",
                          author=", ".join(n for n, _ in dm.TEAM))
    frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B, id="b",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="m", frames=[frame])])

    flow = [Paragraph("CyberShield - Project Architecture Diagrams", ParagraphStyle(
        "t", fontName="Times-Bold", fontSize=19, alignment=TA_CENTER, textColor=ACCENT, spaceAfter=6)),
        Paragraph("Companion document to the final project report. Every diagram describes the implemented "
                  "system: Express 5 routes and services, MongoDB Atlas collections, the Google Gemini "
                  "integration and the CISA / NIST threat feeds.",
                  ParagraphStyle("s", fontName="Times-Roman", fontSize=10.5, leading=15, alignment=TA_CENTER,
                                 spaceAfter=16))]

    for label, cap, path in dm.FIGURES:
        if "screenshots" in path:
            continue
        from reportlab.lib.utils import ImageReader

        iw, ih = ImageReader(path).getSize()
        w = min(16.4 * cm, CONTENT_W)
        h = w * ih / float(iw)
        max_h = PAGE_H - MARGIN_T - MARGIN_B - 2.6 * cm
        if h > max_h:
            h = max_h
            w = h * iw / float(ih)
        img = Image(path, width=w, height=h)
        img.hAlign = "CENTER"
        flow.append(PageBreak())
        flow.append(Paragraph("<b>%s</b>&nbsp;&nbsp;%s" % (escape(label), escape(cap)),
                              ParagraphStyle("c", fontName="Times-Roman", fontSize=11, alignment=TA_CENTER,
                                             spaceAfter=10)))
        flow.append(img)

    doc.build(flow, canvasmaker=NumberedCanvas)
    print("saved", ARCH_OUT)
    return ARCH_OUT


if __name__ == "__main__":
    build_report()
    build_architecture_pdf()
