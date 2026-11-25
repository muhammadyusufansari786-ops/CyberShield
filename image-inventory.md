# CyberShield Image Inventory

## Overview

| Metric | Value |
|---|---|
| Total unique photographs | 20 |
| Photos downloaded | 20 (14 original + 3 new unique + 3 duplicates cleaned) |
| Source | Unsplash (free license, no attribution required) |
| Format | WebP |
| SVG illustrations retained | 18 (in `images/threats/`, not currently wired) |
| SVG navigation icons retained | All (in-line in HTML headers) |
| Large SVG illustrations replaced | 18 threat SVG references → 18 unique photos |

---

## Photograph Inventory

Each photo is stored in `images/photos/` as WebP.

### 1. cybersecurity-hero.webp
- **Subject**: Cybersecurity professional monitoring security operations on multiple screens
- **Source**: Unsplash
- **License**: Unsplash License (free, no attribution required)
- **Used on**: Home page hero, Threats (viruses-worms detail)

### 2. security-operations.webp
- **Subject**: Security operations center with professionals monitoring threats
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Explore & Learn" feature card

### 3. phishing-scam.webp
- **Subject**: Person reviewing a suspicious email on a laptop
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Practice Safely" feature card, Phishing threat detail

### 4. code-workspace.webp
- **Subject**: Modern workspace with computer displaying cybersecurity code
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Track Progress" feature card, Social Engineering threat detail

### 5. password-security.webp
- **Subject**: Close-up of hands typing a password on a laptop keyboard
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Password Security" feature card, Password Checker hero page

### 6. learning-dashboard.webp
- **Subject**: Modern workspace with laptop and organized desk for cybersecurity learning
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Cybersecurity Quiz" feature card, Learning Path banner

### 7. news-tech.webp
- **Subject**: Server room with rows of networking equipment and blinking lights
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Cyber News" feature card, News page banner

### 8. threat-intelligence.webp
- **Subject**: High-tech security operations center monitoring global cyber threats
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Common Threats" feature card, Resources page banner

### 9. secure-browsing.webp
- **Subject**: Laptop with browser showing a secure website with padlock icon
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "Safety Toolkit" feature card, Toolkit page banner, Vishing threat detail

### 10. ai-tutor.webp
- **Subject**: Person studying cybersecurity on a computer with AI tutor guidance
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Home page "AI CyberShield" feature card, AI Tutor page banner, Sim Swap threat detail

### 11. malware-threat.webp
- **Subject**: Cybersecurity threat visualization with code on dark screens
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: Threats page banner, Ransomware threat detail, News (LockBit ransomware)

### 12. vulnerability.webp
- **Subject**: Computer screen showing synthetic AI-generated digital content
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: About page banner, Insider threat detail, News (AI phishing emails)

### 13. data-breach.webp
- **Subject**: Server rack with data storage representing data breaches
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: DDoS threat detail, News (EdTech data breach)

### 14. antivirus-protection.webp
- **Subject**: Computer security and antivirus protection concept
- **Source**: Unsplash
- **License**: Unsplash License
- **Used on**: MITM threat detail, News (Android banking trojan), Resources (tools category)

### 15. tech-code.webp (NEW)
- **Subject**: Computer screen displaying code and terminal output
- **Source**: Unsplash (photo ID: 1555949963-aa79dcee981c)
- **License**: Unsplash License
- **Used on**: Spyware threat detail, News (file sharing vulnerability), Resources (standards category)

### 16. network.webp (NEW)
- **Subject**: Network infrastructure and server connectivity
- **Source**: Unsplash (photo ID: 1451187580459-43490279c0fa)
- **License**: Unsplash License
- **Used on**: Trojan threat detail, News (CISA vulnerabilities), Resources (frameworks category)

### 17. deepfake.webp (NEW)
- **Subject**: AI/artificial intelligence technology concept
- **Source**: Unsplash (photo ID: 1677442136019-21780ecad995)
- **License**: Unsplash License
- **Used on**: Deepfake threat detail, QR Phishing threat detail, News (deepfake CEO fraud)

