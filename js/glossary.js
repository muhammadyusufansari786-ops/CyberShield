/**
 * CyberShield - Cyber Glossary
 * Searchable, filterable cybersecurity term definitions with category and alphabetical navigation
 * Data loaded via fetch() from data/glossary-data.json
 */

(function() {
  'use strict';

  // ========================================
  // Glossary Controller
  // ========================================
  class GlossaryController {
    constructor() {
      this.data = [];
      this.filteredData = [];
      this.searchQuery = '';
      this.activeLetter = 'all';
      this.activeCategory = 'all';
      this.searchInput = document.getElementById('glossary-search');
      this.alphabetNav = document.getElementById('alphabet-nav');
      this.categoryNav = document.getElementById('category-filters');
      this.glossaryList = document.getElementById('glossary-list');
      this.noResults = document.getElementById('no-results');

      this.loadData();
    }

    loadData() {
      if (this.glossaryList) {
        this.glossaryList.innerHTML = '<p style="text-align:center; color: var(--color-text-muted); padding: 2rem;">Loading glossary…</p>';
      }

      fetch('../data/glossary-data.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(rawData => {
          this.data = [...rawData].sort((a, b) => a.term.localeCompare(b.term));
          this.filteredData = [...this.data];
          this.bindEvents();
          this.renderCategories();
          this.renderAlphabet();
          this.applyUrlParams();
          this.applyFilters();
        })
        .catch(err => {
          console.error('Failed to load glossary data:', err);
          if (this.glossaryList) {
            this.glossaryList.innerHTML = '<p style="text-align:center; color: var(--color-danger); padding: 2rem;">⚠️ Failed to load glossary. Please refresh the page.</p>';
          }
        });
    }

    bindEvents() {
      if (!this.searchInput) return;
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.applyFilters();
      });
    }

    // Combined filtering: search AND letter AND category
    applyFilters() {
      this.filteredData = this.data.filter(item => {
        // Category filter
        if (this.activeCategory !== 'all' && item.category !== this.activeCategory) {
          return false;
        }
        // Letter filter
        if (this.activeLetter !== 'all' && !item.term.toUpperCase().startsWith(this.activeLetter)) {
          return false;
        }
        // Search filter (term, definition, explanation, example)
        if (this.searchQuery) {
          const q = this.searchQuery;
          const haystack = [
            item.term,
            item.definition,
            item.explanation || '',
            item.example || ''
          ].join(' ').toLowerCase();
          if (!haystack.includes(q)) {
            return false;
          }
        }
        return true;
      });

      this.renderTerms();
      this.updateFilterCounts();
      if (this.noResults) {
        this.noResults.style.display = this.filteredData.length === 0 ? 'block' : 'none';
      }
    }

    // After rendering, expand and highlight the deep-linked term, then scroll to it
    focusOpenTerm() {
      if (!this.pendingScroll || !this.openTerm || !this.glossaryList) return;
      const card = [...this.glossaryList.querySelectorAll('.glossary-term')]
        .find(d => d.querySelector('.glossary-term-name')?.textContent.trim() === this.openTerm.term);
      if (card) {
        card.classList.add('glossary-term-highlight');
        // A deliberately deep-linked term is wanted in full: expand its details.
        const region = card.querySelector('.viewmore-region');
        if (region && window.CyberViewMore) window.CyberViewMore.open(region);
        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      this.pendingScroll = false;
    }

    renderCategories() {
      if (!this.categoryNav) return;
      const categories = [
        { id: 'all', label: 'All' },
        { id: 'attacks', label: '🎯 Attacks & Scams' },
        { id: 'malware', label: '🦠 Malware' },
        { id: 'authentication', label: '🔑 Authentication' },
        { id: 'crypto', label: '🔐 Encryption & Keys' },
        { id: 'network', label: '🌐 Network' },
        { id: 'web', label: '💻 Web Security' },
        { id: 'defense', label: '🛡️ Defense & Response' },
        { id: 'privacy', label: '🔒 Privacy & Compliance' },
        { id: 'agencies', label: '🏛️ Standards & Agencies' }
      ];

      const countFor = (id) =>
        id === 'all'
          ? this.data.length
          : this.data.filter(item => item.category === id).length;

      this.categoryNav.innerHTML = categories.map(cat =>
        `<button type="button" class="filter-btn${cat.id === 'all' ? ' active' : ''}" data-category="${cat.id}" aria-pressed="${cat.id === 'all'}">${cat.label} <span class="filter-count">(${countFor(cat.id)})</span></button>`
      ).join('');

      this.categoryNav.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          this.activeCategory = btn.dataset.category;
          this.categoryNav.querySelectorAll('button').forEach(b => {
            const isActive = b === btn;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-pressed', isActive);
          });
          this.applyFilters();
        });
      });
    }

    renderAlphabet() {
      if (!this.alphabetNav) return;
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const allBtn = `<button type="button" class="filter-btn" data-letter="all" aria-pressed="false">All</button>`;
      const letterBtns = letters.map(letter =>
        `<button type="button" class="filter-btn" data-letter="${letter}" aria-pressed="false">${letter}</button>`
      ).join('');

      this.alphabetNav.innerHTML = allBtn + letterBtns;

      this.alphabetNav.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          this.activeLetter = btn.dataset.letter;
          this.updateAlphabetHighlight(this.activeLetter);
          this.applyFilters();
        });
      });
    }

    // Deep links: glossary.html?cat=attacks or glossary.html?term=Phishing
    // ?term= matches a term exactly (or by prefix if no exact match) and opens
    // its entry expanded; ?cat= pre-selects a category filter.
    applyUrlParams() {
      if (typeof URLSearchParams === 'undefined') return;
      const params = new URLSearchParams(window.location.search);

      const cat = params.get('cat');
      if (cat) {
        const exists = this.data.some(item => item.category === cat);
        if (exists) {
          this.activeCategory = cat;
          if (this.categoryNav) {
            this.categoryNav.querySelectorAll('button').forEach(b => {
              const isActive = b.dataset.category === cat;
              b.classList.toggle('active', isActive);
              b.setAttribute('aria-pressed', isActive);
            });
          }
        }
      }

      const term = params.get('term');
      if (term) {
        const needle = term.toLowerCase();
        this.openTerm = this.data.find(item => item.term.toLowerCase() === needle)
          || this.data.find(item => item.term.toLowerCase().startsWith(needle))
          || null;
        if (this.openTerm) {
          this.searchQuery = '';
          if (this.searchInput) this.searchInput.value = '';
          this.activeLetter = 'all';
          this.updateAlphabetHighlight('all');
          this.filteredData = [...this.data];
        }
      }

      this.pendingScroll = !!this.openTerm;
    }

    updateAlphabetHighlight(activeLetter) {
      if (!this.alphabetNav) return;
      this.alphabetNav.querySelectorAll('button').forEach(btn => {
        const isActive = btn.dataset.letter === activeLetter;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
      });
    }

    updateFilterCounts() {
      if (!this.categoryNav) return;
      // Candidate set: everything matching search + letter, ignoring the category
      // filter, so each button previews how many terms it would show if clicked.
      const candidate = this.data.filter(item => {
        if (this.activeLetter !== 'all' && !item.term.toUpperCase().startsWith(this.activeLetter)) {
          return false;
        }
        if (this.searchQuery) {
          const q = this.searchQuery;
          const haystack = [item.term, item.definition, item.explanation || '', item.example || ''].join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });

      this.categoryNav.querySelectorAll('button').forEach(btn => {
        const cat = btn.dataset.category;
        const countSpan = btn.querySelector('.filter-count');
        if (!countSpan) return;
        const count = cat === 'all'
          ? candidate.length
          : candidate.filter(item => item.category === cat).length;
        countSpan.textContent = `(${count})`;
      });
    }

    renderTerms() {
      if (!this.glossaryList) return;
      this.glossaryList.innerHTML = this.filteredData.map((item, index) => {
        const term = this.escapeHtml(item.term);
        const definition = this.escapeHtml(item.definition || '');
        const explanation = this.escapeHtml(item.explanation || '');
        const example = this.escapeHtml(item.example || '');
        const risks = this.escapeHtml(item.risks || '');
        const safety = this.escapeHtml(item.safety || '');

        const explanationHtml = explanation
          ? `<p class="glossary-paragraph"><strong>What it is:</strong> ${explanation}</p>`
          : '';
        const exampleHtml = example
          ? `<p class="glossary-paragraph"><strong>Real-world example:</strong> ${example}</p>`
          : '';
        const risksHtml = risks
          ? `<p class="glossary-paragraph"><strong>Risks if ignored:</strong> ${risks}</p>`
          : '';
        const safetyHtml = safety
          ? `<p class="glossary-paragraph"><strong>How to stay safe:</strong> ${safety}</p>`
          : '';

        // Progressive disclosure: term + short definition are always visible;
        // the long explanation lives once in the DOM behind View More.
        const detailId = `glossary-term-${index}-details`;
        const hasDetails = !!(explanation || example || risks || safety);
        // Button lives AFTER the expandable region: collapsed it sits right
        // after the short definition (the region is zero-height), expanded it
        // lands at the very bottom of the revealed details.
        const moreHtml = hasDetails
          ? `
          <div class="viewmore-region glossary-term-more" id="${detailId}">
            <div class="viewmore-inner">${explanationHtml}${exampleHtml}${risksHtml}${safetyHtml}</div>
          </div>
          <button type="button" class="viewmore-btn" aria-expanded="false" aria-controls="${detailId}">
            <span class="viewmore-label">View More</span>
            <span class="viewmore-arrow" aria-hidden="true">→</span>
          </button>`
          : '';

        return `
        <article class="glossary-term">
          <h3 class="glossary-term-name">${term}</h3>
          <p class="glossary-definition">${definition}</p>
          ${moreHtml}
        </article>
      `;
      }).join('');

      this.focusOpenTerm();
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    new GlossaryController();
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GlossaryController };
  }
})();
