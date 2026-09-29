#!/usr/bin/env python3
"""One-time migration: add a category field to every glossary entry."""
import json

MAPPING = {
    # --- Social engineering & fraud attacks ---
    "Phishing": "attacks",
    "Spear Phishing": "attacks",
    "Smishing": "attacks",
    "Quishing": "attacks",
    "Vishing": "attacks",
    "Social Engineering": "attacks",
    "Pretexting": "attacks",
    "Baiting": "attacks",
    "Tailgating": "attacks",
    "Identity Theft": "attacks",
    "SIM Swapping": "attacks",
    "Deepfake": "attacks",
    "Credential Stuffing": "attacks",
    "Password Spraying": "attacks",
    "Brute Force Attack": "attacks",
    "Dictionary Attack": "attacks",

    # --- Malware & disruption ---
    "Malware": "malware",
    "Virus": "malware",
    "Worm": "malware",
    "Trojan Horse": "malware",
    "RAT (Remote Access Trojan)": "malware",
    "Spyware": "malware",
    "Keylogger": "malware",
    "Adware": "malware",
    "Rootkit": "malware",
    "Botnet": "malware",
    "DDoS (Distributed Denial-of-Service)": "malware",
    "Ransomware": "malware",

    # --- Passwords & account access ---
    "MFA (Multi-Factor Authentication)": "authentication",
    "2FA (Two-Factor Authentication)": "authentication",
    "OTP (One-Time Password)": "authentication",
    "TOTP (Time-based OTP)": "authentication",
    "Passphrase": "authentication",
    "Password Manager": "authentication",
    "FIDO2 / WebAuthn": "authentication",
    "Passkey": "authentication",
    "Single Sign-On (SSO)": "authentication",
    "SAML (Security Assertion Markup Language)": "authentication",
    "OAuth 2.0": "authentication",
    "OpenID Connect (OIDC)": "authentication",
    "Zero Trust": "authentication",

    # --- Crypto, keys & certificates ---
    "Rainbow Table": "crypto",
    "Salt (Cryptography)": "crypto",
    "Hashing": "crypto",
    "Encryption": "crypto",
    "Symmetric Encryption": "crypto",
    "Asymmetric Encryption": "crypto",
    "Public Key Infrastructure (PKI)": "crypto",
    "Digital Certificate": "crypto",
    "Certificate Authority (CA)": "crypto",
    "Certificate Pinning": "crypto",
    "SSL/TLS": "crypto",
    "Encryption at Rest": "crypto",
    "Encryption in Transit": "crypto",
    "Key Management": "crypto",
    "Hardware Security Module (HSM)": "crypto",

    # --- Networks & internet protocols ---
    "Firewall": "network",
    "WAF (Web Application Firewall)": "network",
    "IDS/IPS": "network",
    "VPN (Virtual Private Network)": "network",
    "Tor": "network",
    "DNS (Domain Name System)": "network",
    "DNSSEC": "network",
    "DoH (DNS over HTTPS)": "network",
    "DoT (DNS over TLS)": "network",
    "MITM (Man-in-the-Middle)": "network",
    "HSTS (HTTP Strict Transport Security)": "network",

    # --- Web application security ---
    "CSP (Content Security Policy)": "web",
    "XSS (Cross-Site Scripting)": "web",
    "CSRF (Cross-Site Request Forgery)": "web",
    "SQL Injection": "web",
    "OWASP (Open Web Application Security Project)": "web",
    "OWASP Top 10": "web",

    # --- Defense, response & careers ---
    "Zero-Day Vulnerability": "defense",
    "Exploit": "defense",
    "Patch": "defense",
    "CVE (Common Vulnerabilities and Exposures)": "defense",
    "CVSS (Common Vulnerability Scoring System)": "defense",
    "Patch Management": "defense",
    "Penetration Testing": "defense",
    "Red Team / Blue Team": "defense",
    "SIEM (Security Information and Event Management)": "defense",
    "SOC (Security Operations Center)": "defense",
    "Incident Response": "defense",
    "Forensics (Digital)": "defense",
    "Threat Intelligence": "defense",
    "APT (Advanced Persistent Threat)": "defense",
    "Supply Chain Attack": "defense",
    "Least Privilege": "defense",

    # --- Privacy, data & compliance ---
    "Data Minimization": "privacy",
    "GDPR (General Data Protection Regulation)": "privacy",
    "PII (Personally Identifiable Information)": "privacy",
    "Data Breach": "privacy",
    "PCI DSS": "privacy",
    "HIPAA": "privacy",
    "SOC 2": "privacy",
    "ISO 27001": "privacy",

    # --- Agencies & authorities ---
    "CERT-In": "agencies",
    "I4C (Indian Cyber Crime Coordination Centre)": "agencies",
    "Cybercrime.gov.in": "agencies",
    "CISA": "agencies",
    "NIST": "agencies",
}

PATH = "data/glossary-data.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

terms = [d["term"] for d in data]
mapped = set(MAPPING)
unmapped = [t for t in terms if t not in mapped]
extra = sorted(mapped - set(terms))
dups = [t for t in set(terms) if terms.count(t) > 1]

if unmapped or extra or dups:
    print("ABORT: unmapped:", unmapped)
    print("ABORT: extra keys:", extra)
    print("ABORT: duplicate terms:", dups)
    raise SystemExit(1)

for d in data:
    d["category"] = MAPPING[d["term"]]

# Restore original field order: term, definition, explanation, example, risks, safety, category
for d in data:
    ordered = {
        "term": d["term"],
        "definition": d["definition"],
        "explanation": d["explanation"],
        "example": d["example"],
        "risks": d["risks"],
        "safety": d["safety"],
        "category": d["category"],
    }
    d.clear()
    d.update(ordered)

with open(PATH, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")

counts = {}
for d in data:
    counts[d["category"]] = counts.get(d["category"], 0) + 1
print("Migration OK:", len(data), "terms")
for cat in sorted(counts):
    print(f"  {cat}: {counts[cat]}")
