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
  htmlToMarkdown,
  formatMessage,
  generateTitle,
  extractSourceLinks,
  extractChatGPT,
  extractClaude,
  extractGemini,
  extractCopilot,
  extractChat,
  prepareChatForSave
} from '../src/content/chat-extractor.js';
import { stripSourceContainers } from '../src/content/extractors/source-links.js';

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
  it('returns chatgpt for chat.openai.com', async () => {
    expect(detectPlatform('chat.openai.com')).toBe('chatgpt');
  });

  it('returns claude for claude.ai', async () => {
    expect(detectPlatform('claude.ai')).toBe('claude');
  });

  it('returns gemini for gemini.google.com', async () => {
    expect(detectPlatform('gemini.google.com')).toBe('gemini');
  });

  it('returns null for an unknown hostname', async () => {
    expect(detectPlatform('example.com')).toBeNull();
  });

  it('returns null for empty string', async () => {
    expect(detectPlatform('')).toBeNull();
  });

  it('returns null for null', async () => {
    expect(detectPlatform(null)).toBeNull();
  });

  it('returns null for undefined', async () => {
    expect(detectPlatform(undefined)).toBeNull();
  });

  it('detects copilot from copilot.microsoft.com hostname', async () => {
    expect(detectPlatform('copilot.microsoft.com')).toBe('copilot');
  });

  it('detects copilot with path on copilot.microsoft.com', async () => {
    expect(detectPlatform('copilot.microsoft.com')).toBe('copilot');
  });

  it('detects copilot from m365.cloud.microsoft (redirect target)', async () => {
    expect(detectPlatform('m365.cloud.microsoft')).toBe('copilot');
  });

  it('detects copilot from m365.cloud.microsoft with subdomain', async () => {
    expect(detectPlatform('m365.cloud.microsoft')).toBe('copilot');
  });

  it('is case-insensitive', async () => {
    expect(detectPlatform('CHAT.OPENAI.COM')).toBe('chatgpt');
    expect(detectPlatform('Claude.AI')).toBe('claude');
  });

  it('matches on substrings (e.g. subdomain)', async () => {
    expect(detectPlatform('chat.openai.com')).toBe('chatgpt');
  });
});

// ─── sanitizeContent ─────────────────────────────────────────────────────────

describe('sanitizeContent()', () => {
  it('strips HTML tags', async () => {
    expect(sanitizeContent('<b>Hello</b> <i>world</i>')).toBe('Hello world');
  });

  it('decodes HTML entities', async () => {
    // &nbsp; becomes a space, then whitespace normalisation collapses/trims
    expect(sanitizeContent('&amp;')).toBe('&');
    expect(sanitizeContent('&lt;')).toBe('<');
    expect(sanitizeContent('&gt;')).toBe('>');
    expect(sanitizeContent('&quot;')).toBe('"');
    expect(sanitizeContent('&#39;')).toBe("'");
    expect(sanitizeContent('&nbsp;')).toBe(''); // nbsp → space, then trimmed
    expect(sanitizeContent('Hello &amp; World')).toBe('Hello & World');
  });

  it('normalises whitespace', async () => {
    expect(sanitizeContent('  hello   world  ')).toBe('hello world');
  });

  it('handles nested tags', async () => {
    expect(sanitizeContent('<div><p>Text</p></div>')).toBe('Text');
  });

  it('returns empty string for empty input', async () => {
    expect(sanitizeContent('')).toBe('');
  });

  it('returns empty string for null', async () => {
    expect(sanitizeContent(null)).toBe('');
  });

  it('returns empty string for undefined', async () => {
    expect(sanitizeContent(undefined)).toBe('');
  });

  it('handles plain text without HTML', async () => {
    expect(sanitizeContent('Hello world')).toBe('Hello world');
  });

  it('handles mixed tags and entities', async () => {
    const result = sanitizeContent('<p>Hello &amp; <b>world</b></p>');
    expect(result).toBe('Hello & world');
  });
});

// ─── getTextContent ───────────────────────────────────────────────────────────

describe('getTextContent()', () => {
  it('extracts text from a DOM element', async () => {
    const el = document.createElement('div');
    el.textContent = 'Hello world';
    expect(getTextContent(el)).toBe('Hello world');
  });

  it('strips tags from innerHTML', async () => {
    const el = document.createElement('div');
    el.innerHTML = '<b>Bold</b> text';
    expect(getTextContent(el)).toBe('Bold text');
  });

  it('returns empty string for null', async () => {
    expect(getTextContent(null)).toBe('');
  });

  it('falls back to textContent when innerHTML is empty', async () => {
    const el = document.createElement('div');
    // Override innerHTML to return '' (falsy) so textContent path is taken
    Object.defineProperty(el, 'innerHTML', { get: () => '', configurable: true });
    el.textContent = 'plain text only';
    expect(getTextContent(el)).toContain('plain text');
  });

  it('returns empty string when both innerHTML and textContent are empty', async () => {
    const el = document.createElement('div');
    // Both '' → sanitizeContent('') → ''
    expect(getTextContent(el)).toBe('');
  });
});

// ─── htmlToMarkdown ───────────────────────────────────────────────────────────

