/**
 * CyberShield - Resources & References
 * Curated trusted cybersecurity sources with category filtering
 * Data loaded via fetch() from data/resources-data.json
 */

(function() {
  'use strict';

  // ========================================
  // Resources Controller
  // ========================================
  class ResourcesController {
    constructor() {
      this.data = [];
      this.filteredData = [];
      this.grid = document.getElementById('resources-grid');
      this.filterContainer = document.getElementById('resource-filters');

      this.loadData();
    }

    loadData() {
      // Show loading state
      if (this.grid) {
        this.grid.innerHTML = '<p style="text-align:center; color: var(--color-text-muted); padding: 2rem;">Loading resources…</p>';
      }

      fetch('../data/resources-data.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          this.data = data;
          this.filteredData = [...this.data];
          this.renderFilters();
          this.renderResources();
        })
        .catch(err => {
          console.error('Failed to load resources data:', err);
          if (this.grid) {
            this.grid.innerHTML = '<p style="text-align:center; color: var(--color-danger); padding: 2rem;">⚠️ Failed to load resources. Please refresh the page.</p>';
          }
        });
    }

    renderFilters() {
      if (!this.filterContainer) return;
      const categories = [...new Set(this.data.map(item => item.category))].sort();
      const filterOrder = ['all', 'government', 'standards', 'frameworks', 'news', 'tools', 'guides'];

      const orderedCategories = [
        ...filterOrder.filter(c => c === 'all' || categories.includes(c)),
        ...categories.filter(c => !filterOrder.includes(c))
      ];

      this.filterContainer.innerHTML = orderedCategories.map(cat => `
        <button type="button" class="filter-btn ${cat === 'all' ? 'active' : ''}" data-filter="${cat}" aria-pressed="${cat === 'all'}">
          ${this.formatCategory(cat)}
        </button>
      `).join('');

      this.filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
      });
    }

    formatCategory(cat) {
      const labels = {
        'all': 'All',
        'government': '🏛️ Government / Official',
        'standards': '📐 Standards & Compliance',
        'frameworks': '🏗️ Frameworks',
        'news': '📰 News & Intelligence',
        'tools': '🔧 Tools & Utilities',
        'guides': '📚 Guides & Education'
      };
      return labels[cat] || cat;
    }

    setFilter(filter) {
      this.filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        const isActive = btn.dataset.filter === filter;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
      });

      if (filter === 'all') {
        this.filteredData = [...this.data];
      } else {
        this.filteredData = this.data.filter(item => item.category === filter);
      }

      this.renderResources();
    }

    renderResources() {
      if (!this.grid) return;
      this.grid.innerHTML = this.filteredData.map(item => `
        <article class="card resource-card" style="text-align: center;" data-category="${item.category}" role="listitem">
          <div class="resource-icon" style="font-size: 2rem; margin-bottom: 1rem;" aria-hidden="true">${item.icon}</div>
          <h3 class="resource-title" style="margin-bottom: 0.5rem;">${this.escapeHtml(item.name)}</h3>
          <p class="resource-description" style="color: var(--color-text-secondary); font-size: 0.9375rem; margin-bottom: 1rem;">${this.escapeHtml(item.description)}</p>
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="resource-link btn btn-primary" style="display: inline-flex; align-items: center; gap: 0.375rem;">
            Visit
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
          <span class="badge badge-info" style="margin-top: 0.75rem; display: inline-block; font-size: 0.6875rem;">${this.formatCategory(item.category)}</span>
        </article>
      `).join('');

      // Animate cards
      const cards = this.grid.querySelectorAll('.resource-card');
      cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, i * 30);
      });
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    new ResourcesController();
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ResourcesController };
  }
})();