# -*- coding: utf-8 -*-
"""Shared document model for the DOCX and PDF builders.

Both builders consume exactly the same expanded block list, which is what keeps
the two deliverables identical in content.
"""

import os
import re

import content_a
import content_b
import content_c
import content_d

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

TITLE = "CyberShield"
SUBTITLE = "AI-Powered Cybersecurity Awareness and Protection Platform"
REPORT_LABEL = "A Final Year / Mini Project Report"
SUBMITTED = "Submitted in partial fulfilment of the requirements for the award of the degree"

TEAM = [
    ("Muhammad Yusuf", "2500970100130"),
    ("Md Rejaullah", "2500970100127"),
    ("Mohammad Zaid", "2500970100128"),
]

PLACEHOLDERS = {
    "college": "[Name of the College]",
    "university": "[Name of the University]",
    "department": "[Name of the Department]",
    "session": "[Academic Session]",
    "supervisor": "[Name of the Project Supervisor]",
    "designation": "[Designation of the Supervisor]",
    "place": "[Place]",
    "month_year": "[Month, Year]",
}

ABSTRACT = (
    "Cybersecurity awareness material is abundant but poorly matched to the moment in which an ordinary "
    "internet user has to make a decision. Advice is written for specialists, arrives after the suspicious "
    "message has already been received, cannot inspect the user's own content, and provides no way to measure "
    "whether anything was learned. This project presents CyberShield, a web-based cybersecurity awareness and "
    "protection platform that addresses those gaps in a single application.\n\n"
    "CyberShield is implemented as a Node.js and Express 5 application with seventeen HTML pages, a JSON API of "
    "thirty-six endpoints and a MongoDB Atlas database of eleven collections. Accounts are protected with bcrypt "
    "hashing at cost factor twelve and server-side sessions stored in MongoDB, with session regeneration at "
    "authentication and a same-origin check on every state-changing request. The learning core is a "
    "three-hundred-question bank across nine topics and three difficulty levels, served one question at a time so "
    "that the answer key never reaches the browser, and scored on the server with difficulty weights. An adaptive "
    "mode adjusts difficulty during a run from consecutive answers and selects questions from a topic plan built "
    "from the learner's recorded accuracy.\n\n"
    "Four features use the Google Gemini API through the official Google Gen AI SDK: a scam analyzer that assesses "
    "text, URLs and screenshots; a tutor that personalises explanations at three levels; a staged learning roadmap "
    "generated from measured performance; and a news explainer. Deterministic work is performed in code before any "
    "model call - URL structure is parsed without ever contacting the address, and per-topic accuracy is computed "
    "from stored attempts - and everything the model returns is validated against a JSON schema, clamped and "
    "truncated. When the service fails, the tutor returns a reviewed answer and the roadmap falls back to a "
    "rule-based planner that the audit exercised successfully. Live threat intelligence is retrieved from the CISA "
    "Known Exploited Vulnerabilities catalogue and the NIST National Vulnerability Database and cached in MongoDB.\n\n"
    "The project's own end-to-end audit executed one hundred and eleven checks against the running system and "
    "passed one hundred and seven. The four failures trace to a stale test fixture that the duplicate detector "
    "correctly rejected, and are analysed in the testing chapter rather than reported as application defects. The "
    "report documents the architecture, module behaviour, AI integration, database design, API, security controls, "
    "test evidence and limitations of the delivered system."
)

DECLARATION = (
    "We hereby declare that the project report entitled \u201cCyberShield - AI-Powered Cybersecurity Awareness "
    "and Protection Platform\u201d, submitted to {department} of {college}, is a record of original work carried "
    "out by us. The implementation described in this report was designed and developed by the team members listed "
    "below, and the report was prepared from a direct inspection of that implementation.\n\n"
    "We further declare that the work presented here has not been submitted, either in part or in full, for the "
    "award of any other degree or diploma of this or any other institution. All external sources consulted during "
    "the work are acknowledged in the references, and no material has been reproduced without attribution."
)

ACKNOWLEDGEMENT = (
    "We express our sincere gratitude to our project supervisor, {supervisor}, {designation}, for the guidance, "
    "technical criticism and encouragement that shaped this work from an idea into a working system.\n\n"
    "We thank the faculty members of {department} for the reviews and suggestions that improved the design of the "
    "platform, and the laboratory staff for providing the computing facilities used during development and "
    "testing.\n\n"
    "We are grateful to our families and friends for their patience and support during the long testing and "
    "documentation phases of the project. Finally, we thank the maintainers of the open-source tools on which this "
    "work depends - Node.js, Express, MongoDB and Mongoose, and the Google Gen AI SDK - whose documentation made "
    "the implementation considerably more reliable."
)

CERTIFICATE = (
    "This is to certify that the project report entitled \u201cCyberShield - AI-Powered Cybersecurity Awareness "
    "and Protection Platform\u201d is the bona fide record of the project work carried out by the students named "
    "below, in partial fulfilment of the requirements for the award of the degree, during the academic session "
    "{session}.\n\n"
    "The work has been carried out under our supervision, and the report has been found satisfactory in scope, "
    "technical depth and presentation."
)


def _blocks():
    out = []
    for mod in (content_a, content_b, content_c, content_d):
        out.extend(mod.BLOCKS)
    return out


def expand():
    """Number figures per chapter and collect the figure/table indexes."""
    chapter = 0
    figno = 0
    blocks = []
    figures = []
    tables = []
    headings = []

    for blk in _blocks():
        kind = blk[0]

        if kind == "h1":
            text = blk[1]
            m = re.match(r"Chapter\s+(\d+)", text)
            chapter = int(m.group(1)) if m else chapter
            figno = 0
            headings.append((1, text))
            blocks.append(blk)
            continue

        if kind in ("h2", "h3"):
            headings.append((2 if kind == "h2" else 3, blk[1]))
            blocks.append(blk)
            continue

        if kind == "fig":
            path, caption, width = blk[1], blk[2], blk[3]
            figno += 1
            label = "Figure %d.%d" % (chapter, figno)
            full = "%s  %s" % (label, caption)
            figures.append((label, caption, path))
            blocks.append(("fig", os.path.join(HERE, path), full, width))
            continue

        if kind == "table":
            caption, headers, rows = blk[1], blk[2], blk[3]
            m = re.match(r"(Table\s+[\d.]+)", caption)
            tables.append((m.group(1) if m else "Table", caption))
            blocks.append(blk)
            continue

        blocks.append(blk)

    return blocks, figures, tables, headings


BLOCKS, FIGURES, TABLES, HEADINGS = expand()


def front_lines(include_placeholders=True):
    p = PLACEHOLDERS if include_placeholders else PLACEHOLDERS
    return p


if __name__ == "__main__":
    words = sum(len(x[1].split()) for x in BLOCKS if x[0] in ("p", "h1", "h2", "h3"))
    print("blocks:", len(BLOCKS), "figures:", len(FIGURES), "tables:", len(TABLES))
    print("body words:", words)