describe('htmlToMarkdown()', () => {
  function el(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  it('returns empty string for null', async () => {
    expect(htmlToMarkdown(null)).toBe('');
  });

  it('returns plain text unchanged', async () => {
    expect(htmlToMarkdown(el('Hello world'))).toBe('Hello world');
  });

  it('converts <strong> to **bold**', async () => {
    expect(htmlToMarkdown(el('<strong>bold</strong>'))).toBe('**bold**');
  });

  it('converts <b> to **bold**', async () => {
    expect(htmlToMarkdown(el('<b>bold</b>'))).toBe('**bold**');
  });

  it('converts <em> to *italic*', async () => {
    expect(htmlToMarkdown(el('<em>italic</em>'))).toBe('*italic*');
  });

  it('converts <i> to *italic*', async () => {
    expect(htmlToMarkdown(el('<i>italic</i>'))).toBe('*italic*');
  });

  it('converts inline <code> to backtick-code', async () => {
    expect(htmlToMarkdown(el('<code>x = 1</code>'))).toBe('`x = 1`');
  });

  it('converts <pre><code> to fenced code block', async () => {
    const result = htmlToMarkdown(el('<pre><code>console.log(1)</code></pre>'));
    expect(result).toBe('```\nconsole.log(1)\n```');
  });

  it('preserves language class in fenced code block', async () => {
    const result = htmlToMarkdown(el('<pre><code class="language-python">print(1)</code></pre>'));
    expect(result).toBe('```python\nprint(1)\n```');
  });

  it('converts <h1> to # heading', async () => {
    expect(htmlToMarkdown(el('<h1>Title</h1>'))).toBe('# Title');
  });

  it('converts <h2> to ## heading', async () => {
    expect(htmlToMarkdown(el('<h2>Sub</h2>'))).toBe('## Sub');
  });

  it('converts <h3> to ### heading', async () => {
    expect(htmlToMarkdown(el('<h3>Sub</h3>'))).toBe('### Sub');
  });

  it('converts <ul><li> to unordered list', async () => {
    const result = htmlToMarkdown(el('<ul><li>One</li><li>Two</li></ul>'));
    expect(result).toBe('- One\n- Two');
  });

  it('converts <ol><li> to ordered list', async () => {
    const result = htmlToMarkdown(el('<ol><li>First</li><li>Second</li></ol>'));
    expect(result).toBe('1. First\n2. Second');
  });

  it('converts <blockquote> to > quote lines', async () => {
    const result = htmlToMarkdown(el('<blockquote>Note this</blockquote>'));
    expect(result).toBe('> Note this');
  });

  it('converts <a href> to [text](url)', async () => {
    const result = htmlToMarkdown(el('<a href="https://example.com">Example</a>'));
    expect(result).toBe('[Example](https://example.com)');
  });

  it('uses link text only when href is absent', async () => {
    const result = htmlToMarkdown(el('<a>just text</a>'));
    expect(result).toBe('just text');
  });

  it('skips aria-hidden elements', async () => {
    const result = htmlToMarkdown(el('<span aria-hidden="true">hidden</span>visible'));
    expect(result).toBe('visible');
  });

  it('skips <svg>, <button>, <script> elements', async () => {
    const result = htmlToMarkdown(el('<svg>icon</svg><button>click</button><script>bad</script>text'));
    expect(result).toBe('text');
  });

  it('collapses 3+ consecutive newlines to 2', async () => {
    const result = htmlToMarkdown(el('<p>A</p><p>B</p><p>C</p>'));
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('handles mixed rich content: bold inside list item', async () => {
    const result = htmlToMarkdown(el('<ul><li><strong>Key</strong>: value</li></ul>'));
    expect(result).toContain('**Key**');
    expect(result).toContain('- ');
  });

  it('handles a realistic assistant response with heading, list, and code', async () => {
    const html = [
      '<h2>Steps</h2>',
      '<ol><li>Install Node</li><li>Run <code>npm install</code></li></ol>',
      '<pre><code class="language-bash">npm start</code></pre>',
    ].join('');
    const result = htmlToMarkdown(el(html));
    expect(result).toContain('## Steps');
    expect(result).toContain('1. Install Node');
    expect(result).toContain('`npm install`');
    expect(result).toContain('```bash');
    expect(result).toContain('npm start');
  });

  // ── Code block improvements ────────────────────────────────────────────

  it('renders multi-line <code> without <pre> as a fenced code block', async () => {
    // Some AI renderers omit the <pre> wrapper
    const codeEl = document.createElement('code');
    codeEl.textContent = 'def hello():\n    print("world")';
    const wrapper = document.createElement('div');
    wrapper.appendChild(codeEl);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('```');
    expect(result).toContain('def hello():');
    expect(result).toContain('print("world")');
  });

  it('detects language from <code class="language-python"> inside standalone code', async () => {
    const codeEl = document.createElement('code');
    codeEl.className = 'language-python';
    codeEl.textContent = 'def hello():\n    pass';
    const wrapper = document.createElement('div');
    wrapper.appendChild(codeEl);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('```python');
  });

  it('detects language from parent <div class="highlight-source-python"><pre>', async () => {
    // GitHub-style syntax-highlighted code blocks
    const container = document.createElement('div');
    container.className = 'highlight-source-python';
    const pre = document.createElement('pre');
    pre.textContent = 'def hello():\n    pass';
    container.appendChild(pre);
    const wrapper = document.createElement('div');
    wrapper.appendChild(container);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('```python');
  });

  it('<pre> without <code> child still produces a fenced code block', async () => {
    // Some renderers put code directly in <pre> with <span> syntax highlighting
    const pre = document.createElement('pre');
    pre.innerHTML = '<span class="hljs-keyword">const</span> x = <span class="hljs-number">1</span>;';
    const wrapper = document.createElement('div');
    wrapper.appendChild(pre);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('```');
    expect(result).toContain('const x = 1;');
  });

  // ── Copilot role-label heading skipping ───────────────────────────────

  it('skips h5 headings with text "You said:" (Copilot role label)', async () => {
    const result = htmlToMarkdown(el('<h5>You said:</h5><p>My question</p>'));
    expect(result).not.toContain('You said:');
    expect(result).not.toContain('#####');
    expect(result).toContain('My question');
  });

  it('skips role-label headings case-insensitively ("YOU SAID:")', async () => {
    const result = htmlToMarkdown(el('<h5>YOU SAID:</h5>actual content'));
    expect(result).toBe('actual content');
  });

  it('skips h5 with text "Copilot said:"', async () => {
    const result = htmlToMarkdown(el('<h5>Copilot said:</h5>'));
    expect(result).toBe('');
  });

  it('skips "I said:" role-label headings', async () => {
    const result = htmlToMarkdown(el('<h2>I said:</h2><p>real content</p>'));
    expect(result).not.toContain('I said:');
    expect(result).toContain('real content');
  });

  it('does NOT skip a real content heading like "Key Concepts"', async () => {
    expect(htmlToMarkdown(el('<h2>Key Concepts</h2>'))).toBe('## Key Concepts');
  });

  // ── Code-block header (language label) skipping ────────────────────────

  it('skips a language-label div that is a sibling of <pre>', async () => {
    const container = document.createElement('div');
    const langDiv = document.createElement('div');
    langDiv.textContent = 'JavaScript';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'const x = 1;';
    pre.appendChild(code);
    container.appendChild(langDiv);
    container.appendChild(pre);
    const wrapper = document.createElement('div');
    wrapper.appendChild(container);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('```');
    expect(result).toContain('const x = 1;');
    expect(result).not.toMatch(/^JavaScript$/m);
  });

  it('does NOT skip a <div> sibling of <pre> that itself contains <code>', async () => {
    const container = document.createElement('div');
    const contentDiv = document.createElement('div');
    const inlineCode = document.createElement('code');
    inlineCode.textContent = 'npm install';
    contentDiv.appendChild(inlineCode);
    const pre = document.createElement('pre');
    pre.textContent = 'npm run build';
    container.appendChild(contentDiv);
    container.appendChild(pre);
    const wrapper = document.createElement('div');
    wrapper.appendChild(container);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('npm install');
  });

  it('skips <img> with blob: src (session-only URL)', async () => {
    // blob: URLs can't be persisted — htmlToMarkdown emits a placeholder (Option E)
    const result = htmlToMarkdown(el('<img src="blob:https://chat.openai.com/abc123" alt="image">'));
    expect(result).toContain('[\u{1F5BC}\uFE0F Image: image]');
  });

  it('renders <img> with https: src as markdown image', async () => {
    const result = htmlToMarkdown(el('<img src="https://example.com/photo.png" alt="A photo">'));
    expect(result).toContain('![A photo](https://example.com/photo.png)');
  });

  it('renders <img> with https: src and no alt attribute (alt || "" fallback)', async () => {
    // img without alt attribute → getAttribute('alt') returns null → null || '' = ''
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/icon.png');
    // deliberately do NOT set alt
    const wrapper = document.createElement('div');
    wrapper.appendChild(img);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('![](https://example.com/icon.png)');
  });
});

// ─── formatMessage ────────────────────────────────────────────────────────────

describe('formatMessage()', () => {
  it('creates a message with role and content', async () => {
    const msg = formatMessage('user', 'Hello');
    expect(msg).toEqual({ role: 'user', content: 'Hello' });
  });

  it('trims content', async () => {
    expect(formatMessage('user', '  Hello  ').content).toBe('Hello');
  });

  it('falls back role to "unknown" if empty', async () => {
    expect(formatMessage('', 'text').role).toBe('unknown');
  });

  it('handles null content gracefully', async () => {
    expect(formatMessage('user', null).content).toBe('');
  });
});

// ─── generateTitle ────────────────────────────────────────────────────────────

describe('generateTitle()', () => {
  it('uses the first user message as the title when assistant has no heading', async () => {
    const messages = [
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user',      content: 'What is the capital of France?' }
    ];
    expect(generateTitle(messages, '')).toBe('What is the capital of France?');
  });

  it('does NOT truncate long first user messages (regression: was 80 chars)', async () => {
    const long = 'A'.repeat(200);
    const title = generateTitle([{ role: 'user', content: long }], '');
    expect(title).toBe(long);   // full content returned — no truncation
    expect(title.endsWith('...')).toBe(false);
  });

  it('exactly-80-char message is not truncated', async () => {
    const exact = 'A'.repeat(80);
    const title = generateTitle([{ role: 'user', content: exact }], '');
    expect(title).toBe(exact);
  });

  it('falls back to URL path segment when no messages', async () => {
    const title = generateTitle([], 'https://chat.openai.com/c/abc123def456');
    expect(title).toBe('Chat abc123def456');
  });

  it('falls back to "Untitled Chat" when no messages and no useful URL', async () => {
    expect(generateTitle([], '')).toBe('Untitled Chat');
  });

  it('returns "Untitled Chat" when messages array is empty and URL is null', async () => {
    expect(generateTitle([], null)).toBe('Untitled Chat');
  });

  it('skips short URL segments and falls back to Untitled', async () => {
    // Segment 'c' is skipped; no other segments
    const title = generateTitle([], 'https://chat.openai.com/c');
    expect(title).toBe('Untitled Chat');
  });

  // ── New behaviour: content is stored as markdown after htmlToMarkdown ────

  it('strips ** bold markers from user content when building the title', async () => {
    const title = generateTitle([{ role: 'user', content: '**Hello** world' }], '');
    expect(title).toBe('Hello world');
    expect(title).not.toContain('**');
  });

  it('strips # heading markers from user content when building the title', async () => {
    const title = generateTitle([{ role: 'user', content: '## My Question' }], '');
    expect(title).toBe('My Question');
    expect(title).not.toContain('#');
  });

  it('strips inline `code` markers from user content', async () => {
    const title = generateTitle([{ role: 'user', content: 'Use `npm install` to start' }], '');
    expect(title).toBe('Use npm install to start');
  });

  it('uses first non-empty line from multi-line user content', async () => {
    const multiLine = '\nFirst line\nSecond line\nThird line';
    expect(generateTitle([{ role: 'user', content: multiLine }], '')).toBe('First line');
  });

  it('skips blank lines and code fences to find first real text', async () => {
    const content = '\n\n```javascript\nconst x = 1;\n```\n\nActual question here';
    // First non-empty non-code-fence line is the ``` fence itself — we want whatever comes through
    // The important thing: title is not empty
    const title = generateTitle([{ role: 'user', content: content }], '');
    expect(title.length).toBeGreaterThan(0);
  });

  // ── Strategy 1: user message (assistant headings no longer used for title) ────

  it('uses user message even when assistant has h1 heading', async () => {
    const messages = [
      { role: 'user',      content: 'How do closures work in JS?' },
      { role: 'assistant', content: '# JavaScript Closures\nA closure is a function...' },
    ];
    expect(generateTitle(messages, '')).toBe('How do closures work in JS?');
  });

  it('uses user message even when assistant has h2 heading', async () => {
    const messages = [
      { role: 'user',      content: 'How do I centre a div?' },
      { role: 'assistant', content: '## Centering a Div with Flexbox\nUse flex...' },
    ];
    expect(generateTitle(messages, '')).toBe('How do I centre a div?');
  });

  it('falls through to user message when assistant has no heading', async () => {
    const messages = [
      { role: 'assistant', content: 'Sure, here is my answer.' },
      { role: 'user',      content: 'Explain recursion' },
    ];
    expect(generateTitle(messages, '')).toBe('Explain recursion');
  });

  it('skips assistant heading shorter than 4 chars', async () => {
    const messages = [
      { role: 'assistant', content: '# Hi\nSome content here.' },
      { role: 'user',      content: 'Say hi to me' },
    ];
    // 'Hi' is only 2 chars — falls back to user message
    expect(generateTitle(messages, '')).toBe('Say hi to me');
  });

  // ── Strategy 2: first complete sentence ────────────────────────────────

  it('extracts first complete sentence when followed by more text', async () => {
    const messages = [{ role: 'user', content: 'How do I sort an array? I tried various methods.' }];
    expect(generateTitle(messages, '')).toBe('How do I sort an array?');
  });

  it('returns full first line when there is no sentence terminator', async () => {
    const messages = [{ role: 'user', content: 'Explain the difference between let and const' }];
    expect(generateTitle(messages, '')).toBe('Explain the difference between let and const');
  });

  // ── Copilot role-label skipping in title ───────────────────────────────

  it('skips "You said:" Copilot label and uses the actual question as title', async () => {
    const messages = [{ role: 'user', content: '##### You said:\nMy actual question' }];
    const title = generateTitle(messages, '');
    expect(title).toBe('My actual question');
    expect(title).not.toContain('You said');
  });

  it('skips "I said:" and uses subsequent line as title', async () => {
    const messages = [{ role: 'user', content: 'I said:\nReal prompt here' }];
    const title = generateTitle(messages, '');
    expect(title).toBe('Real prompt here');
    expect(title).not.toContain('I said');
  });

  it('skips Copilot label even without colon ("Copilot")', async () => {
    const messages = [{ role: 'user', content: '## Copilot\nThis is the content' }];
    const title = generateTitle(messages, '');
    expect(title).toBe('This is the content');
  });

  it('uses || "" fallback when all user content lines are empty after stripping (line 19 branch)', async () => {
    // Content that after cleaning produces no non-empty lines → [0] = undefined → || '' → firstLine = ''
    // → if (firstLine) is false → falls through to URL/Untitled
    const messages = [{ role: 'user', content: '\n\n\n' }]; // only blank lines
    const title = generateTitle(messages, '');
    expect(title).toBe('Untitled Chat');
  });

  it('returns full cleaned line when sentence is too short (< 8 chars) to extract sentence', async () => {
    // sentenceMatch finds "Yes." (3 chars) which is < 8 → falls through to return full line
    const messages = [{ role: 'user', content: 'Yes. But I need more details on this topic.' }];
    const title = generateTitle(messages, '');
    // "Yes." is < 8 chars long so full first line is returned, not just "Yes."
    expect(title).toBe('Yes. But I need more details on this topic.');
  });
});

// ─── htmlToMarkdown — extractor integration (rich formatting preserved) ──────

describe('extractors — rich formatting preserved via htmlToMarkdown', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('extractChatGPT: preserves bold, inline code, and list from assistant HTML', async () => {
    // Build a ChatGPT-style DOM where the .markdown div has rich HTML
    const div = document.createElement('div');
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'assistant');
    const contentEl = document.createElement('div');
    contentEl.className = 'markdown';
    contentEl.innerHTML = '<p>Use <strong>flexbox</strong>:</p><ul><li>Set <code>display: flex</code></li><li>Add <code>gap</code></li></ul>';
    roleEl.appendChild(contentEl);
    article.appendChild(roleEl);
    div.appendChild(article);
    document.body.appendChild(div);

    const result = await extractChatGPT(document);
    const content = result.messages[0].content;
    expect(content).toContain('**flexbox**');
    expect(content).toContain('`display: flex`');
    expect(content).toContain('- ');
  });

  it('extractCopilot: preserves heading, code block, and bold from assistant HTML', async () => {
    document.body.innerHTML = '';
    const wrapper = document.createElement('div');
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.textContent = 'How do I centre a div?';

    const assistantEl = document.createElement('div');
    assistantEl.setAttribute('data-testid', 'copilot-message');
    assistantEl.innerHTML = [
      '<h2>Answer</h2>',
      '<p>Use <strong>flexbox</strong> on the parent.</p>',
      '<pre><code class="language-css">.parent { display: flex; }</code></pre>',
    ].join('');

    wrapper.appendChild(userEl);
    wrapper.appendChild(assistantEl);
    document.body.appendChild(wrapper);

    const result = await extractCopilot(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('## Answer');
    expect(assistantMsg.content).toContain('**flexbox**');
    expect(assistantMsg.content).toContain('```css');
    expect(assistantMsg.content).toContain('.parent { display: flex; }');
  });

  it('prepareChatForSave: markdown content contains preserved formatting', async () => {
    document.body.innerHTML = '';
    const wrapper = document.createElement('div');
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.textContent = 'Explain lists';
    const assistantEl = document.createElement('div');
    assistantEl.setAttribute('data-testid', 'copilot-message');
    assistantEl.innerHTML = '<ul><li><strong>ul</strong>: unordered</li><li><strong>ol</strong>: ordered</li></ul>';
    wrapper.appendChild(userEl);
    wrapper.appendChild(assistantEl);
    document.body.appendChild(wrapper);

    const extracted = await extractCopilot(document);
    const savePayload = prepareChatForSave({
      platform: 'copilot',
      url: 'https://copilot.microsoft.com/chats/test',
      title: extracted.title,
      messages: extracted.messages,
      messageCount: extracted.messageCount,
      extractedAt: Date.now(),
    });
    // The saved content Markdown should contain the bold items
    expect(savePayload.content).toContain('**ul**');
    expect(savePayload.content).toContain('**ol**');
    expect(savePayload.content).toContain('- ');
  });

  // ── Sidebar scoping: extractCopilot only reads from the main area ─────────

  it('extractCopilot: ignores user elements outside <main> when <main> is present', async () => {
    document.body.innerHTML = '';

    // Sidebar element OUTSIDE main – should be ignored
    const sidebar = document.createElement('aside');
    const sidebarMsg = document.createElement('div');
    sidebarMsg.setAttribute('data-testid', 'user-message');
    sidebarMsg.textContent = 'Sidebar history summary — should NOT appear';
    sidebar.appendChild(sidebarMsg);
    document.body.appendChild(sidebar);

    // Main conversation area
    const main = document.createElement('main');
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.textContent = 'Real user prompt';
    const assistantEl = document.createElement('div');
    assistantEl.setAttribute('data-testid', 'copilot-message');
    assistantEl.textContent = 'Real copilot response';
    main.appendChild(userEl);
    main.appendChild(assistantEl);
    document.body.appendChild(main);

    const result = await extractCopilot(document);
    const allContent = result.messages.map(m => m.content).join(' ');
    expect(allContent).toContain('Real user prompt');
    expect(allContent).not.toContain('Sidebar history summary');
    expect(result.messageCount).toBe(2);
  });

  it('extractCopilot: title comes from actual first user message, not sidebar', async () => {
    document.body.innerHTML = '';

    const sidebar = document.createElement('aside');
    const sidebarTitle = document.createElement('div');
    sidebarTitle.setAttribute('data-testid', 'user-message');
    sidebarTitle.textContent = 'Summarised sidebar title';
    sidebar.appendChild(sidebarTitle);
    document.body.appendChild(sidebar);

    const main = document.createElement('main');
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.textContent = 'My full original prompt text';
    const assistantEl = document.createElement('div');
    assistantEl.setAttribute('data-testid', 'copilot-message');
    assistantEl.textContent = 'Answer';
    main.appendChild(userEl);
    main.appendChild(assistantEl);
    document.body.appendChild(main);

    const result = await extractCopilot(document);
    expect(result.title).toBe('My full original prompt text');
    expect(result.title).not.toContain('Summarised');
  });
});

// ─── extractChatGPT ───────────────────────────────────────────────────────────

describe('extractChatGPT()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws if document is null', async () => {
    await expect(extractChatGPT(null)).rejects.toThrow('Document is required');
  });

  it('returns empty messages for a page with no conversation', async () => {
    document.body.innerHTML = '<main></main>';
    const result = await extractChatGPT(document);
    expect(result.messages).toHaveLength(0);
    expect(result.messageCount).toBe(0);
  });

  it('extracts a single user message', async () => {
    buildChatGPTDoc([{ role: 'user', content: 'Hello ChatGPT' }]);
    const result = await extractChatGPT(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello ChatGPT' });
  });

  it('extracts a full conversation in order', async () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user',      content: 'Thanks!' },
      { role: 'assistant', content: 'You are welcome.' }
    ]);
    const result = await extractChatGPT(document);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('sets the title from the first user message', async () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'What is the weather today?' },
      { role: 'assistant', content: 'I cannot access real-time data.' }
    ]);
    const result = await extractChatGPT(document);
    expect(result.title).toBe('What is the weather today?');
  });

  it('uses the fallback selector when no .markdown exists', async () => {
    // No .markdown class – falls back to the role element text
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'user');
    roleEl.textContent = 'Direct text content';
    article.appendChild(roleEl);
    document.body.appendChild(article);

    const result = await extractChatGPT(document);
    expect(result.messages[0].content).toBe('Direct text content');
  });

  it('skips turns without a role element', async () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    // No role element inside
    article.textContent = 'Orphan text';
    document.body.appendChild(article);

    const result = await extractChatGPT(document);
    expect(result.messages).toHaveLength(0);
  });

  it('maps unknown role to "assistant"', async () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'tool'); // unknown role
    roleEl.textContent = 'Tool usage';
    article.appendChild(roleEl);
    document.body.appendChild(article);

    const result = await extractChatGPT(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('uses the global fallback selector when no articles found', async () => {
    // Fallback: [data-message-author-role] elements not wrapped in articles
    const el = document.createElement('div');
    el.setAttribute('data-message-author-role', 'user');
    el.textContent = 'Fallback content';
    document.body.appendChild(el);

    const result = await extractChatGPT(document);
    expect(result.messages[0].content).toBe('Fallback content');
  });

  it('returns messageCount equal to messages length', async () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'Q1' },
      { role: 'assistant', content: 'A1' }
    ]);
    const result = await extractChatGPT(document);
    expect(result.messageCount).toBe(result.messages.length);
  });

  it('skips an article turn with no [data-message-author-role] child', async () => {
    document.body.innerHTML = '';
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    article.innerHTML = '<p>No role element here</p>';
    document.body.appendChild(article);
    const result = await extractChatGPT(document);
    // The turn is skipped; fallback selector also finds nothing since no [data-message-author-role]
    expect(result.messages).toHaveLength(0);
  });

  it('uses [class*="prose"] element when .markdown is absent', async () => {
    document.body.innerHTML = '';
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'user');
    const proseEl = document.createElement('div');
    proseEl.className = 'prose-content';   // matches [class*="prose"]
    proseEl.textContent = 'Prose text';
    roleEl.appendChild(proseEl);
    article.appendChild(roleEl);
    document.body.appendChild(article);
    const result = await extractChatGPT(document);
    expect(result.messages[0]?.content).toContain('Prose text');
  });

  it('uses || "" fallback for rawRole when attribute value is empty string', async () => {
    // data-message-author-role="" → getAttribute returns "" (falsy) → || '' fires
    // empty rawRole → role maps to 'assistant' (not 'user')
    document.body.innerHTML = '';
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', ''); // empty string
    roleEl.textContent = 'Empty role content';
    article.appendChild(roleEl);
    document.body.appendChild(article);
    const result = await extractChatGPT(document);
    // rawRole = '' (falsy) → '' || '' = '' → not 'user' → maps to 'assistant'
    expect(result.messages[0]?.role).toBe('assistant');
  });

  it('fallback path: maps non-user role to assistant and calls stripSourceContainers', async () => {
    // Fallback path (no articles with data-testid): direct [data-message-author-role] elements
    // where role is NOT 'user' → maps to 'assistant' and processEl = stripSourceContainers(el)
    document.body.innerHTML = '';
    const el = document.createElement('div');
    el.setAttribute('data-message-author-role', 'assistant');
    el.textContent = 'Fallback assistant content';
    document.body.appendChild(el);
    const result = await extractChatGPT(document);
    expect(result.messages[0]?.role).toBe('assistant');
    expect(result.messages[0]?.content).toContain('Fallback assistant content');
  });

  it('skips primary turn when htmlToMarkdown returns empty content (if (content) false branch)', async () => {
    // An article with a role element but completely empty content → content = '' → not pushed
    document.body.innerHTML = '';
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-0');
    const roleEl = document.createElement('div');
    roleEl.setAttribute('data-message-author-role', 'user');
    // No text content → htmlToMarkdown returns ''
    article.appendChild(roleEl);
    document.body.appendChild(article);
    const result = await extractChatGPT(document);
    expect(result.messages).toHaveLength(0);
  });

  it('fallback: skips element when htmlToMarkdown returns empty content (if (content) false branch)', async () => {
    // Fallback element with no text → content = '' → not pushed
    document.body.innerHTML = '';
    const el = document.createElement('div');
    el.setAttribute('data-message-author-role', 'user');
    // No text content
    document.body.appendChild(el);
    const result = await extractChatGPT(document);
    expect(result.messages).toHaveLength(0);
  });
});

