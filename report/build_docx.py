# -*- coding: utf-8 -*-
"""Build CyberShield_Final_Project_Report.docx from the shared document model."""

import os
import re

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

import docmodel as dm

OUT = os.path.join(dm.HERE, "CyberShield_Final_Project_Report.docx")
BODY_FONT = "Times New Roman"
MONO_FONT = "Consolas"


# ----------------------------------------------------------------- helpers
def set_cell_shading(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def add_field(paragraph, instr, placeholder=""):
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run._r.append(fld_begin)

    run2 = paragraph.add_run()
    instr_el = OxmlElement("w:instrText")
    instr_el.set(qn("xml:space"), "preserve")
    instr_el.text = instr
    run2._r.append(instr_el)

    run3 = paragraph.add_run()
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run3._r.append(sep)

    if placeholder:
        paragraph.add_run(placeholder)

    run4 = paragraph.add_run()
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run4._r.append(end)


def style_font(style, name=BODY_FONT, size=None, bold=None, italic=None, color=None):
    style.font.name = name
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), name)
    if size is not None:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if italic is not None:
        style.font.italic = italic
    if color is not None:
        style.font.color.rgb = RGBColor(*color)


def enable_update_fields(doc):
    settings = doc.settings.element
    el = OxmlElement("w:updateFields")
    el.set(qn("w:val"), "true")
    settings.append(el)


def page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Page ")
    r.font.size = Pt(9)
    add_field(p, " PAGE ", "1")
    r2 = p.add_run(" of ")
    r2.font.size = Pt(9)
    add_field(p, " NUMPAGES ", "1")
    for run in p.runs:
        run.font.name = BODY_FONT
        run.font.size = Pt(9)


def header_text(section, text):
    header = section.header
    header.is_linked_to_previous = False
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(text)
    run.font.name = BODY_FONT
    run.font.size = Pt(8.5)
    run.font.italic = True
    run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)


def shade_paragraph(paragraph, hex_fill="F4F5F7"):
    pPr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    pPr.append(shd)


def caption(doc, text, kind="figure"):
    p = doc.add_paragraph(text, style="CaptionX")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return p


def add_text(doc, text, style="BodyTextX"):
    p = doc.add_paragraph(text, style=style)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(item, style="BulletX")
    return


def add_numbers(doc, items):
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph("%d.  %s" % (i, item), style="NumberX")


def add_code(doc, text):
    for line in text.split("\n"):
        p = doc.add_paragraph(line if line else " ", style="CodeX")
        shade_paragraph(p)


def column_widths(headers, rows, total_mm=160.0):
    n = len(headers)
    if n == 1:
        return [total_mm]
    longest = []
    for i in range(n):
        cells = [str(headers[i])] + [str(r[i]) for r in rows if i < len(r)]
        longest.append(max(4, min(max(len(c) for c in cells), 70)))
    weight = sum(longest)
    widths = [max(16.0, total_mm * (w / weight)) for w in longest]
    scale = total_mm / sum(widths)
    return [w * scale for w in widths]


def add_table(doc, caption_text, headers, rows):
    caption(doc, caption_text, "table")
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    widths = column_widths(headers, rows)
    hdr = table.rows[0]
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(str(h))
        run.bold = True
        run.font.size = Pt(8.5)
        run.font.name = BODY_FONT
        set_cell_shading(cell, "E8EDF3")
        cell.width = Cm(widths[i] / 10.0)

    trPr = hdr._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    trPr.append(tbl_header)

    for r in rows:
        cells = table.add_row().cells
        for i in range(len(headers)):
            text = str(r[i]) if i < len(r) else ""
            cell = cells[i]
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            run = p.add_run(text)
            run.font.size = Pt(8.5)
            run.font.name = BODY_FONT
            cell.width = Cm(widths[i] / 10.0)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table