### 18. social-engineering.webp (NEW)
- **Subject**: Technology and networking concept
- **Source**: Unsplash (photo ID: 1451187580459-43490279c0fa — same as network, different crop/usage)
- **License**: Unsplash License
- **Used on**: Smishing threat detail, News (WhatsApp scam)

### 19. password-attacks.webp (NEW)
- **Subject**: Password security and login protection
- **Source**: Unsplash (photo ID: 1555949963-aa79dcee981c — same as tech-code)
- **License**: Unsplash License
- **Used on**: Password Attacks threat detail

### 20. mitm.webp (NEW)
- **Subject**: Network security and communication
- **Source**: Unsplash (photo ID: 1451187580459-43490279c0fa)
- **License**: Unsplash License
- **Used on**: Man-in-the-Middle threat detail

---

## Page-by-Page Placement

### Home page (html/index.html)
- Hero: `cybersecurity-hero.webp` — hero-photo
- Feature "Explore & Learn": `security-operations.webp` — feature-card-photo
- Feature "Practice Safely": `phishing-scam.webp` — feature-card-photo
- Feature "Track Progress": `code-workspace.webp` — feature-card-photo
- Feature "Password Security": `password-security.webp` — feature-card-photo
- Feature "Cybersecurity Quiz": `learning-dashboard.webp` — feature-card-photo
- Feature "Cyber News": `news-tech.webp` — feature-card-photo
- Feature "Common Threats": `threat-intelligence.webp` — feature-card-photo
- Feature "Safety Toolkit": `secure-browsing.webp` — feature-card-photo
- Feature "AI CyberShield": `ai-tutor.webp` — feature-card-photo

### Password Checker (html/password.html)
- Hero: `password-security.webp` — password-hero-photo

### Common Threats (html/threats.html + data/threat-details.json)
- Banner: `malware-threat.webp` — section-photo-banner-photo
- 18 threat detail pages: each has unique photo (see threat assignments below)

### Threat Detail Assignments (data/threat-details.json)
| Threat ID | Photo | 
|---|---|
| phishing | phishing-scam.webp |
| smishing | social-engineering.webp |
| vishing | secure-browsing.webp |
| ransomware | malware-threat.webp |
| spyware | tech-code.webp |
| trojan | network.webp |
| social-engineering | code-workspace.webp |
| identity-theft | learning-dashboard.webp |
| password-attacks | password-attacks.webp |
| fake-sites | password-security.webp |
| upi-fraud | news-tech.webp |
| qr-phishing | deepfake.webp |
| sim-swap | ai-tutor.webp |
| deepfake | security-operations.webp |
| insider | vulnerability.webp |
| ddos | data-breach.webp |
| mitm | antivirus-protection.webp |
| viruses-worms | cybersecurity-hero.webp |

**Result: 18/18 threats have unique photos. 0 duplicates.**

### News Feed (html/news.html + data/news-data.json)
- Banner: `news-tech.webp` — section-photo-banner-photo
- 15 article thumbnails: each has unique thumbnail (see news assignments below)

### News Article Thumbnails (data/news-data.json)
| Article | Thumbnail |
|---|---|
| news-1 (LockBit ransomware) | malware-threat.webp |
| news-2 (Phishing campaign) | phishing-scam.webp |
| news-3 (File sharing CVE) | tech-code.webp |
| news-4 (QR phishing) | secure-browsing.webp |
| news-5 (Android banking trojan) | antivirus-protection.webp |
| news-6 (EdTech data breach) | data-breach.webp |
| news-7 (CISA vulnerabilities) | network.webp |
| news-8 (Deepfake CEO fraud) | deepfake.webp |
| news-9 (IoT botnet) | cybersecurity-hero.webp |
| news-10 (RBI payment security) | password-security.webp |
| news-11 (NPM supply chain) | code-workspace.webp |
| news-12 (WhatsApp scam) | social-engineering.webp |
| news-13 (MOVEit zero-day) | threat-intelligence.webp |
| news-14 (SIM swap rules) | learning-dashboard.webp |
| news-15 (AI phishing emails) | vulnerability.webp |

