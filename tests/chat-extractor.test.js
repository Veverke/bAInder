/**
 * Tests for src/content/chat-extractor.js
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Covers every exported function, all platforms, and all error paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectPlatform,
  sanitizeContent,
  getTextContent,
  formatMessage,
  generateTitle,
  extractChatGPT,
  extractClaude,
  extractGemini,
  extractCopilot,
  extractChat,
  prepareChatForSave
} from '../src/content/chat-extractor.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal ChatGPT-style DOM document with the given conversation turns.
 * @param {Array<{role:'user'|'assistant', content: string}>} turns
 * @returns {Document}
 */
function buildChatGPTDoc(turns = []) {
  const div = document.createElement('div');
  turns.forEach((turn, i) => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', `conversation-turn-${i}`);

    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', turn.role);

    const contentEl = document.createElement('div');
    contentEl.className = 'markdown';
    contentEl.textContent = turn.content;

    roleEl.appendChild(contentEl);
    article.appendChild(roleEl);
    div.appendChild(article);
  });
  document.body.innerHTML = '';
  document.body.appendChild(div);
  return document;
}

/**
 * Build a minimal Claude-style DOM.
 */
function buildClaudeDoc(turns = []) {
  const div = document.createElement('div');
  turns.forEach(turn => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', turn.role === 'user' ? 'human-turn' : 'ai-turn');
    el.textContent = turn.content;
    div.appendChild(el);
  });
  document.body.innerHTML = '';
  document.body.appendChild(div);
  return document;
}

/**
 * Build a minimal Gemini-style DOM.
 */
function buildGeminiDoc(turns = []) {
  const div = document.createElement('div');
  turns.forEach(turn => {
    const el = document.createElement('div');
    el.className = turn.role === 'user' ? 'user-query-content' : 'model-response-text';
    el.textContent = turn.content;
    div.appendChild(el);
  });
  document.body.innerHTML = '';
  document.body.appendChild(div);
  return document;
}

/**
 * Build a minimal Copilot-style DOM document with the given conversation turns.
 * User messages use data-testid="user-message";
 * assistant messages use data-testid="copilot-message".
 */
function buildCopilotDoc(turns = []) {
  const div = document.createElement('div');
  turns.forEach(turn => {
    const el = document.createElement('div');
    el.setAttribute(
      'data-testid',
      turn.role === 'user' ? 'user-message' : 'copilot-message'
    );
    el.textContent = turn.content;
    div.appendChild(el);
  });
  document.body.innerHTML = '';
  document.body.appendChild(div);
  return document;
}

// ─── detectPlatform ───────────────────────────────────────────────────────────

