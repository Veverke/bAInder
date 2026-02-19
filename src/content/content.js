/**
 * bAInder Content Script
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Injected into ChatGPT, Claude, and Gemini pages.
 * Detects platform, extracts chat content, injects "Save to bAInder" button.
 *
 * NOTE: Chrome content scripts cannot use ES module imports.
 * The extraction logic is inlined from src/content/chat-extractor.js.
 * When Vite bundling is added in a future stage this file will be the entry
 * point and will use `import` instead of the inline copies below.
 */

(function bAInderContentScript() {
  'use strict';

  // Prevent double-injection (e.g. if content script runs twice)
  if (window.__bAInderInjected) return;
  window.__bAInderInjected = true;

  // ─── Inlined extraction helpers (mirrors chat-extractor.js) ───────────────

  function detectPlatform(hostname) {
    if (!hostname || typeof hostname !== 'string') return null;
    const h = hostname.toLowerCase();
    if (h.includes('chat.openai.com'))    return 'chatgpt';
    if (h.includes('claude.ai'))          return 'claude';
    if (h.includes('gemini.google.com'))  return 'gemini';
    if (h.includes('copilot.microsoft.com')) return 'copilot';
    return null;
  }

  function sanitizeContent(input) {
    if (!input || typeof input !== 'string') return '';
    const stripped = input.replace(/<[^>]*>/g, ' ');
    const decoded = stripped
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    return decoded.replace(/\s+/g, ' ').trim();
  }

  function getTextContent(el) {
    if (!el) return '';
    return sanitizeContent(el.innerHTML || el.textContent || '');
  }

  function formatMessage(role, content) {
    return { role: role || 'unknown', content: (content || '').trim() };
  }

  function generateTitle(messages, url) {
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser && firstUser.content) {
      const text = firstUser.content.trim();
      if (text.length > 0) return text.length > 80 ? text.slice(0, 77) + '...' : text;
    }
    if (url) {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1];
        if (last && last !== 'c' && last.length > 3) return `Chat ${last.slice(0, 40)}`;
      } catch (_) { /* ignore */ }
    }
    return 'Untitled Chat';
  }

  function extractChatGPT(doc) {
    const messages = [];
    const turns = doc.querySelectorAll('article[data-testid^="conversation-turn"]');
    turns.forEach(turn => {
      const roleEl = turn.querySelector('[data-message-author-role]');
      if (!roleEl) return;
      const rawRole = roleEl.getAttribute('data-message-author-role') || '';
      const role = rawRole === 'user' ? 'user' : 'assistant';
      const contentEl =
        turn.querySelector('.markdown') ||
        turn.querySelector('[class*="prose"]') ||
        turn.querySelector('[class*="whitespace-pre"]') ||
        roleEl;
      const content = getTextContent(contentEl);
      if (content) messages.push(formatMessage(role, content));
    });
    if (messages.length === 0) {
      doc.querySelectorAll('[data-message-author-role]').forEach(el => {
        const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
        const content = getTextContent(el);
        if (content) messages.push(formatMessage(role, content));
      });
    }
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  function extractClaude(doc) {
    const messages = [];
    const humanTurns = Array.from(doc.querySelectorAll('[data-testid="human-turn"], .human-turn, .human-message'));
    const aiTurns    = Array.from(doc.querySelectorAll('[data-testid="ai-turn"], .ai-turn, .ai-message, .bot-turn'));
    const allTurns   = [
      ...humanTurns.map(el => ({ el, role: 'user' })),
      ...aiTurns.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    allTurns.forEach(({ el, role }) => {
      const content = getTextContent(el);
      if (content) messages.push(formatMessage(role, content));
    });
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  function extractGemini(doc) {
    const messages = [];
    const userEls  = Array.from(doc.querySelectorAll('.user-query-content, .query-text, [class*="user-query"]'));
    const modelEls = Array.from(doc.querySelectorAll('.model-response-text, .response-text, [class*="model-response"]'));
    const allEls   = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...modelEls.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    allEls.forEach(({ el, role }) => {
      const content = getTextContent(el);
      if (content) messages.push(formatMessage(role, content));
    });
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  function extractCopilot(doc) {
    const messages = [];
    const userEls    = Array.from(doc.querySelectorAll(
      '[data-testid="user-message"], .UserMessage, [class*="UserMessage"], [class*="user-message"]'
    ));
    const copilotEls = Array.from(doc.querySelectorAll(
      '[data-testid="copilot-message"], [data-testid="assistant-message"], ' +
      '[class*="CopilotMessage"], [class*="AssistantMessage"], [class*="copilot-message"]'
    ));
    const allEls = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...copilotEls.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    allEls.forEach(({ el, role }) => {
      const content = getTextContent(el);
      if (content) messages.push(formatMessage(role, content));
    });
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  function extractChat(platform, doc) {
    if (!platform) throw new Error('Platform is required');
    if (!doc)      throw new Error('Document is required');
    let result;
    switch (platform) {
      case 'chatgpt': result = extractChatGPT(doc); break;
      case 'claude':  result = extractClaude(doc);  break;
      case 'gemini':   result = extractGemini(doc);   break;
      case 'copilot':  result = extractCopilot(doc);  break;
      default: throw new Error(`Unsupported platform: ${platform}`);
    }
    return {
      platform,
      url:          doc.location.href,
      title:        result.title,
      messages:     result.messages,
      messageCount: result.messageCount,
      extractedAt:  Date.now()
    };
  }

  function prepareChatForSave(chatData) {
    if (!chatData) throw new Error('Chat data is required');
    const content = chatData.messages
      .map(m => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join('\n\n---\n\n');
    return {
      title:        chatData.title,
      content,
      url:          chatData.url,
      source:       chatData.platform,
      messageCount: chatData.messageCount,
      messages:     chatData.messages,
      metadata: { extractedAt: chatData.extractedAt, messageCount: chatData.messageCount }
    };
  }

  // ─── Button Injection ──────────────────────────────────────────────────────

  const BUTTON_ID = 'bAInder-save-btn';

  /**
   * Create the "Save to bAInder" button element.
   * @param {string} platform
   * @returns {HTMLButtonElement}
   */
  function createSaveButton(platform) {
    const btn = document.createElement('button');
    btn.id              = BUTTON_ID;
    btn.textContent     = '💾 Save to bAInder';
    btn.title           = 'Save this chat to bAInder';
    btn.setAttribute('aria-label', 'Save chat to bAInder');
    btn.setAttribute('data-platform', platform);

    // Floating button styles (no inline event handlers – CSP safe)
    Object.assign(btn.style, {
      position:     'fixed',
      bottom:       '80px',
      right:        '20px',
      zIndex:       '2147483647',
      background:   '#4f46e5',
      color:        '#fff',
      border:       'none',
      borderRadius: '8px',
      padding:      '10px 16px',
      fontSize:     '13px',
      fontWeight:   '600',
      cursor:       'pointer',
      boxShadow:    '0 4px 12px rgba(0,0,0,0.25)',
      transition:   'background 0.2s, transform 0.1s',
      fontFamily:   'system-ui, -apple-system, sans-serif',
      lineHeight:   '1.4'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#4338ca';
      btn.style.transform  = 'scale(1.03)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#4f46e5';
      btn.style.transform  = 'scale(1)';
    });

    btn.addEventListener('click', handleSaveClick);
    return btn;
  }

  /**
   * Inject the save button if not already present.
   * @param {string} platform
   */
  function injectSaveButton(platform) {
    if (document.getElementById(BUTTON_ID)) return; // already injected
    const btn = createSaveButton(platform);
    document.body.appendChild(btn);
    console.log(`bAInder: Save button injected for ${platform}`);
  }

  /** Remove the save button (called before reinject on SPA navigation). */
  function removeSaveButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  }

  // ─── Save Flow ─────────────────────────────────────────────────────────────

  /**
   * Temporarily change button text/style to give visual feedback.
   * @param {HTMLButtonElement} btn
   * @param {'loading'|'success'|'error'|'empty'|'default'} state
   */
  function setButtonState(btn, state) {
    if (!btn) return;
    const states = {
      loading: { text: '⏳ Saving...',      bg: '#6366f1', disabled: true  },
      success: { text: '✅ Saved!',          bg: '#16a34a', disabled: true  },
      error:   { text: '❌ Error',           bg: '#dc2626', disabled: true  },
      empty:   { text: '⚠️ No chat yet',    bg: '#d97706', disabled: false },
      default: { text: '💾 Save to bAInder', bg: '#4f46e5', disabled: false }
    };
    const s = states[state] || states.default;
    btn.textContent      = s.text;
    btn.style.background = s.bg;
    btn.disabled         = s.disabled;

    if (state === 'success' || state === 'error' || state === 'empty') {
      setTimeout(() => setButtonState(btn, 'default'), 2500);
    }
  }

  /**
   * Handle button click: extract → send to background → show feedback.
   */
  async function handleSaveClick() {
    const btn      = document.getElementById(BUTTON_ID);
    const platform = detectPlatform(window.location.hostname);
    if (!platform) return;

    setButtonState(btn, 'loading');

    try {
      const chatData    = extractChat(platform, document);

      if (chatData.messageCount === 0) {
        setButtonState(btn, 'empty');
        return;
      }

      const savePayload = prepareChatForSave(chatData);
      const response    = await sendMessage({ type: 'SAVE_CHAT', data: savePayload });

      if (response && response.success) {
        setButtonState(btn, 'success');
        console.log('bAInder: Chat saved successfully', response.data);
      } else {
        throw new Error((response && response.error) || 'Unknown error');
      }
    } catch (err) {
      setButtonState(btn, 'error');
      console.error('bAInder: Failed to save chat', err);
    }
  }

  // ─── Chrome Messaging ──────────────────────────────────────────────────────

  /**
   * Send a message to the background script and return the response promise.
   * @param {Object} msg
   * @returns {Promise<Object>}
   */
  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─── Incoming Message Handler ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const platform = detectPlatform(window.location.hostname);

    switch (message.type) {
      case 'EXTRACT_CHAT': {
        if (!platform) {
          sendResponse({ success: false, error: 'Not on a supported AI chat platform' });
          break;
        }
        try {
          const chatData = extractChat(platform, document);
          sendResponse({ success: true, data: prepareChatForSave(chatData) });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      case 'GET_PLATFORM': {
        sendResponse({ success: true, data: { platform } });
        break;
      }

      case 'PING': {
        sendResponse({ success: true, data: 'pong' });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
    }
  });

  // ─── SPA Navigation Observer ───────────────────────────────────────────────

  let lastUrl = document.location.href;

  function onUrlChange() {
    const currentUrl = document.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    console.log('bAInder: URL change detected, re-initialising');
    removeSaveButton();
    initContentScript();
  }

  const navObserver = new MutationObserver(onUrlChange);
  navObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree:   true
  });

  const _pushState    = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);
  history.pushState    = (...args) => { _pushState(...args);    onUrlChange(); };
  history.replaceState = (...args) => { _replaceState(...args); onUrlChange(); };
  window.addEventListener('popstate', onUrlChange);

  // ─── Initialisation ────────────────────────────────────────────────────────

  function initContentScript() {
    const platform = detectPlatform(window.location.hostname);
    if (!platform) {
      console.log('bAInder: Not on a supported AI chat platform');
      return;
    }
    console.log(`bAInder: Detected platform - ${platform}`);
    injectSaveButton(platform);
    console.log('bAInder: Content script ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentScript);
  } else {
    initContentScript();
  }

  console.log('bAInder content script loaded on:', window.location.hostname);

})(); // end IIFE
