/**
 * CyberShield - Advanced AI Cybersecurity Tutor (signed-in)
 *
 * - Requires a live server session; signed-in users get a persisted conversation
 *   plus personalization from their quiz attempts + learning roadmap.
 * - Difficulty (Beginner / Intermediate / Advanced) is sent with every question
 *   so the backend + Gemini adapt explanation depth.
 * - The backend stores the conversation server-side (one active conversation per
 *   user). "Clear conversation" deletes it; "Start new conversation" refreshes.
 * - Answers are rendered through the safe markdown renderer in ai-client.js, so
 *   AI output can never inject HTML/JS.
 * - Defensive-only: the backend safety guard redirects actionable attack asks to a
 *   curated reply before any Gemini call; the Gemini system prompt is the primary
 *   enforcement.
 */

(function () {
  "use strict";

  const AI = window.CyberAI;
  if (!AI) return;

  /* ---------- DOM ---------- */

  const el = {
    personalization: document.getElementById("tutor-personalization"),
    authGate: document.getElementById("tutor-auth-gate"),
    signinBtn: document.getElementById("tutor-signin-btn"),
    difficultyRow: document.getElementById("tutor-difficulty-row"),
    chatCard: document.getElementById("tutor-chat-card"),
    chatWindow: document.getElementById("tutor-chat-window"),
    suggestions: document.getElementById("tutor-suggestions"),
    input: document.getElementById("tutor-chat-input"),
    sendBtn: document.getElementById("tutor-send-btn"),
    newChatBtn: document.getElementById("tutor-new-chat"),
    clearBtn: document.getElementById("tutor-clear-btn"),
    conversationHeader: document.getElementById("tutor-conversation-header"),
    conversationTitle: document.getElementById("tutor-conversation-title"),
    difficultyBtns: document.querySelectorAll("#tutor-difficulty-row .filter-btn"),
  };

  if (!el.chatWindow || !el.input || !el.sendBtn) return;

  /* ---------- State ---------- */

  const GREETING =
    "👋 Hi! I am your **CyberShield Advanced AI Tutor**, powered by Google Gemini.\n\n" +
    "Ask me anything about staying safe online - spotting phishing, securing your " +
    "accounts, understanding malware, protecting your money and privacy, safe Wi-Fi " +
    "and browsing, and preventing identity theft.\n\n" +
    "Pick a level above (Beginner / Intermediate / Advanced) and try one of the " +
    "suggestion chips below. I remember our conversation, so follow-up questions " +
    "get better as we go.";

  let difficulty = "beginner";
  let sessionConversationId = null; // set after we load the conversation
  let busy = false;

  /* ---------- Auth + session ---------- */

  async function isSignedIn() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return false;
      const data = await res.json().catch(function () { return null; });
      return !!(data && data.user);
    } catch (e) {
      return false;
    }
  }

  async function userEmail() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json().catch(function () { return null; });
      return data && data.user ? data.user.email || data.user.name || null : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Rendering ---------- */

  function scrollToEnd() {
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  function addMessage(role, html, extraClass) {
    const wrap = document.createElement("div");
    wrap.className = "ai-chat-msg " + (role === "user" ? "ai-msg-user" : "ai-msg-model") + (extraClass ? " " + extraClass : "");

    const avatar = document.createElement("span");
    avatar.className = "ai-msg-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = role === "user" ? "🧑\u200d🎓" : "🛡️";

    const bubble = document.createElement("div");
    bubble.className = "ai-chat-bubble";
    bubble.innerHTML = html;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    el.chatWindow.appendChild(wrap);
    scrollToEnd();
    return bubble;
  }

  function addUserMessage(text) {
    addMessage("user", AI.escapeHtml(text).replace(/\r?\n/g, "<br>"));
  }

  function addModelMessage(markdown) {
    return addMessage("model", AI.renderMarkdown(markdown));
  }

  function addErrorMessage(message) {
    addMessage("model", "⚠️ " + AI.escapeHtml(message), "ai-msg-error");
  }

  /* ---------- Tutor-structured rendering ---------- */

  function topicTag(topic, topicLabel) {
    const tag = document.createElement("span");
    tag.className = "tutor-topic-tag";
    tag.textContent = (topicLabel || "Cybersecurity") + " · " + (topic || "");
    return tag;
  }

  function practiceTag(practice) {
    if (!practice || !practice.page) return null;
    const tag = document.createElement("a");
    tag.className = "tutor-practice-tag";
    tag.href = practice.page + ".html";
    tag.textContent = "Try: " + (practice.label || practice.page);
    tag.setAttribute("aria-label", "Open " + (practice.label || practice.page));
    return tag;
  }

  function safetyTag(safety) {
    if (safety !== "redirected") return null;
    const tag = document.createElement("span");
    tag.className = "tutor-safety-tag";
    tag.textContent = "Safety-guarded response";
    return tag;
  }

  function renderReplyBlocks(data) {
    // data is the POST /api/ai/tutor response shape:
    // { reply, keyTakeaways, followUps, topic, topicLabel, practice, generatedBy, safety, notice, difficulty }
    const win = el.chatWindow;
    const wrap = win.lastElementChild; // the .ai-chat-msg wrapper (flex container)
    if (!wrap) return;
    const bubble = wrap.querySelector(".ai-chat-bubble") || wrap.lastElementChild;
    if (!bubble) return;

    // topic tag at top of bubble
    if (data.topic) {
      const tag = topicTag(data.topic, data.topicLabel);
      bubble.insertBefore(tag, bubble.firstChild);
    }

    // safety tag inside bubble
    if (data.safety === "redirected") {
      const tag = safetyTag(data.safety);
      if (tag) bubble.appendChild(tag);
    }

    // structured blocks go inside the bubble, after the reply text
    const structure = document.createElement("div");
    structure.className = "tutor-structure";

    // Key takeaways
    const takeaways = (data.keyTakeaways || []).filter(function (t) { return t && t.trim(); });
    if (takeaways.length) {
      const block = document.createElement("div");
      const label = document.createElement("div");
      label.className = "tutor-section-label";
      label.textContent = "Key takeaways";
      block.appendChild(label);

      const ul = document.createElement("ul");
      ul.className = "tutor-key-takeaways";
      takeaways.forEach(function (t) {
        const li = document.createElement("li");
        li.innerHTML = AI.renderMarkdown(t);
        ul.appendChild(li);
      });
      block.appendChild(ul);
      structure.appendChild(block);
    }

    // Follow-ups as clickable chips
    const followUps = (data.followUps || []).filter(function (u) { return u && u.trim(); });
    if (followUps.length) {
      const block = document.createElement("div");
      const label = document.createElement("div");
      label.className = "tutor-section-label";
      label.textContent = "Follow-up questions you can ask";
      block.appendChild(label);

      const wrapChips = document.createElement("div");
      wrapChips.className = "tutor-follow-ups";
      followUps.forEach(function (q) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ai-suggestion";
        chip.textContent = q;
        chip.setAttribute("aria-label", "Ask: " + q);
        chip.addEventListener("click", function () {
          el.input.value = q;
          el.input.focus();
        });
        wrapChips.appendChild(chip);
      });
      block.appendChild(wrapChips);
      structure.appendChild(block);
    }

    // Practice link
    if (data.practice && data.practice.page) {
      const block = document.createElement("div");
      const tag = practiceTag(data.practice);
      if (tag) block.appendChild(tag);
      structure.appendChild(block);
    }

    // Notice (e.g. fallback notice) - keep inside bubble so it reads with the reply
    if (data.notice) {
      const block = document.createElement("div");
      const p = document.createElement("p");
      p.style.marginTop = "0.5rem";
      p.style.fontSize = "0.82rem";
      p.style.color = "var(--color-text-muted)";
      p.innerHTML = AI.renderMarkdown(data.notice);
      block.appendChild(p);
      structure.appendChild(block);
    }

    bubble.appendChild(structure);

    // difficulty badge as a flex sibling of the bubble (near the avatar)
    const diffTag = document.createElement("span");
    diffTag.className = "tutor-diff-tag";
    const d = (data.difficulty || "").replace(/^\w/, function (c) { return c.toUpperCase(); });
    diffTag.textContent = d || "Beginner";
    if (diffTag.textContent) wrap.appendChild(diffTag);
  }

  /* ---------- Suggestions ---------- */

  function renderSuggestions(prompts) {
    el.suggestions.innerHTML = "";
    const list = (prompts && prompts.length) ? prompts : defaultSuggestions();
    list.forEach(function (text) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ai-suggestion";
      chip.textContent = text;
      chip.addEventListener("click", function () {
        el.input.value = text;
        el.input.focus();
      });
      el.suggestions.appendChild(chip);
    });
  }

  function defaultSuggestions() {
    return [
      "What is phishing?",
      "How does multi-factor authentication work?",
      "How can I secure my social media accounts?",
      "What should I do after clicking a suspicious link?",
      "How do I know if my device has malware?",
    ];
  }

  /* ---------- Personalization banner ---------- */

  function renderPersonalization(p) {
    if (!p || !el.personalization) return;
    const banner = el.personalization;
    banner.innerHTML = "";

    const hasHistory = !!(p && p.hasHistory);
    const attempts = p && typeof p.attempts === "number" ? p.attempts : 0;
    const weakTopics = p && p.weakTopics ? p.weakTopics : [];
    const recommendedLevel = p && p.recommendedLevel ? p.recommendedLevel : null;

    const title = document.createElement("strong");
    title.textContent = "Your learning profile";
    banner.appendChild(title);
    banner.appendChild(document.createTextNode(" "));

    const body = document.createElement("span");
    if (!hasHistory) {
      body.textContent = "You have not taken any quizzes yet, so I am starting you at a beginner level. Take a quiz in the Quiz section and I will adapt to your strengths and weak spots.";
    } else {
      const parts = [];
      parts.push("You have completed " + attempts + " quiz question" + (attempts === 1 ? "" : "s") + ".");
      if (weakTopics.length) {
        parts.push(" I noticed you may want more practice on: " + weakTopics.map(function (t) { return t.label || t.topic; }).join(", ") + ".");
      } else {
        parts.push(" Great baseline - no weak spots stood out yet.");
      }
      if (recommendedLevel) {
        parts.push(" I recommend the " + recommendedLevel + " level.");
      }
      body.textContent = parts.join(" ");
    }
    banner.appendChild(body);

    // Quick difficulty override chip
    const actionWrap = document.createElement("div");
    actionWrap.className = "tutor-personalization-actions";
    const overrideLabel = document.createElement("span");
    overrideLabel.style.marginRight = "0.5rem";
    overrideLabel.textContent = "Switch level: ";
    actionWrap.appendChild(overrideLabel);

    ["beginner", "intermediate", "advanced"].forEach(function (lv) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tutor-difficulty-btn";
      btn.textContent = lv.charAt(0).toUpperCase() + lv.slice(1);
      btn.addEventListener("click", function () {
        setDifficulty(lv);
      });
      actionWrap.appendChild(btn);
    });
    banner.appendChild(actionWrap);

    banner.hidden = false;
  }

  /* ---------- Conversation loading ---------- */

  async function loadConversation() {
    try {
      const res = await fetch("/api/tutor/conversation", { credentials: "include" });
      if (!res.ok) {
        // not signed in or error -> show auth gate
        showAuthGate(true);
        return;
      }
      const data = await res.json().catch(function () { return null; });
      if (!data || !data.conversation) {
        // no conversation yet -> start one silently
        await startNewConversationSilent();
        return;
      }
      sessionConversationId = data.conversation.id || null;
      applyConversation(data);
    } catch (e) {
      console.warn("tutor: failed to load conversation", e);
    }
  }

  function applyConversation(data) {
    const conv = data.conversation;
    const p = data.personalization || {};
    const prompts = data.suggestedPrompts || null;

    // Personalization banner
    renderPersonalization(p);

    // Difficulty from conversation (if set)
    if (conv && conv.difficulty && ["beginner", "intermediate", "advanced"].indexOf(conv.difficulty) !== -1) {
      setDifficulty(conv.difficulty, true);
    }

    // Suggested prompts
    if (prompts) renderSuggestions(prompts);

    // Render existing messages
    if (conv && conv.messages && conv.messages.length) {
      conv.messages.forEach(function (m) {
        if (m.role === "user" && m.text) {
          addUserMessage(m.text);
        } else if (m.role === "model" && m.text) {
          const modelBubble = addModelMessage(m.text);
          // Re-apply structured blocks for stored messages, matching the live renderReplyBlocks layout:
          // topic + safety tags inside the bubble, structured blocks (takeaways/followUps/practice/notice)
          // inside the bubble, difficulty badge as a flex sibling of the bubble.
          const wrap = modelBubble.parentNode; // the .ai-chat-msg wrapper
          if (m.topic) {
            const tag = topicTag(m.topic, m.topicLabel);
            modelBubble.insertBefore(tag, modelBubble.firstChild);
          }
          if (m.safety === "redirected") {
            const tag = safetyTag(m.safety);
            if (tag) modelBubble.appendChild(tag);
          }
          const blocks = [];
          if (m.keyTakeaways && m.keyTakeaways.length) {
            blocks.push({ label: "Key takeaways", items: m.keyTakeaways });
          }
          if (m.followUps && m.followUps.length) {
            blocks.push({ label: "Follow-up questions you can ask", items: m.followUps, chips: true });
          }
          if (blocks.length) {
            const structure = document.createElement("div");
            structure.className = "tutor-structure";
            blocks.forEach(function (blk) {
              const block = document.createElement("div");
              const label = document.createElement("div");
              label.className = "tutor-section-label";
              label.textContent = blk.label;
              block.appendChild(label);
              if (blk.chips) {
                const chipWrap = document.createElement("div");
                chipWrap.className = "tutor-follow-ups";
                blk.items.forEach(function (q) {
                  const c = document.createElement("button");
                  c.type = "button";
                  c.className = "ai-suggestion";
                  c.textContent = q;
                  c.setAttribute("aria-label", "Ask: " + q);
                  c.addEventListener("click", function () { el.input.value = q; el.input.focus(); });
                  chipWrap.appendChild(c);
                });
                block.appendChild(chipWrap);
              } else {
                const ul = document.createElement("ul");
                ul.className = "tutor-key-takeaways";
                blk.items.forEach(function (t) {
                  const li = document.createElement("li");
                  li.innerHTML = AI.renderMarkdown(t);
                  ul.appendChild(li);
                });
                block.appendChild(ul);
              }
              structure.appendChild(block);
            });
            modelBubble.appendChild(structure);
          }
          if (m.practice && m.practice.page) {
            const tag = practiceTag(m.practice);
            if (tag) {
              const block = document.createElement("div");
              block.appendChild(tag);
              modelBubble.appendChild(block);
            }
          }
          if (m.notice) {
            const p = document.createElement("p");
            p.style.marginTop = "0.5rem";
            p.style.fontSize = "0.82rem";
            p.style.color = "var(--color-text-muted)";
            p.innerHTML = AI.renderMarkdown(m.notice);
            modelBubble.appendChild(p);
          }
          // difficulty badge as flex sibling of the bubble
          if (m.difficulty) {
            const diffTag = document.createElement("span");
            diffTag.className = "tutor-diff-tag";
            diffTag.textContent = m.difficulty.replace(/^\w/, function (c) { return c.toUpperCase(); });
            wrap.appendChild(diffTag);
          }
        }
      });
      // show conversation header
      el.conversationHeader.hidden = false;
      el.conversationTitle.textContent = conv.title || "Conversation";
    } else {
      // empty conversation -> greeting
      el.conversationHeader.hidden = false;
      el.conversationTitle.textContent = conv && conv.title ? conv.title : "Conversation";
      addModelMessage(GREETING);
    }

    // show chat UI
    showChatUI(true);
  }

  async function startNewConversationSilent() {
    try {
      const res = await fetch("/api/tutor/conversation", { method: "POST", credentials: "include" });
      if (!res.ok) return;
      const data = await res.json().catch(function () { return null; });
      if (data && data.conversation) {
        sessionConversationId = data.conversation.id || null;
        applyConversation(data);
      }
    } catch (e) {
      console.warn("tutor: failed to start conversation", e);
    }
  }

  /* ---------- UI state ---------- */

  async function showAuthGate(show) {
    if (!el.authGate) return;
    el.authGate.style.display = show ? "block" : "none";
    if (show) {
      const email = await userEmail();
      if (email) {
        el.signinBtn.style.display = "none";
        el.authGate.querySelector("p").textContent = "You are signed in as " + AI.escapeHtml(email) + ". Refresh to load your conversation.";
      } else {
        el.signinBtn.style.display = "inline-block";
      }
    }
  }

  function showChatUI(show) {
    if (el.chatCard) el.chatCard.style.display = show ? "block" : "none";
    if (el.difficultyRow) el.difficultyRow.style.display = show ? "block" : "none";
    if (show) {
      el.suggestions.style.display = "";
    }
  }

  function setDifficulty(value) {
    difficulty = (["beginner", "intermediate", "advanced"].indexOf(value) !== -1) ? value : "beginner";
    el.difficultyBtns.forEach(function (btn) {
      const active = btn.getAttribute("data-difficulty") === difficulty;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  /* ---------- Send flow ---------- */

  async function send() {
    const message = (el.input.value || "").trim();
    if (!message || busy) return;
    if (message.length > 4000) {
      addErrorMessage("That question is too long. Please trim it to 4000 characters or fewer.");
      return;
    }

    el.input.value = "";
    addUserMessage(message);
    setBusy(true);

    const loadingBubble = addModelMessage(AI.loadingHtml("Thinking"));

    try {
      const data = await AI.request("/api/ai/tutor", {
        message: message,
        difficulty: difficulty,
      });

      // Remove loading bubble
      const lb = loadingBubble && loadingBubble.parentNode;
      if (lb) lb.remove();

      // If API returned no reply (should not happen, but be safe)
      if (!data || !data.reply) {
        addErrorMessage("The tutor did not return an answer. Please try again.");
        return;
      }

      // data.reply already rendered into addModelMessage above via AI.renderMarkdown?
      // No - we called addModelMessage(AI.loadingHtml(...)) for loading; we need to
      // render the actual reply. But we already removed the loading bubble.
      // So: render the reply into a new model message, then apply structured blocks.
      const modelMsg = addModelMessage(data.reply);
      // Attach structured blocks to this message
      // (renderReplyBlocks expects lastMsg to be the model bubble we just added)
      renderReplyBlocks(data);

      // Persist local conversation id from response if provided
      if (data.conversationId) sessionConversationId = data.conversationId;

    } catch (err) {
      const lb = loadingBubble && loadingBubble.parentNode;
      if (lb) lb.remove();
      addErrorMessage(err.message || "The tutor is unavailable. Please try again.");
      el.input.value = message; // give the question back so they can retry
    } finally {
      setBusy(false);
      el.input.focus();
    }
  }

  function setBusy(isBusy) {
    busy = isBusy;
    if (el.sendBtn) {
      el.sendBtn.disabled = isBusy;
      el.sendBtn.innerHTML = isBusy
        ? '<span class="ai-spinner" aria-hidden="true"></span>Thinking'
        : "Send";
    }
  }

  async function clearConversation() {
    if (busy) return;
    try {
      const res = await fetch("/api/tutor/conversation", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        addErrorMessage("Could not clear the conversation. Please try again.");
        return;
      }
      // Reload to get a fresh empty conversation
      el.chatWindow.innerHTML = "";
      await loadConversation();
    } catch (e) {
      addErrorMessage("Could not clear the conversation. Please try again.");
    }
  }

  async function newConversation() {
    if (busy) return;
    el.chatWindow.innerHTML = "";
    el.conversationHeader.hidden = true;
    await startNewConversationSilent();
  }

  /* ---------- Events ---------- */

  if (el.sendBtn) {
    el.sendBtn.addEventListener("click", send);
  }

  if (el.input) {
    el.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  if (el.sendBtn) {
    // Also allow Ctrl+Enter from anywhere
  }

  if (el.newChatBtn) el.newChatBtn.addEventListener("click", newConversation);
  if (el.clearBtn) el.clearBtn.addEventListener("click", clearConversation);

  if (el.difficultyBtns && el.difficultyBtns.length) {
    el.difficultyBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setDifficulty(btn.getAttribute("data-difficulty") || "beginner");
      });
    });
  }

  if (el.signinBtn) {
    el.signinBtn.addEventListener("click", function () {
      // Redirect to login page; on return, page reload will pick up session.
      window.location.href = "login.html";
    });
  }

  /* ---------- Init ---------- */

  async function init() {
    // Check auth first; if signed in, load conversation + personalization.
    const signedIn = await isSignedIn();
    if (signedIn) {
      showChatUI(true);
      showAuthGate(false);
      el.difficultyRow.style.display = "block";
      loadConversation().catch(function () {});
    } else {
      showAuthGate(true);
      showChatUI(false);
      if (el.signinBtn) el.signinBtn.style.display = "inline-block";
    }
  }
  init().catch(function (e) { console.warn("tutor init error", e); });
})();
