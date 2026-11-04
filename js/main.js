/**
 * CyberShield - Main Shared Functionality
 * Theme management, mobile navigation, utilities
 */

(function() {
  'use strict';

  // ========================================
  // Theme Management
  // ========================================
  const ThemeManager = {
    init() {
      this.themeToggle = document.getElementById('theme-toggle');
      this.mobileThemeToggle = document.getElementById('mobile-theme-toggle');
      this.html = document.documentElement;
      
      // Load saved theme or detect system preference
      const savedTheme = localStorage.getItem('cybershield-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      if (savedTheme) {
        this.setTheme(savedTheme);
      } else if (prefersDark) {
        this.setTheme('dark');
      }
      
      this.bindEvents();
    },
    
    bindEvents() {
      if (this.themeToggle) {
        this.themeToggle.addEventListener('click', () => this.toggle());
      }
      if (this.mobileThemeToggle) {
        this.mobileThemeToggle.addEventListener('click', () => this.toggle());
      }
      
      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('cybershield-theme')) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    },
    
    toggle() {
      const current = this.html.getAttribute('data-theme');
      this.setTheme(current === 'dark' ? 'light' : 'dark');
    },
    
    setTheme(theme) {
      this.html.setAttribute('data-theme', theme);
      localStorage.setItem('cybershield-theme', theme);
      this.updateIcons(theme);
    },
    
    updateIcons(theme) {
      const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
      const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
      
      const icon = theme === 'dark' ? sunIcon : moonIcon;
      
      if (this.themeToggle) this.themeToggle.innerHTML = icon;
      if (this.mobileThemeToggle) this.mobileThemeToggle.innerHTML = icon;
    }
  };

  // ========================================
  // Navigation Drawer (left side, opened from the header hamburger)
  // ========================================
  const MobileNav = {
    init() {
      this.menuBtn = document.getElementById('nav-toggle');
      this.overlay = document.getElementById('nav-overlay');
      this.panel = document.getElementById('nav-drawer');
      this.closeBtn = document.getElementById('nav-close');
      this.links = document.querySelectorAll('.nav-drawer-link');
      
      if (!this.menuBtn || !this.overlay || !this.closeBtn) return;
      
      this.bindEvents();
      this.highlightActive();
    },
    
    bindEvents() {
      // Toggle: same button opens AND closes the menu
      this.menuBtn.addEventListener('click', () => {
        this.overlay.classList.contains('open') ? this.close() : this.open();
      });
      this.closeBtn.addEventListener('click', () => this.close());
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });

      this.links.forEach(link => {
        link.addEventListener('click', () => this.close());
      });

      // Close on Escape key and return focus to the menu button
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
          this.close();
          this.menuBtn.focus();
        }
      });

      // Keep Tab focus inside the open menu (simple focus trap)
      this.overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusables = this.overlay.querySelectorAll('a[href], button:not([disabled])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    },

    open() {
      this.overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      this.menuBtn.setAttribute('aria-expanded', 'true');
      this.menuBtn.setAttribute('aria-label', 'Close menu');
      // Focus must wait a frame until the overlay's visibility transition
      // makes it focusable
      requestAnimationFrame(() => {
        if (this.overlay.classList.contains('open')) this.closeBtn.focus();
      });
    },

    close() {
      this.overlay.classList.remove('open');
      document.body.style.overflow = '';
      this.menuBtn.setAttribute('aria-expanded', 'false');
      this.menuBtn.setAttribute('aria-label', 'Open menu');
    },
    
    highlightActive() {
      const currentPath = window.location.pathname.split('/').pop() || 'index.html';
      this.links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (currentPath === '' && href === 'index.html')) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      });
    }
  };

  // ========================================
  // Smooth Scroll for Anchor Links
  // ========================================
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
          const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
          window.scrollTo({ top: targetPosition, behavior: 'smooth' });
        }
      });
    });
  }

  // ========================================
  // Intersection Observer for Animations
  // ========================================
  function initScrollAnimations() {
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
    
    document.querySelectorAll('.card, .feature-card, .threat-card, .news-card, .resource-card, .progress-item').forEach(el => {
      observer.observe(el);
    });
  }

  // ========================================
  // Utility Functions
  // ========================================
  const Utils = {
    // Debounce function
    debounce(func, wait) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    },
    
    // Format date
    formatDate(dateString) {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return new Date(dateString).toLocaleDateString('en-US', options);
    },
    
    // Sanitize HTML
    sanitizeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
    
    // Generate unique ID
    generateId(prefix = 'id') {
      return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
    },
    
    // Local storage helpers
    storage: {
      get(key, defaultValue = null) {
        try {
          const item = localStorage.getItem(`cybershield-${key}`);
          return item ? JSON.parse(item) : defaultValue;
        } catch { return defaultValue; }
      },
      set(key, value) {
        try {
          localStorage.setItem(`cybershield-${key}`, JSON.stringify(value));
        } catch (e) { console.warn('Storage failed:', e); }
      }
    }
  };

  // ========================================
  // Auth buttons in the header + navigation drawer
  // ========================================
  // One shared <script> handles ALL pages: asks /api/auth/me ONCE, then
  // fills .header-actions with Sign in/Register (or a Dashboard button once
  // signed in) and appends matching links to the nav drawer. Login/Register
  // pages hide their own button so the header never contains a duplicate.
  const AuthUI = {
    async init() {
      this.drawerList = document.querySelector('#nav-drawer .nav-drawer-list');

      let signedIn = false;
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        signedIn = res.ok; // identity is NOT read client-side - just the flag
      } catch {
        signedIn = false; // server offline: show the standard logged-out UI
      }
      this.render(signedIn);
    },

    render(signedIn) {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      this.renderHeader(signedIn, page);
      this.renderDrawer(signedIn);
    },

    renderHeader(signedIn, page) {
      const actions = document.querySelector('.header-actions');
      if (!actions || actions.querySelector('.nav-auth')) return;

      const wrap = document.createElement('div');
      wrap.className = 'nav-auth';

      const login = document.createElement('a');
      login.href = 'login.html';
      login.className = 'btn btn-ghost btn-sm';
      login.textContent = 'Sign In';

      const register = document.createElement('a');
      register.href = 'register.html';
      register.className = 'btn btn-primary btn-sm';
      register.textContent = 'Register';

      if (signedIn) {
        // A signed-in user gets their dashboard link instead of auth buttons.
        const dash = document.createElement('a');
        dash.href = 'dashboard.html';
        dash.className = 'btn btn-primary btn-sm';
        dash.textContent = page === 'dashboard.html' ? 'Signed in' : 'My Dashboard';
        wrap.appendChild(dash);
      } else {
        // On the login page the Sign In button is redundant (and vice versa).
        if (page !== 'login.html') wrap.appendChild(login);
        if (page !== 'register.html') wrap.appendChild(register);
      }

      // Insert before the theme toggle so the toggle always stays top-right.
      const themeToggle = actions.querySelector('.theme-toggle');
      actions.insertBefore(wrap, themeToggle || null);
    },

    renderDrawer(signedIn) {
      if (!this.drawerList) return;

      const item = document.createElement('li');
      item.className = 'nav-drawer-auth-item';
      item.innerHTML = signedIn
        ? this.drawerLinkHtml('dashboard.html', 'My Dashboard',
            '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>')
        : this.drawerLinkHtml('login.html', 'Sign In / Register',
            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>');
      // The .nav-drawer-footer is a sibling of the list, appended after it,
      // so appending here keeps the auth link last among the page links.
      this.drawerList.appendChild(item);
    },

    drawerLinkHtml(href, label, paths) {
      return '<a href="' + href + '" class="nav-drawer-link nav-drawer-link--auth">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>' +
        label + '</a>';
    },
  };

  // ========================================
  // Initialize on DOM Ready
  // ========================================
  document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    MobileNav.init();
    initSmoothScroll();
    initScrollAnimations();
    AuthUI.init();
    
    // Expose utilities globally
    window.CyberShield = { Utils };
    
    // Add theme toggle to the navigation drawer if not exists
    const navDrawer = document.getElementById('nav-drawer');
    if (navDrawer && !document.getElementById('mobile-theme-toggle')) {
      const themeToggle = document.createElement('button');
      themeToggle.id = 'mobile-theme-toggle';
      themeToggle.className = 'theme-toggle';
      themeToggle.setAttribute('aria-label', 'Toggle dark mode');
      themeToggle.style.marginTop = 'auto';
      themeToggle.style.alignSelf = 'center';
      navDrawer.appendChild(themeToggle);
      ThemeManager.mobileThemeToggle = themeToggle;
      ThemeManager.updateIcons(document.documentElement.getAttribute('data-theme') || 'light');
      themeToggle.addEventListener('click', () => ThemeManager.toggle());
    }
  });

  // ========================================
  // Export for module usage
  // ========================================
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThemeManager, MobileNav, Utils };
  }
})();