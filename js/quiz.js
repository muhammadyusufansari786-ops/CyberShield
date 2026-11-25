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
    mobile: ['SIM Swapping', 'Spyware', 'Public Key Infrastructure (PKI)'],
    scam: ['Phishing', 'Smishing', 'Quishing', 'Social Engineering']
  };

  // AI Learning Path (Gemini) - friendly labels + page links for rendered steps
  const CATEGORY_LABELS = {
    passwords: 'Passwords & Authentication',
    phishing: 'Phishing & Social Engineering',
    malware: 'Malware & Threats',
    privacy: 'Privacy & Data Protection',
    mobile: 'Mobile Security',
    scam: 'Scam Awareness (Spot the Scam)'
  };

  const PATH_PAGE_LINKS = {
    home: 'index.html', password: 'password.html', quiz: 'quiz.html', news: 'news.html',
    threats: 'threats.html', toolkit: 'toolkit.html', glossary: 'glossary.html',
    resources: 'resources.html', ai: 'ai-assistant.html', about: 'about.html'
  };

  const PATH_TYPE_ICONS = { Learn: '📚', Read: '📖', Practice: '🎯', Take: '✅' };

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

      // AI learning path (Gemini)
      this.generatePathBtn = document.getElementById('generate-path-btn');
      this.aiPathEl = document.getElementById('ai-learning-path');
      this.lastPerformance = null;

      // Dashboard persistence (signed-in users only; ownership is decided
      // by the server session, never by anything this page sends)
      this.saveStatusEl = document.getElementById('quiz-save-status');
      this.submissionId = null; // one id per quiz run -> idempotent saving
      this.savedAttempt = false;
      this.savingAttempt = false;
      this.selectedCategory = 'all';
      this.lastResult = null;

      // Adaptive mode state. `adaptive` holds the CyberAdaptive session; the
      // question list grows lazily so difficulty can change between questions.
      this.mode = 'normal';
      this.adaptive = null;
      this.adaptiveProfile = null;
      this.adaptiveSignedIn = false;
      this.totalQuestions = 0;
      this.adaptiveSummary = null;

      this.modeButtons = Array.from(document.querySelectorAll('.quiz-mode-btn'));
      this.modeHint = document.getElementById('quiz-mode-hint');
      this.categoryGroup = document.getElementById('category-filter')?.closest('.form-group') || null;
      this.adaptiveMetaEl = document.getElementById('adaptive-meta');
      this.adaptiveDifficultyBadge = document.getElementById('adaptive-difficulty-badge');
      this.adaptiveTopicBadge = document.getElementById('adaptive-topic-badge');
      this.adaptiveResultsEl = document.getElementById('adaptive-results');
      this.adaptiveScoreNote = document.getElementById('adaptive-score-note');
      this.adaptiveDifficultyBreakdown = document.getElementById('adaptive-difficulty-breakdown');
      this.adaptiveTopicBreakdown = document.getElementById('adaptive-topic-breakdown');
      this.adaptiveRecommendations = document.getElementById('adaptive-recommendations');
      this.adaptiveRetakeBtn = document.getElementById('adaptive-retake-btn');
      this.bankNote = document.getElementById('bank-size-note');
      this.newBadge = document.getElementById('question-new-badge');

      // Server-driven run state. The browser never receives the answer key:
      // each question is fetched without it and checked by /api/quiz/answer.
      this.serverQuiz = null;
      this.serverSummary = null;
      this.answerPending = false;
      this.currentDifficulty = null;
      this.bankMeta = null;

      // Disable start button until data is loaded
      if (this.startBtn) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Loading questions…';
      }

      this.loadData();
    }

    loadData() {
      fetch('/api/quiz/meta', { credentials: 'include' })
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
          return response.json();
        })
        .then(meta => {
          this.bankMeta = meta;
          if (this.bankNote) {
            this.bankNote.textContent =
              `${meta.approved} approved questions in the bank - each attempt draws a new mix.`;
          }
          if (this.startBtn) {
            this.startBtn.disabled = false;
            this.startBtn.textContent = 'Start Quiz';
          }
          this.bindEvents();
        })
        .catch(err => {
          console.error('Failed to load the question bank:', err);
          if (this.startBtn) {
            this.startBtn.textContent = '⚠️ Question bank unavailable';
          }
          if (this.bankNote) {
            this.bankNote.textContent = 'Could not reach the question bank. Is the server running?';
          }
        });
    }

    bindEvents() {
      if (this.startBtn) this.startBtn.addEventListener('click', () => this.startServerRun());
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.previousQuestion());
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextQuestion());
      if (this.retakeBtn) this.retakeBtn.addEventListener('click', () => this.resetQuiz());
      if (this.reviewBtn) this.reviewBtn.addEventListener('click', () => this.showReview());
      if (this.retakeFromReviewBtn) this.retakeFromReviewBtn.addEventListener('click', () => this.resetQuiz());
      if (this.generatePathBtn) this.generatePathBtn.addEventListener('click', () => this.generateLearningPath());
      if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.addEventListener('click', () => {
        this.resetQuiz();
        this.startServerRun();
      });

      this.modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => this.setMode(btn.dataset.mode === 'adaptive' ? 'adaptive' : 'normal'));
      });
      this.setMode('normal');
    }

    setMode(mode) {
      this.mode = mode === 'adaptive' ? 'adaptive' : 'normal';
      this.modeButtons.forEach((btn) => {
        const active = btn.dataset.mode === this.mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
        btn.setAttribute('tabindex', active ? '0' : '-1');
      });
      if (this.categoryGroup) this.categoryGroup.hidden = this.mode === 'adaptive';
      if (this.modeHint) {
        this.modeHint.textContent = this.mode === 'adaptive'
          ? 'Questions adapt to your recent quiz history. Weak topics get extra practice and difficulty follows how you answer.'
          : 'Standard randomized quiz across the categories you choose.';
      }
      if (this.startBtn && !this.startBtn.disabled) {
        this.startBtn.textContent = this.mode === 'adaptive' ? 'Start Adaptive Quiz' : 'Start Quiz';
      }
    }

    /**
     * Start a run through the server. Both modes use the same flow: the
     * backend selects the questions (respecting this user's history), the
     * browser fetches them one at a time, and answers are checked server-side.
     */
    async startServerRun() {
      const count = parseInt(document.getElementById('question-count').value, 10) || 10;
      this.timerEnabled = document.getElementById('timer-enabled').checked;
      const category = this.mode === 'adaptive' ? 'all' : document.getElementById('category-filter').value;

      if (this.startBtn) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Preparing your quiz…';
      }

      this.questions = [];
      this.answers = [];
      this.times = [];
      this.currentIndex = 0;
      this.adaptive = null;
      this.adaptiveSummary = null;
      this.serverSummary = null;
      this.lastResult = null;
      this.savedAttempt = false;
      this.selectedCategory = category;

      let data;
      try {
        const res = await fetch('/api/quiz/start', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: this.mode, count, category })
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `quiz could not start (${res.status})`);
      } catch (err) {
        this.setSaveStatus('error', `Could not start the quiz: ${err.message || 'server unreachable'}`);
        if (this.startBtn) {
          this.startBtn.disabled = false;
          this.startBtn.textContent = this.mode === 'adaptive' ? 'Start Adaptive Quiz' : 'Start Quiz';
        }
        return;
      }

      this.serverQuiz = { quizId: data.quizId, mode: data.mode, total: data.total };
      this.totalQuestions = data.total;
      this.currentDifficulty = data.currentDifficulty || null;
      this.adaptiveSignedIn = !!data.personalized;
      this.startDifficulty = data.startDifficulty || null;
      this.startTime = Date.now();

      if (this.saveStatusEl) {
        this.saveStatusEl.textContent = '';
        this.saveStatusEl.className = 'quiz-save-status';
      }
      if (this.adaptiveMetaEl) this.adaptiveMetaEl.hidden = false;
      if (this.adaptiveResultsEl) this.adaptiveResultsEl.hidden = true;
      if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.style.display = 'none';

      if (this.setupEl) this.setupEl.style.display = 'none';
      if (this.activeEl) this.activeEl.style.display = 'block';
      if (this.resultsEl) this.resultsEl.style.display = 'none';
      if (this.reviewEl) this.reviewEl.style.display = 'none';

      this.updateProgress();
      const loaded = await this.loadServerQuestion();

      if (this.timerEnabled && this.timerEl && loaded) {
        this.timerEl.style.display = 'flex';
        this.startTimer();
      } else if (this.timerEl) {
        this.timerEl.style.display = 'none';
      }
      if (this.startBtn) this.startBtn.disabled = false;
    }

    /** Fetch the next question (options pre-shuffled, no answer key). */
    async loadServerQuestion() {
      if (!this.serverQuiz) return false;

      let data;
      try {
        const res = await fetch('/api/quiz/next', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quizId: this.serverQuiz.quizId })
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `could not load the next question (${res.status})`);
      } catch (err) {
        this.setSaveStatus('error', err.message || 'Could not load the next question.', null, 'Retry');
        return false;
      }

      if (data.done) {
        this.finishQuiz();
        return false;
      }

      const q = data.question;
      q._shuffledIndices = q.options.map((_, i) => i);
      q._correctNewIndex = null;
      q._server = true;
      this.questions[this.currentIndex] = q;
      if (this.answers[this.currentIndex] === undefined) this.answers[this.currentIndex] = null;
      this.pendingDifficultyMove = 0;
      this.answeredNow = false;
      this.currentDifficulty = data.difficulty || this.currentDifficulty;

      this.renderQuestion();
      this.updateProgress();
      return true;
    }

    startQuiz() {
      const count = parseInt(document.getElementById('question-count').value);
      this.timerEnabled = document.getElementById('timer-enabled').checked;

      if (this.mode === 'adaptive') {
        this.startAdaptiveQuiz(count);
        return;
      }

      const category = document.getElementById('category-filter').value;
      this.selectedCategory = category;
      this.adaptive = null;
      this.adaptiveSummary = null;

      // One stable id per quiz run: the server treats a repeat submission of
      // the same id as the same attempt (no duplicates from double clicks).
      this.submissionId = this.newSubmissionId();
      this.savedAttempt = false;
      this.lastResult = null;
      if (this.saveStatusEl) {
        this.saveStatusEl.textContent = '';
        this.saveStatusEl.className = 'quiz-save-status';
      }

      // Filter questions
      let pool = category === 'all' ? this.allQuestions : this.allQuestions.filter(q => q.category === category);

      // Shuffle and select
      this.questions = this.shuffleArray([...pool]).slice(0, Math.min(count, pool.length));

      // Reset state
      this.currentIndex = 0;
      this.totalQuestions = this.questions.length;
      this.answers = new Array(this.questions.length).fill(null);
      this.times = new Array(this.questions.length).fill(0);
      this.startTime = Date.now();
      if (this.adaptiveMetaEl) this.adaptiveMetaEl.hidden = true;
      if (this.adaptiveResultsEl) this.adaptiveResultsEl.hidden = true;
      if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.style.display = 'none';

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

    /**
     * Adaptive start: ask the server for this user's profile (topic accuracy,
     * difficulty, recently seen questions), then let CyberAdaptive pick the
     * questions. Signed-out visitors still get the same algorithm with a
     * beginner profile - personalisation needs an account, the quiz does not.
     */
    async startAdaptiveQuiz(count) {
      const requested = Math.min(Math.max(count || 10, 1), 20);
      this.selectedCategory = 'all';
      this.adaptiveSummary = null;
      this.questions = [];
      this.currentIndex = 0;
      this.totalQuestions = requested;

      if (this.startBtn) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Building your quiz…';
      }

      let profile = null;
      this.adaptiveSignedIn = false;
      try {
        const res = await fetch('/api/adaptive/profile', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          profile = data && data.profile ? data.profile : null;
          this.adaptiveSignedIn = !!profile;
        }
      } catch {
        /* offline: fall through to the local beginner profile */
      }

      this.adaptiveProfile = profile || {
        currentDifficulty: 'easy',
        weakTopics: [],
        strongTopics: [],
        seenQuestionIds: [],
        historySufficient: false
      };

      this.adaptive = window.CyberAdaptive.createSession(this.adaptiveProfile, this.allQuestions, requested);
      this.totalQuestions = Math.min(requested, this.adaptive.pool.length);
      if (!this.totalQuestions) {
        if (this.startBtn) {
          this.startBtn.disabled = false;
          this.startBtn.textContent = 'Start Adaptive Quiz';
        }
        return;
      }
      this.adaptive.count = this.totalQuestions;

      this.submissionId = this.newSubmissionId();
      this.savedAttempt = false;
      this.lastResult = null;
      if (this.saveStatusEl) {
        this.saveStatusEl.textContent = '';
        this.saveStatusEl.className = 'quiz-save-status';
      }

      this.answers = new Array(this.totalQuestions).fill(null);
      this.times = new Array(this.totalQuestions).fill(0);
      this.startTime = Date.now();

      if (this.setupEl) this.setupEl.style.display = 'none';
      if (this.activeEl) this.activeEl.style.display = 'block';
      if (this.resultsEl) this.resultsEl.style.display = 'none';
      if (this.reviewEl) this.reviewEl.style.display = 'none';
      if (this.adaptiveResultsEl) this.adaptiveResultsEl.hidden = true;
      if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.style.display = 'none';

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
      if (!q) {
        // In server mode a missing question just means it has not been fetched
        // yet; loadServerQuestion() owns that transition.
        if (this.serverQuiz) return;
        this.finishQuiz();
        return;
      }

      if (q.topic) {
        if (this.adaptiveMetaEl) this.adaptiveMetaEl.hidden = false;
        if (this.adaptiveDifficultyBadge) {
          const level = this.currentDifficulty || q.difficulty || 'easy';
          this.adaptiveDifficultyBadge.textContent = `Difficulty: ${level.charAt(0).toUpperCase() + level.slice(1)}`;
          this.adaptiveDifficultyBadge.className = `badge adaptive-badge adaptive-badge-${level}`;
        }
        if (this.adaptiveTopicBadge) {
          this.adaptiveTopicBadge.textContent = q.topicLabel || (window.CyberAdaptive.TOPIC_LABELS[q.topic] || q.topic);
          this.adaptiveTopicBadge.title = q.subtopic || '';
        }
        if (this.newBadge) this.newBadge.hidden = !q.isNew;
      } else if (this.adaptiveMetaEl) {
        this.adaptiveMetaEl.hidden = true;
      }

      // Update question text
      this.questionText.textContent = `Question ${this.currentIndex + 1}: ${q.question}`;

      // Options arrive pre-shuffled from the server (the browser never sees the
      // key); a locally loaded question is still shuffled here as a fallback.
      let shuffledIndices = q._shuffledIndices;
      if (!shuffledIndices) {
        shuffledIndices = this.shuffleArray(q.options.map((_, i) => i));
        q._shuffledIndices = shuffledIndices;
        q._correctNewIndex = shuffledIndices.indexOf(q.correct);
      }
      const correctNewIndex = q._correctNewIndex;

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
      if (this.answers[this.currentIndex] === undefined) this.answers[this.currentIndex] = null;
      if (this.prevBtn) this.prevBtn.disabled = this.currentIndex === 0;
      if (this.nextBtn) {
        this.nextBtn.textContent = this.currentIndex === this.totalQuestions - 1 ? 'Finish' : 'Next';
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

      // Adaptive: the answer decides the difficulty of the NEXT question.
      if (this.mode === 'adaptive' && this.adaptive) {
        const q = this.questions[this.currentIndex];
        const isCorrect = index === q._correctNewIndex;
        const result = window.CyberAdaptive.recordAnswer(this.adaptive, isCorrect, this.times[this.currentIndex]);
        this.pendingDifficultyMove = result.moved;
        this.answeredNow = true;
      }

      // Update UI
      this.optionsContainer.querySelectorAll('.quiz-option').forEach((btn, i) => {
        btn.setAttribute('aria-pressed', i === index);
        btn.classList.toggle('selected', i === index);
      });

      if (this.nextBtn) this.nextBtn.disabled = false;

      // Server mode: the backend checks the answer and returns the key.
      if (this.serverQuiz) {
        this.submitServerAnswer(index);
        return;
      }

      // Show explanation immediately
      this.showExplanation();
    }

    /**
     * Send one answer to the server. It returns correctness, the correct option
     * index and the explanation; adaptive runs also move the difficulty here,
     * so the next question uses the updated level.
     */
    async submitServerAnswer(selectedIndex) {
      const q = this.questions[this.currentIndex];
      if (!q || !this.serverQuiz || this.answerPending) return;

      this.answerPending = true;
      this.answerSaving = true;
      try {
        const res = await fetch('/api/quiz/answer', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quizId: this.serverQuiz.quizId,
            questionId: q.id,
            selectedIndex
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `answer could not be checked (${res.status})`);

        q._correctNewIndex = data.correctIndex;
        q.explanation = data.explanation || q.explanation || '';
        this.pendingDifficultyMove = data.moved || 0;
        this.answeredNow = true;
        if (data.difficulty) this.currentDifficulty = data.difficulty;
        this.showExplanation();
      } catch (err) {
        this.setSaveStatus('error', `Answer not checked: ${err.message || 'server unreachable'}. `, null, 'Retry');
      } finally {
        this.answerPending = false;
        this.answerSaving = false;
      }
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
          mobile: { slug: 'device', label: 'Stolen Device Response' },
          scam: { slug: 'phishing', label: 'Phishing Response' }
        };
        const guide = EMERGENCY_MAP[q.category];
        const oldLink = this.explanationEl.querySelector('.emergency-jump');
        if (oldLink) oldLink.remove();
        const oldGlossaryLinks = this.explanationEl.querySelectorAll('.glossary-jump');
        oldGlossaryLinks.forEach(l => l.remove());
        if (guide) {
          const link = document.createElement('a');
          link.className = 'emergency-jump';
          link.href = `toolkit.html?incident=${guide.slug}`;
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
      if (this.mode === 'adaptive' && this.explanationEl && this.answeredNow) {
        const oldNote = this.explanationEl.querySelector('.adaptive-move-note');
        if (oldNote) oldNote.remove();
        const note = document.createElement('p');
        note.className = 'adaptive-move-note';
        const level = this.adaptive ? this.adaptive.currentDifficulty : 'easy';
        const pretty = level.charAt(0).toUpperCase() + level.slice(1);
        const moved = this.pendingDifficultyMove || 0;
        note.textContent = moved > 0
          ? `Two correct in a row - the next question moves up to ${pretty}.`
          : moved < 0
            ? `Two missed in a row - the next question steps down to ${pretty} for practice.`
            : `Difficulty stays at ${pretty} for the next question.`;
        this.explanationEl.appendChild(note);
        this.pendingDifficultyMove = 0;
        this.answeredNow = false;
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
        if (this.serverQuiz) {
          this.submitServerAnswer(-1);
          return;
        }
        if (this.mode === 'adaptive' && this.adaptive) {
          const result = window.CyberAdaptive.recordAnswer(this.adaptive, false, 30);
          this.pendingDifficultyMove = result.moved;
          this.answeredNow = true;
        }
        this.showExplanation();
      }
    }

    nextQuestion() {
      if (this.currentIndex < this.totalQuestions - 1) {
        this.currentIndex++;
        this.updateProgress();
        // Server mode: the next question is fetched on demand, so it does not
        // exist in the array yet. Never treat that as "quiz finished".
        if (this.serverQuiz && !this.questions[this.currentIndex]) {
          this.loadServerQuestion();
        } else {
          this.renderQuestion();
        }
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
      const total = this.totalQuestions || this.questions.length || 1;
      const progress = ((this.currentIndex + 1) / total) * 100;
      if (this.progressBar) this.progressBar.style.width = `${Math.min(progress, 100)}%`;
      if (this.progressText) this.progressText.textContent = `Question ${this.currentIndex + 1} of ${total}`;
    }

    finishQuiz() {
      this.stopTimer();
      this.calculateResults();
      this.showResults();
    }

    calculateResults() {
      if (this.serverQuiz) return this.calculateServerResults();

      // Adaptive runs use the weighted score so hard questions are worth more,
      // while the raw percentage stays visible in the summary.
      if (this.mode === 'adaptive' && this.adaptive) {
        const summary = window.CyberAdaptive.summarize(this.adaptive);
        this.adaptiveSummary = summary;
        const totalTime = this.times.reduce((sum, t) => sum + (Number(t) || 0), 0);
        return {
          correct: summary.correct,
          incorrect: summary.incorrect,
          unanswered: Math.max(0, this.totalQuestions - summary.total),
          percentage: summary.weightedScore,
          rawPercentage: summary.rawScore,
          avgTime: summary.total ? Math.round(totalTime / summary.total) : 0,
        };
      }

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

    /** Local preview of the score; the server remains the official source. */
    calculateServerResults() {
      const weights = { easy: 1, medium: 1.5, hard: 2 };
      const served = this.questions.slice(0, this.totalQuestions);
      let correct = 0;
      let unanswered = 0;
      let weightSum = 0;
      let weightCorrect = 0;
      let totalTime = 0;
      let answeredCount = 0;

      served.forEach((q, i) => {
        const weight = weights[q.difficulty] || 1;
        weightSum += weight;
        const userAnswer = this.answers[i];
        if (userAnswer === -1 || userAnswer === null || userAnswer === undefined) {
          unanswered++;
          return;
        }
        totalTime += Number(this.times[i]) || 0;
        answeredCount++;
        if (userAnswer === q._correctNewIndex) {
          correct++;
          weightCorrect += weight;
        }
      });

      const total = served.length;
      const rawPercentage = total ? Math.round((correct / total) * 100) : 0;
      const weighted = weightSum ? Math.round((weightCorrect / weightSum) * 100) : 0;

      return {
        correct,
        incorrect: Math.max(0, total - correct - unanswered),
        unanswered,
        percentage: this.mode === 'adaptive' ? weighted : rawPercentage,
        rawPercentage,
        avgTime: answeredCount ? Math.round(totalTime / answeredCount) : 0
      };
    }

    showResults() {
      const results = this.calculateResults();
      const { correct, incorrect, unanswered, percentage, avgTime } = results;
      const rawPercentage = results.rawPercentage != null ? results.rawPercentage : percentage;

      // Snapshot of this run - saved to the user's dashboard below.
      this.lastResult = {
        correct,
        total: this.totalQuestions,
        percentage,
        rawPercentage,
        durationSeconds: this.startTime
          ? Math.min(7200, Math.round((Date.now() - this.startTime) / 1000))
          : 0
      };

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

      // Adaptive summary panel (difficulty mix, topics, recommendations)
      if (this.mode === 'adaptive' && this.adaptiveSummary) {
        this.renderAdaptiveResults();
      } else if (this.adaptiveResultsEl) {
        this.adaptiveResultsEl.hidden = true;
        if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.style.display = 'none';
      }

      // AI learning path (Gemini): reset any previous result and arm the button
      this.lastPerformance = this.buildPerformance(percentage, correct);
      if (this.aiPathEl) {
        this.aiPathEl.style.display = 'none';
        this.aiPathEl.innerHTML = '';
      }
      if (this.generatePathBtn) {
        this.generatePathBtn.style.display = window.CyberAI ? 'inline-flex' : 'none';
      }

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

      // Persist for signed-in users. Anonymous visitors get a sign-in hint
      // instead of a silent failure.
      this.saveQuizAttempt();
    }

    /** Adaptive-only results detail, built from the session summary. */
    renderAdaptiveResults() {
      const summary = this.adaptiveSummary;
      if (!summary) return;

      if (this.adaptiveScoreNote) {
        const signedOut = this.adaptiveSignedIn ? '' : ' Sign in to make future runs adapt to your history.';
        this.adaptiveScoreNote.textContent =
          `Difficulty-weighted score ${summary.weightedScore}% (raw accuracy ${summary.rawScore}% - ${summary.correct}/${summary.total}). ` +
          `Started at ${summary.startDifficulty}, finished at ${summary.finalDifficulty}.${signedOut}`;
      }

      const levelOrder = ['easy', 'medium', 'hard'];
      if (this.adaptiveDifficultyBreakdown) {
        const rows = levelOrder.map((level) => {
          const d = summary.difficultyDistribution[level] || { asked: 0, correct: 0 };
          const pct = d.asked ? Math.round((d.correct / d.asked) * 100) : 0;
          return `
            <div class="adaptive-row">
              <span class="adaptive-row-label">${level.charAt(0).toUpperCase() + level.slice(1)}</span>
              <span class="adaptive-bar" aria-hidden="true"><span class="adaptive-bar-fill adaptive-bar-${level}" style="width:${pct}%"></span></span>
              <span class="adaptive-row-value">${d.correct}/${d.asked} · ${pct}%</span>
            </div>`;
        }).join('');
        this.adaptiveDifficultyBreakdown.innerHTML =
          `<h4 class="adaptive-block-title">Difficulty distribution</h4>` + rows;
      }

      if (this.adaptiveTopicBreakdown) {
        const rows = summary.topicStats.map((t) => `
          <div class="adaptive-row">
            <span class="adaptive-row-label">${this.escapeHtml(t.label)}</span>
            <span class="adaptive-bar" aria-hidden="true"><span class="adaptive-bar-fill" style="width:${t.accuracy}%"></span></span>
            <span class="adaptive-row-value">${t.correct}/${t.total} · ${t.accuracy}%</span>
          </div>`).join('');
        this.adaptiveTopicBreakdown.innerHTML =
          `<h4 class="adaptive-block-title">Topic-wise performance</h4>` + rows;
      }

      if (this.adaptiveRecommendations) {
        const chips = (list) => list.map((label) => `<span class="adaptive-chip">${this.escapeHtml(label)}</span>`).join('');
        const improved = (this.adaptiveProfile && this.adaptiveProfile.improvedTopics) || [];
        this.adaptiveRecommendations.innerHTML = `
          <h4 class="adaptive-block-title">Next steps</h4>
          ${summary.weakTopics.length ? `<p class="adaptive-line"><strong>Weak topics this run:</strong> ${chips(summary.weakTopics)}</p>` : `<p class="adaptive-line"><strong>No weak topics this run</strong> - keep the streak going.</p>`}
          ${summary.strongTopics.length ? `<p class="adaptive-line"><strong>Strong topics:</strong> ${chips(summary.strongTopics)}</p>` : ''}
          ${improved.length ? `<p class="adaptive-line"><strong>Improved recently:</strong> ${chips(improved.map((t) => t.label))}</p>` : ''}
          <p class="adaptive-line"><strong>Recommended practice:</strong> ${chips(summary.recommendedTopics)}</p>`;
      }

      if (this.adaptiveResultsEl) this.adaptiveResultsEl.hidden = false;
      if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.style.display = 'inline-flex';
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

    /**
     * Build the ANONYMOUS performance snapshot sent to our backend for the
     * AI learning path. Only scores and topic names are included - never any
     * personal data (and this quiz never involves passwords).
     */
    buildPerformance(percentage, correct) {
      // Adaptive runs already know their topic breakdown - hand Gemini topic
      // labels instead of the legacy categories.
      if (this.mode === 'adaptive' && this.adaptiveSummary) {
        const summary = this.adaptiveSummary;
        return {
          score: summary.weightedScore,
          total: summary.total,
          correct: summary.correct,
          strongAreas: summary.strongTopics,
          weakAreas: summary.weakTopics.length ? summary.weakTopics : summary.recommendedTopics,
          categoryStats: Object.fromEntries(
            summary.topicStats.map((t) => [t.topic, { correct: t.correct, total: t.total }])
          ),
        };
      }

      const categoryStats = {};
      this.questions.forEach((q, i) => {
        const cat = q.category || 'general';
        if (!categoryStats[cat]) categoryStats[cat] = { correct: 0, total: 0 };
        categoryStats[cat].total++;
        if (this.answers[i] === q._correctNewIndex) categoryStats[cat].correct++;
      });

      const strongAreas = [];
      const weakAreas = [];
      Object.keys(categoryStats).forEach((cat) => {
        const { correct: c, total: t } = categoryStats[cat];
        const label = CATEGORY_LABELS[cat] || cat;
        if (t > 0 && c / t >= 0.75) strongAreas.push(label);
        else weakAreas.push(label);
      });

      return {
        score: percentage,
        total: this.questions.length,
        correct,
        strongAreas,
        weakAreas,
        categoryStats
      };
    }

    async generateLearningPath() {
      const AI = window.CyberAI;
      if (!AI || !this.lastPerformance) return;

      if (this.aiPathEl) {
        this.aiPathEl.style.display = 'block';
        this.aiPathEl.innerHTML = AI.loadingHtml('Generating your learning path');
        this.aiPathEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      AI.setBtnLoading(this.generatePathBtn, true, 'Generating…');

      try {
        const data = await AI.request('/api/ai/learning-path', this.lastPerformance);
        this.renderLearningPath(data);
        // Only reachable after a real Gemini response - never a placeholder.
        await this.saveLearningPath(data);
      } catch (err) {
        if (this.aiPathEl) {
          this.aiPathEl.innerHTML = '';
          AI.showError(this.aiPathEl, err.message);
          // Explicit retry: nothing was generated or saved.
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'btn btn-secondary btn-sm';
          retry.style.marginTop = '0.75rem';
          retry.textContent = 'Retry generation';
          retry.addEventListener('click', () => this.generateLearningPath());
          this.aiPathEl.appendChild(retry);
        }
      } finally {
        AI.setBtnLoading(this.generatePathBtn, false);
      }
    }

    renderLearningPath(data) {
      if (!this.aiPathEl) return;
      const AI = window.CyberAI;
      const steps = Array.isArray(data.steps) ? data.steps : [];

      const stepHtml = steps.map((step, i) => {
        const icon = PATH_TYPE_ICONS[step.type] || PATH_TYPE_ICONS.Learn;
        const href = PATH_PAGE_LINKS[step.link] || 'index.html';
        const linkLabel = step.link === 'home' ? 'Home' : step.link.charAt(0).toUpperCase() + step.link.slice(1);
        return `
          <li class="ai-path-step">
            <span class="ai-path-num" aria-hidden="true">${i + 1}</span>
            <div class="ai-path-body">
              <div class="ai-path-head">
                <span class="badge badge-info ai-path-type">${icon} ${AI.escapeHtml(step.type)}</span>
                <strong>${AI.escapeHtml(step.title)}</strong>
              </div>
              ${step.description ? `<p class="ai-path-desc">${AI.escapeHtml(step.description)}</p>` : ''}
              <a class="btn btn-ghost btn-sm" href="${href}">Open ${AI.escapeHtml(linkLabel)} →</a>
            </div>
          </li>
        `;
      }).join('');

      this.aiPathEl.innerHTML = `
        <div class="ai-result-header">
          <span class="ai-chip ai-chip-gemini">🤖 Gemini AI</span>
          <span class="ai-chip">🗺️ Your cyber learning path</span>
        </div>
        ${data.summary ? `<p class="ai-verdict">${AI.escapeHtml(data.summary)}</p>` : ''}
        <ol class="ai-path-list">${stepHtml}</ol>
        <p class="ai-disclaimer">Generated by Gemini from your anonymous quiz performance (score and topic names only - no personal data).</p>
      `;
      this.aiPathEl.style.display = 'block';
    }

    /* ------------------------------------------------------------------ */
    /* Dashboard persistence                                              */
    /* ------------------------------------------------------------------ */

    newSubmissionId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    setSaveStatus(kind, message, linkHref, retryLabel) {
      if (!this.saveStatusEl) return;
      this.saveStatusEl.className = `quiz-save-status ${kind || ''}`.trim();
      this.saveStatusEl.textContent = message;

      if (linkHref) {
        const link = document.createElement('a');
        link.href = linkHref;
        link.textContent = 'sign in';
        this.saveStatusEl.appendChild(link);
      }
      if (retryLabel) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-ghost btn-sm';
        btn.textContent = retryLabel;
        btn.addEventListener('click', () => this.saveQuizAttempt());
        this.saveStatusEl.appendChild(btn);
      }
    }

    /**
     * Finalize the run on the server. The server computes the OFFICIAL score
     * from the answers it checked, saves the attempt for signed-in users
     * (idempotent per quiz id) and returns the run summary.
     */
    async saveQuizAttempt() {
      if (this.savedAttempt || this.savingAttempt || !this.serverQuiz || !this.lastResult) return;
      this.savingAttempt = true;
      this.setSaveStatus('saving', 'Submitting your result…');

      try {
        const res = await fetch('/api/quiz/submit', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quizId: this.serverQuiz.quizId,
            durationSeconds: this.lastResult.durationSeconds
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || `submit failed (${res.status})`);

        this.savedAttempt = true;

        // The server's score is authoritative.
        if (typeof data.score === 'number') {
          this.lastResult.percentage = data.score;
          if (this.resultsValue) this.resultsValue.textContent = `${data.score}%`;
          if (this.resultsScore) {
            this.resultsScore.style.background =
              `conic-gradient(var(--color-primary) ${data.score}%, var(--color-border) ${data.score}%)`;
          }
        }

        if (data.summary) {
          this.serverSummary = data.summary;
          this.adaptiveSummary = data.summary;
          if (this.mode === 'adaptive') this.renderAdaptiveResults();
          this.lastPerformance = this.buildPerformance(data.score, data.correct);
        }

        if (data.saved) {
          this.setSaveStatus(
            'ok',
            data.duplicate ? '✓ This attempt was already saved - no duplicate created.' : '✓ Saved to your dashboard.'
          );
        } else {
          this.setSaveStatus(
            'note',
            'Sign in to save attempts and let future quizzes adapt to your history: ',
            'login.html'
          );
        }
      } catch (err) {
        this.setSaveStatus(
          'error',
          `Could not submit this attempt: ${err.message || 'server unreachable'}. `,
          null,
          'Retry'
        );
      } finally {
        this.savingAttempt = false;
      }
    }

    /** Save the generated path for the signed-in user. */
    async saveLearningPath(data) {
      const perf = this.lastPerformance || {};
      try {
        const res = await fetch('/api/learning-paths', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: this.submissionId,
            score: perf.score,
            strongAreas: perf.strongAreas,
            weakAreas: perf.weakAreas,
            summary: data.summary,
            focusArea: (perf.weakAreas && perf.weakAreas[0]) || '',
            steps: data.steps
          })
        });
        const payload = await res.json().catch(() => ({}));

        if (res.status === 401) {
          this.appendPathSaveNote('Sign in to keep learning paths on your dashboard.');
          return;
        }
        if (!res.ok) throw new Error((payload && payload.error) || `save failed (${res.status})`);

        this.appendPathSaveNote('✓ Saved to your dashboard.');
      } catch (err) {
        this.appendPathSaveNote(`Not saved to your dashboard: ${err.message || 'server unreachable'}.`);
      }
    }

    appendPathSaveNote(text) {
      if (!this.aiPathEl) return;
      const note = document.createElement('p');
      note.className = 'quiz-save-status';
      note.textContent = text;
      this.aiPathEl.appendChild(note);
    }

    resetQuiz() {
      this.stopTimer();
      this.isReviewMode = false;
      this.serverQuiz = null;
      this.serverSummary = null;
      this.answerPending = false;
      if (this.aiPathEl) {
        this.aiPathEl.style.display = 'none';
        this.aiPathEl.innerHTML = '';
      }
      if (this.generatePathBtn) this.generatePathBtn.style.display = 'none';
      if (this.saveStatusEl) {
        this.saveStatusEl.textContent = '';
        this.saveStatusEl.className = 'quiz-save-status';
      }
      if (this.setupEl) this.setupEl.style.display = 'block';
      if (this.activeEl) this.activeEl.style.display = 'none';
      if (this.resultsEl) this.resultsEl.style.display = 'none';
      if (this.reviewEl) this.reviewEl.style.display = 'none';
      if (this.adaptiveResultsEl) this.adaptiveResultsEl.hidden = true;
      if (this.adaptiveRetakeBtn) this.adaptiveRetakeBtn.style.display = 'none';
      if (this.startBtn) this.startBtn.disabled = false;
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