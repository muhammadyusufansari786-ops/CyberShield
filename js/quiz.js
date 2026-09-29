/**
 * CyberShield - Quiz Engine
 * Handles quiz state, randomization, scoring, and review
 * Data loaded via fetch() from data/quiz-questions.json
 *
 * Expected question format:
 *   { question: string, options: string[], correct: number,
 *     explanation: string, category: string }
 */

(function () {
  'use strict';

  // ========================================
  // Configuration
  // ========================================
  const DATA_URL = '../data/quiz-questions.json';
  const SECONDS_PER_QUESTION = 30;
  const WARNING_SECONDS = 5;
  const PASS_THRESHOLD = 70; // percent
  const UNANSWERED = -1;     // marker for a question that timed out

  // Glossary deep links per question category (glossary.html?term=<Term>)
  const GLOSSARY_LINKS = {
    phishing: ['Phishing', 'Vishing', 'Smishing', 'Quishing'],
    malware: ['Ransomware', 'Trojan Horse', 'Spyware', 'Botnet'],
    passwords: ['Passphrase', 'Password Manager', 'MFA (Multi-Factor Authentication)', 'Brute Force Attack'],
    privacy: ['PII (Personally Identifiable Information)', 'Data Breach', 'SIM Swapping', 'Identity Theft'],
    mobile: ['SIM Swapping', 'Spyware', 'Public Key Infrastructure (PKI)']
  };

  // Emergency response guide per question category (emergency.html?incident=<slug>)
  const EMERGENCY_GUIDES = {
    phishing: { slug: 'phishing', label: 'Phishing Response' },
    malware: { slug: 'malware', label: 'Malware/Ransomware Response' },
    passwords: { slug: 'hacked', label: 'Hacked Account Response' },
    privacy: { slug: 'identity', label: 'Identity Theft Response' },
    mobile: { slug: 'device', label: 'Stolen Device Response' }
  };

  // ========================================
  // Quiz Controller
  // ========================================
  class QuizController {
    constructor() {
      this.allQuestions = [];
      this.questions = [];      // prepared questions for the current run
      this.currentIndex = 0;
      this.answers = [];        // null = not answered, -1 = timed out, n = chosen option
      this.times = [];          // seconds spent per question
      this.questionStartTime = null;
      this.timerInterval = null;
      this.timerEnabled = false;
      this.timeRemaining = SECONDS_PER_QUESTION;

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

      // Announce explanations to screen readers
      if (this.explanationEl) this.explanationEl.setAttribute('aria-live', 'polite');

      // Disable start button until data is loaded
      if (this.startBtn) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Loading questions…';
      }

      this.loadData();
    }

    // ----------------------------------------
    // Data loading & events
    // ----------------------------------------
    loadData() {
      fetch(DATA_URL)
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Quiz data is empty or not an array');
          }
          this.allQuestions = data.filter(q => this.isValidQuestion(q));
          if (this.allQuestions.length === 0) {
            throw new Error('No valid questions found in quiz data');
          }
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

    isValidQuestion(q) {
      return q
        && typeof q.question === 'string'
        && Array.isArray(q.options)
        && q.options.length >= 2
        && Number.isInteger(q.correct)
        && q.correct >= 0
        && q.correct < q.options.length;
    }

    bindEvents() {
      if (this.startBtn) this.startBtn.addEventListener('click', () => this.startQuiz());
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.previousQuestion());
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextQuestion());
      if (this.retakeBtn) this.retakeBtn.addEventListener('click', () => this.resetQuiz());
      if (this.reviewBtn) this.reviewBtn.addEventListener('click', () => this.showReview());
      if (this.retakeFromReviewBtn) this.retakeFromReviewBtn.addEventListener('click', () => this.resetQuiz());
      document.addEventListener('keydown', (e) => this.handleKeydown(e));
    }

    /**
     * Keyboard shortcuts while a quiz is active:
     *   A-D / 1-4 = choose option, Right arrow / Enter = next, Left arrow = previous
     */
    handleKeydown(e) {
      if (!this.activeEl || this.activeEl.style.display === 'none') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, select, textarea')) return;

      const key = e.key.toLowerCase();
      const optionCount = this.optionsContainer
        ? this.optionsContainer.querySelectorAll('.quiz-option').length
        : 0;

      // Letter (a-d) or number (1-4) selects an option
      let optionIndex = -1;
      if (/^[a-z]$/.test(key)) optionIndex = key.charCodeAt(0) - 97;
      else if (/^[1-9]$/.test(key)) optionIndex = parseInt(key, 10) - 1;

      if (optionIndex >= 0 && optionIndex < optionCount) {
        e.preventDefault();
        this.selectOption(optionIndex);
      } else if (key === 'arrowright' || (key === 'enter' && !(e.target.tagName === 'BUTTON'))) {
        if (this.nextBtn && !this.nextBtn.disabled) {
          e.preventDefault();
          this.nextQuestion();
        }
      } else if (key === 'arrowleft') {
        if (this.prevBtn && !this.prevBtn.disabled) {
          e.preventDefault();
          this.previousQuestion();
        }
      }
    }

    // ----------------------------------------
    // Starting a quiz
    // ----------------------------------------
    startQuiz() {
      const countEl = document.getElementById('question-count');
      const timerEl = document.getElementById('timer-enabled');
      const categoryEl = document.getElementById('category-filter');

      const requested = parseInt(countEl ? countEl.value : '10', 10);
      const count = Number.isNaN(requested) || requested < 1 ? 10 : requested;
      this.timerEnabled = timerEl ? timerEl.checked : false;
      const category = categoryEl ? categoryEl.value : 'all';

      // Filter questions
      const pool = category === 'all'
        ? this.allQuestions
        : this.allQuestions.filter(q => q.category === category);

      if (pool.length === 0) {
        window.alert('No questions are available for this category yet. Please choose another one.');
        return;
      }

      // Shuffle and select, then shuffle options ONCE per question so the
      // order stays stable when the user navigates back and forth.
      this.questions = this.shuffleArray(pool)
        .slice(0, Math.min(count, pool.length))
        .map(q => this.prepareQuestion(q));

      // Reset state
      this.currentIndex = 0;
      this.answers = new Array(this.questions.length).fill(null);
      this.times = new Array(this.questions.length).fill(0);

      // Show quiz UI
      this.showSection('active');
      if (this.timerEl) this.timerEl.style.display = this.timerEnabled ? 'flex' : 'none';

      this.renderQuestion();
    }

    /** Builds a per-run copy of a question with shuffled options. */
    prepareQuestion(q) {
      const order = this.shuffleArray(q.options.map((_, i) => i));
      return {
        question: q.question,
        category: q.category,
        explanation: q.explanation || '',
        options: order.map(origIdx => q.options[origIdx]),
        correctIndex: order.indexOf(q.correct)
      };
    }

    shuffleArray(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    showSection(name) {
      const map = {
        setup: this.setupEl,
        active: this.activeEl,
        results: this.resultsEl,
        review: this.reviewEl
      };
      Object.entries(map).forEach(([key, el]) => {
        if (el) el.style.display = key === name ? 'block' : 'none';
      });
    }

    // ----------------------------------------
    // Rendering a question
    // ----------------------------------------
    renderQuestion() {
      const q = this.questions[this.currentIndex];
      const answer = this.answers[this.currentIndex];
      const isAnswered = answer !== null;

      this.questionText.textContent = `Question ${this.currentIndex + 1}: ${q.question}`;

      this.optionsContainer.innerHTML = q.options.map((text, i) => `
        <button type="button" class="quiz-option" data-index="${i}" aria-pressed="false">
          <span class="option-indicator" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
          <span>${this.escapeHtml(text)}</span>
        </button>
      `).join('');

      this.optionsContainer.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.selectOption(parseInt(e.currentTarget.dataset.index, 10));
        });
      });

      // Navigation
      if (this.prevBtn) this.prevBtn.disabled = this.currentIndex === 0;
      if (this.nextBtn) {
        this.nextBtn.textContent = this.currentIndex === this.questions.length - 1 ? 'Finish' : 'Next';
        this.nextBtn.disabled = !isAnswered;
      }

      this.updateProgress();

      if (isAnswered) {
        // Revisiting a finished question: show its result, no timer
        this.stopTimer();
        this.showExplanation();
      } else {
        if (this.explanationEl) {
          this.explanationEl.classList.remove('show', 'correct', 'incorrect');
        }
        this.questionStartTime = Date.now();
        if (this.timerEnabled) this.startTimer();
      }
    }

    selectOption(index) {
      // Answers are locked once given
      if (this.answers[this.currentIndex] !== null) return;
      if (index < 0 || index >= this.questions[this.currentIndex].options.length) return;

      this.answers[this.currentIndex] = index;
      this.times[this.currentIndex] = this.elapsedSeconds();

      this.stopTimer();
      if (this.nextBtn) this.nextBtn.disabled = false;
      this.showExplanation();
    }

    elapsedSeconds() {
      const elapsed = Math.round((Date.now() - (this.questionStartTime || Date.now())) / 1000);
      return this.timerEnabled ? Math.min(elapsed, SECONDS_PER_QUESTION) : elapsed;
    }

    showExplanation() {
      const q = this.questions[this.currentIndex];
      const userAnswer = this.answers[this.currentIndex];
      const isCorrect = userAnswer === q.correctIndex;

      // Mark options and lock them
      this.optionsContainer.querySelectorAll('.quiz-option').forEach((btn, i) => {
        btn.classList.remove('selected', 'correct', 'incorrect');
        btn.setAttribute('aria-pressed', i === userAnswer);
        if (i === q.correctIndex) {
          btn.classList.add('correct');
        } else if (i === userAnswer) {
          btn.classList.add('incorrect');
        }
        btn.disabled = true;
      });

      if (this.explanationText) this.explanationText.textContent = q.explanation;
      if (!this.explanationEl) return;

      // Clear previously added links
      this.explanationEl.querySelectorAll('.emergency-jump, .glossary-jump').forEach(el => el.remove());

      // Deep link to the matching emergency response guide for this topic
      const guide = EMERGENCY_GUIDES[q.category];
      if (guide) {
        const link = document.createElement('a');
        link.className = 'emergency-jump';
        link.href = `emergency.html?incident=${encodeURIComponent(guide.slug)}`;
        link.textContent = `🚨 Affected by this? Open the ${guide.label} Guide`;
        this.explanationEl.appendChild(link);
      }

      // Glossary links for deeper learning
      (GLOSSARY_LINKS[q.category] || []).forEach(term => {
        const gLink = document.createElement('a');
        gLink.className = 'glossary-jump';
        gLink.href = `glossary.html?term=${encodeURIComponent(term)}`;
        gLink.textContent = `📖 ${term}`;
        this.explanationEl.appendChild(gLink);
      });

      this.explanationEl.classList.add('show');
      this.explanationEl.classList.toggle('correct', isCorrect);
      this.explanationEl.classList.toggle('incorrect', !isCorrect);
    }

    // ----------------------------------------
    // Timer
    // ----------------------------------------
    startTimer() {
      this.stopTimer();
      this.timeRemaining = SECONDS_PER_QUESTION;
      this.renderTimer();

      this.timerInterval = setInterval(() => {
        this.timeRemaining--;
        this.renderTimer();

        if (this.timeRemaining <= 0) {
          this.stopTimer();
          this.handleTimeUp();
        }
      }, 1000);
    }

    renderTimer() {
      if (this.timerValue) this.timerValue.textContent = Math.max(this.timeRemaining, 0);
      if (!this.timerEl) return;

      // Warn in the last few seconds, and reset styling for every new question
      if (this.timeRemaining <= WARNING_SECONDS) {
        this.timerEl.style.background = 'var(--color-danger-bg)';
        this.timerEl.style.color = 'var(--color-danger)';
      } else {
        this.timerEl.style.background = '';
        this.timerEl.style.color = '';
      }
    }

    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    handleTimeUp() {
      if (this.answers[this.currentIndex] !== null) return;

      this.answers[this.currentIndex] = UNANSWERED;
      this.times[this.currentIndex] = SECONDS_PER_QUESTION;
      if (this.nextBtn) this.nextBtn.disabled = false; // let the user move on
      this.showExplanation();
    }

    // ----------------------------------------
    // Navigation
    // ----------------------------------------
    nextQuestion() {
      if (this.answers[this.currentIndex] === null) return;

      if (this.currentIndex < this.questions.length - 1) {
        this.currentIndex++;
        this.renderQuestion();
      } else {
        this.finishQuiz();
      }
    }

    previousQuestion() {
      if (this.currentIndex > 0) {
        this.stopTimer();
        this.currentIndex--;
        this.renderQuestion();
      }
    }

    updateProgress() {
      const progress = ((this.currentIndex + 1) / this.questions.length) * 100;
      if (this.progressBar) this.progressBar.style.width = `${progress}%`;
      if (this.progressText) {
        this.progressText.textContent = `Question ${this.currentIndex + 1} of ${this.questions.length}`;
      }
    }

    // ----------------------------------------
    // Results
    // ----------------------------------------
    finishQuiz() {
      this.stopTimer();
      this.showResults();
    }

    calculateResults() {
      let correct = 0, incorrect = 0, unanswered = 0;
      let totalTime = 0;
      let answeredCount = 0;

      this.questions.forEach((q, i) => {
        const userAnswer = this.answers[i];

        if (userAnswer === UNANSWERED || userAnswer === null) {
          unanswered++;
          return;
        }

        if (userAnswer === q.correctIndex) correct++;
        else incorrect++;

        totalTime += this.times[i];
        answeredCount++;
      });

      const total = this.questions.length;
      const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
      const avgTime = answeredCount > 0 ? Math.round(totalTime / answeredCount) : 0;

      return { correct, incorrect, unanswered, percentage, avgTime };
    }

    showResults() {
      const { correct, incorrect, unanswered, percentage, avgTime } = this.calculateResults();

      // Score circle
      if (this.resultsScore) {
        this.resultsScore.style.background =
          `conic-gradient(var(--color-primary) ${percentage}%, var(--color-border) ${percentage}%)`;
      }
      if (this.resultsValue) this.resultsValue.textContent = `${percentage}%`;

      // Title/message based on score
      let title, message;
      if (percentage >= 90) {
        title = 'Excellent! 🎉';
        message = 'Outstanding cybersecurity knowledge! You\'re well-prepared to spot threats.';
      } else if (percentage >= PASS_THRESHOLD) {
        title = 'Great Job! 👏';
        message = 'Solid understanding of security concepts. Review the areas you missed to strengthen your knowledge.';
      } else if (percentage >= 50) {
        title = 'Good Effort! 📚';
        message = 'You have a foundation, but there are gaps. Review the explanations and try again.';
      } else {
        title = 'Keep Learning! 💪';
        message = 'Cybersecurity is a journey. Review the topics below and retake the quiz when ready.';
      }
      if (this.resultsTitle) this.resultsTitle.textContent = title;
      if (this.resultsMessage) this.resultsMessage.textContent = message;

      // Breakdown
      if (this.correctCount) this.correctCount.textContent = correct;
      if (this.incorrectCount) this.incorrectCount.textContent = incorrect;
      if (this.unansweredCount) this.unansweredCount.textContent = unanswered;
      if (this.avgTime) this.avgTime.textContent = `${avgTime}s`;

      this.saveProgress(percentage);
      this.showSection('results');
    }

    saveProgress(percentage) {
      if (!(window.CyberShield && window.CyberShield.Utils && window.CyberShield.Utils.storage)) return;

      try {
        const storage = window.CyberShield.Utils.storage;
        const progress = storage.get('progress', {});
        const previous = progress.quiz || {};

        progress.quiz = {
          started: true,
          // Once passed, stays completed even if a later attempt scores lower
          completed: Boolean(previous.completed) || percentage >= PASS_THRESHOLD,
          bestScore: Math.max(percentage, previous.bestScore || 0),
          lastAttempt: new Date().toISOString()
        };
        storage.set('progress', progress);
      } catch (err) {
        console.error('Could not save quiz progress:', err);
      }
    }

    // ----------------------------------------
    // Review
    // ----------------------------------------
    showReview() {
      this.showSection('review');
      if (!this.reviewList) return;

      this.reviewList.innerHTML = this.questions.map((q, i) => {
        const userAnswer = this.answers[i];
        const isUnanswered = userAnswer === UNANSWERED || userAnswer === null;
        const isCorrect = !isUnanswered && userAnswer === q.correctIndex;

        const userAnswerText = isUnanswered ? 'Not answered' : q.options[userAnswer];
        const correctAnswerText = q.options[q.correctIndex];
        const badgeType = isCorrect ? 'success' : isUnanswered ? 'warning' : 'danger';
        const badgeLabel = isCorrect ? 'Correct' : isUnanswered ? 'Skipped' : 'Incorrect';

        const glossaryHtml = (GLOSSARY_LINKS[q.category] || []).slice(0, 2).map(t =>
          `<a class="glossary-jump" href="glossary.html?term=${encodeURIComponent(t)}">📖 ${this.escapeHtml(t)}</a>`
        ).join('');

        return `
          <details class="card" style="padding: 1rem;">
            <summary style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-weight: 600;">
              <span>Q${i + 1}: ${this.escapeHtml(q.question)}</span>
              <span class="badge badge-${badgeType}">${badgeLabel}</span>
            </summary>
            <div style="margin-top: 1rem; padding: 1rem; background: var(--color-bg); border-radius: var(--radius-md);">
              <p style="margin-bottom: 0.5rem;"><strong>Your answer:</strong> ${this.escapeHtml(userAnswerText)}</p>
              ${!isCorrect ? `<p style="margin-bottom: 0.5rem; color: var(--color-success);"><strong>Correct answer:</strong> ${this.escapeHtml(correctAnswerText)}</p>` : ''}
              <p style="margin-bottom: 0.5rem; color: var(--color-text-secondary);"><strong>Explanation:</strong> ${this.escapeHtml(q.explanation)}</p>
              ${glossaryHtml}
            </div>
          </details>
        `;
      }).join('');

      // Open first by default
      const firstDetail = this.reviewList.querySelector('details');
      if (firstDetail) firstDetail.open = true;
    }

    // ----------------------------------------
    // Reset
    // ----------------------------------------
    resetQuiz() {
      this.stopTimer();
      this.showSection('setup');
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text == null ? '' : String(text);
      return div.innerHTML;
    }
  }

  // Initialize (only on pages that actually contain the quiz)
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('quiz-setup')) {
      new QuizController();
    }
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QuizController };
  }
})();