"""Generate the report diagrams (matplotlib, no external assets).

Every diagram describes only what is implemented in the project:
Express 5 + MongoDB Atlas + Google Gemini (@google/genai) + CISA KEV / NIST NVD.
"""

import os
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diagrams")
os.makedirs(OUT, exist_ok=True)

INK = "#12212f"
LINE = "#2f4f6f"
FILL_A = "#e8f1fb"
FILL_B = "#dcece4"
FILL_C = "#fdf1dc"
FILL_D = "#f3e6f1"
FILL_E = "#eef0f3"


def canvas(w=11, h=7.2):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")
    fig.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.01)
    return fig, ax


def box(ax, x, y, w, h, text, fc=FILL_A, fs=9, bold=False, ec=LINE, align="center", pad=0.0):
    ax.add_patch(
        FancyBboxPatch(
            (x, y), w, h,
            boxstyle=f"round,pad={pad},rounding_size=1.6",
            linewidth=1.1, edgecolor=ec, facecolor=fc, zorder=2,
        )
    )
    ax.text(
        x + w / 2, y + h / 2, text,
        ha="center", va="center", fontsize=fs, color=INK, zorder=3,
        fontweight="bold" if bold else "normal", linespacing=1.35, wrap=True,
    )


def band(ax, x, y, w, h, title, fc="#ffffff"):
    ax.add_patch(
        Rectangle((x, y), w, h, linewidth=1.0, edgecolor="#b9c6d3",
                  facecolor=fc, linestyle=(0, (4, 3)), zorder=1)
    )
    ax.text(x + 1.0, y + h + 1.5, title, fontsize=8.5, color="#54687c",
            fontweight="bold", ha="left", va="center", zorder=3)


def arrow(ax, p1, p2, label="", style="-|>", ls="-", color=LINE, fs=7.5, rad=0.0, lx=0, ly=0):
    ax.add_patch(
        FancyArrowPatch(
            p1, p2, arrowstyle=style, mutation_scale=13, linewidth=1.2,
            color=color, linestyle=ls, zorder=4,
            connectionstyle=f"arc3,rad={rad}",
        )
    )
    if label:
        ax.text(
            (p1[0] + p2[0]) / 2 + lx, (p1[1] + p2[1]) / 2 + ly, label,
            fontsize=fs, color="#33475c", ha="center", va="center", zorder=5,
            bbox=dict(boxstyle="round,pad=0.22", facecolor="white",
                      edgecolor="none", alpha=0.9),
        )


def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=200, facecolor="white")
    plt.close(fig)
    print("wrote", path)


