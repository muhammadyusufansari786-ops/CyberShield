/**
 * CyberShield - Real-time threat intelligence models (Day 2)
 *
 * ThreatItem      - ONE normalized vulnerability per CVE ID. The MongoDB
 *                   document _id IS the CVE ID, so duplicate records are
 *                   impossible by construction (upsert replaces in place)
 *                   - STRAIGHT out of the upstream feeds, never invented.
 * ThreatSyncState - per-source synchronization bookkeeping (when we last
 *                   fetched, last error, when the next fetch is allowed),
 *                   which powers the frontend "last updated" indicator
 *                   and the backoff that keeps external APIs unharmed.
 *
 * No user data is stored here - only public vulnerability information.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

/* ------------------------------------------------------------------ */
/* ThreatItem                                                          */
/* ------------------------------------------------------------------ */

const threatItemSchema = new Schema(
  {
    // The document _id is the CVE ID itself (string, e.g. "CVE-2026-1234").
    // Declared explicitly so Mongoose never tries to cast it to an ObjectId.
    _id: { type: String },
    source: {
      type: String,
      required: true,
      enum: ['cisa-kev', 'nvd'],
    },
    // "Feed timestamp": CISA KEV dateAdded, or NVD published date. This is
    // what "newest first" sorting and date filters use.
    feedDate: { type: Date, required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    // CISA KEV entries carry no CVSS - severity stays null for them and the
    // UI shows "Actively exploited" instead. Never guessed.
    severity: { type: String, enum: ['critical', 'high', 'medium', 'low', 'none', null], default: null },
    cvss: { type: Number, min: 0, max: 10, default: null },
    cvssVersion: { type: String, trim: true, maxlength: 16 },
    published: { type: Date, default: null }, // NVD publish date (null for KEV-only)
    lastModified: { type: Date, default: null }, // NVD last modified
    vendor: { type: String, trim: true, maxlength: 200 },
    product: { type: String, trim: true, maxlength: 200 },
    // True when the CVE is in the CISA Known Exploited Vulnerabilities catalog
    kev: { type: Boolean, default: false },
    kevDateAdded: { type: Date, default: null },
    kevDueDate: { type: Date, default: null }, // federal remediation deadline
    requiredAction: { type: String, trim: true, maxlength: 1000 },
    ransomwareUse: { type: Boolean, default: false }, // KEV "Known" ransomware campaign use
    cwes: { type: [String], default: [] },
    url: { type: String, trim: true, maxlength: 500 }, // link to the original source
    sourceUpdatedAt: { type: Date, default: null }, // when our copy was last refreshed
  },
  { timestamps: false } // feed data owns the timestamps - no local drift
);

// Common query paths (feeds can grow; keep the dashboard queries fast).
threatItemSchema.index({ feedDate: -1 });
threatItemSchema.index({ severity: 1, feedDate: -1 });
threatItemSchema.index({ kev: 1, ransomwareUse: 1 });
threatItemSchema.index({ source: 1, feedDate: -1 });
threatItemSchema.index({ title: 'text', description: 'text' }); // keyword search

export const ThreatItem = mongoose.model('ThreatItem', threatItemSchema);

/* ------------------------------------------------------------------ */
/* ThreatSyncState                                                     */
/* ------------------------------------------------------------------ */

const threatSyncStateSchema = new Schema(
  {
    source: { type: String, required: true, unique: true }, // 'cisa-kev' | 'nvd'
    lastFetchedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    sourceModifiedAt: { type: Date, default: null }, // upstream feed's own modified date
    lastError: { type: String, trim: true, maxlength: 300, default: null }, // TEXT ONLY - never URLs with credentials
    lastErrorAt: { type: Date, default: null },
    nextFetchAt: { type: Date, default: null },
    itemCount: { type: Number, default: 0 },
  },
  { timestamps: false }
);

export const ThreatSyncState = mongoose.model('ThreatSyncState', threatSyncStateSchema);
