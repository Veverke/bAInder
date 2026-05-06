/**
 * e2e/helpers/mock-pages.js
 *
 * Mock HTML pages for each supported AI platform.
 *
 * These are served via page.route() in content-script tests (A, B, C, D
 * categories) so the extension's content scripts inject into a controlled
 * page that has the same URL pattern as the real platform.
 *
 * Usage:
 *   await page.route('https://chatgpt.com/**', route =>
 *     route.fulfill({ contentType: 'text/html', body: CHATGPT_MOCK_PAGE })
 *   );
 *   await page.goto('https://chatgpt.com/c/test-conv-123');
 *
 * The extension's content script injects because the URL matches the
 * manifest host_permissions pattern. The mock HTML contains the DOM
 * structure that each platform's extractor expects.
 */

// ---------------------------------------------------------------------------
// ChatGPT mock page
// DOM: article[data-testid^="conversation-turn"][data-message-author-role]
//      content in .markdown div
// ---------------------------------------------------------------------------
export const CHATGPT_MOCK_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ChatGPT</title>
</head>
<body>
  <div id="__next">
    <main>
      <div class="flex flex-col" role="presentation">
        <article data-testid="conversation-turn-0" data-message-author-role="user">
          <div class="min-h-[20px] text-base">
            <p>What are React hooks and why should I use them?</p>
          </div>
        </article>
        <article data-testid="conversation-turn-1" data-message-author-role="assistant">
          <div class="markdown prose w-full">
            <p>React Hooks are functions that let you use <strong>state</strong> and other React features in function components.</p>
            <p>The most commonly used hooks are:</p>
            <ul>
              <li><code>useState</code> — manages local component state</li>
              <li><code>useEffect</code> — runs side effects after rendering</li>
              <li><code>useContext</code> — consumes a Context value</li>
            </ul>
            <pre><code class="language-javascript">function Counter() {
  const [count, setCount] = useState(0);
  return &lt;button onClick={() =&gt; setCount(c =&gt; c + 1)}&gt;{count}&lt;/button&gt;;
}</code></pre>
            <p>Hooks replaced class components as the primary way to write React, making logic more reusable and composable.</p>
          </div>
        </article>
        <article data-testid="conversation-turn-2" data-message-author-role="user">
          <div class="min-h-[20px] text-base">
            <p>How does <code>useEffect</code> cleanup work?</p>
          </div>
        </article>
        <article data-testid="conversation-turn-3" data-message-author-role="assistant">
          <div class="markdown prose w-full">
            <p>Return a function from <code>useEffect</code> and React will call it when the component unmounts or before the effect runs again:</p>
            <pre><code class="language-javascript">useEffect(() =&gt; {
  const subscription = subscribe(userId);
  // Cleanup: runs on unmount or when userId changes
  return () =&gt; subscription.unsubscribe();
}, [userId]);</code></pre>
            <p>This prevents <strong>memory leaks</strong> from lingering subscriptions, timers, or event listeners.</p>
          </div>
        </article>
      </div>
    </main>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// ChatGPT — empty new-chat page (no conversation yet)
// ---------------------------------------------------------------------------
export const CHATGPT_EMPTY_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ChatGPT</title>
</head>
<body>
  <div id="__next">
    <main>
      <div class="empty-state">
        <h1>What can I help with?</h1>
      </div>
    </main>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Gemini mock page
// DOM: message-content[data-message-id] with user-query and model-response roles
// ---------------------------------------------------------------------------
export const GEMINI_MOCK_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Gemini</title>
</head>
<body>
  <chat-window>
    <div class="conversation-container">
      <user-query>
        <div class="query-content">
          <p>Explain quantum entanglement simply.</p>
        </div>
      </user-query>
      <model-response>
        <div class="response-content markdown">
          <p>Quantum entanglement is a phenomenon where two particles become <strong>correlated</strong> in such a way that measuring one instantly determines the state of the other, regardless of distance.</p>
          <p>Think of it like a pair of magic dice: no matter how far apart they are, when you roll one and get a 6, the other always shows a 1 — instantly, faster than light.</p>
          <p>Key points:</p>
          <ul>
            <li>Not "sending" information (no faster-than-light communication)</li>
            <li>The correlation is set up when the particles interact</li>
            <li>Measuring one "collapses" both particles' states simultaneously</li>
          </ul>
        </div>
      </model-response>
    </div>
  </chat-window>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Copilot mock page (copilot.microsoft.com)
