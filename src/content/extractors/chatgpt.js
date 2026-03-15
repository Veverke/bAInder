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
import { resolveImageBlobs, resolveAudioBlobs, collectShadowAudio } from './image-resolver.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';

// ── Audio supplement ────────────────────────────────────────────────────────

const _AUDIO_EXT = /\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)(\?|$)/i;
const _MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * Capture a blob: URL as a base64 data: URI.
 * Returns the data URI, 'too_large', or null on failure.
 * @param {string} src
 * @returns {Promise<string|null>}
 */
async function _captureAudioBlob(src) {
  try {
    const r = await fetch(src);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > _MAX_AUDIO_BYTES) return 'too_large';
    const mime  = (r.headers.get('content-type') ?? 'audio/mpeg').split(';')[0].trim();
    const bytes = new Uint8Array(buf);
    let b = '';
    for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
    return `data:${mime};base64,${btoa(b)}`;
  } catch {
    return null;
  }
}

/**
 * Scan the full turn article for <audio> elements and audio-file download
 * anchors that are NOT inside `contentEl` (which was already processed by
 * resolveAudioBlobs + htmlToMarkdown).
 *
 * ChatGPT's code-interpreter sometimes renders a generated audio file as a
 * download card that lives outside the text-base / .markdown container.
 *
 * @param {Element} turn       Full conversation-turn element
 * @param {Element} contentEl  Already-processed content element (skip descendants)
 * @returns {Promise<string>}  Audio marker lines to append, or ''
 */
async function _collectTurnAudio(turn, contentEl) {
  if (contentEl === turn) return ''; // entire turn already processed
  const markers = [];

  // 1. <audio> elements outside contentEl
  for (const audio of turn.querySelectorAll('audio')) {
    if (contentEl.contains(audio)) continue;
    const src = (audio.src && audio.src !== location.href ? audio.src : null) ||
                audio.getAttribute('src') ||
                audio.querySelector('source')?.src ||
                audio.querySelector('source')?.getAttribute('src') || '';
    console.debug('[bAInder] ChatGPT: <audio> outside contentEl src:', src.slice(0, 80));
    if (!src) { markers.push('[🔊 Generated audio (not captured)]'); continue; }
    if (src.startsWith('blob:')) {
      const resolved = await _captureAudioBlob(src);
      if (resolved === 'too_large') markers.push('[🔊 Generated audio (file too large to capture)]');
      else if (!resolved)           markers.push('[🔊 Generated audio (not captured)]');
      else                          markers.push(`[🔊 Generated audio](${resolved})`);
    } else if (/^https?:\/\//i.test(src) || src.startsWith('data:')) {
      markers.push(`[🔊 Generated audio](${src})`);
    } else {
      // Non-http, non-blob URL (e.g. sandbox:, file:) — inaccessible outside the platform
      markers.push('[🔊 Generated audio (not captured)]');
    }
  }

  // 2. <a> anchors with audio signal anywhere, outside contentEl.
  //    Accept: audio ext in href or download filename or visible text;
  //    also accept any blob: download anchor (use content-type to decide).
  const seenAnchors = new Set();
  for (const anchor of turn.querySelectorAll('a[href]')) {
    if (contentEl.contains(anchor)) continue;
    const href = anchor.getAttribute('href') || '';
    if (!href || seenAnchors.has(href)) continue;
    const dl   = anchor.getAttribute('download'); // null if absent, '' if valueless
    const text = (anchor.textContent || '').trim();
    const hasAudioSignal = _AUDIO_EXT.test(href) || _AUDIO_EXT.test(dl ?? '') || _AUDIO_EXT.test(text);
    // For blob: hrefs we accept any download anchor and check content-type at fetch time.
    const isBlobDownload = href.startsWith('blob:') && dl !== null;
    if (!hasAudioSignal && !isBlobDownload) continue;
    seenAnchors.add(href);
    console.debug('[bAInder] ChatGPT: audio <a> outside contentEl href:',
      href.slice(0, 80), 'download:', dl, 'text:', text.slice(0, 40));
    if (href.startsWith('blob:')) {
      const resolved = await _captureAudioBlob(href);
      if (!resolved && !hasAudioSignal) continue; // content-type wasn't audio
      if (resolved === 'too_large') markers.push('[🔊 Generated audio (file too large to capture)]');
      else if (!resolved)           markers.push(`[🔊 Generated audio (session-only)](${href})`);
      else                          markers.push(`[🔊 Generated audio](${resolved})`);
    } else if (/^https?:\/\//i.test(href)) {
      markers.push(`[🔊 Generated audio](${href})`);
    }
  }

  // 3. <button> elements with audio filename in text or aria-label, outside contentEl.
  //    ChatGPT code-interpreter renders file download chips as <button>; no href exists.
  const seenBtnText = new Set();
  for (const btn of turn.querySelectorAll('button')) {
    if (contentEl.contains(btn)) continue;
    const txt = (btn.textContent || '').trim().replace(/\s+/g, ' ');
    const lbl = btn.getAttribute('aria-label') || '';
    const sig = _AUDIO_EXT.test(txt) ? txt : _AUDIO_EXT.test(lbl) ? lbl : null;
    if (!sig || seenBtnText.has(sig)) continue;
    seenBtnText.add(sig);
    console.debug('[bAInder] ChatGPT: audio <button> outside contentEl:', sig.slice(0, 80));
    markers.push('[🔊 Generated audio (not captured)]');
  }

  return markers.length ? '\n' + markers.join('\n') : '';
}