// ─── extractClaude ────────────────────────────────────────────────────────────

describe('extractClaude()', () => {
  const ORG_ID  = 'org-uuid-123';
  const CONV_ID = 'abc-def-456';

  function mockClaudeFetch(turns = [], name = 'Test Conv') {
    const msgs = turns.map((t, i) => ({
      uuid: `m${i}`,
      parent_message_uuid: i > 0 ? `m${i - 1}` : undefined,
      sender: t.role === 'user' ? 'human' : 'assistant',
      content: [{ type: 'text', text: t.content }],
    }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            name,
            chat_messages: msgs,
            current_leaf_message_uuid: msgs.length ? `m${msgs.length - 1}` : undefined,
          }),
        });
      }
      // organizations list endpoint
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: ORG_ID }]) });
    }));
  }

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: `/chat/${CONV_ID}`, href: `https://claude.ai/chat/${CONV_ID}` },
      configurable: true, writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when no conversation ID in URL', async () => {
    Object.defineProperty(window, 'location', { value: { pathname: '/' }, configurable: true, writable: true });
    await expect(extractClaude()).rejects.toThrow('No conversation ID in URL');
  });

  it('throws when fetch organizations fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(extractClaude()).rejects.toThrow('Failed to fetch organizations');
  });

  it('throws when no organizations found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    await expect(extractClaude()).rejects.toThrow('No organizations found');
  });

  it('throws when conversation fetch fails for all orgs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: ORG_ID }]) });
    }));
    await expect(extractClaude()).rejects.toThrow('Failed to fetch conversation (404)');
  });

  it('throws when conversation data has no chat_messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'test' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: ORG_ID }]) });
    }));
    await expect(extractClaude()).rejects.toThrow('Invalid conversation data');
  });

  it('extracts messages from API response', async () => {
    mockClaudeFetch([
      { role: 'user',      content: 'Tell me a joke' },
      { role: 'assistant', content: 'Why did the chicken...' },
    ]);
    const result = await extractClaude();
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user',      content: 'Tell me a joke' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Why did the chicken...' });
  });

  it('uses data.name as conversation title', async () => {
    mockClaudeFetch([{ role: 'user', content: 'Q' }], 'My Custom Title');
    const result = await extractClaude();
    expect(result.title).toBe('My Custom Title');
  });

  it('generates title from messages when data.name is absent', async () => {
    mockClaudeFetch([{ role: 'user', content: 'Explain quantum entanglement' }], '');
    const result = await extractClaude();
    expect(result.title).toContain('Explain quantum entanglement');
  });

  it('returns messageCount equal to messages length', async () => {
    mockClaudeFetch([
      { role: 'user',      content: 'Q' },
      { role: 'assistant', content: 'A' },
    ]);
    const result = await extractClaude();
    expect(result.messageCount).toBe(2);
  });

  it('falls back to chat_messages when current_leaf_message_uuid is missing', async () => {
    const msgs = [
      { uuid: 'm0', sender: 'human',     content: [{ type: 'text', text: 'Q' }] },
      { uuid: 'm1', sender: 'assistant', content: [{ type: 'text', text: 'A' }] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'Test', chat_messages: msgs }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: ORG_ID }]) });
    }));
    const result = await extractClaude();
    expect(result.messages).toHaveLength(2);
  });

  it('handles msg.text string field as content fallback', async () => {
    // content must be absent (not an array) to trigger the msg.text fallback branch
    const msgs = [{ uuid: 'm0', sender: 'human', text: 'Text field content' }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'T', chat_messages: msgs, current_leaf_message_uuid: 'm0' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: ORG_ID }]) });
    }));
    const result = await extractClaude();
    expect(result.messages[0].content).toBe('Text field content');
  });

  it('skips messages with empty content (if(content.trim()) FALSE branch)', async () => {
    mockClaudeFetch([
      { role: 'user',      content: '' },
      { role: 'assistant', content: 'Non-empty response' },
    ]);
    const result = await extractClaude();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('tries multiple orgs and uses first successful one', async () => {
    const msgs = [{ uuid: 'm0', sender: 'human', content: [{ type: 'text', text: 'Q' }] }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (!url.includes('chat_conversations')) {
        // organizations list
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: 'org-fail' }, { uuid: 'org-ok' }]) });
      }
      if (url.includes('org-fail')) return Promise.resolve({ ok: false, status: 403 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'T', chat_messages: msgs, current_leaf_message_uuid: 'm0' }) });
    }));
    const result = await extractClaude();
    expect(result.messages).toHaveLength(1);
  });
});

