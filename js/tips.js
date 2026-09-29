/**
 * CyberShield - Daily Security Tips
 * Rotating tips with categories, search, and favorites
 * Data loaded via fetch() from data/tips-data.json
 */

(function() {
  'use strict';

  // ========================================
  // Tips Controller
  // ========================================
  class TipsController {
    constructor() {
      this.tips = [];
      this.filteredTips = [];
      this.currentPage = 1;
      this.tipsPerPage = 6;
      this.currentCategory = 'all';
      this.searchQuery = '';
      this.favorites = JSON.parse(localStorage.getItem('cybershield-favorite-tips') || '[]');

      this.dailyTipText = document.getElementById('daily-tip-text');
      this.dailyTipDate = document.getElementById('daily-tip-date');
      this.tipsGrid = document.getElementById('tips-grid');
      this.favoritesGrid = document.getElementById('favorites-grid');
      this.noFavorites = document.getElementById('no-favorites');
      this.pagination = document.getElementById('pagination');
      this.searchInput = document.getElementById('tip-search');
      this.categorySelect = document.getElementById('tip-category');
      this.randomBtn = document.getElementById('random-tip-btn');

      this.loadData();
    }

    loadData() {
      fetch('../data/tips-data.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          this.tips = data;
          this.filteredTips = [...this.tips];
          this.bindEvents();
          this.initDailyTip();
          this.render();
          this.renderFavorites();
        })
        .catch(err => {
          console.error('Failed to load tips data:', err);
          if (this.tipsGrid) {
            this.tipsGrid.innerHTML = '<p style="text-align:center; color: var(--color-danger); padding: 2rem;">⚠️ Failed to load tips. Please refresh.</p>';
          }
        });
    }

    bindEvents() {
      if (this.searchInput) {
        this.searchInput.addEventListener('input', (e) => {
          this.searchQuery = e.target.value.toLowerCase().trim();
          this.currentPage = 1;
          this.filterAndRender();
        });
      }

      if (this.categorySelect) {
        this.categorySelect.addEventListener('change', (e) => {
          this.currentCategory = e.target.value;
          this.currentPage = 1;
          this.filterAndRender();
        });
      }

      if (this.randomBtn) {
        this.randomBtn.addEventListener('click', () => this.showRandomTip());
      }
    }

    initDailyTip() {
      if (this.tips.length === 0) return;
      // Deterministic daily tip based on date
      const today = new Date();
      const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
      const tipIndex = dayOfYear % this.tips.length;
      const tip = this.tips[tipIndex];

      if (this.dailyTipText) this.dailyTipText.textContent = tip.text;
      if (this.dailyTipDate) this.dailyTipDate.textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    showRandomTip() {
      if (this.tips.length === 0) return;
      const randomTip = this.tips[Math.floor(Math.random() * this.tips.length)];
      if (this.dailyTipText) this.dailyTipText.textContent = randomTip.text;
      if (this.dailyTipDate) this.dailyTipDate.textContent = 'Random tip';
    }

    filterAndRender() {
      this.filteredTips = this.tips.filter(tip => {
        const matchesCategory = this.currentCategory === 'all' || tip.category === this.currentCategory;
        const matchesSearch = this.searchQuery === '' || tip.text.toLowerCase().includes(this.searchQuery);
        return matchesCategory && matchesSearch;
      });
      this.currentPage = 1;
      this.render();
    }

    render() {
      if (!this.tipsGrid) return;
      const start = (this.currentPage - 1) * this.tipsPerPage;
      const end = start + this.tipsPerPage;
      const pageTips = this.filteredTips.slice(start, end);

      this.tipsGrid.innerHTML = pageTips.map(tip => this.createTipCard(tip)).join('');
      this.renderPagination();
      this.bindTipEvents();
    }

    createTipCard(tip) {
      const isFavorite = this.favorites.includes(tip.id);
      return `
        <article class="card" role="listitem" style="position: relative;">
          <button class="favorite-btn ${isFavorite ? 'active' : ''}"
                  data-tip-id="${tip.id}"
                  aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                  aria-pressed="${isFavorite}"
                  style="position: absolute; top: 1rem; right: 1rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--transition-fast); z-index: 1;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <div style="display: flex; align-items: flex-start; gap: 1rem;">
            <span style="font-size: 2rem; flex-shrink: 0;">${tip.icon}</span>
            <div style="flex: 1;">
              <p style="font-size: 1rem; line-height: 1.7; color: var(--color-text); margin: 0;">${this.escapeHtml(tip.text)}</p>
              <span class="badge badge-${this.getCategoryBadgeClass(tip.category)}" style="margin-top: 0.75rem;">${this.formatCategory(tip.category)}</span>
            </div>
          </div>
        </article>
      `;
    }

    getCategoryBadgeClass(category) {
      const classes = {
        'passwords': 'success',
        'phishing': 'info',
        'device': 'info',
        'privacy': 'success',
        'backup': 'danger',
        'mobile': 'warning',
        'wifi': 'info',
        'social': 'warning'
      };
      return classes[category] || 'neutral';
    }

    formatCategory(category) {
      return category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ');
    }

    bindTipEvents() {
      if (!this.tipsGrid) return;
      this.tipsGrid.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tipId = parseInt(btn.dataset.tipId);
          this.toggleFavorite(tipId, btn);
        });
      });
    }

    toggleFavorite(tipId, btn) {
      const index = this.favorites.indexOf(tipId);
      if (index === -1) {
        this.favorites.push(tipId);
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
        this.showToast('Added to favorites');
      } else {
        this.favorites.splice(index, 1);
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.querySelector('svg').setAttribute('fill', 'none');
        this.showToast('Removed from favorites');
      }
      localStorage.setItem('cybershield-favorite-tips', JSON.stringify(this.favorites));
      this.renderFavorites();
    }

    renderFavorites() {
      if (!this.favoritesGrid || !this.noFavorites) return;
      if (this.favorites.length === 0) {
        this.favoritesGrid.style.display = 'none';
        this.noFavorites.style.display = 'block';
        return;
      }

      this.favoritesGrid.style.display = 'grid';
      this.noFavorites.style.display = 'none';

      const favoriteTips = this.tips.filter(tip => this.favorites.includes(tip.id));
      this.favoritesGrid.innerHTML = favoriteTips.map(tip => `
        <article class="card" role="listitem" style="position: relative;">
          <button class="favorite-btn active"
                  data-tip-id="${tip.id}"
                  aria-label="Remove from favorites"
                  aria-pressed="true"
                  style="position: absolute; top: 0.5rem; right: 0.5rem; background: var(--color-danger-bg); color: var(--color-danger); border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <div style="display: flex; align-items: flex-start; gap: 1rem;">
            <span style="font-size: 1.5rem; flex-shrink: 0;">${tip.icon}</span>
            <div style="flex: 1;">
              <p style="font-size: 0.9375rem; line-height: 1.6; color: var(--color-text); margin: 0;">${this.escapeHtml(tip.text)}</p>
              <span class="badge badge-${this.getCategoryBadgeClass(tip.category)}" style="margin-top: 0.5rem; font-size: 0.6875rem;">${this.formatCategory(tip.category)}</span>
            </div>
          </div>
        </article>
      `).join('');

      // Bind remove events
      this.favoritesGrid.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tipId = parseInt(btn.dataset.tipId);
          this.toggleFavorite(tipId, btn);
        });
      });
    }

    renderPagination() {
      if (!this.pagination) return;
      const totalPages = Math.ceil(this.filteredTips.length / this.tipsPerPage);
      if (totalPages <= 1) {
        this.pagination.innerHTML = '';
        return;
      }

      let html = '';
      if (this.currentPage > 1) {
        html += `<button class="btn btn-secondary btn-sm" data-page="${this.currentPage - 1}" aria-label="Previous page">← Prev</button>`;
      }

      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
          html += `<button class="btn ${i === this.currentPage ? 'btn-primary' : 'btn-secondary'} btn-sm" data-page="${i}" ${i === this.currentPage ? 'aria-current="page"' : ''}>${i}</button>`;
        } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
          html += '<span style="padding: 0 0.5rem; color: var(--color-text-muted);">...</span>';
        }
      }

      if (this.currentPage < totalPages) {
        html += `<button class="btn btn-secondary btn-sm" data-page="${this.currentPage + 1}" aria-label="Next page">Next →</button>`;
      }

      this.pagination.innerHTML = html;

      this.pagination.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.currentPage = parseInt(btn.dataset.page);
          this.render();
          if (this.tipsGrid) window.scrollTo({ top: this.tipsGrid.offsetTop - 100, behavior: 'smooth' });
        });
      });
    }

    showToast(message, type = 'success') {
      const existing = document.querySelector('.toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${type === 'error' ? 'var(--color-danger)' : 'var(--color-primary)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        animation: slideUp 0.3s ease;
      `;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new TipsController();
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TipsController };
  }
})();