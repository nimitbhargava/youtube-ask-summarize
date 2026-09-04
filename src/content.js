/**
 * YouTube 1-Click Ask Summarizer
 * Automates YouTube's native "Ask about this video" Gemini modal in 1 click.
 */
(() => {
  'use strict';

  const BUTTON_ID = 'yt-ask-summarize-btn';
  const OVERLAY_BUTTON_ID = 'yt-ask-video-overlay-btn';
  const ATTR_INJECTED = 'data-yt-ask-injected';

  // Default configuration
  let settings = {
    showVideoOverlay: true,
    showButton: false, // Default false: button will not be added to action bar
    exitTheaterOnSummarize: true,
    pauseOnSummarize: false, // Default false: clicking summarize will NOT pause the video
    autoClickOnAsk: true,
    autoSummarizeOnLoad: false,
    userExplicitlyEnabledActionBar: false,
    userExplicitlyEnabledPause: false,
  };

  let currentVideoId = null;
  let hasAutoSummarizedThisVideo = false;
  let isSummarizing = false;
  let nativeAskClickArmed = false;

  // Load user settings from chrome.storage
  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(settings, (items) => {
        // Keep action bar button false unless explicitly turned on
        if (!items.userExplicitlyEnabledActionBar) {
          items.showButton = false;
        }
        // Keep auto-pause false unless explicitly turned on
        if (!items.userExplicitlyEnabledPause) {
          items.pauseOnSummarize = false;
        }
        settings = { ...settings, ...items };
        updateButtonVisibility();
      });
    }
  }

  // Normalize string for fuzzy matching
  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Check if an element is visible in the viewport
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Dispatches a single, clean user-like click event sequence on a specific target.
   * Explicitly safeguards against clicking any Close/Dismiss buttons or header buttons!
   */
  function clickSingleElement(el) {
    if (!el || !el.isConnected) return false;

    // Safety guard: NEVER click close, dismiss, or panel header buttons!
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    if (
      aria.includes('close') ||
      title.includes('close') ||
      aria.includes('dismiss') ||
      el.classList.contains('close-button') ||
      el.closest('#visibility-button') ||
      el.closest('ytd-engagement-panel-title-header-renderer') ||
      el.closest('#dismiss-button')
    ) {
      console.warn('[yt-ask-summarize] Blocked attempt to click Close/Dismiss button!', el);
      return false;
    }

    try { el.focus?.(); } catch (e) {}

    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: 1,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    };

    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mousedown', eventInit));
      el.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
      if (typeof el.click === 'function') {
        el.click();
      } else {
        el.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 }));
      }
    } catch (err) {
      console.warn('click error:', err);
    }

    return true;
  }

  // Get current YouTube video ID from URL
  function getVideoId() {
    const url = new URL(location.href);
    if (url.pathname === '/watch') {
      return url.searchParams.get('v');
    }
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2];
    }
    return null;
  }

  // --- Theater & Layout Management -----------------------------------------

  /**
   * Detect if YouTube is currently in Theater Mode
   */
  function isTheaterMode() {
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy && watchFlexy.hasAttribute('theater')) return true;

    const sizeBtn = document.querySelector('button.ytp-size-button');
    if (sizeBtn) {
      const aria = (sizeBtn.getAttribute('aria-label') || '').toLowerCase();
      const title = (sizeBtn.getAttribute('title') || '').toLowerCase();
      if (aria.includes('default view') || title.includes('default view')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Exits theater mode so YouTube returns to default view,
   * where the Ask/Summarize chat panel opens directly side-by-side next to the video.
   */
  async function exitTheaterMode() {
    if (!isTheaterMode()) return false;

    const sizeBtn = document.querySelector('button.ytp-size-button');
    if (sizeBtn) {
      sizeBtn.click();
    } else {
      const player = document.querySelector('#movie_player') || document.body;
      player.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', keyCode: 84, bubbles: true }));
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    return true;
  }

  /**
   * Exits fullscreen if active
   */
  function exitFullscreen() {
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen();
      } catch (e) {}
    }
  }

  /**
   * Pauses the video playback
   */
  function pauseVideo() {
    const video = document.querySelector('video');
    if (video && !video.paused) {
      video.pause();
    }
  }

  // --- Detection Strategies ------------------------------------------------

  /**
   * Finds YouTube's native "Ask" button on the watch page.
   */
  function findAskButton() {
    const containerSelectors = [
      '#top-row ytd-menu-renderer',
      'ytd-watch-metadata #actions',
      '#actions-inner',
      '#top-level-buttons-computed',
      'yt-flexible-actions-view-model',
      '#flexible-item-buttons',
      '#menu.ytd-watch-metadata',
      'ytd-menu-renderer[menu-active]',
      'ytd-watch-metadata',
      '#above-the-fold',
    ];

    let candidates = [];
    for (const sel of containerSelectors) {
      const container = document.querySelector(sel);
      if (container) {
        const btns = container.querySelectorAll(
          'button, ytd-button-renderer, yt-button-view-model, [role="button"], yt-chip-cloud-chip-renderer'
        );
        candidates.push(...Array.from(btns));
      }
    }

    if (candidates.length < 5) {
      document.querySelectorAll('ytd-watch-metadata, ytd-menu-renderer').forEach((root) => {
        if (root.shadowRoot) {
          candidates.push(...Array.from(root.shadowRoot.querySelectorAll('button, [role="button"]')));
        }
      });
    }

    for (const el of candidates) {
      if (!isVisible(el)) continue;

      if (el.id === BUTTON_ID || el.closest('#' + BUTTON_ID) || el.id === OVERLAY_BUTTON_ID) continue;

      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const text = normalize(el.textContent);

      if (/like|dislike|share|download|clip|save|thanks|remix|subscribe|comments|notebooklm/i.test(aria + ' ' + title + ' ' + text)) {
        continue;
      }
      if (el.id === 'search-button' || el.id === 'voice-search-button') {
        continue;
      }

      const isAskText =
        text === 'ask' ||
        text.startsWith('ask ') ||
        text === 'ask ai' ||
        text === 'ask gemini' ||
        text === 'ask about this video' ||
        text.includes('ask about this video');

      const isAskAria =
        aria === 'ask' ||
        aria.includes('ask about this video') ||
        aria.includes('ask about video') ||
        aria.includes('ask ai') ||
        aria.includes('ask gemini') ||
        aria.startsWith('ask ');

      const isAskTitle = title === 'ask' || title.includes('ask about this video');

      if (isAskText || isAskAria || isAskTitle) {
        return el;
      }
    }

    return null;
  }

  /**
   * Checks if the Ask button is hidden inside YouTube's "..." (More actions) overflow menu.
   */
  async function findAskInOverflowMenu() {
    const moreBtn = document.querySelector(
      'ytd-menu-renderer button[aria-label="More actions"], ytd-menu-renderer [aria-label*="More" i], button[aria-label="More actions"], yt-icon-button[aria-label="More actions"], ytd-menu-renderer #button'
    );
    if (!moreBtn) return null;

    let popup = document.querySelector('ytd-menu-popup-renderer, tp-yt-iron-dropdown:not([aria-hidden="true"])');
    let openedByUs = false;

    if (!popup || !isVisible(popup)) {
      clickSingleElement(moreBtn);
      openedByUs = true;
      await new Promise((resolve) => setTimeout(resolve, 250));
      popup = document.querySelector('ytd-menu-popup-renderer, tp-yt-iron-dropdown');
    }

    if (popup) {
      const items = popup.querySelectorAll(
        'ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model, button, [role="menuitem"]'
      );
      for (const item of items) {
        const txt = normalize(item.textContent);
        const aria = (item.getAttribute('aria-label') || '').toLowerCase();
        if (txt.includes('ask') || aria.includes('ask')) {
          return item;
        }
      }

      if (openedByUs) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
    }

    return null;
  }

  /**
   * Finds the "Ask about this video" modal or engagement panel.
   */
  function findAskModal() {
    const candidates = document.querySelectorAll(
      'ytd-engagement-panel-section-list-renderer, tp-yt-paper-dialog, [role="dialog"], ytd-popup-container, yt-sheet-view-model, div[class*="conversational"], div[class*="panel"]'
    );

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = normalize(el.textContent);
      if (text.includes('ask about this video') || text.includes('ask gemini')) {
        return el;
      }
    }

    const headings = document.querySelectorAll('h1, h2, h3, h4, [role="heading"], yt-formatted-string');
    for (const h of headings) {
      if (!isVisible(h)) continue;
      const t = normalize(h.textContent);
      if (t === 'ask about this video' || t.startsWith('ask about this video')) {
        return h.closest(
          'ytd-engagement-panel-section-list-renderer, tp-yt-paper-dialog, [role="dialog"], ytd-popup-container, div[class*="panel"], div[id*="panel"]'
        ) || h.parentElement.parentElement;
      }
    }

    return null;
  }

  /**
   * Finds the "Summarize the video" chip or prompt button inside the Ask modal.
   * Specifically targets initial suggestion chips, avoiding any chat history bubbles.
   */
  function findSummarizeChip(modal) {
    if (!modal) return null;

    // First: Look inside chip clouds or suggestion containers
    const chipContainers = modal.querySelectorAll(
      'yt-chip-cloud-chip-renderer, ytd-chip-cloud-chip-renderer, [class*="chip-cloud"], [class*="suggestion-chip"], [class*="prompt-chip"]'
    );
    for (const chipEl of chipContainers) {
      if (!isVisible(chipEl)) continue;
      const text = normalize(chipEl.textContent);
      const aria = normalize(chipEl.getAttribute('aria-label'));
      if (text.includes('summarize') || aria.includes('summarize')) {
        return chipEl.querySelector('button, [role="button"], #chip') || chipEl;
      }
    }

    // Second: General search among buttons (excluding header, close, send, or message turns)
    const buttons = modal.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;

      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();

      if (
        aria.includes('close') ||
        title.includes('close') ||
        aria.includes('dismiss') ||
        aria.includes('send') ||
        btn.closest('ytd-engagement-panel-title-header-renderer') ||
        btn.closest('#visibility-button') ||
        btn.closest('#dismiss-button') ||
        btn.closest('form, [class*="input"], [class*="footer"]')
      ) {
        continue;
      }

      const text = normalize(btn.textContent);
      const isSummarize =
        text === 'summarize the video' ||
        text === 'summarize this video' ||
        text === 'summarize video' ||
        text === 'summarize' ||
        aria === 'summarize the video' ||
        aria.includes('summarize');

      if (isSummarize) {
        return btn.querySelector('#chip, yt-formatted-string, span') || btn;
      }
    }

    return null;
  }

  /**
   * Checks if the summary prompt has already been submitted and is currently being processed by Gemini.
   */
  function isPromptSubmitted(modal) {
    if (!modal) return false;

    // 1. Loading indicators: gear / spinner / shimmer / skeleton
    const spinners = modal.querySelectorAll(
      'tp-yt-paper-spinner, tp-yt-paper-spinner-lite, [class*="loading"], [class*="spinner"], [class*="shimmer"], [class*="skeleton"], svg[class*="spin"], [class*="loading-indicator"]'
    );
    for (const s of spinners) {
      if (isVisible(s)) return true;
    }

    // 2. Chat history turn / message bubble (e.g. user bubble "Summarize the video")
    const chatTurns = modal.querySelectorAll(
      'ytd-conversational-ai-turn-renderer, ytd-conversational-ai-message-renderer, [class*="chat-turn"], [class*="message-bubble"], [class*="user-turn"]'
    );
    if (chatTurns.length > 0) return true;

    // 3. If summary has already started streaming
    if (hasSummaryStarted(modal)) return true;

    return false;
  }

  /**
   * Checks if the summary response has arrived and started streaming or completed.
   */
  function hasSummaryStarted(modal) {
    if (!modal) return false;
    const text = normalize(modal.textContent);

    const summaryPhrases = [
      'key takeaways',
      'key highlights',
      'keys to success',
      'this video outlines',
      'this video explores',
      'this video argues',
      'this video covers',
      'this video discusses',
      'this video is about',
      'this video explains',
      'heres a summary',
      'here is a summary',
      'summary of the video',
      'summary:',
      'main points',
      'overview',
      'takeaways',
    ];

    for (const phrase of summaryPhrases) {
      if (text.includes(phrase)) return true;
    }

    // Check if there is an assistant response container with text
    const botMessages = modal.querySelectorAll(
      'ytd-conversational-ai-response-renderer, [class*="response-container"], [class*="bot-message"], [class*="assistant-message"]'
    );
    for (const m of botMessages) {
      if (isVisible(m) && m.textContent.trim().length > 30) {
        return true;
      }
    }

    // If modal text has substantial content beyond the initial static greetings
    if (text.includes('summarize the video') && text.length > 280) {
      // Ensure it's not just static text by checking for bullets or absence of loading spinner
      if (text.includes('•') || text.includes('- ') || text.includes('1.') || !modal.querySelector('tp-yt-paper-spinner, [class*="spinner"], [class*="skeleton"]')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Fallback: Safely submits "Summarize the video" into the chat input without ever touching the Close button.
   */
  function fallbackInputSummarize(modal) {
    if (!modal) return false;

    const input = modal.querySelector(
      'input[placeholder*="question" i], textarea[placeholder*="question" i], [contenteditable="true"]'
    );
    if (!input) return false;

    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      input.focus();
      input.value = 'Summarize the video';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable) {
      input.focus();
      input.innerText = 'Summarize the video';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Trigger Enter key submission
    setTimeout(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

      // Look for send button strictly adjacent to input, never from modal root
      const inputContainer = input.closest('form, div[class*="input"], div[class*="footer"]') || input.parentElement;
      if (inputContainer && inputContainer !== modal) {
        const sendBtn = Array.from(inputContainer.querySelectorAll('button')).find((b) => {
          const bAria = (b.getAttribute('aria-label') || '').toLowerCase();
          const bTitle = (b.getAttribute('title') || '').toLowerCase();
          return !bAria.includes('close') && !bTitle.includes('close') && !b.closest('ytd-engagement-panel-title-header-renderer');
        });
        if (sendBtn) {
          clickSingleElement(sendBtn);
        }
      }
    }, 200);

    return true;
  }

  // --- Automation Flow -----------------------------------------------------

  /**
   * Executes the 1-click summarize process:
   * 1. Exits theater mode so chat displays side-by-side.
   * 2. Auto-pauses the video if option is enabled.
   * 3. Opens Ask panel if not open.
   * 4. Waits for modal animation to settle and clicks "Summarize the video".
   */
  async function triggerSummarize() {
    if (isSummarizing) return;
    isSummarizing = true;

    setButtonsLoading();

    // Step A: Exit fullscreen if needed
    exitFullscreen();

    // Step B: If in theater mode and option enabled, toggle to default mode
    if (settings.exitTheaterOnSummarize && isTheaterMode()) {
      await exitTheaterMode();
    }

    // Step C: Auto-pause the video if option enabled
    if (settings.pauseOnSummarize) {
      pauseVideo();
    }

    // Step D: Smoothly scroll to top so the video player & side panel are aligned
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Step 1: Check if Ask modal is already open
    const openModal = findAskModal();
    if (openModal) {
      attemptClickSummarize(openModal);
      return;
    }

    // Step 2: Modal not open, find native Ask button
    let askBtn = findAskButton();

    // Step 2b: If not directly visible, check if it's in the overflow "..." menu
    if (!askBtn) {
      askBtn = await findAskInOverflowMenu();
    }

    if (!askBtn) {
      showTemporaryToast("YouTube's 'Ask' feature is not available for this video.");
      resetSummarizeButtons();
      isSummarizing = false;
      return;
    }

    nativeAskClickArmed = true;
    const clickTarget = askBtn.querySelector('button') || askBtn;
    clickSingleElement(clickTarget);

    // Step 3: Wait for modal to open and animate in, then click chip
    waitForModalAndClick();
  }

  let activeModalInterval = null;

  function waitForModalAndClick() {
    // Prevent duplicate intervals
    if (activeModalInterval) {
      clearInterval(activeModalInterval);
      activeModalInterval = null;
    }

    const startTime = Date.now();
    const timeoutMs = 15000;
    let hasClickedChip = false;
    let modalMountedTime = null;

    activeModalInterval = setInterval(() => {
      const modal = findAskModal();
      if (modal) {
        if (!modalMountedTime) {
          modalMountedTime = Date.now();
        }

        // Check if summary has started streaming or completed
        if (hasSummaryStarted(modal)) {
          clearInterval(activeModalInterval);
          activeModalInterval = null;
          onSummarizeSuccess();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // If the prompt is ALREADY submitted and currently loading/generating,
        // DO NOT CLICK ANYTHING! Just wait for the summary to arrive!
        if (isPromptSubmitted(modal)) {
          return;
        }

        const now = Date.now();

        // Wait 400ms after modal mounts for animation & hydration to settle
        if (now - modalMountedTime > 400 && !hasClickedChip) {
          const chip = findSummarizeChip(modal);
          if (chip) {
            hasClickedChip = true;
            clickSingleElement(chip);
            return;
          }
        }

        // If still not submitted after 2.5s, try finding chip again
        if (now - modalMountedTime > 2500 && !hasClickedChip) {
          const chip = findSummarizeChip(modal);
          if (chip) {
            hasClickedChip = true;
            clickSingleElement(chip);
            return;
          }
        }

        // Fallback to chat input only after 5s if chip still wasn't found
        if (now - modalMountedTime > 5000 && !hasClickedChip) {
          hasClickedChip = true;
          fallbackInputSummarize(modal);
        }
      }

      if (Date.now() - startTime > timeoutMs) {
        clearInterval(activeModalInterval);
        activeModalInterval = null;
        resetSummarizeButtons();
        isSummarizing = false;
      }
    }, 200);
  }

  function attemptClickSummarize(modal) {
    if (hasSummaryStarted(modal)) {
      onSummarizeSuccess();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (isPromptSubmitted(modal)) {
      waitForModalAndClick();
      return;
    }

    const chip = findSummarizeChip(modal);
    if (chip) {
      clickSingleElement(chip);
    }
    waitForModalAndClick();
  }

  function setButtonsLoading() {
    const buttons = [document.getElementById(BUTTON_ID), document.getElementById(OVERLAY_BUTTON_ID)].filter(Boolean);
    for (const btn of buttons) {
      btn.classList.add('yt-ask-loading');
      btn.innerHTML = `
        <svg class="yt-ask-icon" viewBox="0 0 24 24">
          <path d="M12 2v2a8 8 0 1 1-8 8H2C2 6.48 6.48 2 12 2z"/>
        </svg>
        <span>Summarizing...</span>
      `;
    }
  }

  function onSummarizeSuccess() {
    const buttons = [document.getElementById(BUTTON_ID), document.getElementById(OVERLAY_BUTTON_ID)].filter(Boolean);
    for (const btn of buttons) {
      btn.classList.remove('yt-ask-loading');
      btn.classList.add('yt-ask-success');
      btn.innerHTML = `
        <svg class="yt-ask-icon" viewBox="0 0 24 24" style="fill: currentColor;">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>Summarized!</span>
      `;
    }

    setTimeout(() => {
      resetSummarizeButtons();
      isSummarizing = false;
    }, 2500);
  }

  function resetSummarizeButtons() {
    const buttons = [document.getElementById(BUTTON_ID), document.getElementById(OVERLAY_BUTTON_ID)].filter(Boolean);
    for (const btn of buttons) {
      btn.classList.remove('yt-ask-loading', 'yt-ask-success');
      btn.innerHTML = `
        <svg class="yt-ask-icon" viewBox="0 0 24 24">
          <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
        </svg>
        <span>Summarize</span>
      `;
    }
  }

  // --- Button Construction & Injection -------------------------------------

  /**
   * On-Video Overlay Button (Top Right of Player)
   */
  function createVideoOverlayButton() {
    const btn = document.createElement('div');
    btn.id = OVERLAY_BUTTON_ID;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.title = 'Summarize video in 1 click (via YouTube Ask)';
    btn.innerHTML = `
      <svg class="yt-ask-icon" viewBox="0 0 24 24">
        <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
      </svg>
      <span>Summarize</span>
    `;

    // Stop player-level events from bubbling up to #movie_player
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'].forEach((evType) => {
      btn.addEventListener(evType, (e) => {
        e.stopPropagation();
      });
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerSummarize();
    });

    return btn;
  }

  function injectVideoOverlayButton() {
    if (!settings.showVideoOverlay) return;
    if (!getVideoId()) return;

    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (!player) return;

    const existing = document.getElementById(OVERLAY_BUTTON_ID);
    if (existing && player.contains(existing)) {
      return;
    }
    if (existing) {
      existing.remove();
    }

    const btn = createVideoOverlayButton();
    player.appendChild(btn);
  }

  /**
   * Action Bar Pill Button (Under Video)
   */
  function createActionBarButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.title = 'Summarize video in 1 click (via YouTube Ask)';
    btn.setAttribute('aria-label', 'Summarize video in 1 click');
    btn.innerHTML = `
      <svg class="yt-ask-icon" viewBox="0 0 24 24">
        <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
      </svg>
      <span>Summarize</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerSummarize();
    });

    return btn;
  }

  function findActionBarContainer() {
    const candidates = [
      document.querySelector('#top-level-buttons-computed'),
      document.querySelector('yt-flexible-actions-view-model'),
      document.querySelector('#flexible-item-buttons'),
      document.querySelector('ytd-watch-metadata #actions #actions-inner'),
      document.querySelector('#actions-inner #menu ytd-menu-renderer'),
      document.querySelector('ytd-watch-metadata #actions'),
      document.querySelector('#top-row #actions'),
    ];

    for (const c of candidates) {
      if (c && isVisible(c)) return c;
    }
    return candidates.find((c) => !!c) || null;
  }

  function attachAskButtonListener(askBtn) {
    if (!askBtn || askBtn.hasAttribute(ATTR_INJECTED)) return;
    askBtn.setAttribute(ATTR_INJECTED, 'true');
    askBtn.addEventListener('click', () => {
      if (settings.autoClickOnAsk) {
        // If Ask modal is already open, clicking native Ask toggles it closed!
        if (findAskModal()) {
          return;
        }
        nativeAskClickArmed = true;
        waitForModalAndClick();
      }
    });
  }

  function injectActionBarButton() {
    if (!settings.showButton) {
      const existing = document.getElementById(BUTTON_ID);
      if (existing) existing.remove();
      return;
    }
    if (document.getElementById(BUTTON_ID)) return;
    if (!getVideoId()) return;

    const askBtn = findAskButton();
    if (askBtn) {
      attachAskButtonListener(askBtn);
      const wrapper = askBtn.closest('ytd-button-renderer, yt-button-view-model') || askBtn;
      const parent = wrapper.parentElement;
      if (parent) {
        const btn = createActionBarButton();
        parent.insertBefore(btn, wrapper);
        checkAutoSummarize();
        return;
      }
    }

    const container = findActionBarContainer();
    if (container) {
      const btn = createActionBarButton();

      const shareBtn = container.querySelector(
        '[aria-label*="share" i], [title*="share" i], ytd-button-renderer:has([aria-label*="share" i])'
      );

      if (shareBtn) {
        const wrapper = shareBtn.closest('ytd-button-renderer, yt-button-view-model') || shareBtn;
        wrapper.parentElement?.insertBefore(btn, wrapper);
      } else {
        container.appendChild(btn);
      }

      checkAutoSummarize();
    }
  }

  function injectAllButtons() {
    injectVideoOverlayButton();
    injectActionBarButton();

    if (settings.autoClickOnAsk) {
      const askBtn = findAskButton();
      if (askBtn) attachAskButtonListener(askBtn);
    }
  }

  function checkAutoSummarize() {
    if (settings.autoSummarizeOnLoad && !hasAutoSummarizedThisVideo) {
      hasAutoSummarizedThisVideo = true;
      setTimeout(() => {
        triggerSummarize();
      }, 1200);
    }
  }

  function updateButtonVisibility() {
    const overlayBtn = document.getElementById(OVERLAY_BUTTON_ID);
    if (!settings.showVideoOverlay && overlayBtn) {
      overlayBtn.remove();
    } else if (settings.showVideoOverlay && !overlayBtn) {
      injectVideoOverlayButton();
    }

    const barBtn = document.getElementById(BUTTON_ID);
    if (!settings.showButton && barBtn) {
      barBtn.remove();
    } else if (settings.showButton && !barBtn) {
      injectActionBarButton();
    }
  }

  // --- Temporary Toast Feedback --------------------------------------------
  function showTemporaryToast(message) {
    const existing = document.getElementById('yt-ask-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'yt-ask-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f1f23;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 20px;
      font-family: Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 9999999;
      box-shadow: 0 6px 20px rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.15);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.2s ease;
    `;

    toast.innerHTML = `
      <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:#ff4b4b;flex-shrink:0;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  // --- Lifecycle & SPA Navigation ------------------------------------------

  function onVideoChange() {
    const vid = getVideoId();
    if (vid !== currentVideoId) {
      currentVideoId = vid;
      hasAutoSummarizedThisVideo = false;
      isSummarizing = false;
      nativeAskClickArmed = false;

      const existingBar = document.getElementById(BUTTON_ID);
      if (existingBar) existingBar.remove();

      const existingOverlay = document.getElementById(OVERLAY_BUTTON_ID);
      if (existingOverlay) existingOverlay.remove();

      scheduleScan();
    }
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      injectAllButtons();
    }, 150);
  }

  // --- Listeners -----------------------------------------------------------

  window.addEventListener('yt-navigate-finish', onVideoChange);
  window.addEventListener('yt-page-data-updated', scheduleScan);
  window.addEventListener('popstate', onVideoChange);
  window.addEventListener('resize', scheduleScan);

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }
      e.preventDefault();
      triggerSummarize();
    }
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'trigger_summarize') {
        triggerSummarize();
        sendResponse({ success: true });
      } else if (request.action === 'toggle_playback') {
        const video = document.querySelector('video');
        if (video) {
          if (video.paused) {
            video.play();
            sendResponse({ paused: false });
          } else {
            video.pause();
            sendResponse({ paused: true });
          }
        } else {
          sendResponse({ paused: true });
        }
      } else if (request.action === 'get_status') {
        const askBtn = findAskButton();
        const modal = findAskModal();
        const video = document.querySelector('video');
        sendResponse({
          isWatchPage: !!getVideoId(),
          askFound: !!askBtn,
          modalOpen: !!modal,
          inTheaterMode: isTheaterMode(),
          isPaused: video ? video.paused : true,
        });
      } else if (request.action === 'settings_updated') {
        loadSettings();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  // Initialize
  loadSettings();
  onVideoChange();

  const observer = new MutationObserver(() => {
    if (getVideoId()) {
      const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
      const existingOverlay = document.getElementById(OVERLAY_BUTTON_ID);
      if (!existingOverlay || (player && !player.contains(existingOverlay)) || !document.getElementById(BUTTON_ID)) {
        scheduleScan();
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  setInterval(() => {
    if (getVideoId()) {
      injectAllButtons();
    }
  }, 800);
})();
