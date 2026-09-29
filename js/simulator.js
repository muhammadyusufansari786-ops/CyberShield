/**
 * CyberShield - Scam Simulator
 * Interactive scam identification with real-world scenarios
 * Data loaded via fetch() from data/simulator-data.json
 */

(function() {
  'use strict';

  // Emergency guide tab per scenario type (deep link: emergency.html?incident=<slug>)
  const EMERGENCY_MAP = { email: 'phishing', sms: 'phishing', url: 'phishing' };

  // ========================================
  // Simulator Controller
  // ========================================
  class SimulatorController {
    constructor() {
      this.allScenarios = [];
      this.scenarios = [];
      this.currentIndex = 0;
      this.correctCount = 0;
      this.totalAttempted = 0;
      this.streak = 0;
      this.bestStreak = parseInt(localStorage.getItem('sim-best-streak') || '0');

      // DOM Elements
      this.startBtn = document.getElementById('start-simulator');
      this.scenarioCard = document.getElementById('scenario-card');
      this.scenarioTypeBadge = document.getElementById('scenario-type-badge');
      this.scenarioNumber = document.getElementById('scenario-number');
      this.scenarioContent = document.getElementById('scenario-content');
      this.questionText = document.getElementById('sim-question');
      this.optionsContainer = document.getElementById('sim-options');
      this.submitBtn = document.getElementById('submit-answer');
      this.nextBtn = document.getElementById('next-scenario');
      this.feedbackEl = document.getElementById('sim-feedback');
      this.feedbackHeader = document.getElementById('feedback-header');
      this.feedbackText = document.getElementById('feedback-text');
      this.scoreEl = document.getElementById('sim-score');
      this.totalEl = document.getElementById('sim-total');
      this.streakEl = document.getElementById('sim-streak');
      this.accuracyEl = document.getElementById('sim-accuracy');
      this.scenarioCountDisplay = document.getElementById('scenario-count-display');

      // Disable start button until data is loaded
      if (this.startBtn) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Loading scenarios…';
      }

      this.bindEvents();
      this.updateStatsDisplay();
      this.loadData();
    }

    loadData() {
      fetch('../data/simulator-data.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          this.allScenarios = data;
          this.scenarios = [...this.allScenarios];
          if (this.startBtn) {
            this.startBtn.disabled = false;
            this.startBtn.textContent = 'Start Simulator';
          }
        })
        .catch(err => {
          console.error('Failed to load simulator data:', err);
          if (this.startBtn) {
            this.startBtn.textContent = '⚠️ Failed to load scenarios';
          }
        });
    }

    bindEvents() {
      if (this.startBtn) this.startBtn.addEventListener('click', () => this.startSimulator());
      if (this.submitBtn) this.submitBtn.addEventListener('click', () => this.submitAnswer());
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextScenario());
    }

    startSimulator() {
      if (!this.allScenarios.length) return;
      this.scenarios = [...this.allScenarios].sort(() => Math.random() - 0.5);
      this.currentIndex = 0;
      this.correctCount = 0;
      this.totalAttempted = 0;
      this.streak = 0;
      localStorage.setItem('sim-best-streak', this.bestStreak);
      this.showStartScreen(false);
      this.loadScenario();
    }

    showStartScreen(show) {
      const startScreen = document.getElementById('start-screen');
      if (startScreen) {
        startScreen.style.display = show ? 'block' : 'none';
      }
      if (this.scenarioCard) this.scenarioCard.style.display = !show ? 'block' : 'none';
    }

    loadScenario() {
      const scenario = this.scenarios[this.currentIndex];

      // Update scenario number
      if (this.scenarioNumber) this.scenarioNumber.textContent = `Scenario ${this.currentIndex + 1} of ${this.scenarios.length}`;
      if (this.scenarioCountDisplay) this.scenarioCountDisplay.textContent = this.currentIndex + 1;

      // Update type badge
      const typeBadges = { email: 'Email', sms: 'SMS', url: 'URL' };
      if (this.scenarioTypeBadge) {
        this.scenarioTypeBadge.textContent = typeBadges[scenario.type] || 'Scenario';
        this.scenarioTypeBadge.className = `scenario-type ${scenario.type}`;
      }

      // Update scenario content
      if (this.scenarioContent) {
        this.scenarioContent.innerHTML = `
          <p><strong>${scenario.type === 'email' ? 'Email:' : scenario.type === 'sms' ? 'SMS:' : 'URL:'}</strong> ${this.escapeHtml(scenario.scenario)}</p>
        `;
      }

      // Shuffle options
      const options = [...scenario.options].sort(() => Math.random() - 0.5);
      const correctNewIndex = options.indexOf(scenario.options[scenario.correct]);

      // Store mapping
      scenario._correctNewIndex = correctNewIndex;
      scenario._options = options;

      // Render options
      if (this.optionsContainer) {
        this.optionsContainer.innerHTML = options.map((opt, i) => `
          <label class="simulator-option" style="display: block; padding: 1rem; background: var(--color-bg); border: 2px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); margin-bottom: 0.75rem;">
            <input type="radio" name="sim-answer" value="${i}" style="margin-right: 0.75rem; transform: scale(1.2);" aria-label="${opt}">
            <span>${String.fromCharCode(65 + i)} ${this.escapeHtml(opt)}</span>
          </label>
        `).join('');

        // Bind option clicks
        this.optionsContainer.querySelectorAll('input').forEach(input => {
          input.addEventListener('change', () => {
            if (this.submitBtn) this.submitBtn.disabled = false;
          });
        });
      }

      if (this.questionText) this.questionText.textContent = scenario.question;
      if (this.submitBtn) this.submitBtn.disabled = true;
      if (this.nextBtn) this.nextBtn.style.display = 'none';
      if (this.feedbackEl) this.feedbackEl.classList.remove('show', 'correct', 'incorrect');
    }

    submitAnswer() {
      const selected = parseInt(document.querySelector('input[name="sim-answer"]:checked')?.value ?? '-1');
      const scenario = this.scenarios[this.currentIndex];
      const isCorrect = selected === scenario._correctNewIndex;

      // Update stats
      this.totalAttempted++;
      if (isCorrect) {
        this.correctCount++;
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        localStorage.setItem('sim-best-streak', this.bestStreak);
      } else {
        this.streak = 0;
      }

      this.updateStatsDisplay();
      this.showFeedback(isCorrect, scenario);
      if (this.submitBtn) this.submitBtn.disabled = true;
      if (this.nextBtn) this.nextBtn.style.display = 'inline-block';
    }

    showFeedback(isCorrect, scenario) {
      if (this.feedbackEl) {
        this.feedbackEl.classList.add('show');
        this.feedbackEl.classList.add(isCorrect ? 'correct' : 'incorrect');
      }

      if (this.feedbackHeader) {
        this.feedbackHeader.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
            ${isCorrect
              ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
              : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
            }
          </svg>
          <span style="font-weight: 600;">${isCorrect ? 'Correct!' : 'Not quite.'}</span>
        `;
      }

      if (this.feedbackText) {
        this.feedbackText.textContent = isCorrect ? scenario.explanation : `Not quite. ${scenario.explanation}`;
      }

      // Deep link to the matching emergency response guide
      if (this.feedbackEl) {
        const oldLink = this.feedbackEl.querySelector('.emergency-jump');
        if (oldLink) oldLink.remove();
        const slug = EMERGENCY_MAP[scenario.type] || 'phishing';
        const link = document.createElement('a');
        link.className = 'emergency-jump';
        link.href = `emergency.html?incident=${slug}`;
        link.textContent = '🚨 Received a message like this? Open the Emergency Response Guide';
        this.feedbackEl.appendChild(link);
      }

      // Highlight correct/incorrect options
      if (this.optionsContainer) {
        this.optionsContainer.querySelectorAll('input').forEach((input, i) => {
          input.disabled = true;
          const label = input.closest('label');
          if (i === scenario._correctNewIndex) {
            label.style.borderColor = 'var(--color-success)';
            label.style.background = 'var(--color-success-bg, #dcfce7)';
          } else if (input.checked && !isCorrect) {
            label.style.borderColor = 'var(--color-danger)';
            label.style.background = 'var(--color-danger-bg, #fee2e2)';
          }
        });
      }

      if (this.nextBtn) this.nextBtn.style.display = 'inline-block';
    }

    nextScenario() {
      this.currentIndex++;
      if (this.currentIndex < this.scenarios.length) {
        this.loadScenario();
      } else {
        this.showResults();
      }
    }

    showResults() {
      if (!this.scenarioCard) return;
      this.scenarioCard.innerHTML = `
        <div class="card" style="max-width: 500px; text-align: center; padding: 3rem 2rem; margin: 0 auto;">
          <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--color-primary-bg) 0%, var(--color-info-bg) 100%); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          </div>
          <h2 style="margin-bottom: 1rem;">Simulator Complete!</h2>
          <p style="font-size: 1.5rem; color: var(--color-primary);">Score: ${this.correctCount}/${this.totalAttempted}</p>
          <p style="margin: 1rem 0;">Accuracy: ${this.totalAttempted > 0 ? Math.round((this.correctCount / this.totalAttempted) * 100) : 0}%</p>
          <p style="margin: 1rem 0;">Best Streak: ${this.bestStreak}</p>
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary" id="restart-simulator">Retry</button>
            <a href="index.html" class="btn btn-secondary">Back to Home</a>
          </div>
        </div>
      `;

      this.scenarioCard.style.display = 'block';

      document.getElementById('restart-simulator')?.addEventListener('click', () => this.startSimulator());
    }

    updateStatsDisplay() {
      if (this.scoreEl) this.scoreEl.textContent = this.correctCount;
      if (this.totalEl) this.totalEl.textContent = this.totalAttempted;
      if (this.streakEl) this.streakEl.textContent = this.streak;
      const accuracy = this.totalAttempted > 0 ? Math.round((this.correctCount / this.totalAttempted) * 100) : 0;
      if (this.accuracyEl) this.accuracyEl.textContent = `${accuracy}%`;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    new SimulatorController();
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimulatorController };
  }
})();