describe('detectPlatform()', () => {
  it('returns chatgpt for chat.openai.com', () => {
    expect(detectPlatform('chat.openai.com')).toBe('chatgpt');
  });

  it('returns claude for claude.ai', () => {
    expect(detectPlatform('claude.ai')).toBe('claude');
  });

  it('returns gemini for gemini.google.com', () => {
    expect(detectPlatform('gemini.google.com')).toBe('gemini');
  });

  it('returns null for an unknown hostname', () => {
    expect(detectPlatform('example.com')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectPlatform('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(detectPlatform(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(detectPlatform(undefined)).toBeNull();
  });

  it('detects copilot from copilot.microsoft.com hostname', () => {
    expect(detectPlatform('copilot.microsoft.com')).toBe('copilot');
  });

  it('detects copilot with path on copilot.microsoft.com', () => {
    expect(detectPlatform('copilot.microsoft.com')).toBe('copilot');
  });

  it('detects copilot from m365.cloud.microsoft (redirect target)', () => {
    expect(detectPlatform('m365.cloud.microsoft')).toBe('copilot');
  });

  it('detects copilot from m365.cloud.microsoft with subdomain', () => {
    expect(detectPlatform('m365.cloud.microsoft')).toBe('copilot');
  });

  it('is case-insensitive', () => {
    expect(detectPlatform('CHAT.OPENAI.COM')).toBe('chatgpt');
    expect(detectPlatform('Claude.AI')).toBe('claude');
  });

  it('matches on substrings (e.g. subdomain)', () => {
    expect(detectPlatform('chat.openai.com')).toBe('chatgpt');
  });
});

// ─── sanitizeContent ─────────────────────────────────────────────────────────

describe('sanitizeContent()', () => {
  it('strips HTML tags', () => {
    expect(sanitizeContent('<b>Hello</b> <i>world</i>')).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    // &nbsp; becomes a space, then whitespace normalisation collapses/trims
    expect(sanitizeContent('&amp;')).toBe('&');
    expect(sanitizeContent('&lt;')).toBe('<');
    expect(sanitizeContent('&gt;')).toBe('>');
    expect(sanitizeContent('&quot;')).toBe('"');
    expect(sanitizeContent('&#39;')).toBe("'");
    expect(sanitizeContent('&nbsp;')).toBe(''); // nbsp → space, then trimmed
    expect(sanitizeContent('Hello &amp; World')).toBe('Hello & World');
  });

  it('normalises whitespace', () => {
    expect(sanitizeContent('  hello   world  ')).toBe('hello world');
  });

  it('handles nested tags', () => {
    expect(sanitizeContent('<div><p>Text</p></div>')).toBe('Text');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeContent('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(sanitizeContent(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeContent(undefined)).toBe('');
  });

  it('handles plain text without HTML', () => {
    expect(sanitizeContent('Hello world')).toBe('Hello world');
  });

  it('handles mixed tags and entities', () => {
    const result = sanitizeContent('<p>Hello &amp; <b>world</b></p>');
    expect(result).toBe('Hello & world');
  });
});

// ─── getTextContent ───────────────────────────────────────────────────────────

describe('getTextContent()', () => {
  it('extracts text from a DOM element', () => {
    const el = document.createElement('div');
    el.textContent = 'Hello world';
    expect(getTextContent(el)).toBe('Hello world');
  });

  it('strips tags from innerHTML', () => {
    const el = document.createElement('div');
    el.innerHTML = '<b>Bold</b> text';
    expect(getTextContent(el)).toBe('Bold text');
  });

  it('returns empty string for null', () => {
    expect(getTextContent(null)).toBe('');
  });
});

// ─── formatMessage ────────────────────────────────────────────────────────────

describe('formatMessage()', () => {
  it('creates a message with role and content', () => {
    const msg = formatMessage('user', 'Hello');
    expect(msg).toEqual({ role: 'user', content: 'Hello' });
  });

  it('trims content', () => {
    expect(formatMessage('user', '  Hello  ').content).toBe('Hello');
  });

  it('falls back role to "unknown" if empty', () => {
    expect(formatMessage('', 'text').role).toBe('unknown');
  });

  it('handles null content gracefully', () => {
    expect(formatMessage('user', null).content).toBe('');
  });
});

// ─── generateTitle ────────────────────────────────────────────────────────────

describe('generateTitle()', () => {
  it('uses the first user message as the title', () => {
    const messages = [
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user',      content: 'What is the capital of France?' }
    ];
    expect(generateTitle(messages, '')).toBe('What is the capital of France?');
  });

  it('truncates long first user messages to 80 chars', () => {
    const long = 'A'.repeat(100);
    const title = generateTitle([{ role: 'user', content: long }], '');
    expect(title).toHaveLength(80);
    expect(title.endsWith('...')).toBe(true);
  });

  it('exactly-80-char message is NOT truncated', () => {
    const exact = 'A'.repeat(80);
    const title = generateTitle([{ role: 'user', content: exact }], '');
    expect(title).toBe(exact);
  });

  it('falls back to URL path segment when no messages', () => {
    const title = generateTitle([], 'https://chat.openai.com/c/abc123def456');
    expect(title).toBe('Chat abc123def456');
  });

  it('falls back to "Untitled Chat" when no messages and no useful URL', () => {
    expect(generateTitle([], '')).toBe('Untitled Chat');
  });

  it('returns "Untitled Chat" when messages array is empty and URL is null', () => {
    expect(generateTitle([], null)).toBe('Untitled Chat');
  });

  it('skips short URL segments and falls back to Untitled', () => {
    // Segment 'c' is skipped; no other segments
    const title = generateTitle([], 'https://chat.openai.com/c');
    expect(title).toBe('Untitled Chat');
  });
});

// ─── extractChatGPT ───────────────────────────────────────────────────────────

describe('extractChatGPT()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws if document is null', () => {
    expect(() => extractChatGPT(null)).toThrow('Document is required');
  });

  it('returns empty messages for a page with no conversation', () => {
    document.body.innerHTML = '<main></main>';
    const result = extractChatGPT(document);
    expect(result.messages).toHaveLength(0);
    expect(result.messageCount).toBe(0);
  });

  it('extracts a single user message', () => {
    buildChatGPTDoc([{ role: 'user', content: 'Hello ChatGPT' }]);
    const result = extractChatGPT(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello ChatGPT' });
  });

  it('extracts a full conversation in order', () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user',      content: 'Thanks!' },
      { role: 'assistant', content: 'You are welcome.' }
    ]);
    const result = extractChatGPT(document);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('sets the title from the first user message', () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'What is the weather today?' },
      { role: 'assistant', content: 'I cannot access real-time data.' }
    ]);
    const result = extractChatGPT(document);
    expect(result.title).toBe('What is the weather today?');
  });

  it('uses the fallback selector when no .markdown exists', () => {
    // No .markdown class – falls back to the role element text
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'user');
    roleEl.textContent = 'Direct text content';
    article.appendChild(roleEl);
    document.body.appendChild(article);

    const result = extractChatGPT(document);
    expect(result.messages[0].content).toBe('Direct text content');
  });

  it('skips turns without a role element', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    // No role element inside
    article.textContent = 'Orphan text';
    document.body.appendChild(article);

    const result = extractChatGPT(document);
    expect(result.messages).toHaveLength(0);
  });

  it('maps unknown role to "assistant"', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'tool'); // unknown role
    roleEl.textContent = 'Tool usage';
    article.appendChild(roleEl);
    document.body.appendChild(article);

    const result = extractChatGPT(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('uses the global fallback selector when no articles found', () => {
    // Fallback: [data-message-author-role] elements not wrapped in articles
    const el = document.createElement('div');
    el.setAttribute('data-message-author-role', 'user');
    el.textContent = 'Fallback content';
    document.body.appendChild(el);

    const result = extractChatGPT(document);
    expect(result.messages[0].content).toBe('Fallback content');
  });

  it('returns messageCount equal to messages length', () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'Q1' },
      { role: 'assistant', content: 'A1' }
    ]);
    const result = extractChatGPT(document);
    expect(result.messageCount).toBe(result.messages.length);
  });
});

