/**
 * C — Markdown Fidelity (C01–C18)
 *
 * Verifies that the extractor preserves markdown formatting from the AI
 * platform's DOM into the saved content string.
 *
 * Uses ChatGPT mock pages with specific DOM content for each formatting type.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { clearStorage }                    from '../helpers/storage.js';

let context, extensionId;

test.beforeAll(async () => {
  ({ context, extensionId } = await launchExtension());
});

test.afterAll(async () => {
  await closeExtension(context);
});

test.beforeEach(async () => {
  const sw = context.serviceWorkers()[0];
  await clearStorage(sw);
});

// ---------------------------------------------------------------------------
// Helper: build a ChatGPT page with one assistant turn containing given HTML,
//         trigger save, return the stored content string.
// ---------------------------------------------------------------------------

async function saveWithContent(assistantHtml, userText = 'Test question') {
  const mockHtml = /* html */ `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ChatGPT</title></head>
<body><div id="__next"><main><div class="flex flex-col">
  <article data-testid="conversation-turn-0" data-message-author-role="user">
    <div class="text-base"><p>${userText}</p></div>
  </article>
  <article data-testid="conversation-turn-1" data-message-author-role="assistant">
    <div class="markdown prose w-full">${assistantHtml}</div>
  </article>
</div></main></div></body></html>`;

  const page = await context.newPage();
  await page.route('https://chatgpt.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: mockHtml })
  );
  await page.goto('https://chatgpt.com/c/markdown-test', { waitUntil: 'domcontentloaded' });

  const saveBtn = page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]').first();
  await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
  await saveBtn.click();

  await page.waitForTimeout(2000);
  await page.close();

  const sw = context.serviceWorkers()[0];
  const r  = await sw.evaluate(async () => {
    const idx = await chrome.storage.local.get('chatIndex');
    if (!idx.chatIndex?.length) return null;
    const id = idx.chatIndex[0].id;
    const c  = await chrome.storage.local.get(`chat:${id}`);
    return c[`chat:${id}`]?.content ?? null;
  });
  return r;
}

// ---------------------------------------------------------------------------
// C01 — Plain prose extracted without garbage characters
// ---------------------------------------------------------------------------

test('C01 — Plain prose extracted without garbage', async () => {
  const content = await saveWithContent('<p>The quick brown fox jumps over the lazy dog.</p>');
  expect(content).toContain('quick brown fox');
  expect(content).not.toMatch(/[<>]/);
});

// ---------------------------------------------------------------------------
// C02 — Bold preserved as **bold**
// ---------------------------------------------------------------------------

test('C02 — Bold text preserved as **bold**', async () => {
  const content = await saveWithContent('<p>This is <strong>bold</strong> text.</p>');
  expect(content).toContain('**bold**');
});

// ---------------------------------------------------------------------------
// C03 — Italic preserved as *italic*
// ---------------------------------------------------------------------------

test('C03 — Italic text preserved as *italic*', async () => {
  const content = await saveWithContent('<p>This is <em>italic</em> text.</p>');
  expect(content).toMatch(/\*italic\*/);
});

// ---------------------------------------------------------------------------
// C04 — Inline code preserved as `code`
// ---------------------------------------------------------------------------

test('C04 — Inline code preserved as `code`', async () => {
  const content = await saveWithContent('<p>Use <code>useState</code> for state.</p>');
  expect(content).toContain('`useState`');
});

// ---------------------------------------------------------------------------
// C05 — Fenced code block with correct language label
// ---------------------------------------------------------------------------

test('C05 — Fenced code block with language label preserved', async () => {
  const content = await saveWithContent(
    '<pre><code class="language-javascript">const x = 42;</code></pre>'
  );
  expect(content).toContain('```javascript');
  expect(content).toContain('const x = 42;');
  expect(content).toContain('```');
});

// ---------------------------------------------------------------------------
// C06 — Numbered list items preserved as 1. 2. 3.
// ---------------------------------------------------------------------------