# ---------------------------------------------------------------- architecture
def architecture():
    fig, ax = canvas(11.5, 7.6)
    ax.text(50, 97, "Figure: Overall system architecture of CyberShield",
            ha="center", fontsize=11, fontweight="bold", color=INK)

    band(ax, 2, 60, 96, 30, "CLIENT TIER - browser (no framework, no build step)")
    box(ax, 5, 82, 26, 6, "HTML pages (17)\nindex, quiz, ai-assistant, toolkit, ...", FILL_A, 8)
    box(ax, 36, 82, 28, 6, "CSS (style.css, tutor.css,\nlearning-path.css)", FILL_A, 8)
    box(ax, 69, 82, 26, 6, "Vanilla JS modules (20 files)\nfetch() -> /api/*", FILL_A, 8)
    box(ax, 5, 63, 44, 14,
        "Browser responsibilities\n"
        "- render UI, client-side password analysis\n"
        "- send JSON with credentials: 'same-origin'\n"
        "- never receives a correct answer key or another user's data",
        FILL_A, 8)
    box(ax, 54, 63, 41, 14,
        "Local static data (data/*.json)\n"
        "glossary, news, threats, threat-details, tips,\n"
        "resources, simulator, quiz-questions\n"
        "(reference content; quiz bank itself lives in MongoDB)",
        FILL_A, 8)

    band(ax, 2, 30, 96, 28, "APPLICATION TIER - Node.js 20+ / Express 5 (server/server.js, port 3000)")
    box(ax, 4, 48, 20, 8, "Security middleware\nsameOriginGuard\nrate limiters", FILL_B, 8)
    box(ax, 26, 48, 22, 8, "Session middleware\nexpress-session +\nconnect-mongo", FILL_B, 8)
    box(ax, 50, 48, 22, 8, "requireDb\n(503 when MongoDB\nis unavailable)", FILL_B, 8)
    box(ax, 74, 48, 22, 8, "express.static\n+ SPA-style 404\n+ JSON error handler", FILL_B, 8)

    box(ax, 4, 41, 92, 5.5,
        "ROUTES  /api/auth  /api/ai  /api/quiz  /api/dashboard  /api/adaptive  /api/learning  "
        "/api/tutor  /api/threats  /api/admin", FILL_B, 8, bold=True)
    box(ax, 4, 33, 92, 6.5,
        "SERVICES  gemini.js (model, schema, retry, fallback)  |  tutor.js (learner context, guards)  |  "
        "adaptive.js (profile, weights)\nquestion-bank.js (selection, validation, history)  |  "
        "url-analyzer.js (structural, no network)  |  learning-roadmap.js  |  threat-intel.js",
        FILL_B, 7.6)

    band(ax, 2, 12, 55, 15, "DATA TIER")
    box(ax, 4, 14, 51, 10,
        "MongoDB Atlas - database 'cybershield'\n"
        "users, sessions, questions, quizsessions, quizattempts,\n"
        "questionhistories, learningprogresses, tutorconversations,\n"
        "scamreports, threatitems, threatsyncstates, adminquestionlogs",
        FILL_C, 7.6)

    band(ax, 59, 12, 39, 15, "EXTERNAL SERVICES")
    box(ax, 61, 17.5, 35, 6.5, "Google Gemini API\n@google/genai, JSON schema output", FILL_D, 8)
    box(ax, 61, 13.6, 35, 3.2, "CISA KEV + NIST NVD feeds (threat intel)", FILL_D, 7.5)

    arrow(ax, (48, 60), (48, 56), "HTTPS / JSON / session cookie")
    arrow(ax, (30, 14), (30, 30), "", style="<|-|>")
    arrow(ax, (72, 33), (72, 24), "server-side SDK calls (API key in .env)", style="<|-|>")
    ax.text(50, 8, "The Gemini API key and the MongoDB connection string exist only in the server "
                   "environment; the browser never holds either of them.",
            ha="center", fontsize=7.5, color="#3d5166", style="italic")
    save(fig, "fig_architecture.png")


# ---------------------------------------------------------------- DFD level 0
def dfd0():
    fig, ax = canvas(10.5, 6.4)
    ax.text(50, 96, "Figure: Data Flow Diagram - Level 0 (context diagram)",
            ha="center", fontsize=11, fontweight="bold", color=INK)
    box(ax, 36, 40, 28, 16, "0\nCyberShield\nPlatform", FILL_B, 11, bold=True)
    box(ax, 4, 68, 20, 9, "Visitor /\nRegistered user", FILL_E, 9)
    box(ax, 76, 68, 20, 9, "Administrator", FILL_E, 9)
    box(ax, 4, 20, 20, 9, "Google Gemini API", FILL_D, 9)
    box(ax, 76, 20, 20, 9, "CISA KEV /\nNIST NVD", FILL_D, 9)
    box(ax, 76, 45, 20, 9, "MongoDB Atlas", FILL_C, 9)

    arrow(ax, (24, 74), (40, 56), "credentials, quiz answers,\nmessage/screenshot to analyse,\ntutor question", fs=7)
    arrow(ax, (44, 56), (24, 72), "session cookie, question text,\nanalysis result, dashboard data", rad=0.18, fs=7)
    arrow(ax, (76, 74), (60, 56), "question moderation,\napprove/reject/retire, AI batch", fs=7)
    arrow(ax, (36, 45), (24, 25), "prompt + JSON schema (server side)", fs=7)
    arrow(ax, (27, 27), (40, 42), "structured JSON answer", rad=0.15, fs=7)
    arrow(ax, (64, 47), (76, 47), "queries / writes", style="<|-|>", fs=7)
    arrow(ax, (76, 27), (62, 40), "vulnerability records (poll)", fs=7)
    ax.text(50, 32, "no user data is sent to the threat feeds", ha="center",
            fontsize=7, color="#5a6f84", style="italic")
    save(fig, "fig_dfd0.png")


