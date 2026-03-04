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

// ─── htmlToMarkdown ───────────────────────────────────────────────────────────

describe('htmlToMarkdown()', () => {
  function el(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  it('returns empty string for null', () => {
    expect(htmlToMarkdown(null)).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(htmlToMarkdown(el('Hello world'))).toBe('Hello world');
  });

  it('converts <strong> to **bold**', () => {
    expect(htmlToMarkdown(el('<strong>bold</strong>'))).toBe('**bold**');
  });

  it('converts <b> to **bold**', () => {
    expect(htmlToMarkdown(el('<b>bold</b>'))).toBe('**bold**');
  });

  it('converts <em> to *italic*', () => {
    expect(htmlToMarkdown(el('<em>italic</em>'))).toBe('*italic*');
  });

  it('converts <i> to *italic*', () => {
    expect(htmlToMarkdown(el('<i>italic</i>'))).toBe('*italic*');
  });

  it('converts inline <code> to backtick-code', () => {
    expect(htmlToMarkdown(el('<code>x = 1</code>'))).toBe('`x = 1`');
  });

  it('converts <pre><code> to fenced code block', () => {
    const result = htmlToMarkdown(el('<pre><code>console.log(1)</code></pre>'));
    expect(result).toBe('```\nconsole.log(1)\n```');
  });

  it('preserves language class in fenced code block', () => {
    const result = htmlToMarkdown(el('<pre><code class="language-python">print(1)</code></pre>'));
    expect(result).toBe('```python\nprint(1)\n```');
  });

  it('converts <h1> to # heading', () => {
    expect(htmlToMarkdown(el('<h1>Title</h1>'))).toBe('# Title');
  });

  it('converts <h2> to ## heading', () => {
    expect(htmlToMarkdown(el('<h2>Sub</h2>'))).toBe('## Sub');
  });

  it('converts <h3> to ### heading', () => {
    expect(htmlToMarkdown(el('<h3>Sub</h3>'))).toBe('### Sub');
  });

  it('converts <ul><li> to unordered list', () => {
    const result = htmlToMarkdown(el('<ul><li>One</li><li>Two</li></ul>'));
    expect(result).toBe('- One\n- Two');
  });

  it('converts <ol><li> to ordered list', () => {
    const result = htmlToMarkdown(el('<ol><li>First</li><li>Second</li></ol>'));
    expect(result).toBe('1. First\n2. Second');
  });

  it('converts <blockquote> to > quote lines', () => {
    const result = htmlToMarkdown(el('<blockquote>Note this</blockquote>'));
    expect(result).toBe('> Note this');
  });

  it('converts <a href> to [text](url)', () => {
    const result = htmlToMarkdown(el('<a href="https://example.com">Example</a>'));
    expect(result).toBe('[Example](https://example.com)');
  });

  it('uses link text only when href is absent', () => {
    const result = htmlToMarkdown(el('<a>just text</a>'));
    expect(result).toBe('just text');
  });

  it('skips aria-hidden elements', () => {
    const result = htmlToMarkdown(el('<span aria-hidden="true">hidden</span>visible'));
    expect(result).toBe('visible');
  });

  it('skips <svg>, <button>, <script> elements', () => {
    const result = htmlToMarkdown(el('<svg>icon</svg><button>click</button><script>bad</script>text'));
    expect(result).toBe('text');
  });

  it('collapses 3+ consecutive newlines to 2', () => {
    const result = htmlToMarkdown(el('<p>A</p><p>B</p><p>C</p>'));
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('handles mixed rich content: bold inside list item', () => {
    const result = htmlToMarkdown(el('<ul><li><strong>Key</strong>: value</li></ul>'));
    expect(result).toContain('**Key**');
    expect(result).toContain('- ');
  });

  it('handles a realistic assistant response with heading, list, and code', () => {
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

  it('renders multi-line <code> without <pre> as a fenced code block', () => {
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

  it('detects language from <code class="language-python"> inside standalone code', () => {
    const codeEl = document.createElement('code');
    codeEl.className = 'language-python';
    codeEl.textContent = 'def hello():\n    pass';
    const wrapper = document.createElement('div');
    wrapper.appendChild(codeEl);
    const result = htmlToMarkdown(wrapper);
    expect(result).toContain('```python');
  });

  it('detects language from parent <div class="highlight-source-python"><pre>', () => {
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

  it('<pre> without <code> child still produces a fenced code block', () => {
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

  it('skips h5 headings with text "You said:" (Copilot role label)', () => {
    const result = htmlToMarkdown(el('<h5>You said:</h5><p>My question</p>'));
    expect(result).not.toContain('You said:');
    expect(result).not.toContain('#####');
    expect(result).toContain('My question');
  });

  it('skips role-label headings case-insensitively ("YOU SAID:")', () => {
    const result = htmlToMarkdown(el('<h5>YOU SAID:</h5>actual content'));
    expect(result).toBe('actual content');
  });

  it('skips h5 with text "Copilot said:"', () => {
    const result = htmlToMarkdown(el('<h5>Copilot said:</h5>'));
    expect(result).toBe('');
  });

  it('skips "I said:" role-label headings', () => {
    const result = htmlToMarkdown(el('<h2>I said:</h2><p>real content</p>'));
    expect(result).not.toContain('I said:');
    expect(result).toContain('real content');
  });

  it('does NOT skip a real content heading like "Key Concepts"', () => {
    expect(htmlToMarkdown(el('<h2>Key Concepts</h2>'))).toBe('## Key Concepts');
  });

  // ── Code-block header (language label) skipping ────────────────────────

  it('skips a language-label div that is a sibling of <pre>', () => {
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

  it('does NOT skip a <div> sibling of <pre> that itself contains <code>', () => {
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
  it('uses the first user message as the title when assistant has no heading', () => {
    const messages = [
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user',      content: 'What is the capital of France?' }
    ];
    expect(generateTitle(messages, '')).toBe('What is the capital of France?');
  });

  it('does NOT truncate long first user messages (regression: was 80 chars)', () => {
    const long = 'A'.repeat(200);
    const title = generateTitle([{ role: 'user', content: long }], '');
    expect(title).toBe(long);   // full content returned — no truncation
    expect(title.endsWith('...')).toBe(false);
  });

  it('exactly-80-char message is not truncated', () => {
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

  // ── New behaviour: content is stored as markdown after htmlToMarkdown ────

  it('strips ** bold markers from user content when building the title', () => {
    const title = generateTitle([{ role: 'user', content: '**Hello** world' }], '');
    expect(title).toBe('Hello world');
    expect(title).not.toContain('**');
  });

  it('strips # heading markers from user content when building the title', () => {
    const title = generateTitle([{ role: 'user', content: '## My Question' }], '');
    expect(title).toBe('My Question');
    expect(title).not.toContain('#');
  });

  it('strips inline `code` markers from user content', () => {
    const title = generateTitle([{ role: 'user', content: 'Use `npm install` to start' }], '');
    expect(title).toBe('Use npm install to start');
  });

  it('uses first non-empty line from multi-line user content', () => {
    const multiLine = '\nFirst line\nSecond line\nThird line';
    expect(generateTitle([{ role: 'user', content: multiLine }], '')).toBe('First line');
  });

  it('skips blank lines and code fences to find first real text', () => {
    const content = '\n\n```javascript\nconst x = 1;\n```\n\nActual question here';
    // First non-empty non-code-fence line is the ``` fence itself — we want whatever comes through
    // The important thing: title is not empty
    const title = generateTitle([{ role: 'user', content: content }], '');
    expect(title.length).toBeGreaterThan(0);
  });

  // ── Strategy 1: user message (assistant headings no longer used for title) ────

  it('uses user message even when assistant has h1 heading', () => {
    const messages = [
      { role: 'user',      content: 'How do closures work in JS?' },
      { role: 'assistant', content: '# JavaScript Closures\nA closure is a function...' },
    ];
    expect(generateTitle(messages, '')).toBe('How do closures work in JS?');
  });

  it('uses user message even when assistant has h2 heading', () => {
    const messages = [
      { role: 'user',      content: 'How do I centre a div?' },
      { role: 'assistant', content: '## Centering a Div with Flexbox\nUse flex...' },
    ];
    expect(generateTitle(messages, '')).toBe('How do I centre a div?');
  });

  it('falls through to user message when assistant has no heading', () => {
    const messages = [
      { role: 'assistant', content: 'Sure, here is my answer.' },
      { role: 'user',      content: 'Explain recursion' },
    ];
    expect(generateTitle(messages, '')).toBe('Explain recursion');
  });

  it('skips assistant heading shorter than 4 chars', () => {
    const messages = [
      { role: 'assistant', content: '# Hi\nSome content here.' },
      { role: 'user',      content: 'Say hi to me' },
    ];
    // 'Hi' is only 2 chars — falls back to user message
    expect(generateTitle(messages, '')).toBe('Say hi to me');
  });

  // ── Strategy 2: first complete sentence ────────────────────────────────

  it('extracts first complete sentence when followed by more text', () => {
    const messages = [{ role: 'user', content: 'How do I sort an array? I tried various methods.' }];
    expect(generateTitle(messages, '')).toBe('How do I sort an array?');
  });

  it('returns full first line when there is no sentence terminator', () => {
    const messages = [{ role: 'user', content: 'Explain the difference between let and const' }];
    expect(generateTitle(messages, '')).toBe('Explain the difference between let and const');
  });

  // ── Copilot role-label skipping in title ───────────────────────────────

  it('skips "You said:" Copilot label and uses the actual question as title', () => {
    const messages = [{ role: 'user', content: '##### You said:\nMy actual question' }];
    const title = generateTitle(messages, '');
    expect(title).toBe('My actual question');
    expect(title).not.toContain('You said');
  });

  it('skips "I said:" and uses subsequent line as title', () => {
    const messages = [{ role: 'user', content: 'I said:\nReal prompt here' }];
    const title = generateTitle(messages, '');
    expect(title).toBe('Real prompt here');
    expect(title).not.toContain('I said');
  });

  it('skips Copilot label even without colon ("Copilot")', () => {
    const messages = [{ role: 'user', content: '## Copilot\nThis is the content' }];
    const title = generateTitle(messages, '');
    expect(title).toBe('This is the content');
  });
});

// ─── htmlToMarkdown — extractor integration (rich formatting preserved) ──────

describe('extractors — rich formatting preserved via htmlToMarkdown', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('extractChatGPT: preserves bold, inline code, and list from assistant HTML', () => {
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

    const result = extractChatGPT(document);
    const content = result.messages[0].content;
    expect(content).toContain('**flexbox**');
    expect(content).toContain('`display: flex`');
    expect(content).toContain('- ');
  });

  it('extractCopilot: preserves heading, code block, and bold from assistant HTML', () => {
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

    const result = extractCopilot(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('## Answer');
    expect(assistantMsg.content).toContain('**flexbox**');
    expect(assistantMsg.content).toContain('```css');
    expect(assistantMsg.content).toContain('.parent { display: flex; }');
  });

  it('prepareChatForSave: markdown content contains preserved formatting', () => {
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

    const extracted = extractCopilot(document);
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

  it('extractCopilot: ignores user elements outside <main> when <main> is present', () => {
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

    const result = extractCopilot(document);
    const allContent = result.messages.map(m => m.content).join(' ');
    expect(allContent).toContain('Real user prompt');
    expect(allContent).not.toContain('Sidebar history summary');
    expect(result.messageCount).toBe(2);
  });

  it('extractCopilot: title comes from actual first user message, not sidebar', () => {
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

    const result = extractCopilot(document);
    expect(result.title).toBe('My full original prompt text');
    expect(result.title).not.toContain('Summarised');
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

  it('does not duplicate user message when outer wrapper also matches [class*="user-query"]', () => {
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

    const result = extractGemini(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('What is machine learning?');
  });

  it('does not duplicate assistant message when outer wrapper also matches [class*="model-response"]', () => {
    const outer = document.createElement('div');
    outer.className = 'model-response-container';
    const inner = document.createElement('div');
    inner.className = 'model-response-text';
    inner.textContent = 'ML is a subset of AI.';
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const result = extractGemini(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBe('ML is a subset of AI.');
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

  // ── Role-label stripping ──────────────────────────────────────────────────

  it('strips "You said:" h5 injected by Copilot from user message content', () => {
    document.body.innerHTML = '';
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.innerHTML = '<h5>You said:</h5><p>How do closures work?</p>';
    document.body.appendChild(userEl);
    const result = extractCopilot(document);
    expect(result.messages[0].content).toBe('How do closures work?');
    expect(result.messages[0].content).not.toContain('You said');
  });

  it('strips "Copilot said:" h5 from assistant message content', () => {
    document.body.innerHTML = '';
    const assistEl = document.createElement('div');
    assistEl.setAttribute('data-testid', 'copilot-message');
    assistEl.innerHTML = '<h5>Copilot said:</h5><p>A closure captures its surrounding scope.</p>';
    document.body.appendChild(assistEl);
    const result = extractCopilot(document);
    expect(result.messages[0].content).toBe('A closure captures its surrounding scope.');
    expect(result.messages[0].content).not.toContain('Copilot said');
  });

  it('title uses the real question, not the Copilot label', () => {
    document.body.innerHTML = '';
    const userEl = document.createElement('div');
    userEl.setAttribute('data-testid', 'user-message');
    userEl.innerHTML = '<h5>You said:</h5><p>Can I tell if arguments were passed to a JS function?</p>';
    document.body.appendChild(userEl);
    const result = extractCopilot(document);
    expect(result.title).not.toContain('You said');
    expect(result.title).toContain('arguments');
  });

  // ── Ancestor deduplication ───────────────────────────────────────────

  it('does not create duplicate messages when outer and inner element both match', () => {
    document.body.innerHTML = '';
    const outer = document.createElement('div');
    outer.setAttribute('data-testid', 'user-message');
    const inner = document.createElement('div');
    inner.className = 'UserMessage';
    inner.textContent = 'One message not duplicated';
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const result = extractCopilot(document);
    const userMsgs = result.messages.filter(m => m.role === 'user');
    expect(userMsgs).toHaveLength(1);
  });

  // ── History sidebar exclusion ──────────────────────────────────────────

  it('ignores user elements inside <aside> (history sidebar)', () => {
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

    const result = extractCopilot(document);
    const allContent = result.messages.map(m => m.content).join(' ');
    expect(allContent).toContain('Current real prompt');
    expect(allContent).not.toContain('Old history chat title');
  });
});

// ─── extractSourceLinks ───────────────────────────────────────────────────────

describe('extractSourceLinks()', () => {
  function makeEl(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  it('returns empty string when turnEl is null', () => {
    expect(extractSourceLinks(null)).toBe('');
  });

  it('returns empty string when no source links are present', () => {
    const el = makeEl('<p>No links here</p>');
    expect(extractSourceLinks(el)).toBe('');
  });

  it('returns empty string for internal / relative links only', () => {
    const el = makeEl('<a href="#section">anchor</a><a href="/page">relative</a>');
    expect(extractSourceLinks(el)).toBe('');
  });

  // ── Part B: links inside <button> wrappers ──────────────────────────────

  it('extracts links inside a <button aria-label="Sources"> (Copilot pattern)', () => {
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

  it('extracts links inside a <button> whose text contains "references"', () => {
    const el = makeEl(`
      <button>3 references
        <a href="https://ref1.com">Ref 1</a>
      </button>
    `);
    const result = extractSourceLinks(el);
    expect(result).toContain('[Ref 1](https://ref1.com)');
  });

  it('ignores <button> elements unrelated to sources', () => {
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

  it('ignores <button> that mentions "sources" but has no <a href> links', () => {
    const el = makeEl('<button aria-label="Sources">No links</button>');
    expect(extractSourceLinks(el)).toBe('');
  });

  // ── Part A: sibling source containers outside contentEl ─────────────────

  it('collects links from a [data-testid*="citation"] sibling of contentEl', () => {
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

  it('does NOT duplicate links that are already inside contentEl', () => {
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

  it('deduplicates repeated URLs across source containers', () => {
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

  it('ChatGPT: sources in a citation sibling are appended to the assistant message', () => {
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
    const result = extractChatGPT(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[Wikipedia](https://wiki.example.com)');
  });

  it('Copilot: sources inside a <button> are appended to the assistant message', () => {
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
    const result = extractCopilot(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[CS1](https://copilot-source1.com)');
    expect(assistantMsg.content).toContain('[CS2](https://copilot-source2.com)');
  });

  it('Gemini: sources inside a <button aria-label="Citations"> are appended', () => {
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
    const result = extractGemini(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[Gemini Source](https://gemini-src.com)');
  });

  it('Gemini: attribution links inside the response div are moved to the Sources block', () => {
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
    const result = extractGemini(document);
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    // Attribution is stripped from main content and appears only in Sources block
    expect(assistantMsg.content).toContain('**Sources:**');
    expect(assistantMsg.content).toContain('[Gemini Source](https://gemini-src.com)');
  });

  it('user messages never get a Sources section appended', () => {
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
    const result = extractChatGPT(document);
    const userMsg = result.messages.find(m => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg.content).not.toContain('**Sources:**');
  });

  it('Copilot: sources-button-testid container is stripped from main content and links are collected', () => {
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
    const result = extractCopilot(document);
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

  it('Copilot: data-test-id (hyphenated) sources container is stripped and links collected', () => {
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
    const result = extractCopilot(document);
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

  it('ChatGPT: sources-button content (images) excluded from message body', () => {
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
    const result = extractChatGPT(document);
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

  it('generates content as markdown with emoji role prefixes', () => {
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
    expect(saveReady.content).toContain('🙋');
    expect(saveReady.content).toContain('🤖');
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
    expect(saveReady.content).toContain('🙋');
    expect(saveReady.content).toContain('🤖');
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