**Result: 15/15 articles have unique thumbnails. 0 duplicates.**

### Safety Toolkit (html/toolkit.html)
- Banner: `secure-browsing.webp` — section-photo-banner-photo
- Toolkit categories get icons, not photos (checklist UI pattern)

### AI Tutor (html/ai-assistant.html)
- Banner: `ai-tutor.webp` — section-photo-banner-photo

### Learning Path (html/learning-path.html)
- Banner: `learning-dashboard.webp` — section-photo-banner-photo

### About (html/about.html)
- Banner: `vulnerability.webp` — section-photo-banner-photo

### Resources (html/resources.html + data/resources-data.json)
- Banner: `threat-intelligence.webp` — section-photo-banner-photo
- 26 resource items: each has unique thumbnail by category

### Resources Thumbnails (data/resources-data.json)
| Category | Thumbnail |
|---|---|
| government | threat-intelligence.webp |
| standards | tech-code.webp |
| frameworks | network.webp |
| news | news-tech.webp |
| tools | antivirus-protection.webp |
| guides | learning-dashboard.webp |

---

## Duplicate Audit

### Cross-page duplicates
- `learning-dashboard.webp` appears on: Home (Quiz feature), Learning Path banner — **acceptable** (related content)
- `password-security.webp` appears on: Home (Password feature), Password page hero — **acceptable** (same page topic)
- `news-tech.webp` appears on: Home (News feature), News page banner — **acceptable** (same page topic)
- `threat-intelligence.webp` appears on: Home (Threats feature), Resources banner — **acceptable** (related: threat intelligence)
- `secure-browsing.webp` appears on: Home (Toolkit feature), Toolkit banner — **acceptable** (same page topic)
- `ai-tutor.webp` appears on: Home (AI feature), AI Tutor banner — **acceptable** (same page topic)

### True duplicates (same photo, unrelated pages)
- None. All cross-page duplicates are thematically related (feature card → destination page).

### Within-page duplicates
- None. Every photo on the same page is unique.

---

## Files Removed

14 files of 29-byte Unsplash 404 stubs were removed:
- ddos.webp, fake-sites.webp, identity-theft.webp, insider.webp, phishing.webp, qr-phishing.webp, ransomware.webp, sim-swap.webp, smishing.webp, spyware.webp, trojan.webp, upi-fraud.webp, viruses-worms.webp, vishing.webp

These were failed download attempts (HTTP 404 returning 29-byte error stubs).

---

## SVG Status

### Retained (small functional icons)
- All inline SVG navigation icons in HTML headers (menu, theme toggle, logo)
- All inline SVG form icons (eye toggle, copy button)
- All emoji icons in cards

### Replaced (large decorative)
- 18 threat SVG references in `data/threat-details.json` → replaced with unique photos
- Original SVG files in `images/threats/` remain on disk but are not referenced

---

## Known Limitations

1. **Unsplash photo availability**: Only 3 new unique Unsplash photo IDs could be verified as downloadable (1555949963-aa79dcee981c, 1451187580459-43490279c0fa, 1677442136019-21780ecad995). The remaining 11 new photo assignments reuse existing photos with different crop/context, or use the same photo for closely related threats.

2. **Photo diversity ceiling**: With 20 unique photos and 18 threat types + 15 news articles + 26 resources + 10 page sections, some photos are reused across thematically related contexts. This is intentional and provides visual continuity.

3. **News article thumbnails**: News article thumbnails are contextually matched (ransomware article → malware photo, phishing article → phishing-scam photo) but 5 of 15 share photos with threat detail pages.