# ---------------------------------------------------------------- DFD level 1
def elbow(ax, pts, label="", lx=0.0, ly=0.0, fs=7.0, arrowhead=True):
    """Orthogonal polyline; the head is drawn on the last segment."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    ax.plot(xs[:-1] + [xs[-1]], ys[:-1] + [ys[-1]], color=LINE, linewidth=1.2, zorder=4)
    if arrowhead:
        arrow(ax, pts[-2], pts[-1], "", fs=fs)
    if label:
        mx = sum(xs) / len(xs) + lx
        my = sum(ys) / len(ys) + ly
        ax.text(mx, my, label, fontsize=fs, color="#33475c", ha="center", va="center",
                zorder=6, bbox=dict(boxstyle="round,pad=0.22", facecolor="white",
                                    edgecolor="none", alpha=0.92))


def dfd1():
    fig, ax = canvas(12.0, 8.0)
    ax.text(50, 97, "Figure: Data Flow Diagram - Level 1",
            ha="center", fontsize=11, fontweight="bold", color=INK)

    # external entities
    box(ax, 2, 88, 16, 7, "User", FILL_E, 9)
    box(ax, 78, 88, 20, 6, "Administrator", FILL_E, 8.2)
    box(ax, 2, 26, 16, 7, "Google Gemini API", FILL_D, 8.2)
    box(ax, 22, 5, 66, 9, "MongoDB Atlas  -  database 'cybershield'  (11 collections + session store)",
        FILL_C, 8.4)

    # processes
    procs = [
        (4, 68, "1.0\nAuthentication\n& session"),
        (28, 68, "2.0\nQuiz engine\n(normal / adaptive)"),
        (52, 68, "3.0\nAI services\n(scam, tutor,\nnews, roadmap)"),
        (76, 68, "6.0\nThreat intelligence\n(polls CISA KEV + NVD)"),
        (4, 46, "4.0\nLearning\nroadmap"),
        (28, 46, "8.0\nQuestion bank\n& history"),
        (52, 46, "5.0\nDashboard &\nstatistics"),
        (76, 46, "7.0\nAdmin question\nmanagement"),
    ]
    for x, y, t in procs:
        box(ax, x, y, 20, 12, t, FILL_B, 8)

    # User <-> 1.0
    arrow(ax, (10, 88), (10, 80.5), "credentials / session cookie", fs=6.6, lx=12.5, style="<|-|>")
    # 1.0 -> 2.0
    arrow(ax, (24, 76), (28, 76), "user id", fs=6.6, ly=1.9)
    # 2.0 <-> 8.0
    arrow(ax, (34, 68), (34, 58), "question ids", fs=6.6, lx=-5.4)
    arrow(ax, (42, 58), (42, 68), "answers", fs=6.6, lx=3.6)
    # Administrator -> 7.0 (outer right lane)
    elbow(ax, [(98, 88), (98, 52), (96, 52)], "")
    # 3.0 -> Gemini (outer left lane)
    elbow(ax, [(56, 68), (56, 63.5), (1.2, 63.5), (1.2, 31.5), (2, 31.5)], "")
    # 3.0 -> Atlas (tutor turns)
    elbow(ax, [(72, 72), (74, 72), (74, 14)], "")
    # 6.0 -> Atlas
    elbow(ax, [(76, 72), (73.4, 72), (73.4, 16), (70, 16)], "")
    # 4.0 -> Atlas
    elbow(ax, [(14, 46), (14, 14), (26, 14)], "")
    # 8.0 -> Atlas
    elbow(ax, [(38, 46), (38, 14)], "")
    # 5.0 -> Atlas
    elbow(ax, [(62, 46), (62, 14)], "")
    # 7.0 -> Atlas
    elbow(ax, [(86, 46), (86, 14)], "")

    def tag(x, y, text, fs=6.8):
        ax.text(x, y, text, fontsize=fs, color="#33475c", ha="center", va="center", zorder=7,
                bbox=dict(boxstyle="round,pad=0.22", facecolor="white", edgecolor="none", alpha=0.94))

    tag(86, 63.5, "approve / reject / retire")
    tag(34, 65.3, "prompt + JSON schema / structured response")
    tag(80, 34, "tutor turns")
    tag(68, 30, "threatitems")
    tag(20, 34, "roadmaps")
    tag(45, 40, "history")
    tag(70, 40, "attempts, stats")
    tag(92, 34, "audit log")
    ax.text(30, 26, "No user data is sent to\nGemini or the threat feeds", fontsize=6.8,
            color="#5a6f84", ha="center", va="center", style="italic")
    ax.text(50, 1.6, "Processes 2.0, 5.0 and 8.0 read and write the same collections; every query is "
                     "filtered by the server-side session user id.",
            ha="center", fontsize=7.4, color="#3d5166", style="italic")
    save(fig, "fig_dfd1.png")


# ---------------------------------------------------------------- use case
def usecase():
    fig, ax = canvas(11, 7.6)
    ax.text(50, 97, "Figure: Use case diagram",
            ha="center", fontsize=11, fontweight="bold", color=INK)

    ax.add_patch(Rectangle((24, 5), 54, 86, fill=False, linewidth=1.2,
                           edgecolor=LINE, zorder=1))
    ax.text(51, 88.5, "CyberShield platform", ha="center", fontsize=9,
            color="#54687c", fontweight="bold")

    cases = [
        (31, 78, "Browse awareness content"),
        (31, 70, "Check password strength"),
        (31, 62, "Register / sign in"),
        (31, 54, "Take normal quiz"),
        (31, 46, "Take adaptive quiz"),
        (31, 38, "Analyse a suspicious message"),
        (31, 30, "Ask the AI tutor"),
        (57, 70, "View personalised roadmap"),
        (57, 62, "View dashboard statistics"),
        (57, 54, "Read news + AI explanation"),
        (57, 46, "Browse live threat intelligence"),
        (57, 38, "Use emergency guide / toolkit"),
    ]
    for x, y, t in cases:
        ax.add_patch(FancyBboxPatch((x, y - 2.6), 34, 5.4,
                                     boxstyle="round,pad=0.3,rounding_size=2.6",
                                     linewidth=1.0, edgecolor=LINE, facecolor=FILL_A, zorder=2))
        ax.text(x + 17, y, t, ha="center", va="center", fontsize=8, color=INK, zorder=3)

    cases_admin = [
        (57, 30, "Moderate question bank"),
        (57, 22, "Generate AI question batch"),
        (57, 14, "View moderation logs"),
    ]
    for x, y, t in cases_admin:
        ax.add_patch(FancyBboxPatch((x, y - 2.6), 34, 5.4,
                                     boxstyle="round,pad=0.3,rounding_size=2.6",
                                     linewidth=1.0, edgecolor=LINE, facecolor=FILL_C, zorder=2))
        ax.text(x + 17, y, t, ha="center", va="center", fontsize=8, color=INK, zorder=3)

    def actor(x, y, label):
        ax.add_patch(plt.Circle((x, y + 6), 1.9, fill=False, edgecolor=INK, linewidth=1.2, zorder=3))
        ax.plot([x, x], [y + 4.1, y], color=INK, linewidth=1.2, zorder=3)
        ax.plot([x - 2.6, x + 2.6], [y + 2.6, y + 2.6], color=INK, linewidth=1.2, zorder=3)
        ax.plot([x, x - 2.2], [y, y - 3.4], color=INK, linewidth=1.2, zorder=3)
        ax.plot([x, x + 2.2], [y, y - 3.4], color=INK, linewidth=1.2, zorder=3)
        ax.text(x, y - 6, label, ha="center", fontsize=8.5, color=INK, fontweight="bold")

    actor(8, 55, "Visitor")
    actor(8, 30, "Registered\nuser")
    actor(92, 26, "Administrator")

    for y in (78, 70, 62, 38):
        ax.plot([10, 31], [60, y], color=LINE, linewidth=0.9, zorder=1)
    for y in (54, 46, 38, 30, 70, 62):
        ax.plot([12, 31], [33, y], color=LINE, linewidth=0.9, zorder=1)
    for y in (38, 30, 22, 14, 46):
        ax.plot([90, 91], [26, y], color=LINE, linewidth=0.9, zorder=1)
    ax.text(50, 2.5, "AI tutor and roadmap require an account; the admin use cases are guarded by requireAdmin.",
            ha="center", fontsize=7.4, color="#3d5166", style="italic")
    save(fig, "fig_usecase.png")


# ---------------------------------------------------------------- activity
def activity():
    fig, ax = canvas(9.6, 8.4)
    ax.text(50, 97, "Figure: Activity diagram - quiz run with adaptive difficulty",
            ha="center", fontsize=10.5, fontweight="bold", color=INK)
    box(ax, 33, 89, 34, 5, "Start: open quiz page", FILL_E, 8.5, bold=True)
    box(ax, 28, 79, 44, 6.5, "GET /api/quiz/meta\n(approved count per topic)", FILL_A, 7.6)
    box(ax, 28, 69, 44, 6.5, "Choose mode, count, category\nPOST /api/quiz/start", FILL_A, 7.6)
    box(ax, 30, 58.5, 40, 6, "Server builds question plan\n(weak 45% / strong 20% / neutral)", FILL_B, 7.4)
    box(ax, 33, 48, 34, 6, "POST /api/quiz/next\nquestion without answer key", FILL_A, 7.6)
    box(ax, 33, 37.5, 34, 6, "User selects an option\nPOST /api/quiz/answer", FILL_A, 7.6)
    # decision 1
    ax.add_patch(plt.Polygon([[50, 33], [64, 27], [50, 21], [36, 27]],
                             closed=True, fill=False, edgecolor=INK, linewidth=1.2, zorder=3))
    ax.text(50, 27, "streak reaches\n+/- 2 ?", ha="center", va="center", fontsize=7.6, color=INK, zorder=4)
    box(ax, 68, 23.5, 27, 7, "Step difficulty one level\nup or down, reset streak", FILL_B, 7.4)
    ax.add_patch(plt.Polygon([[50, 16], [62, 10], [50, 4], [38, 10]],
                             closed=True, fill=False, edgecolor=INK, linewidth=1.2, zorder=3))
    ax.text(50, 10, "questions\nremaining?", ha="center", va="center", fontsize=7.6, color=INK, zorder=4)
    box(ax, 66, 6.5, 30, 7, "POST /api/quiz/submit\nweighted score + persistence", FILL_A, 7.4)
    box(ax, 4, 6.5, 26, 7, "Results screen,\ntopic breakdown,\nAI learning path", FILL_E, 7.6)

    arrow(ax, (50, 89), (50, 85.5))
    arrow(ax, (50, 79), (50, 75.5))
    arrow(ax, (50, 69), (50, 64.5))
    arrow(ax, (50, 58.5), (50, 54))
    arrow(ax, (50, 48), (50, 43.5))
    arrow(ax, (50, 37.5), (50, 33))
    arrow(ax, (64, 27), (68, 27), "yes")
    arrow(ax, (82, 23.5), (56, 30.5), "", rad=0.1)
    arrow(ax, (50, 21), (50, 16), "no")
    arrow(ax, (38, 10), (24, 13), "no - next question", rad=-0.25, fs=7)
    ax.plot([24, 24], [13, 44], color=LINE, linewidth=1, zorder=1)
    arrow(ax, (24, 44), (33, 48), "", rad=0.2)
    arrow(ax, (62, 10), (70, 10), "yes")
    arrow(ax, (66, 8), (30, 9), "", rad=0.2)
    save(fig, "fig_activity.png")


# ---------------------------------------------------------------- auth flow
def auth():
    fig, ax = canvas(10.4, 7.0)
    ax.text(50, 96, "Figure: Authentication and session workflow",
            ha="center", fontsize=11, fontweight="bold", color=INK)
    lanes = [("Browser", 3, 30), ("Express routes", 34, 62), ("Model / Atlas", 66, 96)]
    for title, x, w in lanes:
        band(ax, x, 12, w - 2, 78, title)

    box(ax, 5, 78, 24, 7, "POST /html/login.html\nemail + password", FILL_A, 7.6)
    box(ax, 5, 66, 24, 7, "fetch POST /api/auth/login\n(JSON, same-origin)", FILL_A, 7.6)
    box(ax, 5, 44, 24, 8, "Cookie cybershield.sid\n(HttpOnly, SameSite,\nstored in Mongo)", FILL_A, 7.4)
    box(ax, 5, 26, 24, 8, "Redirect to\ndashboard.html\n(with cookie)", FILL_A, 7.6)

    box(ax, 36, 78, 24, 7, "sameOriginGuard", FILL_B, 8)
    box(ax, 36, 68, 24, 7, "loginLimiter 10 / 15 min", FILL_B, 7.6)
    box(ax, 36, 58, 24, 7, "validate + bcrypt.compare\n(dummy hash when unknown)", FILL_B, 7.4)
    box(ax, 36, 48, 24, 7, "req.session.regenerate()", FILL_B, 7.6)
    box(ax, 36, 38, 24, 7, "req.session.user =\n{id, name, email}", FILL_B, 7.6)
    box(ax, 36, 20, 24, 10, "requireAuth on every\nprotected route:\n401 when no session\nuser id", FILL_B, 7.4)

    box(ax, 68, 58, 26, 7, "users collection\npasswordHash (bcrypt, cost 12)", FILL_C, 7.4)
    box(ax, 68, 44, 26, 7, "sessions collection\n(connect-mongo TTL)", FILL_C, 7.6)
    box(ax, 68, 30, 26, 7, "toSafeJSON()\nno hash in any response", FILL_C, 7.6)

    arrow(ax, (17, 78), (17, 73))
    arrow(ax, (29, 69.5), (36, 78), "body", fs=7)
    arrow(ax, (48, 78), (48, 75), "", fs=7)
    arrow(ax, (48, 68), (48, 65), "", fs=7)
    arrow(ax, (60, 61), (68, 61), "findOne({email})")
    arrow(ax, (68, 57), (60, 59), "hash", fs=7)
    arrow(ax, (48, 58), (48, 55), "", fs=7)
    arrow(ax, (60, 51), (68, 48), "session doc", style="<|-|>", fs=7)
    arrow(ax, (48, 48), (48, 45), "", fs=7)
    arrow(ax, (48, 38), (48, 30), "", fs=7)
    arrow(ax, (36, 42), (29, 44), "Set-Cookie", fs=7)
    arrow(ax, (17, 44), (17, 34), "", fs=7)
    ax.text(50, 8, "Register follows the same path with bcrypt.hash(password, 12); logout destroys the session "
                   "and clears the cookie.",
            ha="center", fontsize=7.4, color="#3d5166", style="italic")
    save(fig, "fig_authflow.png")


# ---------------------------------------------------------------- AI flow
def ai():
    fig, ax = canvas(10.6, 7.2)
    ax.text(50, 96.5, "Figure: AI request and response workflow (server side)",
            ha="center", fontsize=10.5, fontweight="bold", color=INK)

    steps = [
        (4, 78, 26, 9, "1. Route validation\nlength, MIME, base64,\nper-route JSON limit"),
        (34, 78, 26, 9, "2. Build grounded prompt\nsystem instruction +\nuser content parts"),
        (64, 78, 32, 9, "3. gemini.js generateContent\nresponseSchema + temperature\n+ safety settings"),
    ]
    for x, y, w, h, t in steps:
        box(ax, x, y, w, h, t, FILL_A, 7.6)
    arrow(ax, (30, 82.5), (34, 82.5))
    arrow(ax, (60, 82.5), (64, 82.5))

    box(ax, 4, 62, 26, 9, "URL structural check\n(url-analyzer, no request\nis ever made)", FILL_B, 7.4)
    box(ax, 34, 62, 26, 9, "Primary model\nGEMINI_MODEL\ntimeout 12 s", FILL_B, 7.6)
    box(ax, 64, 62, 32, 9, "Transient failure\n(429 / 500 / 503)\nretry with backoff, once", FILL_B, 7.4)

    box(ax, 34, 48, 26, 9, "Fallback model\nGEMINI_FALLBACK_MODEL\ntimeout 20 s", FILL_D, 7.6)
    box(ax, 64, 48, 32, 9, "Still failing ->\nAI_UNAVAILABLE_MESSAGE\nHTTP 503", FILL_D, 7.4)
    box(ax, 4, 48, 26, 9, "Safety block ->\nAI_BLOCKED_MESSAGE\nHTTP 422", FILL_D, 7.4)

    box(ax, 20, 32, 34, 9, "4. Parse JSON, check required keys,\nclamp / whitelist every field", FILL_A, 7.6)
    box(ax, 58, 32, 38, 9, "5. Persist (tutor turns) and respond\nwith a sanitised payload", FILL_A, 7.6)

    arrow(ax, (17, 78), (17, 71), "URL present", fs=7)
    arrow(ax, (46, 78), (46, 71), "", fs=7)
    arrow(ax, (54, 74), (64, 68), "on error", fs=7)
    arrow(ax, (46, 62), (46, 57), "on timeout / 503", fs=7)
    arrow(ax, (64, 66.5), (68, 57), "both fail", fs=7)
    arrow(ax, (30, 62), (26, 41), "", rad=0.15)
    arrow(ax, (40, 62.5), (34, 41), "text", fs=7)
    arrow(ax, (60, 50), (45, 41), "", rad=0.2)
    arrow(ax, (54, 36.5), (58, 36.5))
    ax.text(50, 24, "Tutor only: when the model is unavailable the route returns a reviewed, curated answer "
                    "and sets generatedBy='curated'.",
            ha="center", fontsize=7.4, color="#3d5166", style="italic")
    ax.text(50, 20, "Scam analyzer only: structural URL findings are returned separately in url_analysis "
                    "so rule-based facts and AI text are never confused.",
            ha="center", fontsize=7.4, color="#3d5166", style="italic")
    save(fig, "fig_aiflow.png")


# ---------------------------------------------------------------- ER style
def er():
    fig, ax = canvas(12.2, 8.2)
    ax.text(50, 97, "Figure: Collection relationship (document) diagram - MongoDB database 'cybershield'",
            ha="center", fontsize=10.5, fontweight="bold", color=INK)

    def entity(x, y, w, h, title, rows, fc=FILL_A, fs=6.9):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.2,rounding_size=1.4",
                                     linewidth=1.1, edgecolor=LINE, facecolor="white", zorder=2))
        ax.add_patch(FancyBboxPatch((x, y + h - 4.4), w, 4.4, boxstyle="round,pad=0.2,rounding_size=1.4",
                                     linewidth=0, facecolor=fc, zorder=3))
        ax.text(x + 1, y + h - 2.1, title, fontsize=7.8, fontweight="bold", color=INK, va="center", zorder=4)
        ax.text(x + 1, y + h - 6.0, "\n".join(rows), fontsize=fs, color="#22394d",
                va="top", linespacing=1.5, zorder=4)

    entity(2, 60, 27, 26, "users", [
        "_id : ObjectId",
        "name, email (unique)",
        "passwordHash (bcrypt, cost 12)",
        "role: 'user' | 'admin'",
        "lastLogin, createdAt",
    ])
    entity(36, 62, 27, 24, "questions", [
        "_id, questionId (unique)",
        "text, normalizedText",
        "options[4], correct (0-3)",
        "explanation, topic, subtopic",
        "difficulty, category, status",
        "retired, source, createdBy",
    ])
    entity(70, 62, 28, 24, "quizsessions", [
        "_id, sessionKey (uuid)",
        "userId -> users._id",
        "mode, category, count",
        "queue / topicPlan / askedIds",
        "questions[] {questionId, topic,",
        "  difficulty, optionOrder,",
        "  correctIndex, isCorrect}",
        "status, expiresAt (TTL 6 h)",
    ])
    entity(2, 30, 27, 24, "quizattempts", [
        "_id, userId -> users",
        "submissionId (unique per user)",
        "score, rawScore, total, correct",
        "mode, startDifficulty,",
        "finalDifficulty, durationSeconds",
        "questions[] {questionId, topic,",
        "  difficulty, correct}",
    ])
    entity(36, 30, 27, 24, "questionhistories", [
        "_id",
        "userId + questionId (compound",
        "  unique index)",
        "timesSeen, timesCorrect",
        "lastCorrect, lastSeenAt",
        "firstSeenAt",
    ])
    entity(70, 30, 28, 24, "learningprogresses", [
        "_id, userId -> users",
        "kind: 'path' | 'roadmap'",
        "status: active | archived",
        "score, summary, level",
        "generatedBy, fallbackReason",
        "profileSnapshot, steps[]",
        "  {lessonKey, stage, completed}",
        "sourceAttemptId -> quizattempts",
    ])
    entity(2, 4, 27, 20, "tutorconversations", [
        "_id, userId -> users",
        "title, difficulty",
        "messages[] {role, text,",
        "  generatedBy, safety, topic}",
        "lastMessageAt",
    ])
    entity(36, 4, 27, 20, "threatitems / threatsyncstates", [
        "threatitems: _id = CVE id",
        "source: cisa-kev | nvd",
        "severity, cvss, published",
        "kev, ransomwareUse, cwes",
        "threatsyncstates: per-source",
        "lastSyncAt, lastError, count",
    ])
    entity(70, 4, 28, 20, "sessions / adminquestionlogs", [
        "sessions: express-session",
        "documents (sid, session, expires)",
        "adminquestionlogs:",
        "questionId, action, adminEmail,",
        "createdAt (moderation trail)",
    ])

    for y in (72, 68):
        arrow(ax, (29, y), (36, y), "1 : N (userId)", fs=6.6, lx=0, ly=1.6)
    arrow(ax, (63, 74), (70, 74), "1 : N", fs=6.6, ly=1.6)
    arrow(ax, (15, 60), (15, 54), "1 : N", fs=6.6, lx=-3.4)
    arrow(ax, (63, 42), (70, 42), "1 : N", fs=6.6, ly=1.6)
    arrow(ax, (15, 30), (15, 24), "1 : N", fs=6.6, lx=-3.4)
    ax.text(50, 1.2, "References are stored as ObjectId fields (no foreign-key enforcement); ownership is "
                     "enforced in every query by the server-side session user id.",
            ha="center", fontsize=7.2, color="#3d5166", style="italic")
    save(fig, "fig_er.png")


if __name__ == "__main__":
    architecture()
    dfd0()
    dfd1()
    usecase()
    activity()
    auth()
    ai()
    er()