// DOM: cib-chat-turn components with user/bot roles
// ---------------------------------------------------------------------------
export const COPILOT_MOCK_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Microsoft Copilot</title>
</head>
<body>
  <cib-serp>
    <cib-conversation>
      <cib-chat-turn data-turn-role="user">
        <cib-message-group>
          <div class="user-message">
            <p>Plan a 3-day trip to Tokyo.</p>
          </div>
        </cib-message-group>
      </cib-chat-turn>
      <cib-chat-turn data-turn-role="bot">
        <cib-message-group>
          <div class="response-message">
            <p>Here is a suggested <strong>3-day Tokyo itinerary</strong>:</p>
            <p><strong>Day 1 — East Tokyo:</strong> Senso-ji temple in Asakusa, Akihabara electronics district, Ueno Park museums.</p>
            <p><strong>Day 2 — West Tokyo:</strong> Shinjuku Gyoen garden, Harajuku Takeshita Street, Shibuya Crossing at dusk.</p>
            <p><strong>Day 3 — Day trip:</strong> Nikko UNESCO shrine complex (90 min by train) or Mt Takao hiking trail.</p>
          </div>
        </cib-message-group>
      </cib-chat-turn>
    </cib-conversation>
  </cib-serp>
</body>
</html>`;

// ---------------------------------------------------------------------------
// DeepSeek mock page
// DOM: .ds-message-container with user/assistant roles
// ---------------------------------------------------------------------------
export const DEEPSEEK_MOCK_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DeepSeek</title>
</head>
<body>
  <div id="root">
    <div class="ds-chat-container">
      <div class="ds-message-container" data-role="user">
        <div class="ds-message-content">
          <p>What is gradient descent and how does it work?</p>
        </div>
      </div>
      <div class="ds-message-container" data-role="assistant">
        <div class="ds-message-content markdown-body">
          <p>Gradient descent is an optimisation algorithm used to minimise a <strong>loss function</strong> by iteratively moving in the direction of steepest descent.</p>
          <p><strong>Intuition:</strong> imagine being blindfolded on a hilly landscape trying to reach the lowest point. You feel the slope under your feet and take a step downhill. Repeat until flat.</p>
          <p><strong>Update rule:</strong></p>
          <pre><code class="language-python">theta = theta - learning_rate * gradient(loss, theta)</code></pre>
          <p>Common variants:</p>
          <ul>
            <li><strong>Batch GD</strong> — uses all training data per step (slow but accurate)</li>
            <li><strong>Stochastic GD (SGD)</strong> — one sample per step (noisy but fast)</li>
            <li><strong>Mini-batch GD</strong> — balance of both (most common in practice)</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Perplexity mock page
// DOM: .prose answer block
// ---------------------------------------------------------------------------
export const PERPLEXITY_MOCK_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Perplexity</title>
</head>
<body>
  <div id="app">
    <div class="query-section">
      <h1 class="query-text">What is the CAP theorem in distributed systems?</h1>
    </div>
    <div class="answer-section">
      <div class="prose">
        <p>The <strong>CAP theorem</strong> (Brewer's theorem) states that a distributed system can guarantee at most <strong>two of three properties</strong> simultaneously:</p>
        <ul>
          <li><strong>Consistency</strong> — every read returns the most recent write</li>
          <li><strong>Availability</strong> — every request receives a response (not necessarily the latest)</li>
          <li><strong>Partition tolerance</strong> — the system continues to operate despite network partitions</li>
        </ul>
        <p>Since network partitions are unavoidable in real distributed systems, the practical choice is between <strong>CP</strong> (HBase, Zookeeper) and <strong>AP</strong> (Cassandra, DynamoDB) systems.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Helper: set up page routing for a given platform mock
// ---------------------------------------------------------------------------

const PLATFORM_MOCKS = {
  chatgpt:     { pattern: 'https://chatgpt.com/**',              page: CHATGPT_MOCK_PAGE },
  gemini:      { pattern: 'https://gemini.google.com/**',        page: GEMINI_MOCK_PAGE  },
  copilot:     { pattern: 'https://copilot.microsoft.com/**',    page: COPILOT_MOCK_PAGE },
  deepseek:    { pattern: 'https://chat.deepseek.com/**',        page: DEEPSEEK_MOCK_PAGE },
  perplexity:  { pattern: 'https://www.perplexity.ai/**',        page: PERPLEXITY_MOCK_PAGE },
};

/**
 * Configure page routing to serve a mock HTML page for the given platform.
 * Navigate to the returned URL to trigger content script injection.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'chatgpt'|'gemini'|'copilot'|'deepseek'|'perplexity'} platform
 * @param {string} [conversationPath]  Path segment after the origin (defaults to '/c/test-conv')
 * @returns {Promise<string>}  The URL that was navigated to
 */
export async function routeMockPlatform(page, platform, conversationPath = '/c/test-conv') {
  const mock = PLATFORM_MOCKS[platform];
  if (!mock) throw new Error(`Unknown platform: ${platform}`);

  await page.route(mock.pattern, route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: mock.page })
  );

  const origin = mock.pattern.replace('/**', '');
  const url    = `${origin}${conversationPath}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return url;
}
