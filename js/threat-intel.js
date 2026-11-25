/**
 * CyberShield - Threat Intelligence dashboard (Day 2)
 *
 * Reads ONLY from the project's own API (/api/threats), which serves cached
 * CISA KEV + NIST NVD data. No third-party script is called from the browser
 * and no API keys exist client-side.
 *
 * Features: search (CVE ID / keyword), severity + exploitation filters,
 * source and date filters, sorting, Load More pagination, and explicit
 * loading / empty / error states plus a "last updated" indicator.
 */

(function () {
  'use strict';

  const PAGE_SIZE = 12;

  class ThreatIntelController {
    constructor() {
      this.state = {
        search: '',
        filter: 'all', // all | critical | high | medium | low | exploited | ransomware
        source: '',
        range: '',
        sort: 'newest',
        page: 1,
        total: 0,
        items: [],
        loading: false,
        error: null,
      };

      this.grid = document.getElementById('intel-grid');
      this.searchInput = document.getElementById('intel-search');
      this.sourceSelect = document.getElementById('intel-source');
      this.rangeSelect = document.getElementById('intel-range');
      this.sortSelect = document.getElementById('intel-sort');
      this.filterButtons = Array.from(document.querySelectorAll('.intel-filters .filter-btn'));
      this.summaryEl = document.getElementById('intel-summary');
      this.freshnessEl = document.getElementById('intel-freshness');
      this.loadMoreBtn = document.getElementById('intel-load-more');
      this.clearBtn = document.getElementById('intel-clear');

      if (!this.grid) return;

      this.bindEvents();
      this.load();
      this.loadStatus();
      // Keep the "last updated" indicator honest without hammering the API.
      setInterval(() => this.loadStatus(), 5 * 60 * 1000);
    }

    /* ------------------------------------------------------------------ */
    /* Events                                                             */
    /* ------------------------------------------------------------------ */

    bindEvents() {
      const debouncedSearch = this.debounce(() => {
        this.state.search = this.searchInput.value.trim();
        this.reload();
      }, 400);

      if (this.searchInput) {
        this.searchInput.addEventListener('input', debouncedSearch);
        this.searchInput.addEventListener('search', () => {
          this.state.search = this.searchInput.value.trim();
          this.reload();
        });
      }

      this.filterButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const filter = btn.dataset.filter || 'all';
          if (filter === this.state.filter) return;
          this.state.filter = filter;
          this.filterButtons.forEach((b) => {
            const active = b.dataset.filter === filter;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', String(active));
          });
          this.reload();
        });
      });

      [this.sourceSelect, this.rangeSelect, this.sortSelect].forEach((el) => {
        if (el) el.addEventListener('change', () => {
          this.state.source = this.sourceSelect ? this.sourceSelect.value : '';
          this.state.range = this.rangeSelect ? this.rangeSelect.value : '';
          this.state.sort = this.sortSelect ? this.sortSelect.value : 'newest';
          this.reload();
        });
      });

      if (this.loadMoreBtn) {
        this.loadMoreBtn.addEventListener('click', () => {
          if (this.state.loading) return;
          this.state.page += 1;
          this.load({ append: true });
        });
      }

      if (this.clearBtn) {
        this.clearBtn.addEventListener('click', () => this.clearFilters());
      }

      // Delegated: cards are re-rendered on every query.
      this.grid.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="retry"]')) this.load();
        if (e.target.closest('[data-action="reset"]')) this.clearFilters();
      });
    }

    clearFilters() {
      this.state.search = '';
      this.state.filter = 'all';
      this.state.source = '';
      this.state.range = '';
      this.state.sort = 'newest';
      if (this.searchInput) this.searchInput.value = '';
      if (this.sourceSelect) this.sourceSelect.value = '';
      if (this.rangeSelect) this.rangeSelect.value = '';
      if (this.sortSelect) this.sortSelect.value = 'newest';
      this.filterButtons.forEach((b) => {
        const active = b.dataset.filter === 'all';
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      this.reload();
    }

    reload() {
      this.state.page = 1;
      this.state.items = [];
      this.load();
    }

    /* ------------------------------------------------------------------ */
    /* Data fetching                                                      */
    /* ------------------------------------------------------------------ */

    buildQuery() {
      const params = new URLSearchParams();
      const { search, filter, source, range, sort, page } = this.state;

      if (search) params.set('search', search);
      if (['critical', 'high', 'medium', 'low'].includes(filter)) params.set('severity', filter);
      if (filter === 'exploited') params.set('exploited', '1');
      if (filter === 'ransomware') params.set('ransomware', '1');
      if (source) params.set('source', source);
      if (range) {
        const days = Number(range);
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        params.set('dateFrom', from.toISOString());
      }
      if (sort && sort !== 'newest') params.set('sort', sort);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return params.toString();
    }

    async load({ append = false } = {}) {
      this.state.loading = true;
      this.state.error = null;
      this.grid.setAttribute('aria-busy', 'true');

      if (append) {
        if (this.loadMoreBtn) {
          this.loadMoreBtn.disabled = true;
          this.loadMoreBtn.textContent = 'Loading…';
        }
      } else {
        this.renderLoading();
      }

      try {
        const res = await fetch(`/api/threats?${this.buildQuery()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        this.state.total = Number(data.total) || 0;
        this.state.items = append ? this.state.items.concat(data.items || []) : (data.items || []);

        this.render();
      } catch (err) {
        this.state.error = err && err.message ? err.message : 'Could not reach the threat intelligence service.';
        if (!append) this.state.items = [];
        this.renderError();
        this.updateSummary();
      } finally {
        this.state.loading = false;
        this.grid.setAttribute('aria-busy', 'false');
        if (this.loadMoreBtn) {
          this.loadMoreBtn.disabled = false;
          this.updateLoadMore();
        }
      }
    }

    async loadStatus() {
      if (!this.freshnessEl) return;
      try {
        const res = await fetch('/api/threats/status');
        if (!res.ok) throw new Error('status unavailable');
        this.renderFreshness(await res.json());
      } catch {
        this.freshnessEl.innerHTML =
          '<span class="intel-dot warn" aria-hidden="true"></span><span>Feed status unavailable — showing cached results</span>';
      }
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                          */
    /* ------------------------------------------------------------------ */

    render() {
      if (!this.grid) return;

      if (!this.state.items.length) {
        this.grid.innerHTML = `
          <div class="intel-state">
            <h3>No vulnerabilities match these filters</h3>
            <p>Try a different keyword, widen the date range, or clear the filters to see the full catalog.</p>
            <button type="button" class="btn btn-secondary" data-action="reset">Clear filters</button>
          </div>`;
        this.updateSummary();
        return;
      }

      this.grid.innerHTML = this.state.items.map((item) => this.cardHtml(item)).join('');
      this.updateSummary();
      this.updateLoadMore();
    }

    renderLoading() {
      if (!this.grid) return;
      this.grid.innerHTML = `
        <div class="intel-skeleton" aria-hidden="true"></div>
        <div class="intel-skeleton" aria-hidden="true"></div>`;
      if (this.summaryEl) this.summaryEl.textContent = 'Loading vulnerabilities from the cached feeds…';
      if (this.loadMoreBtn) this.loadMoreBtn.style.display = 'none';
    }

    renderError() {
      if (!this.grid) return;
      this.grid.innerHTML = `
        <div class="card intel-state intel-state-error">
          <h3>⚠️ Threat intelligence is unavailable right now</h3>
          <p>${this.escapeHtml(this.state.error || 'The service could not be reached.')} The page will keep working once the server is back.</p>
          <button type="button" class="btn btn-secondary" data-action="retry">Try again</button>
        </div>`;
      if (this.loadMoreBtn) this.loadMoreBtn.style.display = 'none';
    }

    cardHtml(item) {
      const severity = (item.severity || '').toLowerCase();
      const sevClass = { critical: 'badge-danger', high: 'badge-warning', medium: 'badge-info', low: 'badge-neutral', none: 'badge-neutral' }[severity] || '';
      const isKevSource = item.source === 'cisa-kev';

      const badges = [];
      if (severity && sevClass) {
        badges.push(`<span class="badge ${sevClass}">${severity.toUpperCase()}</span>`);
      }
      if (item.kev) badges.push('<span class="badge badge-danger">🔥 Actively exploited</span>');
      if (item.ransomwareUse) badges.push('<span class="badge badge-warning">💰 Ransomware use</span>');
      if (!severity && !item.kev) badges.push('<span class="badge badge-neutral">Not scored by NVD</span>');

      const meta = [];
      if (typeof item.cvss === 'number') {
        meta.push(this.metaPair('CVSS score', `${item.cvss}${item.cvssVersion ? ` · ${this.escapeHtml(item.cvssVersion)}` : ''}`));
      }
      if (item.published) meta.push(this.metaPair('Published', this.formatDate(item.published)));
      if (item.lastModified) meta.push(this.metaPair('Last updated', this.formatDate(item.lastModified)));
      if (item.kevDateAdded) meta.push(this.metaPair('Added to KEV', this.formatDate(item.kevDateAdded)));
      if (item.kevDueDate) meta.push(this.metaPair('Remediation due', this.formatDate(item.kevDueDate)));
      if (item.vendor) meta.push(this.metaPair('Vendor', item.vendor));
      if (item.product) meta.push(this.metaPair('Product', item.product));

      const cwes = Array.isArray(item.cwes) && item.cwes.length
        ? `<p class="intel-source">Weakness: ${item.cwes.map((c) => this.escapeHtml(c)).join(', ')}</p>`
        : '';

      const action = item.requiredAction
        ? `<p class="intel-action"><strong>Required action:</strong> ${this.escapeHtml(item.requiredAction)}</p>`
        : '';

      const title = item.title && item.title !== item.cveId ? `<h3 class="intel-title">${this.escapeHtml(this.stripCvePrefix(item.title, item.cveId))}</h3>` : '';
      const url = typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : null;

      return `
        <article class="card intel-card">
          <div class="intel-card-top">
            <code class="intel-cve">${this.escapeHtml(item.cveId)}</code>
            ${badges.join('')}
          </div>
          ${title}
          <p class="intel-desc">${this.escapeHtml(this.truncate(item.description || 'No description provided by the source.', 340))}</p>
          ${meta.length ? `<dl class="intel-meta">${meta.join('')}</dl>` : ''}
          ${action}
          ${cwes}
          <div class="intel-card-foot">
            <span class="intel-source">${this.escapeHtml(item.sourceName || '')} · ${isKevSource ? 'Added' : 'Published'} ${this.formatDate(item.feedDate)}</span>
            ${url ? `<a class="btn btn-ghost btn-sm" href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View advisory ↗</a>` : ''}
          </div>
        </article>`;
    }

    metaPair(label, value) {
      return `<div><dt>${this.escapeHtml(label)}</dt><dd>${this.escapeHtml(String(value))}</dd></div>`;
    }

    updateSummary() {
      if (!this.summaryEl) return;
      const shown = this.state.items.length;
      const total = this.state.total;
      const bits = [];
      if (shown > 0) {
        bits.push(`Showing <strong>${shown.toLocaleString()}</strong> of <strong>${total.toLocaleString()}</strong> vulnerabilities`);
      }
      const active = [];
      if (this.state.filter !== 'all') {
        active.push(this.state.filter === 'exploited' ? 'actively exploited'
          : this.state.filter === 'ransomware' ? 'known ransomware use'
          : this.state.filter);
      }
      if (this.state.search) active.push(`“${this.escapeHtml(this.state.search)}”`);
      if (active.length) bits.push(`· ${this.escapeHtml(active.join(' · '))}`);
      if (!bits.length) bits.push('No results');
      this.summaryEl.innerHTML = bits.join(' ');
    }

    updateLoadMore() {
      if (!this.loadMoreBtn) return;
      const more = this.state.items.length < this.state.total;
      this.loadMoreBtn.style.display = more ? 'inline-flex' : 'none';
      this.loadMoreBtn.textContent = more
        ? `Load More Vulnerabilities (${this.state.items.length.toLocaleString()} of ${this.state.total.toLocaleString()})`
        : 'Load More Vulnerabilities';
    }

    renderFreshness(status) {
      if (!this.freshnessEl) return;
      const src = status.sources || {};
      const kev = src['cisa-kev'] || {};
      const nvd = src.nvd || {};
      const errored = ['cisa-kev', 'nvd'].filter((k) => src[k] && src[k].lastError);
      const dotClass = errored.length === 2 ? 'bad' : errored.length ? 'warn' : '';

      const parts = [];
      parts.push(`Last feed update ${this.relativeTime(status.lastUpdatedAt)}`);
      parts.push(`CISA KEV <strong>${(kev.itemCount || 0).toLocaleString()}</strong>`);
      parts.push(`NIST NVD <strong>${(nvd.itemCount || 0).toLocaleString()}</strong>`);
      if (errored.length) {
        parts.push(`⚠️ ${errored.map((k) => (k === 'cisa-kev' ? 'KEV' : 'NVD')).join(' / ')} refresh issue — serving cached data`);
      }

      this.freshnessEl.innerHTML = `
        <span class="intel-dot ${dotClass}" aria-hidden="true"></span>
        <span>${parts.join(' <span class="intel-sep">·</span> ')}</span>`;
      this.freshnessEl.title = `CISA KEV last success: ${kev.lastSuccessAt ? new Date(kev.lastSuccessAt).toLocaleString() : 'never'}\nNVD last success: ${nvd.lastSuccessAt ? new Date(nvd.lastSuccessAt).toLocaleString() : 'never'}`;
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                            */
    /* ------------------------------------------------------------------ */

    /** KEV titles repeat the CVE ID ("CVE-2026-1 - Vendor ..."); show only the text. */
    stripCvePrefix(title, cveId) {
      const t = String(title || '').trim();
      if (!cveId) return t;
      const idx = t.indexOf(cveId);
      if (idx !== 0) return t;
      return t.slice(cveId.length).replace(/^[\s:–—-]+/, '') || t;
    }

    truncate(text, max) {
      const s = String(text || '').trim();
      return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s;
    }

    formatDate(value) {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    relativeTime(value) {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return 'unknown';
      const diff = Date.now() - d.getTime();
      if (diff < 60 * 1000) return 'just now';
      const mins = Math.round(diff / (60 * 1000));
      if (mins < 60) return `${mins} min ago`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `${hours} h ago`;
      const days = Math.round(hours / 24);
      return `${days} d ago`;
    }

    debounce(fn, wait) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text == null ? '' : String(text);
      return div.innerHTML;
    }
  }

  document.addEventListener('DOMContentLoaded', () => new ThreatIntelController());

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThreatIntelController };
  }
})();
