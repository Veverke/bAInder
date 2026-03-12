/**
 * ChatGPT conversation extractor.
 * Targets: chat.openai.com, chatgpt.com
 *
 * ChatGPT DOM (as of 2025/2026):
 *   Each turn:  article[data-testid^="conversation-turn"]
 *   Role attr:  [data-message-author-role]
 *   Content:    .markdown, .text-base, or direct text nodes
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { resolveImageBlobs }     from './image-resolver.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';

/**
 * Extract messages from a ChatGPT conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export async function extractChatGPT(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Primary selector – role is stored on a child element inside the article
  const turns = doc.querySelectorAll('article[data-testid^="conversation-turn"]');

  console.debug('[bAInder] ChatGPT extraction: turns=%d', turns.length);

  // Route https: image fetches through the background service worker to bypass
  // CORP: same-site on OpenAI image CDNs (files.oaiusercontent.com, *.blob.core.windows.net).
  const bgFetch = (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage)
    ? url => new Promise((resolve, reject) => {
        console.debug('[bAInder] ChatGPT bgFetch → background:', url.slice(0, 80));
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          const du = resp?.dataUrl || '';
          console.debug('[bAInder] ChatGPT bgFetch ← background: success=' + resp?.success +
            ' dataUrl.length=' + du.length + ' prefix=' + du.slice(0, 30));
          if (resp?.success && du.startsWith('data:')) resolve(du);
          else reject(new Error(resp?.error || 'invalid dataUrl from background'));
        });
      })
    : null;

  for (const turn of turns) {
    const testId = turn.getAttribute('data-testid') || '?';

    // Step 1: Determine role.
    // Newer ChatGPT (2026): assistant articles no longer carry [data-message-author-role];
    // role is signalled by a screen-reader-only h6 heading instead.
    const roleEl = turn.querySelector('[data-message-author-role]');
    let role;
    if (roleEl) {
      const rawRole = roleEl.getAttribute('data-message-author-role') || '';
      role = rawRole === 'user' ? 'user' : 'assistant';
    } else {
      const heading    = turn.querySelector('h6');
      const headingTxt = (heading?.textContent || '').trim();
      if (/chatgpt said|assistant said/i.test(headingTxt)) {
        role = 'assistant';
      } else if (/you said|i said|user said/i.test(headingTxt)) {
        role = 'user';
      } else {
        console.debug('[bAInder] ChatGPT skip turn', testId,
          '| cannot determine role | h6: "' + headingTxt + '"');
        continue;
      }
    }

    // Step 2: Find content element.
    // For assistant turns, prefer the broader text-base wrapper so that generated
    // images (DALL-E) that are siblings of .markdown are included in the scope.
    // For user turns keep the existing narrow chain.
    let contentEl, contentElDesc;
    if (role === 'assistant') {
      const textBase = turn.querySelector('[class*="text-base"]');
      const markdown = turn.querySelector('.markdown');
      const prose    = turn.querySelector('[class*="prose"]');
      contentEl     = textBase || markdown || prose || roleEl || turn;
      contentElDesc = textBase ? '[class*=text-base]' : markdown ? '.markdown' : prose ? '[class*=prose]' : roleEl ? 'roleEl' : 'turn';
    } else {
      const markdown = turn.querySelector('.markdown');
      const prose    = turn.querySelector('[class*="prose"]');
      const whitePre = turn.querySelector('[class*="whitespace-pre"]');
      contentEl     = markdown || prose || whitePre || roleEl || turn;
      contentElDesc = markdown ? '.markdown' : prose ? '[class*=prose]' : whitePre ? '[class*=whitespace-pre]' : roleEl ? 'roleEl' : 'turn';
    }

    const imgsInContentEl = contentEl.querySelectorAll('img').length;
    const imgsInTurn      = turn.querySelectorAll('img').length;
    console.debug('[bAInder] ChatGPT turn', testId, role,
      '| contentEl:', contentElDesc,
      '| imgs contentEl/turn:', imgsInContentEl, '/', imgsInTurn);

    // stripSourceContainers returns a detached clone; pass live contentEl as dimsEl
    // so resolveImageBlobs can read getBoundingClientRect() for image dimensions.
    const processEl = role === 'assistant' ? stripSourceContainers(contentEl) : contentEl;
    const dimsEl   = role === 'assistant' ? contentEl : null;
    const resolvedEl = await resolveImageBlobs(processEl, bgFetch, dimsEl);
    let content = htmlToMarkdown(resolvedEl);
    console.debug('[bAInder] ChatGPT turn result', testId, role,
      '| markdown len:', content.length, '| hasImg:', content.includes('!['), '| hasPlaceholder:', content.includes('🖼️'));
    if (role === 'assistant') content += extractSourceLinks(turn, contentEl);
    if (content) messages.push(formatMessage(role, content));
  }

  // Fallback: role attribute on the turn article itself
  if (messages.length === 0) {
    console.debug('[bAInder] ChatGPT: primary selector found no turns, trying fallback');
    for (const el of doc.querySelectorAll('[data-message-author-role]')) {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
      const dimsEl   = role === 'assistant' ? el : null;
      const resolvedEl = await resolveImageBlobs(processEl, bgFetch, dimsEl);
      const content = htmlToMarkdown(resolvedEl);
      console.debug('[bAInder] ChatGPT fallback turn:', role, '| markdown len:', content.length);
      if (content) messages.push(formatMessage(role, content));
    }
  }

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
