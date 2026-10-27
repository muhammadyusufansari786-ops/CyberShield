/**
 * CyberShield - News Feed
 * Handles fetching, filtering, and displaying cybersecurity news
 * Data loaded via fetch() from data/news-data.json
 */

(function() {
  'use strict';

  // ========================================
  // News Controller
  // ========================================
  class NewsController {
    constructor() {
      this.news = [];
      this.filteredNews = [];
      this.currentFilter = 'all';
      this.displayCount = 9;

      this.grid = document.getElementById('news-grid');
      this.filterButtons = document.querySelectorAll('.filter-btn');
      this.refreshBtn = document.getElementById('refresh-news');
      this.loadMoreBtn = document.getElementById('load-more');

      this.loadData();
    }

    loadData() {
      if (this.grid) {
        this.grid.innerHTML = '<p style="text-align:center; color: var(--color-text-muted); padding: 2rem;">Loading news…</p>';
      }

      fetch('../data/news-data.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          this.news = data;
          this.filteredNews = [...this.news];
          this.bindEvents();
          this.render();
        })
        .catch(err => {
          console.error('Failed to load news data:', err);
          if (this.grid) {
            this.grid.innerHTML = '<p style="text-align:center; color: var(--color-danger); padding: 2rem;">⚠️ Failed to load news. Please refresh the page.</p>';
          }
        });
    }

    bindEvents() {
      // Filter buttons
      this.filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => this.setFilter(e.currentTarget.dataset.filter));
      });

      // Refresh button
      if (this.refreshBtn) {
        this.refreshBtn.addEventListener('click', () => this.refresh());
      }

      // Load more button
      if (this.loadMoreBtn) {
        this.loadMoreBtn.addEventListener('click', () => this.loadMore());
      }

      // AI explainer (Gemini) - delegated because cards re-render on filter/load-more
      if (this.grid) {
        this.grid.addEventListener('click', (e) => {
          const explainBtn = e.target.closest('.news-ai-explain-btn');
          if (explainBtn) {
            const wrap = explainBtn.closest('.news-ai');
            const item = this.itemForCard(wrap);
            if (item) this.explainArticle(wrap, item);
            return;
          }
          const askToggle = e.target.closest('.news-ai-ask-btn');
          if (askToggle) {
            const wrap = askToggle.closest('.news-ai');
            const row = wrap && wrap.querySelector('.news-ai-ask-row');
            if (row) {
              const show = row.style.display === 'none';
              row.style.display = show ? 'flex' : 'none';
              if (show) {
                const input = row.querySelector('.news-ai-question');
                if (input) input.focus();
              }
            }
            return;
          }
          const askSubmit = e.target.closest('.news-ai-ask-submit');
          if (askSubmit) {
            const wrap = askSubmit.closest('.news-ai');
            const item = this.itemForCard(wrap);
            const input = wrap && wrap.querySelector('.news-ai-question');
            if (item && input && input.value.trim()) this.askAboutArticle(wrap, item, input.value.trim());
          }
        });

        this.grid.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('news-ai-question')) {
            e.preventDefault();
            const wrap = e.target.closest('.news-ai');
            const item = this.itemForCard(wrap);
            if (item && e.target.value.trim()) this.askAboutArticle(wrap, item, e.target.value.trim());
          }
        });
      }
    }

    setFilter(filter) {
      this.currentFilter = filter;
      this.displayCount = 9;

      // Update active button
      this.filterButtons.forEach(btn => {
        const isActive = btn.dataset.filter === filter;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
      });

      // Filter news
      if (filter === 'all') {
        this.filteredNews = [...this.news];
      } else {
        this.filteredNews = this.news.filter(item => item.category === filter);
      }

      this.render();
    }

    refresh() {
      // Shuffle and re-render
      if (!this.refreshBtn) return;
      this.refreshBtn.disabled = true;
      this.refreshBtn.innerHTML = `
        <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        Refreshing...
      `;

      setTimeout(() => {
        this.news = this.shuffleArray([...this.news]);
        this.setFilter(this.currentFilter);

        this.refreshBtn.disabled = false;
        this.refreshBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          Refresh Feed
        `;

        this.showToast('Feed refreshed with latest articles');
      }, 1000);
    }

    loadMore() {
      this.displayCount += 6;
      this.render();
    }

    shuffleArray(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    render() {
      if (!this.grid) return;
      const newsToShow = this.filteredNews.slice(0, this.displayCount);

      this.grid.innerHTML = newsToShow.map(item => this.createNewsCard(item)).join('');

      // Show/hide load more button
      if (this.loadMoreBtn) {
        this.loadMoreBtn.style.display = this.displayCount < this.filteredNews.length ? 'inline-flex' : 'none';
      }

      // Animate cards
      this.animateCards();
    }

    createNewsCard(item) {
      const formattedDate = this.formatDate(item.date);
      const categoryLabel = this.getCategoryLabel(item.category);
      const categoryClass = this.getCategoryClass(item.category);

      return `
        <article class="card news-card" data-id="${item.id}" style="display: flex; flex-direction: column; height: 100%;">
          <div class="news-meta">
            <span class="news-category ${categoryClass}">${categoryLabel}</span>
            <span class="news-source">${this.escapeHtml(item.source)}</span>
            <time class="news-date" datetime="${item.date}">${formattedDate}</time>
          </div>
          <h3 class="news-title">${this.escapeHtml(item.title)}</h3>
          <p class="news-excerpt line-clamp-3">${this.escapeHtml(item.excerpt)}</p>
          <div class="news-footer" style="display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 1px solid var(--color-border); margin-top: auto;">
            <span style="font-size: 0.8125rem; color: var(--color-text-muted);">${item.tags.slice(0, 3).map(t => `#${t}`).join(' ')}</span>
            <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Read More</a>
          </div>
          <div class="viewmore-region news-more-region" id="news-${item.id}-more">
            <div class="viewmore-inner">
              <div class="news-advice-block">
                <h4 style="font-size: 0.875rem; font-weight: 600; margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  Protection Advice
                </h4>
                <p style="font-size: 0.875rem; color: var(--color-text-secondary);">${this.escapeHtml(item.advice)}</p>
              </div>
              <div class="news-ai" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border);">
            <div class="news-ai-actions">
              <button type="button" class="btn btn-secondary btn-sm news-ai-explain-btn">🤖 Explain with Gemini</button>
              <button type="button" class="btn btn-ghost btn-sm news-ai-ask-btn">💬 Ask AI About This News</button>
            </div>
            <div class="news-ai-ask-row" style="display: none;">
              <input type="text" class="form-input news-ai-question" maxlength="1000" placeholder="Ask about this article, e.g. 'How does this affect students?'" aria-label="Your question about this article">
              <button type="button" class="btn btn-primary btn-sm news-ai-ask-submit">Ask</button>
            </div>
            <div class="news-ai-result ai-result" style="display: none;" aria-live="polite"></div>
              </div>
            </div>
          </div>
          <button type="button" class="viewmore-btn" aria-expanded="false" aria-controls="news-${item.id}-more">
            <span class="viewmore-label">View More</span>
            <span class="viewmore-arrow" aria-hidden="true">→</span>
          </button>
        </article>
      `;
    }

    getCategoryLabel(category) {
      const labels = {
        'all': 'All',
        'breach': 'Data Breach',
        'vulnerability': 'Vulnerability',
        'ransomware': 'Ransomware',
        'phishing': 'Phishing',
        'malware': 'Malware',
        'scam': 'Scams',
        'india': 'India Specific'
      };
      return labels[category] || category;
    }

    getCategoryClass(category) {
      const classes = {
        'breach': 'badge-danger',
        'vulnerability': 'badge-warning',
        'ransomware': 'badge-danger',
        'phishing': 'badge-info',
        'malware': 'badge-warning',
        'scam': 'badge-info',
        'india': 'badge-success'
      };
      return classes[category] || 'badge-neutral';
    }

    /* ------------------------------------------------------------------ */
    /* AI news explainer (Gemini)                                          */
    /* ------------------------------------------------------------------ */

    itemForCard(wrap) {
      if (!wrap) return null;
      const article = wrap.closest('.news-card');
      if (!article) return null;
      const id = article.getAttribute('data-id');
      return this.news.find(n => String(n.id) === String(id)) || null;
    }

    /** Only the article info already shown in the app is sent - nothing else. */
    articlePayload(item) {
      return {
        title: item.title,
        excerpt: item.excerpt,
        category: this.getCategoryLabel(item.category),
        source: item.source,
        date: item.date,
        advice: item.advice,
        tags: Array.isArray(item.tags) ? item.tags : []
      };
    }

    async explainArticle(wrap, item) {
      const AI = window.CyberAI;
      if (!AI || !wrap) return;
      const resultEl = wrap.querySelector('.news-ai-result');
      const btn = wrap.querySelector('.news-ai-explain-btn');
      if (!resultEl) return;

      resultEl.style.display = 'block';
      resultEl.innerHTML = AI.loadingHtml('Preparing AI explanation');
      AI.setBtnLoading(btn, true, 'Explaining…');

      try {
        const data = await AI.request('/api/ai/news-explain', { article: this.articlePayload(item) });
        this.renderExplanation(resultEl, data);
      } catch (err) {
        resultEl.innerHTML = '';
        AI.showError(resultEl, err.message);
      } finally {
        AI.setBtnLoading(btn, false);
      }
    }

    async askAboutArticle(wrap, item, question) {
      const AI = window.CyberAI;
      if (!AI || !wrap) return;
      const resultEl = wrap.querySelector('.news-ai-result');
      const submit = wrap.querySelector('.news-ai-ask-submit');
      if (!resultEl) return;

      resultEl.style.display = 'block';
      resultEl.innerHTML = AI.loadingHtml('Analyzing with Gemini');
      AI.setBtnLoading(submit, true, 'Asking…');

      try {
        const data = await AI.request('/api/ai/news-explain', {
          article: this.articlePayload(item),
          question
        });
        resultEl.innerHTML = `
          <div class="ai-result-header">
            <span class="ai-chip ai-chip-gemini">🤖 Gemini AI answer</span>
          </div>
          <div class="ai-markdown">${AI.renderMarkdown(data.answer || '')}</div>
          <p class="ai-disclaimer">Answered only from the article information in this app; anything beyond it is clearly labeled general cybersecurity advice.</p>
        `;
      } catch (err) {
        resultEl.innerHTML = '';
        AI.showError(resultEl, err.message);
      } finally {
        AI.setBtnLoading(submit, false);
      }
    }

    renderExplanation(resultEl, data) {
      const AI = window.CyberAI;
      const lessons = Array.isArray(data.key_lessons) ? data.key_lessons : [];
      const actions = Array.isArray(data.defensive_actions) ? data.defensive_actions : [];

      resultEl.innerHTML = `
        <div class="ai-result-header">
          <span class="ai-chip ai-chip-gemini">🤖 Gemini AI explanation</span>
          <span class="ai-chip">🎯 ${AI.escapeHtml(data.threat_category || 'Cyber threat')}</span>
        </div>
        <div class="ai-result-block">
          <h4 class="ai-result-heading">📝 Simple summary</h4>
          <p class="ai-verdict">${AI.escapeHtml(data.simple_summary || '')}</p>
        </div>
        ${data.who_affected ? `<div class="ai-result-block"><h4 class="ai-result-heading">👥 Who may be affected</h4><p class="ai-verdict">${AI.escapeHtml(data.who_affected)}</p></div>` : ''}
        ${data.why_it_matters ? `<div class="ai-result-block"><h4 class="ai-result-heading">💡 Why this matters</h4><p class="ai-verdict">${AI.escapeHtml(data.why_it_matters)}</p></div>` : ''}
        ${lessons.length ? `<div class="ai-result-block"><h4 class="ai-result-heading">🔑 Key lessons</h4><ul class="ai-list">${lessons.map(l => `<li>${AI.escapeHtml(l)}</li>`).join('')}</ul></div>` : ''}
        ${actions.length ? `<div class="ai-result-block"><h4 class="ai-result-heading">🛡️ Recommended defensive actions</h4><ol class="ai-list">${actions.map(a => `<li>${AI.escapeHtml(a)}</li>`).join('')}</ol></div>` : ''}
        <p class="ai-disclaimer">Summary, category and lessons come from the article information in this app. Defensive actions are general cybersecurity advice, not claims from the article. AI explanations can be imperfect.</p>
      `;
    }

    /* ------------------------------------------------------------------ */
    /* AI news explainer (Gemini)                                          */
    /* ------------------------------------------------------------------ */

    itemForCard(wrap) {
      if (!wrap) return null;
      const article = wrap.closest('.news-card');
      if (!article) return null;
      const id = article.getAttribute('data-id');
      return this.news.find(n => String(n.id) === String(id)) || null;
    }

    /** Only the article info already shown in the app is sent - nothing else. */
    articlePayload(item) {
      return {
        title: item.title,
        excerpt: item.excerpt,
        category: this.getCategoryLabel(item.category),
        source: item.source,
        date: item.date,
        advice: item.advice,
        tags: Array.isArray(item.tags) ? item.tags : []
      };
    }

    async explainArticle(wrap, item) {
      const AI = window.CyberAI;
      if (!AI || !wrap) return;
      const resultEl = wrap.querySelector('.news-ai-result');
      const btn = wrap.querySelector('.news-ai-explain-btn');
      if (!resultEl) return;

      resultEl.style.display = 'block';
      resultEl.innerHTML = AI.loadingHtml('Preparing AI explanation');
      AI.setBtnLoading(btn, true, 'Explaining…');

      try {
        const data = await AI.request('/api/ai/news-explain', { article: this.articlePayload(item) });
        this.renderExplanation(resultEl, data);
      } catch (err) {
        resultEl.innerHTML = '';
        AI.showError(resultEl, err.message);
      } finally {
        AI.setBtnLoading(btn, false);
      }
    }

    async askAboutArticle(wrap, item, question) {
      const AI = window.CyberAI;
      if (!AI || !wrap) return;
      const resultEl = wrap.querySelector('.news-ai-result');
      const submit = wrap.querySelector('.news-ai-ask-submit');
      if (!resultEl) return;

      resultEl.style.display = 'block';
      resultEl.innerHTML = AI.loadingHtml('Analyzing with Gemini');
      AI.setBtnLoading(submit, true, 'Asking…');

      try {
        const data = await AI.request('/api/ai/news-explain', {
          article: this.articlePayload(item),
          question
        });
        resultEl.innerHTML = `
          <div class="ai-result-header">
            <span class="ai-chip ai-chip-gemini">🤖 Gemini AI answer</span>
          </div>
          <div class="ai-markdown">${AI.renderMarkdown(data.answer || '')}</div>
          <p class="ai-disclaimer">Answered only from the article information in this app; anything beyond it is clearly labeled general cybersecurity advice.</p>
        `;
      } catch (err) {
        resultEl.innerHTML = '';
        AI.showError(resultEl, err.message);
      } finally {
        AI.setBtnLoading(submit, false);
      }
    }

    renderExplanation(resultEl, data) {
      const AI = window.CyberAI;
      const lessons = Array.isArray(data.key_lessons) ? data.key_lessons : [];
      const actions = Array.isArray(data.defensive_actions) ? data.defensive_actions : [];

      resultEl.innerHTML = `
        <div class="ai-result-header">
          <span class="ai-chip ai-chip-gemini">🤖 Gemini AI explanation</span>
          <span class="ai-chip">🎯 ${AI.escapeHtml(data.threat_category || 'Cyber threat')}</span>
        </div>
        <div class="ai-result-block">
          <h4 class="ai-result-heading">📝 Simple summary</h4>
          <p class="ai-verdict">${AI.escapeHtml(data.simple_summary || '')}</p>
        </div>
        ${data.who_affected ? `<div class="ai-result-block"><h4 class="ai-result-heading">👥 Who may be affected</h4><p class="ai-verdict">${AI.escapeHtml(data.who_affected)}</p></div>` : ''}
        ${data.why_it_matters ? `<div class="ai-result-block"><h4 class="ai-result-heading">💡 Why this matters</h4><p class="ai-verdict">${AI.escapeHtml(data.why_it_matters)}</p></div>` : ''}
        ${lessons.length ? `<div class="ai-result-block"><h4 class="ai-result-heading">🔑 Key lessons</h4><ul class="ai-list">${lessons.map(l => `<li>${AI.escapeHtml(l)}</li>`).join('')}</ul></div>` : ''}
        ${actions.length ? `<div class="ai-result-block"><h4 class="ai-result-heading">🛡️ Recommended defensive actions</h4><ol class="ai-list">${actions.map(a => `<li>${AI.escapeHtml(a)}</li>`).join('')}</ol></div>` : ''}
        <p class="ai-disclaimer">Summary, category and lessons come from the article information in this app. Defensive actions are general cybersecurity advice, not claims from the article. AI explanations can be imperfect.</p>
      `;
    }

    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    animateCards() {
      if (!this.grid) return;
      const cards = this.grid.querySelectorAll('.news-card');
      cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, i * 50);
      });
    }

    showToast(message) {
      const existing = document.querySelector('.toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: var(--color-primary);
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
      }, 3000);
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Add toast animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  `;
  document.head.appendChild(style);

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    new NewsController();
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NewsController };
  }
})();