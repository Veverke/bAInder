/**
 * save-banner.js
 *
 * Responsibility: detect the active AI-chat tab and drive the inline
 * "Save to bAInder" banner — including save button state transitions and
 * the full panel-save flow.
 *
 * NOT responsible for: chat storage (delegates to ChatRepository), tree
 * persistence (delegates to tree-controller), or the post-save dialog flow
 * (delegates to chat-actions.handleChatSaved).
 */

import { state, elements } from '../app-context.js';
import { logger } from '../../lib/utils/logger.js';
import browser from '../../lib/vendor/browser.js';
import { updateStorageUsage } from './storage-usage.js';
import { SAVE_BTN_RESET_MS } from '../../lib/utils/constants.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


// ─── Save-button topic helper ─────────────────────────────────────────────────

/**
 * Return the topic name to show on the default Save button, or null when none
 * is available yet.
 *
 * Priority:
 *  1. Topic created immediately before (lastCreatedTopicId)
 *  2. Most recently used topic for saving (lastUsedTopicId)
 */
function _saveBtnTopicName() {
  const topicId = _state.lastCreatedTopicId || _state.lastUsedTopicId;
  if (!topicId || !_state.tree) return null;
  const topic = _state.tree.topics[topicId];
  if (!topic) return null;
  // Truncate long names so the button stays compact
  const name = topic.name;
  return name.length > 22 ? `${name.slice(0, 20)}…` : name;
}

// ─── Platform detection ───────────────────────────────────────────────────────

const PLATFORM_PATTERNS = [
  { re: /chatgpt\.com|chat\.openai\.com/,                     name: 'ChatGPT'    },
  { re: /claude\.ai/,                                          name: 'Claude'     },
  { re: /gemini\.google\.com/,                                 name: 'Gemini'     },
  { re: /copilot\.microsoft\.com|m365\.cloud\.microsoft/,      name: 'Copilot'    },
  { re: /perplexity\.ai/,                                      name: 'Perplexity' },
];

export function detectPlatformFromUrl(url) {
  if (!url) return null;
  for (const { re, name } of PLATFORM_PATTERNS) {
    if (re.test(url)) return name;
  }
  return null;
}

// ─── Banner init ──────────────────────────────────────────────────────────────

export async function initSaveBanner() {
  if (!elements.saveBanner) return;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const platform = tab ? detectPlatformFromUrl(tab.url) : null;
    if (platform) {
      if (elements.saveBannerMsg) {
        elements.saveBannerMsg.textContent = `${platform} conversation detected`;
        elements.saveBannerMsg.classList.remove('save-banner__msg--warn');
      }
      elements.saveBanner.style.display = 'flex';
      setSaveBtnState('default');
    } else {
      elements.saveBanner.style.display = 'none';
    }
  } catch (err) {
    logger.warn('bAInder: initSaveBanner error', err);
    if (elements.saveBanner) elements.saveBanner.style.display = 'none';
  }
}

// ─── Save button state machine ────────────────────────────────────────────────

const SAVE_BTN_MAP = {
  loading: { text: '⏳ Saving…',         disabled: true  },
  success: { text: '✅ Saved!',           disabled: true  },
  error:   { text: '❌ Error',            disabled: false },
  empty:   { text: '⚠️ No chat yet',     disabled: false },
  reload:  { text: '🔄 Reload page',     disabled: false },
};

export function setSaveBtnState(s) {
  const btn = elements.saveBtn;
  if (!btn) return;

  let st;
  if (s === 'default') {
    const topicName = _saveBtnTopicName();
    st = {
      text:     topicName ? `💾 Save to "${topicName}"` : '💾 Save',
      disabled: false,
    };
  } else {
    st = SAVE_BTN_MAP[s] ?? { text: '💾 Save', disabled: false };
  }

  btn.textContent = st.text;
  btn.disabled    = st.disabled;
  btn._reloadMode = (s === 'reload');

  if (s === 'success' || s === 'error' || s === 'empty') {
    setTimeout(() => setSaveBtnState('default'), SAVE_BTN_RESET_MS);
  }
}

// ─── Panel save flow (triggered by "Save" button click) ───────────────────────

export async function handlePanelSave() {
  setSaveBtnState('loading');
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    const extractResponse = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_CHAT' });
    if (!extractResponse?.success) {
      throw new Error(extractResponse?.error || 'Extraction failed');
    }
    const chatData = extractResponse.data;
    if (!chatData || (chatData.messageCount === 0 && !chatData.messages?.length)) {
      setSaveBtnState('empty');
      return;
    }

    const saveResponse = await browser.runtime.sendMessage({ type: 'SAVE_CHAT', data: chatData });
    if (!saveResponse?.success) throw new Error(saveResponse?.error || 'Save failed');

    // setSaveBtnState('success') is deferred to handleChatSaved() so the button
    // only shows "Saved!" AFTER the user confirms the assign-to-topic dialog.
    await updateStorageUsage();
  } catch (err) {
    const noCS      = /receiving end does not exist|could not establish connection/i.test(err.message);
    const ctxLost   = /context.*(lost|invalidated)/i.test(err.message);
    if (noCS || ctxLost) {
      if (elements.saveBannerMsg) {
        elements.saveBannerMsg.textContent = '⚠️ Reload this page to activate bAInder';
        elements.saveBannerMsg.classList.add('save-banner__msg--warn');
      }
      setSaveBtnState('reload');
    } else {
      setSaveBtnState('error');
    }
    logger.error('bAInder: Panel save failed', err);
  }
}
