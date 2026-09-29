/**
 * CyberShield - Password Strength Checker & Generator
 * All analysis happens client-side. No data stored or transmitted.
 */

(function() {
  'use strict';

  // Common passwords list (top 1000 most common - subset)
  const COMMON_PASSWORDS = new Set([
    '123456', 'password', '123456789', '12345678', '12345', '111111', '1234567',
    'sunshine', 'qwerty', 'iloveyou', 'princess', 'admin', 'welcome', '666666',
    'abc123', 'football', '123123', 'monkey', '654321', '!@#$%^&*', 'charlie',
    'aa123456', 'donald', 'password1', 'qwerty123', '123qwe', 'letmein', 'shadow',
    'master', 'hello', 'freedom', 'whatever', 'qazwsx', 'trustno1', 'jordan23',
    '1234', '1234567890', '987654321', '123123123', '11111111', '1q2w3e4r',
    'passw0rd', 'admin123', 'welcome123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    'password123', 'admin1234', 'qwerty1', '123456a', 'abc123456', 'superman',
    'batman', 'iloveyou1', 'dragon', 'monkey1', 'letmein1', 'shadow1', 'master1'
  ]);

  // Keyboard patterns for detection
  const KEYBOARD_PATTERNS = [
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    '1234567890', '0987654321',
    'qazwsxedcrfvtgbyhnujmikolp'
  ];

  // Glossary deep links, chosen by password state (glossary.html?term=<Term>)
  const GLOSSARY_LINKS = {
    weak: ['Passphrase', 'Password Manager', 'Credential Stuffing'],
    fair: ['Passphrase', 'MFA (Multi-Factor Authentication)'],
    strong: ['Password Manager', 'MFA (Multi-Factor Authentication)']
  };

  class PasswordAnalyzer {
    constructor() {
      this.input = document.getElementById('password-input');
      this.toggleBtn = document.getElementById('toggle-visibility');
      this.eyeIcon = document.getElementById('eye-icon');
      this.strengthBar = document.getElementById('strength-bar');
      this.entropyLabel = document.getElementById('entropy-label');
      this.feedbackContainer = document.getElementById('strength-feedback');
      this.generateBtn = document.getElementById('generate-btn');
      this.clearBtn = document.getElementById('clear-btn');
      this.copyBtn = document.getElementById('copy-btn');
      this.generatedCard = document.getElementById('generated-password-card');
      this.generatedInput = document.getElementById('generated-password');
      this.strengthLabels = document.querySelectorAll('.strength-label');
      
      this.debouncedAnalyze = CyberShield.Utils.debounce(this.analyze.bind(this), 150);
      this.init();
    }

    init() {
      if (!this.input) return;

      this.input.addEventListener('input', () => this.debouncedAnalyze());
      this.toggleBtn.addEventListener('click', () => this.toggleVisibility());
      this.generateBtn.addEventListener('click', () => this.generatePassword());
      this.clearBtn.addEventListener('click', () => this.clear());
      this.copyBtn.addEventListener('click', () => this.copyPassword());
      
      // Initial analysis if there's a value
      if (this.input.value) this.analyze();
    }

    toggleVisibility() {
      const isPassword = this.input.type === 'password';
      this.input.type = isPassword ? 'text' : 'password';
      this.eyeIcon.innerHTML = isPassword
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      this.toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    }

    analyze() {
      const password = this.input.value;
      
      if (!password) {
        this.resetUI();
        return;
      }

      const result = this.calculateEntropy(password);
      this.updateUI(result);
      this.updateProgressTracking();
    }

    calculateEntropy(password) {
      let poolSize = 0;
      const hasLower = /[a-z]/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSymbol = /[^a-zA-Z0-9]/.test(password);
      
      if (hasLower) poolSize += 26;
      if (hasUpper) poolSize += 26;
      if (hasNumber) poolSize += 10;
      if (hasSymbol) poolSize += 32; // Common symbols

      // Base entropy calculation
      const length = password.length;
      const rawEntropy = length * Math.log2(poolSize || 1);

      // Penalties
      let penalty = 0;
      const feedback = [];

      // Length check
      if (length < 8) {
        penalty += 10;
        feedback.push({ type: 'fail', text: 'Password is too short (minimum 8 characters recommended)' });
      } else if (length >= 12) {
        feedback.push({ type: 'pass', text: 'Good length (12+ characters)' });
      } else {
        feedback.push({ type: 'warn', text: 'Consider using 12+ characters for better security' });
      }

      // Character variety
      const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
      if (varietyCount === 1) {
        penalty += 15;
        feedback.push({ type: 'fail', text: 'Only one character type used' });
      } else if (varietyCount === 2) {
        penalty += 5;
        feedback.push({ type: 'warn', text: 'Only two character types used' });
      } else if (varietyCount >= 3) {
        feedback.push({ type: 'pass', text: 'Good character variety' });
      }

      // Common password check
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        penalty += 30;
        feedback.push({ type: 'fail', text: 'This is a very common password - easily guessed' });
      }

      // Repeated characters
      if (/(.)\1{2,}/.test(password)) {
        penalty += 10;
        feedback.push({ type: 'warn', text: 'Repeated characters detected' });
      }

      // Sequential patterns
      if (this.hasSequentialPattern(password)) {
        penalty += 15;
        feedback.push({ type: 'warn', text: 'Sequential keyboard/character pattern detected' });
      }

      // Common substitutions (leet speak)
      if (this.hasCommonSubstitutions(password)) {
        penalty += 5;
        feedback.push({ type: 'warn', text: 'Common letter substitutions detected (e.g., a→@, e→3)' });
      }

      // Personal info patterns (basic)
      if (this.hasPersonalInfoPattern(password)) {
        penalty += 10;
        feedback.push({ type: 'warn', text: 'Possible personal information pattern detected' });
      }

      // Calculate final entropy
      const finalEntropy = Math.max(0, rawEntropy - penalty);
      
      // Determine strength level
      let strength;
      if (finalEntropy < 28) strength = 'very-weak';
      else if (finalEntropy < 36) strength = 'weak';
      else if (finalEntropy < 60) strength = 'fair';
      else if (finalEntropy < 128) strength = 'strong';
      else strength = 'very-strong';

      return {
        entropy: Math.round(finalEntropy),
        strength,
        feedback,
        poolSize,
        length,
        hasLower,
        hasUpper,
        hasNumber,
        hasSymbol,
        varietyCount,
        isCommon: COMMON_PASSWORDS.has(password.toLowerCase())
      };
    }

    hasSequentialPattern(password) {
      const lower = password.toLowerCase();
      for (const pattern of KEYBOARD_PATTERNS) {
        for (let i = 0; i <= pattern.length - 3; i++) {
          const sub = pattern.slice(i, i + 3);
          if (lower.includes(sub) || lower.includes(sub.split('').reverse().join(''))) {
            return true;
          }
        }
      }
      // Number sequences
      for (let i = 0; i <= 7; i++) {
        const seq = String(i).repeat(3); // 000, 111, etc.
        const seq2 = `${i}${i+1}${i+2}`; // 012, 123, etc.
        const seq3 = `${i+2}${i+1}${i}`; // 210, 321, etc.
        if (lower.includes(seq) || lower.includes(seq2) || lower.includes(seq3)) {
          return true;
        }
      }
      return false;
    }

    hasCommonSubstitutions(password) {
      const substitutions = {
        'a': ['@', '4'],
        'e': ['3'],
        'i': ['1', '!'],
        'o': ['0'],
        's': ['$', '5'],
        't': ['7', '+'],
        'l': ['1', '|']
      };
      
      const lower = password.toLowerCase();
      for (const [char, subs] of Object.entries(substitutions)) {
        for (const sub of subs) {
          const regex = new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          if (regex.test(password) && lower.includes(char)) {
            return true;
          }
        }
      }
      return false;
    }

    hasPersonalInfoPattern(password) {
      // Check for years (19xx, 20xx)
      if (/\b(19|20)\d{2}\b/.test(password)) return true;
      // Check for common date patterns
      if (/\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])[-/](\d{2,4})\b/.test(password)) return true;
      return false;
    }

    updateUI(result) {
      // Update strength bar
      this.strengthBar.className = `strength-bar-fill strength-${result.strength}`;
      
      // Update labels
      this.strengthLabels.forEach(label => {
        label.classList.toggle('active', label.dataset.level === result.strength);
      });

      // Update entropy label
      const strengthText = result.strength.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      this.entropyLabel.textContent = `${result.entropy} bits • ${strengthText}`;
      this.entropyLabel.className = `badge badge-${this.getBadgeClass(result.strength)}`;

      this.updateGlossaryLinks(result.strength);

      // Update feedback
      this.feedbackContainer.innerHTML = result.feedback.map(f => `
        <div class="feedback-item">
          <svg class="feedback-icon ${f.type}" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${f.type === 'pass' ? '<polyline points="20 6 9 17 4 12"></polyline>' : f.type === 'fail' ? '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' : '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'}
          </svg>
          <span>${this.escapeHtml(f.text)}</span>
        </div>
      `).join('');
      this.feedbackContainer.setAttribute('aria-hidden', 'false');
    }

    // Show 2-3 relevant glossary links under the feedback, based on how strong the password is
    updateGlossaryLinks(strength) {
      if (!this.feedbackContainer) return;
      const oldLinks = this.feedbackContainer.parentElement.querySelectorAll('.glossary-jump');
      oldLinks.forEach(l => l.remove());

      let bucket = 'weak';
      if (strength === 'strong' || strength === 'very-strong') bucket = 'strong';
      else if (strength === 'fair') bucket = 'fair';

      const terms = GLOSSARY_LINKS[bucket] || [];
      const container = this.feedbackContainer.parentElement;
      terms.forEach(term => {
        const link = document.createElement('a');
        link.className = 'glossary-jump';
        link.href = `glossary.html?term=${encodeURIComponent(term)}`;
        link.textContent = `📖 ${term}`;
        container.appendChild(link);
      });
    }

    getBadgeClass(strength) {
      const map = {
        'very-weak': 'danger',
        'weak': 'warning',
        'fair': 'info',
        'strong': 'success',
        'very-strong': 'success'
      };
      return map[strength] || 'neutral';
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    resetUI() {
      this.strengthBar.className = 'strength-bar-fill';
      this.strengthLabels.forEach(label => label.classList.remove('active'));
      this.entropyLabel.textContent = 'Enter a password';
      this.entropyLabel.className = 'badge badge-neutral';
      this.feedbackContainer.innerHTML = '';
      this.feedbackContainer.setAttribute('aria-hidden', 'true');
      this.generatedCard.style.display = 'none';
      const oldLinks = this.feedbackContainer.parentElement.querySelectorAll('.glossary-jump');
      oldLinks.forEach(l => l.remove());
    }

    generatePassword() {
      const length = 16;
      const charset = {
        lower: 'abcdefghijklmnopqrstuvwxyz',
        upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        number: '0123456789',
        symbol: '!@#$%^&*_-+='
      };
      
      // Ensure at least one of each type
      let password = '';
      password += charset.lower[Math.floor(Math.random() * charset.lower.length)];
      password += charset.upper[Math.floor(Math.random() * charset.upper.length)];
      password += charset.number[Math.floor(Math.random() * charset.number.length)];
      password += charset.symbol[Math.floor(Math.random() * charset.symbol.length)];
      
      // Fill the rest
      const allChars = charset.lower + charset.upper + charset.number + charset.symbol;
      for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
      }
      
      // Shuffle
      password = password.split('').sort(() => Math.random() - 0.5).join('');
      
      this.generatedInput.value = password;
      this.generatedCard.style.display = 'block';
      this.generatedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Analyze the generated password
      this.input.value = password;
      this.analyze();
    }

    clear() {
      this.input.value = '';
      this.generatedCard.style.display = 'none';
      this.resetUI();
      this.input.focus();
    }

    copyPassword() {
      const password = this.generatedInput.value;
      if (!password) return;
      
      navigator.clipboard.writeText(password).then(() => {
        const originalIcon = this.copyBtn.innerHTML;
        this.copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline>';
        this.copyBtn.style.color = 'var(--color-success)';
        setTimeout(() => {
          this.copyBtn.innerHTML = originalIcon;
          this.copyBtn.style.color = '';
        }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        this.generatedInput.select();
        document.execCommand('copy');
      });
    }

    updateProgressTracking() {
      const progress = CyberShield.Utils.storage.get('progress', {});
      if (!progress.password) {
        progress.password = { started: false, completed: false };
      }
      progress.password.started = true;
      
      // Mark completed if strong password tested
      const result = this.calculateEntropy(this.input.value);
      if (result.strength === 'strong' || result.strength === 'very-strong') {
        progress.password.completed = true;
      }
      
      CyberShield.Utils.storage.set('progress', progress);
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    new PasswordAnalyzer();
  });

  // Export for testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PasswordAnalyzer, COMMON_PASSWORDS };
  }
})();