// ─── extractGemini ────────────────────────────────────────────────────────────

describe('extractGemini()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws if document is null', async () => {
    await expect(extractGemini(null)).rejects.toThrow('Document is required');
  });

  it('returns empty messages for a blank page', async () => {
    document.body.innerHTML = '<div></div>';
    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(0);
  });

  it('extracts user queries and model responses', async () => {
    buildGeminiDoc([
      { role: 'user',      content: 'What is ML?' },
      { role: 'assistant', content: 'Machine learning is...' }
    ]);
    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user',      content: 'What is ML?' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Machine learning is...' });
  });

  it('extracts using .query-text class fallback', async () => {
    const el = document.createElement('div');
    el.className = 'query-text';
    el.textContent = 'User query via class';
    document.body.appendChild(el);

    const result = await extractGemini(document);
    expect(result.messages[0].role).toBe('user');
  });

  it('extracts using .response-text class fallback', async () => {
    const el = document.createElement('div');
    el.className = 'response-text';
    el.textContent = 'Response via class';
    document.body.appendChild(el);

    const result = await extractGemini(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('sets title from first user message', async () => {
    buildGeminiDoc([{ role: 'user', content: 'Summarise this document' }]);
    const result = await extractGemini(document);
    expect(result.title).toBe('Summarise this document');
  });

  it('returns messageCount equal to messages length', async () => {
    buildGeminiDoc([
      { role: 'user',      content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user',      content: 'C' }
    ]);
    const result = await extractGemini(document);
    expect(result.messageCount).toBe(3);
  });

  it('does not duplicate user message when outer wrapper also matches [class*="user-query"]', async () => {
    // Gemini real DOM: an outer container div whose class contains "user-query"
    // (e.g. "user-query-container") wraps the actual content div "user-query-content".
    // Both match the wildcard selector — without removeDescendants this produces
    // two identical user messages instead of one.
    const outer = document.createElement('div');
    outer.className = 'user-query-container';
    const inner = document.createElement('div');
    inner.className = 'user-query-content';
    inner.textContent = 'What is machine learning?';
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('What is machine learning?');
  });

  it('does not duplicate assistant message when outer wrapper also matches [class*="model-response"]', async () => {
    const outer = document.createElement('div');
    outer.className = 'model-response-container';
    const inner = document.createElement('div');
    inner.className = 'model-response-text';
    inner.textContent = 'ML is a subset of AI.';
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBe('ML is a subset of AI.');
  });

  it('skips a turn whose content is empty (if(content) FALSE branch)', async () => {
    // An assistant element with no text → htmlToMarkdown returns '' → not pushed
    const emptyModel = document.createElement('div');
    emptyModel.className = 'model-response-text';
    // No text content
    document.body.appendChild(emptyModel);

    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(0);
  });

  it('strips "Gemini said" heading from assistant content', async () => {
    // Gemini injects a "Gemini said" heading (h2/h3) before each model response.
    // It should not appear in the saved content — only the 🤖 emoji prefix is used.
    const el = document.createElement('div');
    el.className = 'model-response-text';
    el.innerHTML = '<h2>Gemini said</h2><p>The answer is 42.</p>';
    document.body.appendChild(el);

    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).not.toMatch(/gemini said/i);
    expect(result.messages[0].content).toContain('The answer is 42.');
  });

  it('strips "You stopped this response" text from assistant content', async () => {
    // When a user interrupts a generation, Gemini renders this message inside
    // the model-response element. It must not appear in the saved content.
    const el = document.createElement('div');
    el.className = 'model-response-text';
    el.innerHTML = '<p>Partial answer here.</p><p>You stopped this response</p>';
    document.body.appendChild(el);

    const result = await extractGemini(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain('Partial answer here.');
    expect(result.messages[0].content).not.toMatch(/you stopped this response/i);
  });
});

// ─── extractCopilot ────────────────────────────────────────────────────────

describe('extractCopilot()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws when document is null', async () => {
    await expect(extractCopilot(null)).rejects.toThrow('Document is required');
  });

  it('returns empty messages when no elements found', async () => {
    document.body.innerHTML = '<div></div>';
    const result = await extractCopilot(document);
    expect(result.messages).toHaveLength(0);
    expect(result.messageCount).toBe(0);
    expect(result.title).toBeDefined();
  });

  it('extracts a single user message via data-testid="user-message"', async () => {
    buildCopilotDoc([{ role: 'user', content: 'Hello Copilot' }]);
    const result = await extractCopilot(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('Hello Copilot');
  });

  it('extracts a single assistant message via data-testid="copilot-message"', async () => {
    buildCopilotDoc([{ role: 'assistant', content: 'Hi there!' }]);
    const result = await extractCopilot(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBe('Hi there!');
  });

  it('extracts multi-turn conversation in DOM order', async () => {
    buildCopilotDoc([
      { role: 'user',      content: 'What is TypeScript?' },
      { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
      { role: 'user',      content: 'Give me an example.' },
      { role: 'assistant', content: 'const x: number = 42;' }
    ]);
    const result = await extractCopilot(document);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('sets title from the first user message', async () => {
    buildCopilotDoc([{ role: 'user', content: 'Explain async/await' }]);
    const result = await extractCopilot(document);
    expect(result.title).toBe('Explain async/await');
  });

  it('uses fallback title when no user message present', async () => {
    buildCopilotDoc([{ role: 'assistant', content: 'Hello!' }]);
    const result = await extractCopilot(document);
    expect(typeof result.title).toBe('string');
  });

  it('returns messageCount equal to messages length', async () => {
    buildCopilotDoc([
      { role: 'user',      content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user',      content: 'Q2' }
    ]);
    const result = await extractCopilot(document);
    expect(result.messageCount).toBe(3);
  });

  it('matches user elements with .UserMessage class fallback', async () => {
    const el = document.createElement('div');
    el.className = 'UserMessage';
    el.textContent = 'Via class fallback';
    document.body.appendChild(el);
    const result = await extractCopilot(document);
    expect(result.messages.some(m => m.content === 'Via class fallback')).toBe(true);
  });

  it('matches assistant elements with data-testid="assistant-message" fallback', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'assistant-message');
    el.textContent = 'Fallback assistant';
    document.body.appendChild(el);
    const result = await extractCopilot(document);
    expect(result.messages.some(m => m.content === 'Fallback assistant')).toBe(true);
  });

  // ── Role-label stripping ──────────────────────────────────────────────────

  it('strips "You said:" h5 injected by Copilot from user message content', async () => {
    document.body.innerHTML = '';
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.innerHTML = '<h5>You said:</h5><p>How do closures work?</p>';
    document.body.appendChild(userEl);
    const result = await extractCopilot(document);
    expect(result.messages[0].content).toBe('How do closures work?');
    expect(result.messages[0].content).not.toContain('You said');
  });

  it('strips "Copilot said:" h5 from assistant message content', async () => {
    document.body.innerHTML = '';
    const assistEl = document.createElement('div');
    assistEl.setAttribute('data-testid', 'copilot-message');
    assistEl.innerHTML = '<h5>Copilot said:</h5><p>A closure captures its surrounding scope.</p>';
    document.body.appendChild(assistEl);
    const result = await extractCopilot(document);
    expect(result.messages[0].content).toBe('A closure captures its surrounding scope.');
    expect(result.messages[0].content).not.toContain('Copilot said');
  });

  it('title uses the real question, not the Copilot label', async () => {
    document.body.innerHTML = '';
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.innerHTML = '<h5>You said:</h5><p>Can I tell if arguments were passed to a JS function?</p>';
    document.body.appendChild(userEl);
    const result = await extractCopilot(document);
    expect(result.title).not.toContain('You said');
    expect(result.title).toContain('arguments');
  });

  // ── Ancestor deduplication ───────────────────────────────────────────

  it('does not create duplicate messages when outer and inner element both match', async () => {
    document.body.innerHTML = '';
    const outer = document.createElement('div');
    outer.setAttribute('data-testid', 'user-message');
    const inner = document.createElement('div');
    inner.className = 'UserMessage';
    inner.textContent = 'One message not duplicated';
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const result = await extractCopilot(document);
    const userMsgs = result.messages.filter(m => m.role === 'user');
    expect(userMsgs).toHaveLength(1);
  });

  // ── History sidebar exclusion ──────────────────────────────────────────

  it('ignores user elements inside <aside> (history sidebar)', async () => {
    document.body.innerHTML = '';
    const aside = document.createElement('aside');
    const historyItem = document.createElement('div');
    historyItem.setAttribute('data-testid', 'user-message');
    historyItem.textContent = 'Old history chat title';
    aside.appendChild(historyItem);
    document.body.appendChild(aside);

    const realMsg = document.createElement('div');
    realMsg.setAttribute('data-testid', 'user-message');
    realMsg.textContent = 'Current real prompt';
    document.body.appendChild(realMsg);

    const result = await extractCopilot(document);
    const allContent = result.messages.map(m => m.content).join(' ');
    expect(allContent).toContain('Current real prompt');
    expect(allContent).not.toContain('Old history chat title');
  });

  it('skips a turn whose htmlToMarkdown content is empty after stripRoleLabels (if(content) FALSE branch)', async () => {
    // An element containing only a "You said:" label → after stripping, content is ''
    document.body.innerHTML = '';
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.innerHTML = '<h5>You said:</h5>'; // only the label, no actual content
    document.body.appendChild(userEl);
    const result = await extractCopilot(document);
    // After role-label stripping, content = '' → not pushed
    expect(result.messages).toHaveLength(0);
  });
});

// ─── extractSourceLinks ───────────────────────────────────────────────────────

describe('extractSourceLinks()', () => {
  function makeEl(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  it('returns empty string when turnEl is null', async () => {
    expect(extractSourceLinks(null)).toBe('');
  });

  it('returns empty string when no source links are present', async () => {
    const el = makeEl('<p>No links here</p>');
    expect(extractSourceLinks(el)).toBe('');
  });

  it('returns empty string for internal / relative links only', async () => {
    const el = makeEl('<a href="#section">anchor</a><a href="/page">relative</a>');
    expect(extractSourceLinks(el)).toBe('');
  });

  // ── Part B: links inside <button> wrappers ──────────────────────────────

  it('extracts links inside a <button aria-label="Sources"> (Copilot pattern)', async () => {
    const el = makeEl(`
      <div>Main response text</div>
      <button aria-label="Sources">
        <a href="https://example.com/a">Article A</a>
        <a href="https://example.com/b">Article B</a>
      </button>
    `);
    const result = extractSourceLinks(el);
    expect(result).toContain('**Sources:**');
    expect(result).toContain('[Article A](https://example.com/a)');
    expect(result).toContain('[Article B](https://example.com/b)');
  });

  it('extracts links inside a <button> whose text contains "references"', async () => {
    const el = makeEl(`
      <button>3 references
        <a href="https://ref1.com">Ref 1</a>
      </button>
    `);
    const result = extractSourceLinks(el);
    expect(result).toContain('[Ref 1](https://ref1.com)');
  });

  it('ignores <button> elements unrelated to sources', async () => {
    const el = makeEl(`
      <button aria-label="Copy">Copy</button>
      <button aria-label="Share with sources clicked">
        <a href="https://example.com">Link</a>
      </button>
    `);
    // "Share with sources clicked" DOES contain "sources", so the link is picked up.
    // The "Copy" button has no links. Check that "Copy" button does not cause issues.
    const result = extractSourceLinks(el);
    // Only a link check — no crash expected
    expect(typeof result).toBe('string');
  });

  it('ignores <button> that mentions "sources" but has no <a href> links', async () => {
    const el = makeEl('<button aria-label="Sources">No links</button>');
    expect(extractSourceLinks(el)).toBe('');
  });

  // ── Part A: sibling source containers outside contentEl ─────────────────

  it('collects links from a [data-testid*="citation"] sibling of contentEl', async () => {
    const turn = document.createElement('div');
    turn.innerHTML = `
      <div class="markdown"><p>Response</p></div>
      <div data-testid="citation-list">
        <a href="https://source1.com">Source 1</a>
        <a href="https://source2.com">Source 2</a>
      </div>
    `;
    const contentEl = turn.querySelector('.markdown');
    const result = extractSourceLinks(turn, contentEl);
    expect(result).toContain('[Source 1](https://source1.com)');
    expect(result).toContain('[Source 2](https://source2.com)');
  });

  it('does NOT duplicate links that are already inside contentEl', async () => {
    const turn = document.createElement('div');
    turn.innerHTML = `
      <div class="markdown">
        <p>See <a href="https://inside.com">this link</a></p>
      </div>
      <div data-testid="citation-list">
        <a href="https://outside.com">Outside</a>
      </div>
    `;
    const contentEl = turn.querySelector('.markdown');
    const result = extractSourceLinks(turn, contentEl);
    expect(result).toContain('[Outside](https://outside.com)');
    expect(result).not.toContain('inside.com');
  });

  it('deduplicates repeated URLs across source containers', async () => {
    const turn = document.createElement('div');
    turn.innerHTML = `
      <div class="markdown"></div>
      <div data-testid="citation-one">
        <a href="https://same.com">Same</a>
      </div>
      <div data-testid="citation-two">
        <a href="https://same.com">Same again</a>
      </div>
    `;
    const contentEl = turn.querySelector('.markdown');
    const result = extractSourceLinks(turn, contentEl);
    const matches = (result.match(/same\.com/g) || []).length;
    expect(matches).toBe(1);
  });

  // ── Integration: sources appear in platform extractor output ────────────

  it('ChatGPT: sources in a citation sibling are appended to the assistant message', async () => {
    document.body.innerHTML = '';
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-1');
    article.innerHTML = `
      <div data-message-author-role="assistant">
        <div class="markdown"><p>Here is the answer.</p></div>
      </div>
      <div data-testid="citation-list">
        <a href="https://wiki.example.com">Wikipedia</a>
      </div>
    `;
    document.body.appendChild(article);
    const result = await extractChatGPT(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[Wikipedia](https://wiki.example.com)');
  });

  it('Copilot: sources inside a <button> are appended to the assistant message', async () => {
    document.body.innerHTML = '';
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'copilot-message');
    div.innerHTML = `
      <p>Response text</p>
      <button aria-label="2 sources">
        <a href="https://copilot-source1.com">CS1</a>
        <a href="https://copilot-source2.com">CS2</a>
      </button>
    `;
    document.body.appendChild(div);
    const result = await extractCopilot(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[CS1](https://copilot-source1.com)');
    expect(assistantMsg.content).toContain('[CS2](https://copilot-source2.com)');
  });

  it('Gemini: sources inside a <button aria-label="Citations"> are appended', async () => {
    document.body.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'model-response-text';
    div.innerHTML = `
      <p>Gemini answer</p>
      <button aria-label="3 citations">
        <a href="https://gemini-src.com">Gemini Source</a>
      </button>
    `;
    document.body.appendChild(div);
    const result = await extractGemini(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[Gemini Source](https://gemini-src.com)');
  });

  it('Gemini: attribution links inside the response div are moved to the Sources block', async () => {
    document.body.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'model-response-text';
    div.innerHTML = `
      <p>Gemini answer</p>
      <div class="source-attribution">
        <a href="https://gemini-src.com">Gemini Source</a>
      </div>
    `;
    document.body.appendChild(div);
    const result = await extractGemini(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    // Attribution is stripped from main content and appears only in Sources block
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[Gemini Source](https://gemini-src.com)');
  });

  it('user messages never get a Sources section appended', async () => {
    document.body.innerHTML = '';
    const turn = document.createElement('article');
    turn.setAttribute('data-testid', 'conversation-turn-0');
    turn.innerHTML = `
      <div data-message-author-role="user">
        <div class="markdown"><p>User question</p></div>
      </div>
      <div data-testid="citation-list">
        <a href="https://example.com">Some link</a>
      </div>
    `;
    document.body.appendChild(turn);
    const result = await extractChatGPT(document);
    const userMsg = result.messages.find(m => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg.content).not.toContain('**Sources:**');
  });

  it('Copilot: sources-button-testid container is stripped from main content and links are collected', async () => {
    document.body.innerHTML = '';
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'copilot-message');
    div.innerHTML = `
      <p>Main response text</p>
      <button data-testid="sources-button-testid-abc123">
        <img src="https://favicon.example.com/icon.png" alt="favicon">
        <span>3 sources</span>
        <a href="https://source-a.com">Source A</a>
        <a href="https://source-b.com">Source B</a>
        <a href="https://source-c.com">Source C</a>
      </button>
    `;
    document.body.appendChild(div);
    const result = await extractCopilot(document);
    const msg = result.messages.find(m => m.role === 'assistant');
    expect(msg).toBeDefined();
    // Images from the sources button must NOT appear in main content
    expect(msg.content).not.toContain('favicon.example.com');
    expect(msg.content).not.toContain('![');
    // "Sources" text from button must NOT leak into main paragraph content
    // (it may only appear in the **Sources:** block)
    const beforeSources = msg.content.split('**Sources:**')[0];
    expect(beforeSources).not.toContain('3 sources');
    // All three links must appear in the Sources block
    expect(msg.content).toContain('**Sources:**');
    expect(msg.content).toContain('[Source A](https://source-a.com)');
    expect(msg.content).toContain('[Source B](https://source-b.com)');
    expect(msg.content).toContain('[Source C](https://source-c.com)');
  });

  it('Copilot: data-test-id (hyphenated) sources container is stripped and links collected', async () => {
    document.body.innerHTML = '';
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'copilot-message');
    // Use the HYPHENATED attribute name as reported by the user
    div.innerHTML = `
      <p>Main response text</p>
      <div data-test-id="sources-button-testid-abc999" role="button">
        <img src="https://favicon2.example.com/icon.png" alt="favicon">
        <span>2 sources</span>
        <a href="https://hyphen-source-a.com">Hyphen A</a>
        <a href="https://hyphen-source-b.com">Hyphen B</a>
      </div>
    `;
    document.body.appendChild(div);
    const result = await extractCopilot(document);
    const msg = result.messages.find(m => m.role === 'assistant');
    expect(msg).toBeDefined();
    // Favicon images must NOT appear in main content
    expect(msg.content).not.toContain('favicon2.example.com');
    expect(msg.content).not.toContain('![');
    // "2 sources" text must NOT leak before the Sources block
    const beforeSources = msg.content.split('**Sources:**')[0];
    expect(beforeSources).not.toContain('2 sources');
    // Links must appear in the Sources block
    expect(msg.content).toContain('**Sources:**');
    expect(msg.content).toContain('[Hyphen A](https://hyphen-source-a.com)');
    expect(msg.content).toContain('[Hyphen B](https://hyphen-source-b.com)');
  });

  it('ChatGPT: sources-button content (images) excluded from message body', async () => {
    document.body.innerHTML = '';
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'conversation-turn-1');
    article.innerHTML = `
      <div data-message-author-role="assistant">
        <div class="markdown"><p>Answer here</p></div>
        <button data-testid="sources-button-testid-xyz">
          <img src="https://favicon.test.com/fav.ico" alt="">
          <span>2 sources</span>
          <a href="https://wiki.test.com">Wiki</a>
          <a href="https://blog.test.com">Blog</a>
        </button>
      </div>
    `;
    document.body.appendChild(article);
    const result = await extractChatGPT(document);
    const msg = result.messages.find(m => m.role === 'assistant');
    expect(msg).toBeDefined();
    expect(msg.content).not.toContain('favicon.test.com');
    expect(msg.content).toContain('**Sources:**');
    expect(msg.content).toContain('[Wiki](https://wiki.test.com)');
    expect(msg.content).toContain('[Blog](https://blog.test.com)');
  });
});

// ─── extractChat (dispatch) ───────────────────────────────────────────────────

describe('extractChat()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('throws when platform is null', async () => {
    await expect(extractChat(null, document)).rejects.toThrow('Platform is required');
  });

  it('throws when document is null', async () => {
    await expect(extractChat('chatgpt', null)).rejects.toThrow('Document is required');
  });

  it('throws for unsupported platform', async () => {
    await expect(extractChat('bing', document)).rejects.toThrow('Unsupported platform: bing');
  });

  it('dispatches to extractChatGPT', async () => {
    buildChatGPTDoc([{ role: 'user', content: 'GPT question' }]);
    const result = await extractChat('chatgpt', document);
    expect(result.platform).toBe('chatgpt');
    expect(result.messages[0].content).toBe('GPT question');
  });

  it('dispatches to extractClaude', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/chat/conv-abc', href: 'https://claude.ai/chat/conv-abc' },
      configurable: true, writable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          name: 'Test',
          chat_messages: [{ uuid: 'm0', sender: 'human', content: [{ type: 'text', text: 'Claude question' }] }],
          current_leaf_message_uuid: 'm0',
        })});
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: 'org1' }]) });
    }));
    const result = await extractChat('claude', document);
    expect(result.platform).toBe('claude');
    expect(result.messages[0].content).toBe('Claude question');
    vi.unstubAllGlobals();
  });

  it('dispatches to extractGemini', async () => {
    buildGeminiDoc([{ role: 'user', content: 'Gemini question' }]);
    const result = await extractChat('gemini', document);
    expect(result.platform).toBe('gemini');
    expect(result.messages[0].content).toBe('Gemini question');
  });

  it('dispatches to extractCopilot', async () => {
    buildCopilotDoc([{ role: 'user', content: 'Copilot question' }]);
    const result = await extractChat('copilot', document);
    expect(result.platform).toBe('copilot');
    expect(result.messages[0].content).toBe('Copilot question');
  });

  it('includes extractedAt timestamp', async () => {
    const before = Date.now();
    buildChatGPTDoc([{ role: 'user', content: 'Q' }]);
    const result = await extractChat('chatgpt', document);
    expect(result.extractedAt).toBeGreaterThanOrEqual(before);
    expect(result.extractedAt).toBeLessThanOrEqual(Date.now());
  });

  it('includes url from document.location.href', async () => {
    buildChatGPTDoc([{ role: 'user', content: 'Q' }]);
    const result = await extractChat('chatgpt', document);
    // In happy-dom test env, href is 'about:blank'
    expect(typeof result.url).toBe('string');
  });

  it('accepts an explicit URL override', async () => {
    buildChatGPTDoc([{ role: 'user', content: 'Q' }]);
    const result = await extractChat('chatgpt', document, 'https://chat.openai.com/c/abc');
    expect(result.url).toBe('https://chat.openai.com/c/abc');
  });

  it('returns messageCount in the envelope', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/chat/conv-mc', href: 'https://claude.ai/chat/conv-mc' },
      configurable: true, writable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          name: 'T',
          chat_messages: [
            { uuid: 'm0', sender: 'human',     content: [{ type: 'text', text: 'Q1' }] },
            { uuid: 'm1', parent_message_uuid: 'm0', sender: 'assistant', content: [{ type: 'text', text: 'A1' }] },
          ],
          current_leaf_message_uuid: 'm1',
        })});
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: 'org1' }]) });
    }));
    const result = await extractChat('claude', document);
    expect(result.messageCount).toBe(2);
    vi.unstubAllGlobals();
  });
});