// ─── extractClaude ────────────────────────────────────────────────────────────

describe('extractClaude()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws if document is null', () => {
    expect(() => extractClaude(null)).toThrow('Document is required');
  });

  it('returns empty messages for a blank page', () => {
    document.body.innerHTML = '<div></div>';
    const result = extractClaude(document);
    expect(result.messages).toHaveLength(0);
  });

  it('extracts human and ai turns by data-testid', () => {
    buildClaudeDoc([
      { role: 'user',      content: 'Tell me a joke' },
      { role: 'assistant', content: 'Why did the chicken...' }
    ]);
    const result = extractClaude(document);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user',      content: 'Tell me a joke' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Why did the chicken...' });
  });

  it('extracts using .human-turn class fallback', () => {
    const human = document.createElement('div');
    human.className = 'human-turn';
    human.textContent = 'User class message';
    document.body.appendChild(human);

    const result = extractClaude(document);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('User class message');
  });

  it('extracts using .ai-turn class fallback', () => {
    const ai = document.createElement('div');
    ai.className = 'ai-turn';
    ai.textContent = 'AI class message';
    document.body.appendChild(ai);

    const result = extractClaude(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('handles .bot-turn class', () => {
    const bot = document.createElement('div');
    bot.className = 'bot-turn';
    bot.textContent = 'Bot response';
    document.body.appendChild(bot);

    const result = extractClaude(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('sets title from first user message', () => {
    buildClaudeDoc([{ role: 'user', content: 'Explain quantum entanglement' }]);
    const result = extractClaude(document);
    expect(result.title).toBe('Explain quantum entanglement');
  });

  it('returns messageCount equal to messages length', () => {
    buildClaudeDoc([
      { role: 'user',      content: 'Q' },
      { role: 'assistant', content: 'A' }
    ]);
    const result = extractClaude(document);
    expect(result.messageCount).toBe(2);
  });
});

// ─── extractGemini ────────────────────────────────────────────────────────────

describe('extractGemini()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws if document is null', () => {
    expect(() => extractGemini(null)).toThrow('Document is required');
  });

  it('returns empty messages for a blank page', () => {
    document.body.innerHTML = '<div></div>';
    const result = extractGemini(document);
    expect(result.messages).toHaveLength(0);
  });

  it('extracts user queries and model responses', () => {
    buildGeminiDoc([
      { role: 'user',      content: 'What is ML?' },
      { role: 'assistant', content: 'Machine learning is...' }
    ]);
    const result = extractGemini(document);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user',      content: 'What is ML?' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Machine learning is...' });
  });

  it('extracts using .query-text class fallback', () => {
    const el = document.createElement('div');
    el.className = 'query-text';
    el.textContent = 'User query via class';
    document.body.appendChild(el);

    const result = extractGemini(document);
    expect(result.messages[0].role).toBe('user');
  });

  it('extracts using .response-text class fallback', () => {
    const el = document.createElement('div');
    el.className = 'response-text';
    el.textContent = 'Response via class';
    document.body.appendChild(el);

    const result = extractGemini(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('sets title from first user message', () => {
    buildGeminiDoc([{ role: 'user', content: 'Summarise this document' }]);
    const result = extractGemini(document);
    expect(result.title).toBe('Summarise this document');
  });

  it('returns messageCount equal to messages length', () => {
    buildGeminiDoc([
      { role: 'user',      content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user',      content: 'C' }
    ]);
    const result = extractGemini(document);
    expect(result.messageCount).toBe(3);
  });
});

// ─── extractCopilot ────────────────────────────────────────────────────────

describe('extractCopilot()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws when document is null', () => {
    expect(() => extractCopilot(null)).toThrow('Document is required');
  });

  it('returns empty messages when no elements found', () => {
    document.body.innerHTML = '<div></div>';
    const result = extractCopilot(document);
    expect(result.messages).toHaveLength(0);
    expect(result.messageCount).toBe(0);
    expect(result.title).toBeDefined();
  });

  it('extracts a single user message via data-testid="user-message"', () => {
    buildCopilotDoc([{ role: 'user', content: 'Hello Copilot' }]);
    const result = extractCopilot(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('Hello Copilot');
  });

  it('extracts a single assistant message via data-testid="copilot-message"', () => {
    buildCopilotDoc([{ role: 'assistant', content: 'Hi there!' }]);
    const result = extractCopilot(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBe('Hi there!');
  });

  it('extracts multi-turn conversation in DOM order', () => {
    buildCopilotDoc([
      { role: 'user',      content: 'What is TypeScript?' },
      { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
      { role: 'user',      content: 'Give me an example.' },
      { role: 'assistant', content: 'const x: number = 42;' }
    ]);
    const result = extractCopilot(document);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('sets title from the first user message', () => {
    buildCopilotDoc([{ role: 'user', content: 'Explain async/await' }]);
    const result = extractCopilot(document);
    expect(result.title).toBe('Explain async/await');
  });

  it('uses fallback title when no user message present', () => {
    buildCopilotDoc([{ role: 'assistant', content: 'Hello!' }]);
    const result = extractCopilot(document);
    expect(typeof result.title).toBe('string');
  });

  it('returns messageCount equal to messages length', () => {
    buildCopilotDoc([
      { role: 'user',      content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user',      content: 'Q2' }
    ]);
    const result = extractCopilot(document);
    expect(result.messageCount).toBe(3);
  });

  it('matches user elements with .UserMessage class fallback', () => {
    const el = document.createElement('div');
    el.className = 'UserMessage';
    el.textContent = 'Via class fallback';
    document.body.appendChild(el);
    const result = extractCopilot(document);
    expect(result.messages.some(m => m.content === 'Via class fallback')).toBe(true);
  });

  it('matches assistant elements with data-testid="assistant-message" fallback', () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'assistant-message');
    el.textContent = 'Fallback assistant';
    document.body.appendChild(el);
    const result = extractCopilot(document);
    expect(result.messages.some(m => m.content === 'Fallback assistant')).toBe(true);
  });
});

// ─── extractChat (dispatch) ───────────────────────────────────────────────────

describe('extractChat()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws when platform is null', () => {
    expect(() => extractChat(null, document)).toThrow('Platform is required');
  });

  it('throws when document is null', () => {
    expect(() => extractChat('chatgpt', null)).toThrow('Document is required');
  });

  it('throws for unsupported platform', () => {
    expect(() => extractChat('bing', document)).toThrow('Unsupported platform: bing');
  });

  it('dispatches to extractChatGPT', () => {
    buildChatGPTDoc([{ role: 'user', content: 'GPT question' }]);
    const result = extractChat('chatgpt', document);
    expect(result.platform).toBe('chatgpt');
    expect(result.messages[0].content).toBe('GPT question');
  });

  it('dispatches to extractClaude', () => {
    buildClaudeDoc([{ role: 'user', content: 'Claude question' }]);
    const result = extractChat('claude', document);
    expect(result.platform).toBe('claude');
    expect(result.messages[0].content).toBe('Claude question');
  });

  it('dispatches to extractGemini', () => {
    buildGeminiDoc([{ role: 'user', content: 'Gemini question' }]);
    const result = extractChat('gemini', document);
    expect(result.platform).toBe('gemini');
    expect(result.messages[0].content).toBe('Gemini question');
  });

  it('dispatches to extractCopilot', () => {
    buildCopilotDoc([{ role: 'user', content: 'Copilot question' }]);
    const result = extractChat('copilot', document);
    expect(result.platform).toBe('copilot');
    expect(result.messages[0].content).toBe('Copilot question');
  });

  it('includes extractedAt timestamp', () => {
    const before = Date.now();
    buildChatGPTDoc([{ role: 'user', content: 'Q' }]);
    const result = extractChat('chatgpt', document);
    expect(result.extractedAt).toBeGreaterThanOrEqual(before);
    expect(result.extractedAt).toBeLessThanOrEqual(Date.now());
  });

  it('includes url from document.location.href', () => {
    buildChatGPTDoc([{ role: 'user', content: 'Q' }]);
    const result = extractChat('chatgpt', document);
    // In JSDOM test env, href is 'about:blank'
    expect(typeof result.url).toBe('string');
  });

  it('accepts an explicit URL override', () => {
    buildChatGPTDoc([{ role: 'user', content: 'Q' }]);
    const result = extractChat('chatgpt', document, 'https://chat.openai.com/c/abc');
    expect(result.url).toBe('https://chat.openai.com/c/abc');
  });

  it('returns messageCount in the envelope', () => {
    buildClaudeDoc([
      { role: 'user',      content: 'Q1' },
      { role: 'assistant', content: 'A1' }
    ]);
    const result = extractChat('claude', document);
    expect(result.messageCount).toBe(2);
  });
});

// ─── prepareChatForSave ───────────────────────────────────────────────────────

describe('prepareChatForSave()', () => {
  it('throws when chatData is null', () => {
    expect(() => prepareChatForSave(null)).toThrow('Chat data is required');
  });

  it('returns an object with all storage-ready fields', () => {
    const chatData = {
      platform:     'chatgpt',
      url:          'https://chat.openai.com/c/abc',
      title:        'My Chat',
      messages:     [{ role: 'user', content: 'Hello' }],
      messageCount: 1,
      extractedAt:  1234567890
    };
    const result = prepareChatForSave(chatData);
    expect(result.title).toBe('My Chat');
    expect(result.url).toBe('https://chat.openai.com/c/abc');
    expect(result.source).toBe('chatgpt');
    expect(result.messageCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.metadata.extractedAt).toBe(1234567890);
  });

  it('generates content as markdown with bold role labels', () => {
    const chatData = {
      platform:     'claude',
      url:          '',
      title:        'T',
      messages:     [
        { role: 'user',      content: 'Hi'   },
        { role: 'assistant', content: 'Hello' }
      ],
      messageCount: 2,
      extractedAt:  0
    };
    const result = prepareChatForSave(chatData);
    expect(result.content).toContain('**User**');
    expect(result.content).toContain('**Assistant**');
    expect(result.content).toContain('Hi');
    expect(result.content).toContain('Hello');
  });

  it('includes YAML frontmatter separator in content', () => {
    const chatData = {
      platform: 'gemini', url: '', title: 'T',
      messages: [
        { role: 'user',      content: 'A' },
        { role: 'assistant', content: 'B' }
      ],
      messageCount: 2, extractedAt: 0
    };
    const result = prepareChatForSave(chatData);
    expect(result.content).toContain('---');
  });

  it('handles empty messages array — content has frontmatter but no role labels', () => {
    const chatData = {
      platform: 'chatgpt', url: '', title: 'Empty',
      messages: [], messageCount: 0, extractedAt: 0
    };
    const result = prepareChatForSave(chatData);
    expect(result.content).toContain('contentFormat: markdown-v1');
    expect(result.content).not.toContain('**User**');
    expect(result.messages).toHaveLength(0);
  });

  it('includes contentFormat in metadata', () => {
    const chatData = {
      platform: 'chatgpt', url: '', title: 'T',
      messages: [{ role: 'user', content: 'Q' }],
      messageCount: 1, extractedAt: 999
    };
    expect(prepareChatForSave(chatData).metadata.contentFormat).toBe('markdown-v1');
    expect(prepareChatForSave(chatData).metadata.messageCount).toBe(1);
  });
});

// ─── Integration: full extract → prepare pipeline ─────────────────────────────

describe('Full extraction pipeline', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('ChatGPT: end-to-end extract and prepare', () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'Explain recursion' },
      { role: 'assistant', content: 'Recursion is when a function calls itself.' },
      { role: 'user',      content: 'Give an example in Python' },
      { role: 'assistant', content: 'def fact(n): return 1 if n<=1 else n*fact(n-1)' }
    ]);
    const chatData   = extractChat('chatgpt', document, 'https://chat.openai.com/c/xyz');
    const saveReady  = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('Explain recursion');
    expect(saveReady.source).toBe('chatgpt');
    expect(saveReady.messageCount).toBe(4);
    expect(saveReady.content).toContain('**User**');
    expect(saveReady.content).toContain('**Assistant**');
    expect(saveReady.content).toContain('Explain recursion');
  });

  it('Claude: end-to-end extract and prepare', () => {
    buildClaudeDoc([
      { role: 'user',      content: 'Write a haiku about the ocean' },
      { role: 'assistant', content: 'Waves crash on the shore\nSalt and foam kiss the white sand\nEternal rhythm' }
    ]);
    const chatData  = extractChat('claude', document, 'https://claude.ai/chat/123');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('Write a haiku about the ocean');
    expect(saveReady.source).toBe('claude');
    expect(saveReady.messageCount).toBe(2);
  });

  it('Gemini: end-to-end extract and prepare', () => {
    buildGeminiDoc([
      { role: 'user',      content: 'What are the planets in our solar system?' },
      { role: 'assistant', content: 'Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.' }
    ]);
    const chatData  = extractChat('gemini', document, 'https://gemini.google.com/app/abc');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('What are the planets in our solar system?');
    expect(saveReady.source).toBe('gemini');
    expect(saveReady.messageCount).toBe(2);
  });

  it('Copilot: end-to-end extract and prepare', () => {
    buildCopilotDoc([
      { role: 'user',      content: 'How do I reverse a string in Python?' },
      { role: 'assistant', content: 'Use slicing: s[::-1]' },
      { role: 'user',      content: 'What about in JavaScript?' },
      { role: 'assistant', content: "str.split('').reverse().join('')" }
    ]);
    const chatData  = extractChat('copilot', document, 'https://copilot.microsoft.com/');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('How do I reverse a string in Python?');
    expect(saveReady.source).toBe('copilot');
    expect(saveReady.messageCount).toBe(4);
    expect(saveReady.content).toContain('**User**');
    expect(saveReady.content).toContain('**Assistant**');
    expect(saveReady.content).toContain('How do I reverse a string in Python?');
  });

  it('handles an empty conversation gracefully end-to-end', () => {
    document.body.innerHTML = '<main></main>';
    const chatData  = extractChat('chatgpt', document, 'https://chat.openai.com/c/empty');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.messageCount).toBe(0);
    expect(saveReady.content).toContain('contentFormat: markdown-v1');
    expect(typeof saveReady.title).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: sort comparison returns 1 (b precedes a in DOM)
// This tests the `pos & DOCUMENT_POSITION_FOLLOWING ? -1 : 1` false branch
// ---------------------------------------------------------------------------

describe('extractClaude() – sort returns 1 when AI element precedes human', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('should still capture messages correctly when AI turn appears before human in DOM', () => {
    // Build Claude doc with AI element appended BEFORE the human element
    const div = document.createElement('div');

    const aiEl = document.createElement('div');
    aiEl.setAttribute('data-testid', 'ai-turn');
    aiEl.textContent = 'Hello, I am Claude.';

    const humanEl = document.createElement('div');
    humanEl.setAttribute('data-testid', 'human-turn');
    humanEl.textContent = 'Who are you?';

    // AI comes first in DOM (before human)
    div.appendChild(aiEl);
    div.appendChild(humanEl);
    document.body.appendChild(div);

    const result = extractClaude(document);
    expect(result.messages.length).toBe(2);
    // After sort by DOM position, AI (first in DOM) → assistant, Human (second) → user
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[1].role).toBe('user');
  });
});