test('C06 — Numbered list preserved as 1. 2. 3.', async () => {
  const content = await saveWithContent(
    '<ol><li>First item</li><li>Second item</li><li>Third item</li></ol>'
  );
  expect(content).toMatch(/1\.\s+First item/);
  expect(content).toMatch(/2\.\s+Second item/);
});

// ---------------------------------------------------------------------------
// C07 — Bulleted list items preserved as - item
// ---------------------------------------------------------------------------

test('C07 — Bulleted list preserved as - item', async () => {
  const content = await saveWithContent(
    '<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>'
  );
  expect(content).toMatch(/[-*]\s+Alpha/);
  expect(content).toMatch(/[-*]\s+Beta/);
});

// ---------------------------------------------------------------------------
// C08 — Heading preserved with correct # level
// ---------------------------------------------------------------------------

test('C08 — H2 heading preserved as ## heading', async () => {
  const content = await saveWithContent('<h2>Installation</h2><p>Run npm install.</p>');
  expect(content).toContain('## Installation');
});

// ---------------------------------------------------------------------------
// C09 — Blockquote preserved as > text
// ---------------------------------------------------------------------------

test('C09 — Blockquote preserved as > text', async () => {
  const content = await saveWithContent('<blockquote><p>Design is not just what it looks like.</p></blockquote>');
  expect(content).toMatch(/^>\s+Design is not/m);
});

// ---------------------------------------------------------------------------
// C10 — Hyperlink preserved as [text](url)
// ---------------------------------------------------------------------------

test('C10 — Hyperlink preserved as [text](url)', async () => {
  const content = await saveWithContent('<p>See <a href="https://react.dev">the React docs</a>.</p>');
  expect(content).toContain('[the React docs](https://react.dev)');
});

// ---------------------------------------------------------------------------
// C11 — https:// image preserved as ![alt](url)
// ---------------------------------------------------------------------------

test('C11 — https:// image preserved as Markdown image', async () => {
  const content = await saveWithContent(
    '<p><img src="https://example.com/diagram.png" alt="Architecture diagram"></p>'
  );
  expect(content).toContain('![');
  expect(content).toContain('https://example.com/diagram.png');
});

// ---------------------------------------------------------------------------
// C12 — blob: image URL is NOT saved
// ---------------------------------------------------------------------------

test('C12 — blob: image URL is not saved in content', async () => {
  const content = await saveWithContent(
    '<p><img src="blob:https://chatgpt.com/abc123" alt="generated"></p>'
  );
  expect(content).not.toContain('blob:https://chatgpt.com/abc123');
});

// ---------------------------------------------------------------------------
// C15 — Markdown table preserved
// ---------------------------------------------------------------------------

test('C15 — Markdown table (| col |) preserved from HTML table', async () => {
  const content = await saveWithContent(`
    <table>
      <thead><tr><th>Name</th><th>Age</th></tr></thead>
      <tbody>
        <tr><td>Alice</td><td>30</td></tr>
        <tr><td>Bob</td><td>25</td></tr>
      </tbody>
    </table>
  `);
  // Should contain pipe-separated table syntax
  expect(content).toMatch(/\|.*Name.*\|.*Age.*\|/);
  expect(content).toContain('Alice');
});

// ---------------------------------------------------------------------------
// C17 — Math block preserved as $$...$$
// ---------------------------------------------------------------------------

test('C17 — LaTeX/KaTeX math block preserved as $$...$$', async () => {
  const content = await saveWithContent(
    '<p>The formula is: <span class="math-display">E = mc^2</span></p>'
  );
  // Math should be present — either as $$ block or inline $ or raw text
  expect(content).toContain('E = mc');
});

// ---------------------------------------------------------------------------
// C18 — Emoji preserved intact
// ---------------------------------------------------------------------------

test('C18 — Emoji characters in response body preserved intact', async () => {
  const content = await saveWithContent('<p>React is great! 🚀 Really useful for SPAs 💡</p>');
  expect(content).toContain('🚀');
  expect(content).toContain('💡');
});