# ----------------------------------------------------------------- document
def build():
    doc = Document()

    # page setup
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.left_margin = Cm(2.5)
    sec.right_margin = Cm(2.2)
    sec.top_margin = Cm(2.3)
    sec.bottom_margin = Cm(2.2)
    sec.header_distance = Cm(1.1)
    sec.footer_distance = Cm(1.1)

    styles = doc.styles
    normal = styles["Normal"]
    style_font(normal, size=11.5)
    normal.paragraph_format.line_spacing = 1.35
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    for name, size, bold, italic, before, after, align in [
        ("BodyTextX", 11.5, False, False, 0, 6, WD_ALIGN_PARAGRAPH.JUSTIFY),
        ("H1X", 16, True, False, 0, 14, WD_ALIGN_PARAGRAPH.CENTER),
        ("H2X", 13, True, False, 12, 6, WD_ALIGN_PARAGRAPH.LEFT),
        ("H3X", 11.8, True, True, 10, 4, WD_ALIGN_PARAGRAPH.LEFT),
        ("CaptionX", 9.5, False, True, 3, 10, WD_ALIGN_PARAGRAPH.CENTER),
        ("BulletX", 11.2, False, False, 0, 3, WD_ALIGN_PARAGRAPH.JUSTIFY),
        ("NumberX", 11.2, False, False, 0, 3, WD_ALIGN_PARAGRAPH.JUSTIFY),
        ("CodeX", 7.8, False, False, 0, 0, WD_ALIGN_PARAGRAPH.LEFT),
        ("FrontX", 13, False, False, 0, 10, WD_ALIGN_PARAGRAPH.CENTER),
    ]:
        st = styles.add_style(name, 1)  # paragraph
        st.base_style = styles["Normal"]
        st.font.name = MONO_FONT if name == "CodeX" else BODY_FONT
        st.font.size = Pt(size)
        st.font.bold = bold
        st.font.italic = italic
        st.paragraph_format.space_before = Pt(before)
        st.paragraph_format.space_after = Pt(after)
        st.paragraph_format.alignment = align
        if name == "CodeX":
            st.paragraph_format.line_spacing = 1.0
        if name == "H1X":
            st.paragraph_format.page_break_before = True
        if name in ("BulletX",):
            st.paragraph_format.left_indent = Cm(0.7)
            st.paragraph_format.first_line_indent = Cm(-0.35)
        if name == "NumberX":
            st.paragraph_format.left_indent = Cm(0.8)
            st.paragraph_format.first_line_indent = Cm(-0.8)

    page_number_footer(sec)
    header_text(sec, "CyberShield - AI-Powered Cybersecurity Awareness and Protection Platform")

    P = dm.PLACEHOLDERS

    # ------------------------------------------------ cover
    def blank(n=1):
        for _ in range(n):
            doc.add_paragraph()

    blank(2)
    t = doc.add_paragraph(style="FrontX")
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run("PROJECT REPORT")
    r.font.size = Pt(12)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    blank(1)
    t = doc.add_paragraph(style="FrontX")
    r = t.add_run("CyberShield")
    r.font.size = Pt(34)
    r.font.bold = True

    t = doc.add_paragraph(style="FrontX")
    r = t.add_run(dm.SUBTITLE)
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1F, 0x3B, 0x54)

    blank(1)
    t = doc.add_paragraph(style="FrontX")
    r = t.add_run(dm.REPORT_LABEL)
    r.font.size = Pt(12)
    r.font.italic = True

    t = doc.add_paragraph(style="FrontX")
    t.add_run(dm.SUBMITTED + "\nof the degree").font.size = Pt(11)

    t = doc.add_paragraph(style="FrontX")
    r = t.add_run("Bachelor of Technology")
    r.font.size = Pt(13)
    r.font.bold = True

    blank(1)
    for text, size, bold in [
        (P["department"], 11.5, False),
        (P["college"], 13, True),
        (P["university"], 11.5, False),
        (P["session"], 11, False),
    ]:
        p = doc.add_paragraph(style="FrontX")
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.font.bold = bold

    blank(1)
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("Submitted by")
    r.font.size = Pt(10.5)
    r.font.italic = True

    team = doc.add_table(rows=1, cols=3)
    team.style = "Table Grid"
    team.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = team.rows[0].cells
    for i, h in enumerate(["Name of the Student", "Roll Number", "Signature"]):
        hdr[i].text = ""
        run = hdr[i].paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(9.5)
        set_cell_shading(hdr[i], "E8EDF3")
    for name, roll in dm.TEAM:
        cells = team.add_row().cells
        for i, val in enumerate([name, roll, ""]):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(val)
            run.font.size = Pt(9.5)

    blank(1)
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("Under the guidance of\n" + P["supervisor"] + "\n" + P["designation"])
    r.font.size = Pt(10.5)

    blank(1)
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run(P["place"] + "    \u2022    " + P["month_year"])
    r.font.size = Pt(10.5)

    # ------------------------------------------------ certificate
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run(dm.PLACEHOLDERS["college"].upper())
    r.font.size = Pt(15)
    r.font.bold = True

    p = doc.add_paragraph(style="FrontX")
    r = p.add_run(dm.PLACEHOLDERS["department"])
    r.font.size = Pt(11.5)

    blank(1)
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("CERTIFICATE")
    r.font.size = Pt(18)
    r.font.bold = True

    blank(1)
    add_text(doc, dm.CERTIFICATE.format(session=P["session"]), "BodyTextX")

    blank(1)
    signed = doc.add_table(rows=2, cols=2)
    signed.alignment = WD_TABLE_ALIGNMENT.CENTER
    labels = [
        ("Signature of the Supervisor", "Signature of the Head of the Department"),
        (P["supervisor"], P["department"]),
    ]
    for r_i, row in enumerate(labels):
        for c_i, val in enumerate(row):
            cell = signed.rows[r_i].cells[c_i]
            cell.text = ""
            para = cell.paragraphs[0]
            run = para.add_run(("\n\n" if r_i == 0 else "") + val)
            run.font.size = Pt(10)

    blank(1)
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("External Examiner: ______________________________")
    r.font.size = Pt(10)

    # ------------------------------------------------ declaration
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("DECLARATION")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)
    add_text(doc, dm.DECLARATION.format(**P), "BodyTextX")

    blank(1)
    for name, roll in dm.TEAM:
        p = doc.add_paragraph(style="FrontX")
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run("%s  (%s)   ____________________" % (name, roll))
        r.font.size = Pt(10.5)

    blank(1)
    p = doc.add_paragraph(style="FrontX")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run("Date: ______________        Place: " + P["place"])
    r.font.size = Pt(10.5)

    # ------------------------------------------------ acknowledgement
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("ACKNOWLEDGEMENT")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)
    add_text(doc, dm.ACKNOWLEDGEMENT.format(**P), "BodyTextX")

    # ------------------------------------------------ abstract
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("ABSTRACT")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)
    for para in dm.ABSTRACT.split("\n\n"):
        add_text(doc, para, "BodyTextX")

    p = doc.add_paragraph(style="BodyTextX")
    r = p.add_run("Keywords: ")
    r.bold = True
    p.add_run("cybersecurity awareness, phishing detection, adaptive assessment, large language model, "
              "Gemini API, MongoDB, Express, secure session management, threat intelligence.")

    # ------------------------------------------------ table of contents
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("TABLE OF CONTENTS")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)

    note = doc.add_paragraph(style="CaptionX")
    note.add_run("The table of contents below is a live field. In Microsoft Word it is refreshed automatically "
                 "when the document is opened; press Ctrl+A then F9 if a prompt does not appear. The PDF edition "
                 "of this report contains the same contents with page numbers already resolved.")

    p = doc.add_paragraph()
    add_field(p, ' TOC \\o "1-3" \\h \\z \\u ', "Right-click here and choose Update Field to generate the table of contents.")

    # list of figures / tables
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("LIST OF FIGURES")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)
    for label, cap, _path in dm.FIGURES:
        p = doc.add_paragraph(style="NumberX")
        p.paragraph_format.first_line_indent = Cm(-0.0)
        p.paragraph_format.left_indent = Cm(0)
        p.paragraph_format.space_after = Pt(2)
        p.add_run(label + "\t").bold = True
        p.add_run(cap)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(0.1))

    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("LIST OF TABLES")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)
    for label, cap in dm.TABLES:
        p = doc.add_paragraph(style="NumberX")
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.left_indent = Cm(0)
        p.paragraph_format.space_after = Pt(2)
        p.add_run(label + "\t").bold = True
        p.add_run(cap)

    # abbreviations
    doc.add_page_break()
    p = doc.add_paragraph(style="FrontX")
    r = p.add_run("LIST OF ABBREVIATIONS")
    r.font.size = Pt(18)
    r.font.bold = True
    blank(1)
    abbrev = [
        ("API", "Application Programming Interface"),
        ("CSRF", "Cross-Site Request Forgery"),
        ("CSS", "Cascading Style Sheets"),
        ("CVE", "Common Vulnerabilities and Exposures"),
        ("CVSS", "Common Vulnerability Scoring System"),
        ("CWE", "Common Weakness Enumeration"),
        ("DOCX", "Office Open XML Document"),
        ("HTTP / HTTPS", "Hypertext Transfer Protocol / Secure"),
        ("JSON", "JavaScript Object Notation"),
        ("JWT", "JSON Web Token (not used in this project)"),
        ("KEV", "Known Exploited Vulnerabilities (CISA catalogue)"),
        ("KYC", "Know Your Customer"),
        ("LLM", "Large Language Model"),
        ("MFA", "Multi-Factor Authentication"),
        ("NVD", "National Vulnerability Database (NIST)"),
        ("OTP", "One-Time Password"),
        ("OWASP", "Open Worldwide Application Security Project"),
        ("PDF", "Portable Document Format"),
        ("SSRF", "Server-Side Request Forgery"),
        ("TOTP", "Time-based One-Time Password"),
        ("TTL", "Time To Live (index expiry)"),
        ("UI / UX", "User Interface / User Experience"),
        ("UPI", "Unified Payments Interface"),
        ("XSS", "Cross-Site Scripting"),
    ]
    ab = doc.add_table(rows=1, cols=2)
    ab.style = "Table Grid"
    ab.alignment = WD_TABLE_ALIGNMENT.CENTER
    heads = ab.rows[0].cells
    for i, h in enumerate(["Abbreviation", "Expansion"]):
        heads[i].text = ""
        run = heads[i].paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(9.5)
        set_cell_shading(heads[i], "E8EDF3")
    for a, full in abbrev:
        cells = ab.add_row().cells
        cells[0].text = ""
        cells[0].paragraphs[0].add_run(a).font.size = Pt(9.5)
        cells[1].text = ""
        cells[1].paragraphs[0].add_run(full).font.size = Pt(9.5)
    for row in ab.rows:
        row.cells[0].width = Cm(4.0)
        row.cells[1].width = Cm(12.0)

    # ------------------------------------------------ body
    for blk in dm.BLOCKS:
        kind = blk[0]
        if kind == "h1":
            p = doc.add_paragraph(blk[1], style="H1X")
        elif kind == "h2":
            doc.add_paragraph(blk[1], style="H2X")
        elif kind == "h3":
            doc.add_paragraph(blk[1], style="H3X")
        elif kind == "p":
            add_text(doc, blk[1], "BodyTextX")
        elif kind == "b":
            add_bullets(doc, blk[1])
        elif kind == "n":
            add_numbers(doc, blk[1])
        elif kind == "table":
            add_table(doc, blk[1], blk[2], blk[3])
        elif kind == "fig":
            path, text, width = blk[1], blk[2], blk[3]
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.keep_with_next = True
            run = p.add_run()
            run.add_picture(path, width=Cm(min(width, 15.9)))
            caption(doc, text)
        elif kind == "code":
            add_code(doc, blk[1])

    enable_update_fields(doc)
    doc.save(OUT)
    print("saved", OUT)
    return OUT


if __name__ == "__main__":
    build()
