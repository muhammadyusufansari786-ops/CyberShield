/**
 * CyberShield - Quiz Engine
 * Handles quiz state, randomization, scoring, and review
 * Data loaded via fetch() from data/quiz-questions.json
 */

(function() {
  'use strict';

  // Glossary deep links per question category (glossary.html?term=<Term>)
  const GLOSSARY_LINKS = {
    phishing: ['Phishing', 'Vishing', 'Smishing', 'Quishing'],
    malware: ['Ransomware', 'Trojan Horse', 'Spyware', 'Botnet'],
    passwords: ['Passphrase', 'Password Manager', 'MFA (Multi-Factor Authentication)', 'Brute Force Attack'],
    privacy: ['PII (Personally Identifiable Information)', 'Data Breach', 'SIM Swapping', 'Identity Theft'],
    mobile: ['SIM Swapping', 'Spyware', 'Public Key Infrastructure (PKI)']
  };

  // ========================================
  // Quiz Controller
  // ========================================
  class QuizController {
    constructor() {
      this.allQuestions = [];
      this.questions = [];
      this.currentIndex = 0;
      this.answers = [];
      this.times = [];
      this.startTime = null;
      this.timerInterval = null;
      this.timerEnabled = false;
      this.timeRemaining = 30;
      this.isReviewMode = false;

      // DOM Elements
      this.setupEl = document.getElementById('quiz-setup');
      this.activeEl = document.getElementById('quiz-active');
      this.resultsEl = document.getElementById('quiz-results');
      this.reviewEl = document.getElementById('quiz-review');

      this.startBtn = document.getElementById('start-quiz-btn');
      this.prevBtn = document.getElementById('prev-btn');
      this.nextBtn = document.getElementById('next-btn');
      this.retakeBtn = document.getElementById('retake-btn');
      this.reviewBtn = document.getElementById('review-btn');
      this.retakeFromReviewBtn = document.getElementById('retake-from-review');

      this.progressBar = document.getElementById('quiz-progress-bar');
      this.progressText = document.getElementById('progress-text');
      this.timerEl = document.getElementById('quiz-timer');
      this.timerValue = document.getElementById('timer-value');
      this.questionText = document.getElementById('question-text');
      this.optionsContainer = document.getElementById('quiz-options');
      this.explanationEl = document.getElementById('quiz-explanation');
      this.explanationText = document.getElementById('explanation-text');

      this.resultsScore = document.getElementById('results-score');
      this.resultsValue = document.getElementById('results-value');
      this.resultsTitle = document.getElementById('results-title');
      this.resultsMessage = document.getElementById('results-message');
      this.correctCount = document.getElementById('correct-count');
      this.incorrectCount = document.getElementById('incorrect-count');
      this.unansweredCount = document.getElementById('unanswered-count');
      this.avgTime = document.getElementById('avg-time');
      this.reviewList = document.getElementById('review-list');

      // Disable start button until data is loaded
      if (this.startBtn) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Loading questions…';
      }

      this.loadData();
    }

    loadData() {
      fetch('../data/quiz-questions.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          this.allQuestions = data;
          if (this.startBtn) {
            this.startBtn.disabled = false;
            this.startBtn.textContent = 'Start Quiz';
          }
          this.bindEvents();
        })
        .catch(err => {
          console.error('Failed to load quiz questions:', err);
          if (this.startBtn) {
            this.startBtn.textContent = '⚠️ Failed to load questions';
          }
        });
    }

    bindEvents() {
      if (this.startBtn) this.startBtn.addEventListener('click', () => this.startQuiz());
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.previousQuestion());
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextQuestion());
      if (this.retakeBtn) this.retakeBtn.addEventListener('click', () => this.resetQuiz());
      if (this.reviewBtn) this.reviewBtn.addEventListener('click', () => this.showReview());
      if (this.retakeFromReviewBtn) this.retakeFromReviewBtn.addEventListener('click', () => this.resetQuiz());
    }

    startQuiz() {
      const count = parseInt(document.getElementById('question-count').value);
      this.timerEnabled = document.getElementById('timer-enabled').checked;
      const category = document.getElementById('category-filter').value;

      // Filter questions
      let pool = category === 'all' ? this.allQuestions : this.allQuestions.filter(q => q.category === category);

      // Shuffle and select
      this.questions = this.shuffleArray([...pool]).slice(0, Math.min(count, pool.length));

      // Reset state
      this.currentIndex = 0;
      this.answers = new Array(this.questions.length).fill(null);
      this.times = new Array(this.questions.length).fill(0);
      this.startTime = Date.now();

      // Show quiz UI
      if (this.setupEl) this.setupEl.style.display = 'none';
      if (this.activeEl) this.activeEl.style.display = 'block';
      if (this.resultsEl) this.resultsEl.style.display = 'none';
      if (this.reviewEl) this.reviewEl.style.display = 'none';

      this.renderQuestion();
      this.updateProgress();

      if (this.timerEnabled && this.timerEl) {
        this.timerEl.style.display = 'flex';
        this.startTimer();
      }
    }

    shuffleArray(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    renderQuestion() {
      const q = this.questions[this.currentIndex];

      // Update question text
      this.questionText.textContent = `Question ${this.currentIndex + 1}: ${q.question}`;

      // Shuffle options
      const optionIndices = q.options.map((_, i) => i);
      const shuffledIndices = this.shuffleArray(optionIndices);

      // Find where correct answer ended up
      const correctNewIndex = shuffledIndices.indexOf(q.correct);

      // Store mapping for this question
      q._shuffledIndices = shuffledIndices;
      q._correctNewIndex = correctNewIndex;

      // Render options
      this.optionsContainer.innerHTML = shuffledIndices.map((origIdx, newIdx) => `
        <button
          type="button"
          class="quiz-option"
          data-index="${newIdx}"
          aria-pressed="false"
          ${this.answers[this.currentIndex] === newIdx ? 'aria-pressed="true"' : ''}
        >
          <span class="option-indicator" aria-hidden="true">${String.fromCharCode(65 + newIdx)}</span>
          <span>${this.escapeHtml(q.options[origIdx])}</span>
        </button>
      `).join('');

      // Bind option clicks
      this.optionsContainer.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', (e) => this.selectOption(parseInt(e.currentTarget.dataset.index)));
      });

      // Update navigation
      if (this.prevBtn) this.prevBtn.disabled = this.currentIndex === 0;
      if (this.nextBtn) {
        this.nextBtn.textContent = this.currentIndex === this.questions.length - 1 ? 'Finish' : 'Next';
        this.nextBtn.disabled = this.answers[this.currentIndex] === null && !this.isReviewMode;
      }

      // Hide explanation
      if (this.explanationEl) this.explanationEl.classList.remove('show');

      // Reset timer
      if (this.timerEnabled) {
        this.timeRemaining = 30;
        if (this.timerValue) this.timerValue.textContent = this.timeRemaining;
        this.startTimer();
      }
    }

    selectOption(index) {
      if (this.isReviewMode) return;

      this.answers[this.currentIndex] = index;
      this.times[this.currentIndex] = this.timerEnabled
        ? (30 - this.timeRemaining)
        : Math.round((Date.now() - (this.questionStartTime || this.startTime)) / 1000);

      // Update UI
      this.optionsContainer.querySelectorAll('.quiz-option').forEach((btn, i) => {
        btn.setAttribute('aria-pressed', i === index);
        btn.classList.toggle('selected', i === index);
      });

      if (this.nextBtn) this.nextBtn.disabled = false;

      // Show explanation immediately
      this.showExplanation();
    }

    showExplanation() {
      const q = this.questions[this.currentIndex];
      const userAnswer = this.answers[this.currentIndex];
      const correctIndex = q._correctNewIndex;
      const isCorrect = userAnswer === correctIndex;

      // Mark options
      this.optionsContainer.querySelectorAll('.quiz-option').forEach((btn, i) => {
        btn.classList.remove('selected');
        if (i === correctIndex) {
          btn.classList.add('correct');
        } else if (i === userAnswer && !isCorrect) {
          btn.classList.add('incorrect');
        }
        btn.disabled = true;
      });

      // Show explanation
      if (this.explanationText) this.explanationText.textContent = q.explanation;

      // Deep link to the matching emergency response guide for this topic
      if (this.explanationEl) {
        const EMERGENCY_MAP = {
          phishing: { slug: 'phishing', label: 'Phishing Response' },
          malware: { slug: 'malware', label: 'Malware/Ransomware Response' },
          passwords: { slug: 'hacked', label: 'Hacked Account Response' },
          privacy: { slug: 'identity', label: 'Identity Theft Response' },
          mobile: { slug: 'device', label: 'Stolen Device Response' }
        };
        const guide = EMERGENCY_MAP[q.category];
        const oldLink = this.explanationEl.querySelector('.emergency-jump');
        if (oldLink) oldLink.remove();
        const oldGlossaryLinks = this.explanationEl.querySelectorAll('.glossary-jump');
        oldGlossaryLinks.forEach(l => l.remove());
        if (guide) {
          const link = document.createElement('a');
          link.className = 'emergency-jump';
          link.href = `emergency.html?incident=${guide.slug}`;
          link.textContent = `🚨 Affected by this? Open the ${guide.label} Guide`;
          this.explanationEl.appendChild(link);
        }
        // Glossary links for deeper learning
        const terms = GLOSSARY_LINKS[q.category] || [];
        terms.forEach(term => {
          const gLink = document.createElement('a');
          gLink.className = 'glossary-jump';
          gLink.href = `glossary.html?term=${encodeURIComponent(term)}`;
          gLink.textContent = `📖 ${term}`;
          this.explanationEl.appendChild(gLink);
        });
      }
      if (this.explanationEl) {
        this.explanationEl.classList.add('show');
        this.explanationEl.classList.toggle('correct', isCorrect);
        this.explanationEl.classList.toggle('incorrect', !isCorrect && userAnswer !== null);
      }

      // Stop timer
      if (this.timerEnabled) {
        this.stopTimer();
      }
    }

    startTimer() {
      this.questionStartTime = Date.now();
      this.stopTimer();
      this.timerInterval = setInterval(() => {
        this.timeRemaining--;
        if (this.timerValue) this.timerValue.textContent = this.timeRemaining;

        if (this.timeRemaining <= 5 && this.timerEl) {
          this.timerEl.style.background = 'var(--color-danger-bg)';
          this.timerEl.style.color = 'var(--color-danger)';
        }

        if (this.timeRemaining <= 0) {
          this.stopTimer();
          this.handleTimeUp();
        }
      }, 1000);
    }

    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    handleTimeUp() {
      if (this.answers[this.currentIndex] === null) {
        this.answers[this.currentIndex] = -1; // Mark as unanswered
        this.times[this.currentIndex] = 30;
        this.showExplanation();
      }
    }

    nextQuestion() {
      if (this.currentIndex < this.questions.length - 1) {
        this.currentIndex++;
        this.renderQuestion();
        this.updateProgress();
      } else {
        this.finishQuiz();
      }
    }

    previousQuestion() {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.isReviewMode = true;
        this.renderQuestion();
        this.updateProgress();
        this.restoreAnswerState();
        this.isReviewMode = false;
      }
    }

    restoreAnswerState() {
      const userAnswer = this.answers[this.currentIndex];
      if (userAnswer !== null && userAnswer !== -1) {
        this.optionsContainer.querySelectorAll('.quiz-option').forEach((btn, i) => {
          btn.setAttribute('aria-pressed', i === userAnswer);
          btn.classList.toggle('selected', i === userAnswer);
        });
        if (this.nextBtn) this.nextBtn.disabled = false;
        this.showExplanation();
      } else {
        if (this.nextBtn) this.nextBtn.disabled = true;
        if (this.explanationEl) this.explanationEl.classList.remove('show');
      }
    }

    updateProgress() {
      const progress = ((this.currentIndex + 1) / this.questions.length) * 100;
      if (this.progressBar) this.progressBar.style.width = `${progress}%`;
      if (this.progressText) this.progressText.textContent = `Question ${this.currentIndex + 1} of ${this.questions.length}`;
    }

    finishQuiz() {
      this.stopTimer();
      this.calculateResults();
      this.showResults();
    }

    calculateResults() {
      let correct = 0, incorrect = 0, unanswered = 0;
      let totalTime = 0;
      let answeredCount = 0;

      this.questions.forEach((q, i) => {
        const userAnswer = this.answers[i];
        const correctIndex = q._correctNewIndex;

        if (userAnswer === -1 || userAnswer === null) {
          unanswered++;
        } else if (userAnswer === correctIndex) {
          correct++;
          totalTime += this.times[i];
          answeredCount++;
        } else {
          incorrect++;
          totalTime += this.times[i];
          answeredCount++;
        }
      });

      const percentage = this.questions.length > 0 ? Math.round((correct / this.questions.length) * 100) : 0;
      const avg = answeredCount > 0 ? Math.round(totalTime / answeredCount) : 0;

      return { correct, incorrect, unanswered, percentage, avgTime: avg };
    }

    showResults() {
      const { correct, incorrect, unanswered, percentage, avgTime } = this.calculateResults();

      // Update score circle
      if (this.resultsScore) this.resultsScore.style.background = `conic-gradient(var(--color-primary) ${percentage}%, var(--color-border) ${percentage}%)`;
      if (this.resultsValue) this.resultsValue.textContent = `${percentage}%`;

      // Update title/message based on score
      if (percentage >= 90) {
        if (this.resultsTitle) this.resultsTitle.textContent = 'Excellent! 🎉';
        if (this.resultsMessage) this.resultsMessage.textContent = 'Outstanding cybersecurity knowledge! You\'re well-prepared to spot threats.';
      } else if (percentage >= 70) {
        if (this.resultsTitle) this.resultsTitle.textContent = 'Great Job! 👏';
        if (this.resultsMessage) this.resultsMessage.textContent = 'Solid understanding of security concepts. Review the areas you missed to strengthen your knowledge.';
      } else if (percentage >= 50) {
        if (this.resultsTitle) this.resultsTitle.textContent = 'Good Effort! 📚';
        if (this.resultsMessage) this.resultsMessage.textContent = 'You have a foundation, but there are gaps. Review the explanations and try again.';
      } else {
        if (this.resultsTitle) this.resultsTitle.textContent = 'Keep Learning! 💪';
        if (this.resultsMessage) this.resultsMessage.textContent = 'Cybersecurity is a journey. Review the topics below and retake the quiz when ready.';
      }

      // Update breakdown
      if (this.correctCount) this.correctCount.textContent = correct;
      if (this.incorrectCount) this.incorrectCount.textContent = incorrect;
      if (this.unansweredCount) this.unansweredCount.textContent = unanswered;
      if (this.avgTime) this.avgTime.textContent = `${avgTime}s`;

      // Save progress
      if (window.CyberShield && window.CyberShield.Utils) {
        const progress = CyberShield.Utils.storage.get('progress', {});
        progress.quiz = {
          started: true,
          completed: percentage >= 70,
          bestScore: Math.max(percentage, (progress.quiz && progress.quiz.bestScore) || 0),
          lastAttempt: new Date().toISOString()
        };
        CyberShield.Utils.storage.set('progress', progress);
      }

      // Show results
      if (this.activeEl) this.activeEl.style.display = 'none';
      if (this.resultsEl) this.resultsEl.style.display = 'block';
    }

    showReview() {
      if (this.resultsEl) this.resultsEl.style.display = 'none';
      if (this.reviewEl) this.reviewEl.style.display = 'block';
      this.isReviewMode = true;

      if (!this.reviewList) return;

      this.reviewList.innerHTML = this.questions.map((q, i) => {
        const userAnswer = this.answers[i];
        const correctIndex = q._correctNewIndex;
        const isCorrect = userAnswer === correctIndex;
        const isUnanswered = userAnswer === -1 || userAnswer === null;

        const userAnswerText = isUnanswered ? 'Not answered' : q.options[q._shuffledIndices[userAnswer]];
        const correctAnswerText = q.options[q._shuffledIndices[correctIndex]];

        return `
          <details class="card" style="padding: 1rem;">
            <summary style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-weight: 600;">
              <span>Q${i + 1}: ${this.escapeHtml(q.question)}</span>
              <span class="badge badge-${isCorrect ? 'success' : isUnanswered ? 'warning' : 'danger'}">
                ${isCorrect ? 'Correct' : isUnanswered ? 'Skipped' : 'Incorrect'}
              </span>
            </summary>
            <div style="margin-top: 1rem; padding: 1rem; background: var(--color-bg); border-radius: var(--radius-md);">
              <p style="margin-bottom: 0.5rem;"><strong>Your answer:</strong> ${this.escapeHtml(userAnswerText)}</p>
              ${!isCorrect && !isUnanswered ? `<p style="margin-bottom: 0.5rem; color: var(--color-success);"><strong>Correct answer:</strong> ${this.escapeHtml(correctAnswerText)}</p>` : ''}
              <p style="margin-bottom: 0.5rem; color: var(--color-text-secondary);"><strong>Explanation:</strong> ${this.escapeHtml(q.explanation)}</p>
              ${(GLOSSARY_LINKS[q.category] || []).slice(0, 2).map(t =>
                `<a class="glossary-jump" href="glossary.html?term=${encodeURIComponent(t)}">📖 ${this.escapeHtml(t)}</a>`
              ).join('')}
            </div>
          </details>
        `;
      }).join('');

      // Open first by default
      const firstDetail = this.reviewList.querySelector('details');
      if (firstDetail) firstDetail.open = true;
    }

    resetQuiz() {
      this.stopTimer();
      this.isReviewMode = false;
      if (this.setupEl) this.setupEl.style.display = 'block';
      if (this.activeEl) this.activeEl.style.display = 'none';
      if (this.resultsEl) this.resultsEl.style.display = 'none';
      if (this.reviewEl) this.reviewEl.style.display = 'none';
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    new QuizController();
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QuizController };
  }
})();