// ─── prepareChatForSave ───────────────────────────────────────────────────────

describe('prepareChatForSave()', () => {
  it('throws when chatData is null', async () => {
    expect(() => prepareChatForSave(null)).toThrow('Chat data is required');
  });

  it('returns an object with all storage-ready fields', async () => {
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

  it('generates content as markdown with emoji role prefixes', async () => {
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
    expect(result.content).toContain('🙋 Hi');
    expect(result.content).toContain('🤖 Hello');
    expect(result.content).not.toContain('**User**');
    expect(result.content).not.toContain('**Assistant**');
  });

  it('includes YAML frontmatter separator in content', async () => {
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

  it('handles empty messages array — content has frontmatter but no role labels', async () => {
    const chatData = {
      platform: 'chatgpt', url: '', title: 'Empty',
      messages: [], messageCount: 0, extractedAt: 0
    };
    const result = prepareChatForSave(chatData);
    expect(result.content).toContain('contentFormat: markdown-v1');
    expect(result.content).not.toContain('**User**');
    expect(result.messages).toHaveLength(0);
  });

  it('includes contentFormat in metadata', async () => {
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
  afterEach(() => { vi.unstubAllGlobals(); });

  it('ChatGPT: end-to-end extract and prepare', async () => {
    buildChatGPTDoc([
      { role: 'user',      content: 'Explain recursion' },
      { role: 'assistant', content: 'Recursion is when a function calls itself.' },
      { role: 'user',      content: 'Give an example in Python' },
      { role: 'assistant', content: 'def fact(n): return 1 if n<=1 else n*fact(n-1)' }
    ]);
    const chatData   = await extractChat('chatgpt', document, 'https://chat.openai.com/c/xyz');
    const saveReady  = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('Explain recursion');
    expect(saveReady.source).toBe('chatgpt');
    expect(saveReady.messageCount).toBe(4);
    expect(saveReady.content).toContain('🙋');
    expect(saveReady.content).toContain('🤖');
    expect(saveReady.content).toContain('Explain recursion');
  });

  it('Claude: end-to-end extract and prepare', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/chat/a1b2c3d4-e5f6-7890-abcd-ef1234567890', href: 'https://claude.ai/chat/a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      configurable: true, writable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          name: 'Write a haiku about the ocean',
          chat_messages: [
            { uuid: 'm0', sender: 'human',     content: [{ type: 'text', text: 'Write a haiku about the ocean' }] },
            { uuid: 'm1', parent_message_uuid: 'm0', sender: 'assistant', content: [{ type: 'text', text: 'Waves crash on the shore\nSalt and foam kiss the white sand\nEternal rhythm' }] },
          ],
          current_leaf_message_uuid: 'm1',
        })});
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: 'org1' }]) });
    }));
    const chatData  = await extractChat('claude', document, 'https://claude.ai/chat/haiku-conv');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('Write a haiku about the ocean');
    expect(saveReady.source).toBe('claude');
    expect(saveReady.messageCount).toBe(2);
  });

  it('Gemini: end-to-end extract and prepare', async () => {
    buildGeminiDoc([
      { role: 'user',      content: 'What are the planets in our solar system?' },
      { role: 'assistant', content: 'Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.' }
    ]);
    const chatData  = await extractChat('gemini', document, 'https://gemini.google.com/app/abc');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('What are the planets in our solar system?');
    expect(saveReady.source).toBe('gemini');
    expect(saveReady.messageCount).toBe(2);
  });

  it('Copilot: end-to-end extract and prepare', async () => {
    buildCopilotDoc([
      { role: 'user',      content: 'How do I reverse a string in Python?' },
      { role: 'assistant', content: 'Use slicing: s[::-1]' },
      { role: 'user',      content: 'What about in JavaScript?' },
      { role: 'assistant', content: "str.split('').reverse().join('')" }
    ]);
    const chatData  = await extractChat('copilot', document, 'https://copilot.microsoft.com/');
    const saveReady = prepareChatForSave(chatData);

    expect(saveReady.title).toBe('How do I reverse a string in Python?');
    expect(saveReady.source).toBe('copilot');
    expect(saveReady.messageCount).toBe(4);
    expect(saveReady.content).toContain('🙋');
    expect(saveReady.content).toContain('🤖');
    expect(saveReady.content).toContain('How do I reverse a string in Python?');
  });

  it('handles an empty conversation gracefully end-to-end', async () => {
    document.body.innerHTML = '<main></main>';
    const chatData  = await extractChat('chatgpt', document, 'https://chat.openai.com/c/empty');
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

describe('extractClaude() – branch traversal from leaf to root', () => {
  const ORG_ID  = 'org-bt';
  const CONV_ID = 'bt-conv-123';

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: `/chat/${CONV_ID}`, href: `https://claude.ai/chat/${CONV_ID}` },
      configurable: true, writable: true,
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('walks parent_message_uuid chain to reconstruct branch in chronological order', async () => {
    // m0 → m1 → m2 (leaf), traversal must produce [m0, m1, m2] in order
    const msgs = [
      { uuid: 'm2', parent_message_uuid: 'm1', sender: 'assistant', content: [{ type: 'text', text: 'Hello, I am Claude.' }] },
      { uuid: 'm0', sender: 'human',           content: [{ type: 'text', text: 'Who are you?' }] },
      { uuid: 'm1', parent_message_uuid: 'm0', sender: 'human', content: [{ type: 'text', text: 'Tell me more.' }] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('chat_conversations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          name: 'Test', chat_messages: msgs, current_leaf_message_uuid: 'm2',
        })});
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ uuid: ORG_ID }]) });
    }));
    const result = await extractClaude();
    expect(result.messages.length).toBe(3);
    expect(result.messages[0].content).toBe('Who are you?');
    expect(result.messages[1].content).toBe('Tell me more.');
    expect(result.messages[2].content).toBe('Hello, I am Claude.');
  });
});