/**
 * Full-document audio sweep: scan the ENTIRE page for audio elements and
 * download anchors that weren't inside any conversation-turn article we
 * processed (e.g., code-interpreter output lives in its own turn that gets
 * skipped when role detection fails, or outside any article entirely).
 *
 * @param {Document} doc
 * @param {Set<string>} excludeSrcs  Audio srcs already captured (skip duplicates)
 * @returns {Promise<string>}  Newline-joined 🔊 markers, or ''
 */
async function _collectDocAudio(doc, excludeSrcs) {
  const markers  = [];
  const seenSrcs = new Set(excludeSrcs);

  // Step 0: Read audio blobs captured by the MAIN-world interceptor (audio-interceptor.js).
  // The interceptor patches URL.createObjectURL() and anchor.click() and writes each audio
  // blob / signed URL as a data: URI into a <meta name="bainder-audio-cache"> DOM element.
  for (const meta of doc.querySelectorAll('meta[name="bainder-audio-cache"]')) {
    const blobUrl = meta.getAttribute('data-blob-url') || '';
    const dataUrl = meta.getAttribute('data-data-url') || '';
    if (!dataUrl || seenSrcs.has(blobUrl)) continue;
    seenSrcs.add(blobUrl);
    console.log('[bAInder] ChatGPT: interceptor cache hit, src:', blobUrl.slice(0, 60));
    markers.push(`[🔊 Generated audio](${dataUrl})`);
  }

  // Step 0b: Shadow-DOM audio sweep (catches <audio> elements inside shadow roots).
  for (const { src } of collectShadowAudio(doc.documentElement ?? doc.body)) {
    if (seenSrcs.has(src)) continue;
    seenSrcs.add(src);
    console.log('[bAInder] ChatGPT docSweep: shadow <audio> src:', src.slice(0, 80));
    if (src.startsWith('blob:')) {
      const resolved = await _captureAudioBlob(src);
      if (resolved === 'too_large') markers.push('[🔊 Generated audio (file too large to capture)]');
      else if (!resolved)           markers.push('[🔊 Generated audio (not captured)]');
      else                          markers.push(`[🔊 Generated audio](${resolved})`);
    } else if (/^https?:\/\//i.test(src)) {
      markers.push(`[🔊 Generated audio](${src})`);
    }
  }

  // 1. Every <audio> element in the document
  for (const audio of doc.querySelectorAll('audio')) {
    const src = (typeof audio.src === 'string' && audio.src && !audio.src.endsWith('/') ? audio.src : null) ||
                audio.getAttribute('src') ||
                audio.querySelector('source')?.getAttribute('src') || '';
    if (!src || seenSrcs.has(src)) continue;
    seenSrcs.add(src);
    console.log('[bAInder] ChatGPT docSweep: <audio> src:', src.slice(0, 80));
    if (src.startsWith('blob:')) {
      const resolved = await _captureAudioBlob(src);
      if (resolved === 'too_large') markers.push('[🔊 Generated audio (file too large to capture)]');
      else if (!resolved)           markers.push('[🔊 Generated audio (not captured)]');
      else                          markers.push(`[🔊 Generated audio](${resolved})`);
    } else {
      markers.push(`[🔊 Generated audio](${src})`);
    }
  }

  // 2. Every <a href> with audio signal in href, download filename, or visible text
  for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') || '';
    if (!href || seenSrcs.has(href)) continue;
    const dl   = anchor.getAttribute('download'); // null = no attr, '' = attr present but empty
    const text = (anchor.textContent || '').trim();
    const hasExt = _AUDIO_EXT.test(href) || _AUDIO_EXT.test(dl ?? '') || _AUDIO_EXT.test(text);
    const isBlobDl = href.startsWith('blob:') && dl !== null;
    if (!hasExt && !isBlobDl) continue;
    seenSrcs.add(href);
    console.log('[bAInder] ChatGPT docSweep: audio <a> href:', href.slice(0, 80),
      'dl:', dl, 'text:', text.slice(0, 40));
    if (href.startsWith('blob:')) {
      const resolved = await _captureAudioBlob(href);
      if (!resolved && !hasExt) continue; // content-type wasn't audio
      if (resolved === 'too_large') markers.push('[🔊 Generated audio (file too large to capture)]');
      else if (!resolved)           markers.push(`[🔊 Generated audio (session-only)](${href})`);
      else                          markers.push(`[🔊 Generated audio](${resolved})`);
    } else if (/^https?:\/\//i.test(href)) {
      markers.push(`[🔊 Generated audio](${href})`);
    }
  }

  // 3. Any element (div/span/button/etc.) whose text looks like an audio filename,
  //    excluding what's already inside conversation-turn articles.
  const turnArticles = doc.querySelectorAll('article[data-testid^="conversation-turn"]');
  const AUDIO_FILENAME_RE = /\b[\w. -]+\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)\b/i;
  // Only scan elements that are NOT inside a conversation-turn article
  for (const el of doc.querySelectorAll('[download],[data-filename]')) {
    if (Array.from(turnArticles).some(a => a.contains(el))) continue; // handled by turn loop
    const fn = el.getAttribute('download') || el.getAttribute('data-filename') || '';
    if (!AUDIO_FILENAME_RE.test(fn)) continue;
    const key = fn;
    if (seenSrcs.has(key)) continue;
    seenSrcs.add(key);
    console.log('[bAInder] ChatGPT docSweep: audio filename element:', fn);
    markers.push('[🔊 Generated audio (not captured)]');
  }

  console.log('[bAInder] ChatGPT docSweep: total audio markers found:', markers.length);
  return markers.join('\n');
}

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
    const processEl  = role === 'assistant' ? stripSourceContainers(contentEl) : contentEl;
    const dimsEl     = role === 'assistant' ? contentEl : null;
    const resolvedEl = await resolveAudioBlobs(await resolveImageBlobs(processEl, bgFetch, dimsEl));
    let content = htmlToMarkdown(resolvedEl);
    console.debug('[bAInder] ChatGPT turn result', testId, role,
      '| markdown len:', content.length, '| hasImg:', content.includes('!['), '| hasPlaceholder:', content.includes('🖼️'));

    // Supplement: capture audio download elements in the turn that are
    // outside contentEl (e.g., code-interpreter file cards rendered as siblings).
    if (role === 'assistant') {
      const extraAudio = await _collectTurnAudio(turn, contentEl);
      if (extraAudio) {
        content += '\n' + extraAudio;
        console.debug('[bAInder] ChatGPT: audio supplement for', testId, ':', extraAudio.slice(0, 80));
      }
    }

    if (role === 'assistant') content += extractSourceLinks(turn, contentEl);
    if (content) messages.push(formatMessage(role, content));
  }

  // Fallback: role attribute on the turn article itself
  if (messages.length === 0) {
    console.debug('[bAInder] ChatGPT: primary selector found no turns, trying fallback');
    for (const el of doc.querySelectorAll('[data-message-author-role]')) {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const processEl  = role === 'assistant' ? stripSourceContainers(el) : el;
      const dimsEl     = role === 'assistant' ? el : null;
      const resolvedEl = await resolveAudioBlobs(await resolveImageBlobs(processEl, bgFetch, dimsEl));
      const content = htmlToMarkdown(resolvedEl);
      console.debug('[bAInder] ChatGPT fallback turn:', role, '| markdown len:', content.length);
      if (content) messages.push(formatMessage(role, content));
    }
  }

  // Full-document audio sweep: catch audio in skipped turns (code-interpreter
  // output articles with no recognisable role) or outside turn articles entirely.
  const capturedSrcs = new Set(
    messages.flatMap(m => {
      const text = typeof m.content === 'string' ? m.content : '';
      const found = [];
      const re = /\[🔊 Generated audio[^\]]*\]\(([^)]+)\)/g;
      let mch;
      while ((mch = re.exec(text)) !== null) found.push(mch[1]);
      return found;
    })
  );
  const docAudio = await _collectDocAudio(doc, capturedSrcs);
  if (docAudio) {
    // Attach to the last assistant message, or create a placeholder if none
    const lastAsst = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAsst) {
      lastAsst.content += '\n' + docAudio;
      console.log('[bAInder] ChatGPT: docSweep appended to last assistant msg');
    }
  }

  // ── Text-heuristic audio detection ────────────────────────────────────────
  // ChatGPT code-interpreter generates audio files via JavaScript (the download
  // button calls URL.createObjectURL only on click — no static href in the DOM).
  // DOM scanning finds nothing.  Instead, detect the "Download it here:" pattern
  // that ChatGPT always emits after describing a generated audio file, and inject
  // a [🔊 Generated audio (not captured)] placeholder in the gap.
  //
  // Signal A: text after "Download it here:" is blank (the download widget was
  //           silently dropped by htmlToMarkdown).
  // Signal B: the message mentions audio/sound/WAV/MP3 etc.
  // Guard:    skip if a 🔊 marker is already present (captured properly above).
  const AUDIO_SIGNAL_RE   = /\b(wav|mp3|ogg|webm|m4a|aac|flac|opus|audio|sound|ambient|soundscape|music\s+clip|audio\s+file|sound\s+file)\b/i;
  const DOWNLOAD_HERE_RE  = /(\*{0,2}Download(?:\s+it)?\s*here:?\*{0,2}[ \t]*)\n/i;

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    if (msg.content.includes('🔊')) continue;
    if (!DOWNLOAD_HERE_RE.test(msg.content)) continue;
    if (!AUDIO_SIGNAL_RE.test(msg.content))  continue;
    console.log('[bAInder] ChatGPT: audio text heuristic fired — injecting placeholder');
    msg.content = msg.content.replace(
      DOWNLOAD_HERE_RE,
      '$1\n[🔊 Generated audio (not captured)]\n'
    );
  }

  // ── Strip response-variant pagination artifact ─────────────────────────────
  // ChatGPT renders "1 / 2" or "1/2" navigation arrows between response variants.
  // This UI element is picked up by htmlToMarkdown as trailing text content.
  for (const msg of messages) {
    msg.content = msg.content.replace(/\n+\d+\s*\/\s*\d+\s*$/, '').trimEnd();
  }

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