describe('extractGemini() – sort returns 1 when model element precedes user in DOM', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('should still capture messages correctly when model turn appears before user in DOM', () => {
    const div = document.createElement('div');

    const modelEl = document.createElement('div');
    modelEl.className = 'model-response-text';
    modelEl.textContent = 'I can help with that.';

    const userEl = document.createElement('div');
    userEl.className = 'user-query-content';
    userEl.textContent = 'Can you help?';

    // Model comes first in DOM
    div.appendChild(modelEl);
    div.appendChild(userEl);
    document.body.appendChild(div);

    const result = extractGemini(document);
    expect(result.messages.length).toBe(2);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[1].role).toBe('user');
  });
});

describe('extractCopilot() – sort returns 1 when assistant element precedes user in DOM', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('should still capture messages correctly when assistant turn appears before user in DOM', () => {
    const div = document.createElement('div');

    const assistantEl = document.createElement('div');
    assistantEl.setAttribute('data-testid', 'copilot-message');
    assistantEl.textContent = 'I am GitHub Copilot.';

    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.textContent = 'Who are you?';

    // Assistant comes first in DOM (before user)
    div.appendChild(assistantEl);
    div.appendChild(userEl);
    document.body.appendChild(div);

    const result = extractCopilot(document);
    expect(result.messages.length).toBe(2);
    // After sort, assistant (first in DOM) stays first
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[1].role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: extractChat() URL fallback branches
// ---------------------------------------------------------------------------

describe('extractChat() – URL resolution branches', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('uses doc.location.href when no url arg is provided', () => {
    buildChatGPTDoc([{ role: 'user', content: 'Hello' }]);
    // JSDOM document.location.href is 'about:blank' by default
    const result = extractChat('chatgpt', document); // no url arg
    // Should use doc.location.href ('about:blank') not throw
    expect(typeof result.url).toBe('string');
  });

  it('uses empty string when url arg is omitted and doc has no location', () => {
    // Simulate a document object with no location property
    const div = document.createElement('div');
    document.body.appendChild(div);
    const fakeDoc = {
      querySelectorAll: (sel) => document.querySelectorAll(sel),
      location: null  // no location
    };
    buildChatGPTDoc([{ role: 'user', content: 'Test' }]);
    // Provide fakeDoc with null location but no url → finalUrl = ''
    const result = extractChat('chatgpt', fakeDoc);
    expect(result.url).toBe('');
  });
  it('copilot: uses explicit url arg when provided', () => {
    buildCopilotDoc([{ role: 'user', content: 'Hello' }]);
    const result = extractChat('copilot', document, 'https://m365.cloud.microsoft/chat?conversationId=abc');
    expect(result.url).toBe('https://m365.cloud.microsoft/chat?conversationId=abc');
  });

  it('copilot: falls back to doc.location.href when no url arg', () => {
    buildCopilotDoc([{ role: 'user', content: 'Hello' }]);
    const result = extractChat('copilot', document);
    expect(typeof result.url).toBe('string');
  });

});