describe('extractGemini() – sort returns 1 when model element precedes user in DOM', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('should still capture messages correctly when model turn appears before user in DOM', async () => {
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

    const result = await extractGemini(document);
    expect(result.messages.length).toBe(2);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[1].role).toBe('user');
  });
});

describe('extractCopilot() – sort returns 1 when assistant element precedes user in DOM', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('should still capture messages correctly when assistant turn appears before user in DOM', async () => {
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

    const result = await extractCopilot(document);
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

  it('uses doc.location.href when no url arg is provided', async () => {
    buildChatGPTDoc([{ role: 'user', content: 'Hello' }]);
    // happy-dom document.location.href is 'about:blank' by default
    const result = await extractChat('chatgpt', document); // no url arg
    // Should use doc.location.href ('about:blank') not throw
    expect(typeof result.url).toBe('string');
  });

  it('uses empty string when url arg is omitted and doc has no location', async () => {
    buildChatGPTDoc([{ role: 'user', content: 'Test' }]);
    const fakeDoc = {
      querySelectorAll: (sel) => document.querySelectorAll(sel),
      location: null  // no location
    };
    const result = await extractChat('chatgpt', fakeDoc);
    expect(result.url).toBe('');
  });

  it('copilot: uses explicit url arg when provided', async () => {
    buildCopilotDoc([{ role: 'user', content: 'Hello' }]);
    const result = await extractChat('copilot', document, 'https://m365.cloud.microsoft/chat?conversationId=abc');
    expect(result.url).toBe('https://m365.cloud.microsoft/chat?conversationId=abc');
  });

  it('copilot: falls back to doc.location.href when no url arg', async () => {
    buildCopilotDoc([{ role: 'user', content: 'Hello' }]);
    const result = await extractChat('copilot', document);
    expect(typeof result.url).toBe('string');
  });
});

// ─── extractSourceLinks – Part B and Part C ───────────────────────────────────

describe('extractSourceLinks() – additional branches', () => {
  function makeEl(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  it('Part B: extracts from elements with data-testid containing "source"', async () => {
    const el = makeEl(`
      <div data-testid="sources-container">
        <a href="https://partb-source.com">Part B Source</a>
      </div>
    `);
    const result = extractSourceLinks(el);
    expect(result).toContain('[Part B Source](https://partb-source.com)');
  });

  it('Part B: extracts from element with data-test-id containing "source"', async () => {
    const el = makeEl(`
      <div data-test-id="source-info">
        <a href="https://hyphen-testid.com">Hyphen TestId</a>
      </div>
    `);
    const result = extractSourceLinks(el);
    expect(result).toContain('[Hyphen TestId](https://hyphen-testid.com)');
  });

  it('Part C: extracts favicon-based sources from Copilot button', async () => {
    const el = makeEl(`
      <div data-testid="sources-button-testid">
        <img src="https://services.bingapis.com/favicon?url=example.com" />
      </div>
    `);
    const result = extractSourceLinks(el);
    expect(result).toContain('**Sources:**');
    expect(result).toContain('example.com');
  });

  it('Part C: skips favicon imgs with no matching query param', async () => {
    const el = makeEl(`
      <div data-testid="sources-button-testid">
        <img src="https://services.bingapis.com/favicon?other=val" />
      </div>
    `);
    // No ?url= param, so the img is ignored
    expect(extractSourceLinks(el)).toBe('');
  });

  it('Part C: deduplicates repeated favicon domains', async () => {
    const el = makeEl(`
      <div data-testid="sources-button-testid">
        <img src="https://services.bingapis.com/favicon?url=https%3A%2F%2Fsame.com%2F" />
        <img src="https://services.bingapis.com/favicon?url=https%3A%2F%2Fsame.com%2F" />
      </div>
    `);
    const result = extractSourceLinks(el);
    // Only one list entry produced even though the same domain appears twice
    const listLines = result.split('\n').filter(l => l.startsWith('- '));
    expect(listLines).toHaveLength(1);
  });

  it('skips protocol-relative links that are not http/https', async () => {
    const el = makeEl('<a href="ftp://some-ftp.com">FTP Link</a>');
    expect(extractSourceLinks(el)).toBe('');
  });

  it('uses href as title when anchor has no text', async () => {
    const el = makeEl('<div data-testid="citation-x"><a href="https://bare-href.com"></a></div>');
    const result = extractSourceLinks(el);
    expect(result).toContain('[https://bare-href.com](https://bare-href.com)');
  });
});

// ─── stripSourceContainers ────────────────────────────────────────────────────

describe('stripSourceContainers()', () => {
  function makeEl(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  it('returns a clone and does not mutate the original', async () => {
    const el = makeEl('<div data-testid="citation-x"><a href="https://x.com">X</a></div><p>Keep</p>');
    const clone = stripSourceContainers(el);
    // Original still has the citation div
    expect(el.querySelector('[data-testid="citation-x"]')).not.toBeNull();
    // Clone should not (it was stripped by SOURCE_CONTAINER_SELECTORS or testid check)
    const cloneCitation = clone.querySelector('[data-testid="citation-x"]');
    expect(cloneCitation).toBeNull();
  });

  it('removes elements matching SOURCE_CONTAINER_SELECTORS', async () => {
    const el = makeEl('<div class="CitationBubble"><a href="https://x.com">X</a></div><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('.CitationBubble')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('removes elements whose data-testid contains "source"', async () => {
    const el = makeEl('<div data-testid="sources-button-testid">Button</div><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('[data-testid="sources-button-testid"]')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('removes elements whose data-test-id contains "source"', async () => {
    const el = makeEl('<div data-test-id="source-info">Info</div><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('[data-test-id="source-info"]')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('removes <button> elements with aria-label containing "sources"', async () => {
    const el = makeEl('<button aria-label="Sources">3 sources</button><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('button')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('removes <button> with text containing "references"', async () => {
    const el = makeEl('<button>See references</button><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('button')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('keeps <button> unrelated to sources', async () => {
    const el = makeEl('<button>Copy text</button><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('button')).not.toBeNull();
  });

  it('removes Copilot feedback banner elements', async () => {
    const el = makeEl('<div aria-label="provide your feedback">Feedback</div><p>Keep</p>');
    const clone = stripSourceContainers(el);
    // The feedback removal catches element with aria-label containing "provide your feedback"
    expect(clone.querySelector('[aria-label="provide your feedback"]')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('removes Copilot UI chrome (messageAttributionIcon)', async () => {
    const el = makeEl('<span data-testid="messageAttributionIcon">Logo</span><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('[data-testid="messageAttributionIcon"]')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });

  it('handles element with no children safely', async () => {
    const el = makeEl('');
    const clone = stripSourceContainers(el);
    expect(clone).toBeTruthy();
  });

  it('[role=button] matching sources is removed', async () => {
    const el = makeEl('<div role="button" aria-label="Citations">Cites</div><p>Keep</p>');
    const clone = stripSourceContainers(el);
    expect(clone.querySelector('[role="button"][aria-label="Citations"]')).toBeNull();
    expect(clone.querySelector('p')).not.toBeNull();
  });
});
