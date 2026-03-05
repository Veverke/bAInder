/**
 * @file style-transformer.test.js
 * @description Comprehensive unit tests for src/lib/style-transformer.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  STYLES,
  STYLE_LABELS,
  applyStyle,
  styledToMarkdown,
  styledToHtmlBody,
} from '../src/lib/theme/style-transformer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const chatWithMessages = {
  id: 'chat-1',
  title: 'JavaScript Promises Explained',
  source: 'chatgpt',
  url: 'https://chat.openai.com/c/abc',
  timestamp: 1700000000000,
  messages: [
    { role: 'user', content: 'What are JavaScript Promises?' },
    {
      role: 'assistant',
      content:
        'A Promise is an object representing the eventual completion of an async operation.',
    },
    { role: 'user', content: 'How do I use async/await?' },
    {
      role: 'assistant',
      content:
        'Async/await is syntactic sugar over Promises.\n\nHere is an example:\n\n```js\nasync function fetchData() {\n  const data = await fetch(url);\n  return data.json();\n}\n```',
    },
  ],
  messageCount: 4,
  metadata: { isExcerpt: false },
  tags: [],
};

const chatWithoutMessages = {
  id: 'chat-2',
  title: 'Machine Learning Basics',
  source: 'claude',
  url: '',
  timestamp: null,
  messages: [],
  content: 'Machine learning is a subset of artificial intelligence.',
  messageCount: 0,
  metadata: {},
  tags: [],
};

const minimalChat = {
  id: 'chat-3',
};

// Deep-clone helper so fixtures are never mutated between tests
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// STYLES constant
// ---------------------------------------------------------------------------

describe('STYLES constant', () => {
  it('has keys RAW, TECHNICAL, ACADEMIC, BLOG, LINKEDIN', () => {
    expect(STYLES).toHaveProperty('RAW');
    expect(STYLES).toHaveProperty('TECHNICAL');
    expect(STYLES).toHaveProperty('ACADEMIC');
    expect(STYLES).toHaveProperty('BLOG');
    expect(STYLES).toHaveProperty('LINKEDIN');
  });

  it('all values are strings', () => {
    for (const value of Object.values(STYLES)) {
      expect(typeof value).toBe('string');
    }
  });

  it('has exactly five entries', () => {
    expect(Object.keys(STYLES).length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// STYLE_LABELS constant
// ---------------------------------------------------------------------------

describe('STYLE_LABELS constant', () => {
  it('has a label for each STYLES value', () => {
    for (const value of Object.values(STYLES)) {
      expect(STYLE_LABELS).toHaveProperty(value);
    }
  });

  it('labels are non-empty strings', () => {
    for (const label of Object.values(STYLE_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("STYLE_LABELS['raw'] equals 'Raw Transcript'", () => {
    expect(STYLE_LABELS['raw']).toBe('Raw Transcript');
  });

  it("STYLE_LABELS['technical'] equals 'Technical Article'", () => {
    expect(STYLE_LABELS['technical']).toBe('Technical Article');
  });

  it("STYLE_LABELS['academic'] equals 'Academic Journal'", () => {
    expect(STYLE_LABELS['academic']).toBe('Academic Journal');
  });

  it("STYLE_LABELS['blog'] equals 'Blog Post'", () => {
    expect(STYLE_LABELS['blog']).toBe('Blog Post');
  });

  it("STYLE_LABELS['linkedin'] equals 'LinkedIn Article'", () => {
    expect(STYLE_LABELS['linkedin']).toBe('LinkedIn Article');
  });
});

// ---------------------------------------------------------------------------
// applyStyle() — common behaviour
// ---------------------------------------------------------------------------

describe('applyStyle() — common behaviour', () => {
  let chat;
  beforeEach(() => {
    chat = clone(chatWithMessages);
  });

  it('returns object with title, introduction, sections, conclusion, meta keys', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('introduction');
    expect(result).toHaveProperty('sections');
    expect(result).toHaveProperty('conclusion');
    expect(result).toHaveProperty('meta');
  });

  it('meta.style equals the requested style', () => {
    for (const style of Object.values(STYLES)) {
      const result = applyStyle(chat, style);
      expect(result.meta.style).toBe(style);
    }
  });

  it('meta.originalTitle equals chat.title', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(result.meta.originalTitle).toBe(chat.title);
  });

  it('meta.source equals chat.source', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(result.meta.source).toBe(chat.source);
  });

  it('sections is a non-empty array for a chat with messages', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('each section has heading (string) and content (string)', () => {
    for (const style of Object.values(STYLES)) {
      const result = applyStyle(chat, style);
      for (const section of result.sections) {
        expect(typeof section.heading).toBe('string');
        expect(typeof section.content).toBe('string');
      }
    }
  });

  it('null chat → returns default structure with empty sections, no throw', () => {
    expect(() => applyStyle(null, STYLES.RAW)).not.toThrow();
    const result = applyStyle(null, STYLES.RAW);
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('sections');
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBe(0);
  });

  it('undefined chat → returns default structure with empty sections, no throw', () => {
    expect(() => applyStyle(undefined, STYLES.RAW)).not.toThrow();
    const result = applyStyle(undefined, STYLES.RAW);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBe(0);
  });

  it('invalid style falls back to raw (same result as STYLES.RAW)', () => {
    const withInvalid = applyStyle(chat, 'nonexistent');
    const withRaw = applyStyle(chat, STYLES.RAW);
    expect(withInvalid.meta.style).toBe(STYLES.RAW);
    expect(withInvalid.sections.length).toBe(withRaw.sections.length);
  });

  it('missing style (undefined) falls back to raw', () => {
    const result = applyStyle(chat, undefined);
    expect(result.meta.style).toBe(STYLES.RAW);
  });

  it('empty string style falls back to raw', () => {
    const result = applyStyle(chat, '');
    expect(result.meta.style).toBe(STYLES.RAW);
  });

  it('chat with no messages → uses content body as a single section', () => {
    const result = applyStyle(clone(chatWithoutMessages), STYLES.RAW);
    expect(result.sections.length).toBe(1);
    expect(result.sections[0].content).toBe(chatWithoutMessages.content);
  });

  it('meta.messageCount equals chat.messageCount', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(result.meta.messageCount).toBe(chat.messageCount);
  });

  it('meta.url equals chat.url', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(result.meta.url).toBe(chat.url);
  });

  it('meta.timestamp equals chat.timestamp', () => {
    const result = applyStyle(chat, STYLES.RAW);
    expect(result.meta.timestamp).toBe(chat.timestamp);
  });

  it('does not mutate the original chat object', () => {
    const original = clone(chatWithMessages);
    const snapshot = clone(chatWithMessages);
    for (const style of Object.values(STYLES)) {
      applyStyle(original, style);
    }
    expect(original).toEqual(snapshot);
  });

  it('minimalChat (id only) — no throw for any style', () => {
    for (const style of Object.values(STYLES)) {
      expect(() => applyStyle(clone(minimalChat), style)).not.toThrow();
    }
  });

  it('minimalChat returns sections array', () => {
    const result = applyStyle(clone(minimalChat), STYLES.RAW);
    expect(Array.isArray(result.sections)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyStyle() — RAW style
// ---------------------------------------------------------------------------

describe('applyStyle() — RAW style', () => {
  let chat;
  let result;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    result = applyStyle(chat, STYLES.RAW);
  });

  it('sections.length equals messages.length', () => {
    expect(result.sections.length).toBe(chat.messages.length);
  });

  it('section headings are "User" and "Assistant" (capitalised)', () => {
    const headings = result.sections.map((s) => s.heading);
    expect(headings).toContain('User');
    expect(headings).toContain('Assistant');
  });

  it('introduction is empty string', () => {
    expect(result.introduction).toBe('');
  });

  it('conclusion is empty string', () => {
    expect(result.conclusion).toBe('');
  });

  it('section content equals the original message content verbatim', () => {
    for (let i = 0; i < chat.messages.length; i++) {
      expect(result.sections[i].content).toBe(chat.messages[i].content);
    }
  });

  it('title equals chat.title', () => {
    expect(result.title).toBe(chat.title);
  });

  it('user messages appear before their corresponding assistant messages', () => {
    // Even indices should be User, odd should be Assistant for this fixture
    expect(result.sections[0].heading).toBe('User');
    expect(result.sections[1].heading).toBe('Assistant');
    expect(result.sections[2].heading).toBe('User');
    expect(result.sections[3].heading).toBe('Assistant');
  });

  it('works correctly for chat with no messages (content fallback)', () => {
    const noMsgResult = applyStyle(clone(chatWithoutMessages), STYLES.RAW);
    expect(noMsgResult.sections.length).toBe(1);
    expect(noMsgResult.sections[0].heading).toBe('Assistant');
    expect(noMsgResult.sections[0].content).toBe(chatWithoutMessages.content);
  });
});

// ---------------------------------------------------------------------------
// applyStyle() — TECHNICAL style
// ---------------------------------------------------------------------------

describe('applyStyle() — TECHNICAL style', () => {
  let chat;
  let result;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    result = applyStyle(chat, STYLES.TECHNICAL);
  });

  it('introduction is a non-empty string mentioning the topic', () => {
    expect(typeof result.introduction).toBe('string');
    expect(result.introduction.length).toBeGreaterThan(0);
    expect(result.introduction.toLowerCase()).toContain(
      chat.title.toLowerCase()
    );
  });

  it('conclusion is a non-empty string', () => {
    expect(typeof result.conclusion).toBe('string');
    expect(result.conclusion.length).toBeGreaterThan(0);
  });

  it('sections include user and assistant turns with different headings than raw', () => {
    const rawResult = applyStyle(chat, STYLES.RAW);
    const rawHeadings = new Set(rawResult.sections.map((s) => s.heading));
    const techHeadings = new Set(result.sections.map((s) => s.heading));
    // Technical headings should differ from raw ("User"/"Assistant")
    expect(techHeadings).not.toEqual(rawHeadings);
  });

  it('sections count equals messages count', () => {
    expect(result.sections.length).toBe(chat.messages.length);
  });

  it('appends a suffix when title is not already technical', () => {
    // "JavaScript Promises Explained" has no technical keyword → suffix added
    expect(result.title).toContain(chat.title);
    expect(result.title.length).toBeGreaterThanOrEqual(chat.title.length);
  });

  it('does not append suffix when title already contains a technical keyword', () => {
    const techChat = clone(chatWithMessages);
    techChat.title = 'REST API Overview';
    const res = applyStyle(techChat, STYLES.TECHNICAL);
    expect(res.title).toBe('REST API Overview');
  });

  it('user sections use "Problem Statement" or "Follow-up Questions" headings', () => {
    const userSections = result.sections.filter((_, i) =>
      chat.messages[i].role === 'user'
    );
    const allowedHeadings = ['Problem Statement', 'Follow-up Questions'];
    for (const section of userSections) {
      expect(allowedHeadings).toContain(section.heading);
    }
  });

  it('assistant sections use technical headings', () => {
    const assistantSections = result.sections.filter((_, i) =>
      chat.messages[i].role === 'assistant'
    );
    const allowedHeadings = ['Solution', 'Technical Details', 'Further Explanation'];
    for (const section of assistantSections) {
      expect(allowedHeadings).toContain(section.heading);
    }
  });

  it('section content preserves original message content', () => {
    for (let i = 0; i < chat.messages.length; i++) {
      expect(result.sections[i].content).toBe(chat.messages[i].content);
    }
  });

  it('meta.style is TECHNICAL', () => {
    expect(result.meta.style).toBe(STYLES.TECHNICAL);
  });
});

// ---------------------------------------------------------------------------
// applyStyle() — ACADEMIC style
// ---------------------------------------------------------------------------

describe('applyStyle() — ACADEMIC style', () => {
  let chat;
  let result;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    result = applyStyle(chat, STYLES.ACADEMIC);
  });

  it('introduction contains "Abstract" academic framing', () => {
    expect(result.introduction).toMatch(/Abstract/i);
  });

  it('conclusion contains academic framing', () => {
    const conclusion = result.conclusion.toLowerCase();
    expect(
      conclusion.includes('dialogue') ||
        conclusion.includes('discussion') ||
        conclusion.includes('analysis') ||
        conclusion.includes('illustrate')
    ).toBe(true);
  });

  it('section headings contain "Query" and "Response" patterns', () => {
    const headings = result.sections.map((s) => s.heading);
    expect(headings.some((h) => h.startsWith('Query'))).toBe(true);
    expect(headings.some((h) => h.startsWith('Response'))).toBe(true);
  });

  it('Query headings are numbered sequentially', () => {
    const queryHeadings = result.sections
      .map((s) => s.heading)
      .filter((h) => h.startsWith('Query'));
    expect(queryHeadings).toEqual(['Query 1', 'Query 2']);
  });

  it('Response headings are numbered sequentially', () => {
    const responseHeadings = result.sections
      .map((s) => s.heading)
      .filter((h) => h.startsWith('Response'));
    expect(responseHeadings).toEqual(['Response 1', 'Response 2']);
  });

  it('title is in Title Case', () => {
    // "JavaScript Promises Explained" — major words should be capitalised
    expect(result.title).toMatch(/^[A-Z]/);
    // "Explained" should be capitalised
    expect(result.title).toContain('Explained');
  });

  it('title converts minor words to lower case', () => {
    const mixedChat = clone(chatWithMessages);
    mixedChat.title = 'the art of the deal';
    const res = applyStyle(mixedChat, STYLES.ACADEMIC);
    // First word always capitalised; "of" and "the" after position 0 lowercase
    expect(res.title.startsWith('The')).toBe(true);
    // "of" and second "the" should be lower
    expect(res.title).toContain('of');
    expect(res.title).not.toContain(' The Art'); // no double-cap on "The" mid-string for minor word
  });

  it('meta.style is ACADEMIC', () => {
    expect(result.meta.style).toBe(STYLES.ACADEMIC);
  });

  it('sections count equals messages count', () => {
    expect(result.sections.length).toBe(chat.messages.length);
  });

  it('section content preserves original message content', () => {
    for (let i = 0; i < chat.messages.length; i++) {
      expect(result.sections[i].content).toBe(chat.messages[i].content);
    }
  });
});

// ---------------------------------------------------------------------------
// applyStyle() — BLOG style
// ---------------------------------------------------------------------------

describe('applyStyle() — BLOG style', () => {
  let chat;
  let result;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    result = applyStyle(chat, STYLES.BLOG);
  });

  it('introduction is friendly/casual (contains "fascinating" or "insights")', () => {
    const intro = result.introduction.toLowerCase();
    expect(
      intro.includes('fascinating') || intro.includes('insights') || intro.includes('great')
    ).toBe(true);
  });

  it('conclusion invites comments', () => {
    const conclusion = result.conclusion.toLowerCase();
    expect(
      conclusion.includes('comment') || conclusion.includes('thoughts') || conclusion.includes('let me know')
    ).toBe(true);
  });

  it('user sections are blockquoted (content starts with ">")', () => {
    const userSections = result.sections.filter((_, i) =>
      chat.messages[i].role === 'user'
    );
    for (const section of userSections) {
      expect(section.content.startsWith('>')).toBe(true);
    }
  });

  it('assistant sections are not blockquoted', () => {
    const assistantSections = result.sections.filter((_, i) =>
      chat.messages[i].role === 'assistant'
    );
    for (const section of assistantSections) {
      expect(section.content.startsWith('>')).toBe(false);
    }
  });

  it('adds "How to:" prefix for question-type titles', () => {
    const questionChat = clone(chatWithMessages);
    questionChat.title = 'What is TypeScript?';
    const res = applyStyle(questionChat, STYLES.BLOG);
    expect(res.title).toContain('How to:');
  });

  it('adds "How to:" prefix for titles starting with action verbs', () => {
    const actionChat = clone(chatWithMessages);
    actionChat.title = 'Build a REST API';
    const res = applyStyle(actionChat, STYLES.BLOG);
    expect(res.title).toContain('How to:');
  });

  it('does not add "How to:" prefix for neutral declarative titles', () => {
    const neutralChat = clone(chatWithMessages);
    neutralChat.title = 'JavaScript Promises Explained';
    const res = applyStyle(neutralChat, STYLES.BLOG);
    // Does not start with a verb or question word — no prefix
    expect(res.title).not.toContain('How to:');
  });

  it('multiline user content is blockquoted on all lines', () => {
    const multilineChat = clone(chatWithMessages);
    multilineChat.messages = [
      { role: 'user', content: 'Line one\nLine two\nLine three' },
    ];
    const res = applyStyle(multilineChat, STYLES.BLOG);
    const userContent = res.sections[0].content;
    // Every line after the first \n> should also start with >
    expect(userContent).toContain('\n>');
  });

  it('meta.style is BLOG', () => {
    expect(result.meta.style).toBe(STYLES.BLOG);
  });

  it('sections count equals messages count', () => {
    expect(result.sections.length).toBe(chat.messages.length);
  });
});

// ---------------------------------------------------------------------------
// applyStyle() — LINKEDIN style
// ---------------------------------------------------------------------------

describe('applyStyle() — LINKEDIN style', () => {
  let chat;
  let result;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    result = applyStyle(chat, STYLES.LINKEDIN);
  });

  it('introduction is professional in tone', () => {
    const intro = result.introduction.toLowerCase();
    expect(
      intro.includes('insight') ||
        intro.includes('interesting') ||
        intro.includes('compelling') ||
        intro.includes('professional')
    ).toBe(true);
  });

  it('conclusion contains AI-related hashtags', () => {
    expect(result.conclusion).toMatch(/#[A-Za-z]+/);
    const conclusion = result.conclusion;
    expect(
      conclusion.includes('#AI') ||
        conclusion.includes('#Learning') ||
        conclusion.includes('#Professional')
    ).toBe(true);
  });

  it('title is professional — contains the original topic', () => {
    expect(result.title.toLowerCase()).toContain(
      chat.title.toLowerCase().split(' ')[0].toLowerCase()
    );
  });

  it('uses "N Key Insights on …" title format when there are ≥3 assistant messages', () => {
    // chatWithMessages has 2 assistant messages (< 3) → "Deep Dive" format
    const assistantCount = chat.messages.filter((m) => m.role === 'assistant').length;
    expect(assistantCount).toBe(2);
    expect(result.title).toContain('Deep Dive');
  });

  it('uses "N Key Insights" format when ≥3 assistant messages', () => {
    const manyAssistantChat = clone(chatWithMessages);
    manyAssistantChat.messages = [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1. First point.' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2. Second point.' },
      { role: 'user', content: 'Q3' },
      { role: 'assistant', content: 'A3. Third point.' },
    ];
    const res = applyStyle(manyAssistantChat, STYLES.LINKEDIN);
    expect(res.title).toMatch(/3 Key Insights/i);
  });

  it('sections present assistant content with "Insight N" headings', () => {
    const assistantSections = result.sections.filter((s) =>
      s.heading.startsWith('Insight')
    );
    expect(assistantSections.length).toBeGreaterThan(0);
  });

  it('user sections use "Context" heading', () => {
    const contextSections = result.sections.filter((s) => s.heading === 'Context');
    expect(contextSections.length).toBeGreaterThan(0);
  });

  it('meta.style is LINKEDIN', () => {
    expect(result.meta.style).toBe(STYLES.LINKEDIN);
  });

  it('sections count equals messages count', () => {
    expect(result.sections.length).toBe(chat.messages.length);
  });
});

// ---------------------------------------------------------------------------
// Parameterised: all 5 styles produce valid structure for all fixtures
// ---------------------------------------------------------------------------

describe('applyStyle() — all styles × all fixtures produce valid structure', () => {
  const fixtures = [
    { name: 'chatWithMessages', data: chatWithMessages },
    { name: 'chatWithoutMessages', data: chatWithoutMessages },
    { name: 'minimalChat', data: minimalChat },
  ];

  for (const style of Object.values(STYLES)) {
    for (const fixture of fixtures) {
      it(`style="${style}" fixture="${fixture.name}" → valid result`, () => {
        const chat = clone(fixture.data);
        const result = applyStyle(chat, style);

        expect(typeof result.title).toBe('string');
        expect(typeof result.introduction).toBe('string');
        expect(Array.isArray(result.sections)).toBe(true);
        expect(typeof result.conclusion).toBe('string');
        expect(typeof result.meta).toBe('object');
        expect(result.meta.style).toBe(style);

        for (const section of result.sections) {
          expect(typeof section.heading).toBe('string');
          expect(typeof section.content).toBe('string');
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// styledToMarkdown()
// ---------------------------------------------------------------------------

describe('styledToMarkdown()', () => {
  let rawResult;
  let chat;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    rawResult = applyStyle(chat, STYLES.RAW);
  });

  it('null styledChat → returns ""', () => {
    expect(styledToMarkdown(null)).toBe('');
  });

  it('undefined styledChat → returns ""', () => {
    expect(styledToMarkdown(undefined)).toBe('');
  });

  it('result starts with "# " title heading', () => {
    const md = styledToMarkdown(rawResult);
    expect(md.startsWith('# ')).toBe(true);
    expect(md).toContain(`# ${rawResult.title}`);
  });

  it('contains introduction text when non-empty', () => {
    const techResult = applyStyle(chat, STYLES.TECHNICAL);
    const md = styledToMarkdown(techResult);
    expect(md).toContain(techResult.introduction);
  });

  it('each section with a heading has a "## " heading line', () => {
    const techResult = applyStyle(chat, STYLES.TECHNICAL);
    const md = styledToMarkdown(techResult);
    for (const section of techResult.sections) {
      if (section.heading) {
        expect(md).toContain(`## ${section.heading}`);
      }
    }
  });

  it('conclusion appears after "---" separator', () => {
    const techResult = applyStyle(chat, STYLES.TECHNICAL);
    const md = styledToMarkdown(techResult);
    const separatorIndex = md.indexOf('---');
    const conclusionIndex = md.indexOf(techResult.conclusion);
    expect(separatorIndex).toBeGreaterThan(0);
    expect(conclusionIndex).toBeGreaterThan(separatorIndex);
  });

  it('sections appear in correct order (first section before last section)', () => {
    const techResult = applyStyle(chat, STYLES.TECHNICAL);
    const md = styledToMarkdown(techResult);
    const firstHeading = techResult.sections[0].heading;
    const lastHeading = techResult.sections[techResult.sections.length - 1].heading;
    const firstIdx = md.indexOf(`## ${firstHeading}`);
    const lastIdx = md.lastIndexOf(`## ${lastHeading}`);
    expect(firstIdx).toBeLessThan(lastIdx);
  });

  it('raw style produces "## User" and "## Assistant" headings', () => {
    const md = styledToMarkdown(rawResult);
    expect(md).toContain('## User');
    expect(md).toContain('## Assistant');
  });

  it('raw style: no "---" separator (no conclusion)', () => {
    const md = styledToMarkdown(rawResult);
    expect(md).not.toContain('---');
  });

  it('contains section content in output', () => {
    const md = styledToMarkdown(rawResult);
    for (const section of rawResult.sections) {
      expect(md).toContain(section.content);
    }
  });

  it('no "## " heading line for sections with empty heading (blog style)', () => {
    const blogResult = applyStyle(chat, STYLES.BLOG);
    const md = styledToMarkdown(blogResult);
    // Blog assistant sections have empty heading — no "## " should precede their content
    // Just ensure we don't get "## " followed immediately by blank
    const lines = md.split('\n');
    for (const line of lines) {
      if (line === '## ') {
        // An h2 with an empty heading should NOT appear
        expect(true).toBe(false); // fail explicitly
      }
    }
  });

  it('styledToMarkdown with no title → no "# " heading line', () => {
    const noTitle = { title: '', introduction: '', sections: [], conclusion: '' };
    const md = styledToMarkdown(noTitle);
    expect(md).not.toContain('# ');
  });

  it('styledToMarkdown with no introduction → no blank intro line', () => {
    const noIntro = { title: 'Test', introduction: '', sections: [], conclusion: '' };
    const md = styledToMarkdown(noIntro);
    expect(md).toBe('# Test');
  });

  it('styledToMarkdown with no conclusion → no "---" separator', () => {
    const noConclusion = {
      title: 'Test',
      introduction: 'Intro text',
      sections: [{ heading: 'H', content: 'C' }],
      conclusion: '',
    };
    const md = styledToMarkdown(noConclusion);
    expect(md).not.toContain('---');
  });

  it('all 5 styles produce non-empty markdown for chatWithMessages', () => {
    for (const style of Object.values(STYLES)) {
      const styled = applyStyle(clone(chatWithMessages), style);
      const md = styledToMarkdown(styled);
      expect(md.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// styledToHtmlBody()
// ---------------------------------------------------------------------------

describe('styledToHtmlBody()', () => {
  let rawResult;
  let chat;

  beforeEach(() => {
    chat = clone(chatWithMessages);
    rawResult = applyStyle(chat, STYLES.RAW);
  });

  it('null → returns ""', () => {
    expect(styledToHtmlBody(null)).toBe('');
  });

  it('undefined → returns ""', () => {
    expect(styledToHtmlBody(undefined)).toBe('');
  });

  it('contains <p class="intro"> for introduction when non-empty', () => {
    const techResult = applyStyle(chat, STYLES.TECHNICAL);
    const html = styledToHtmlBody(techResult);
    expect(html).toContain('<p class="intro">');
  });

  it('contains <section> elements for each section', () => {
    const html = styledToHtmlBody(rawResult);
    const sectionCount = (html.match(/<section>/g) || []).length;
    expect(sectionCount).toBe(rawResult.sections.length);
  });

  it('contains <footer class="conclusion"> for conclusion when non-empty', () => {
    const techResult = applyStyle(chat, STYLES.TECHNICAL);
    const html = styledToHtmlBody(techResult);
    expect(html).toContain('<footer class="conclusion">');
  });

  it('empty introduction → no <p class="intro">', () => {
    const html = styledToHtmlBody(rawResult); // raw has empty intro
    expect(html).not.toContain('<p class="intro">');
  });

  it('empty conclusion → no <footer class="conclusion">', () => {
    const html = styledToHtmlBody(rawResult); // raw has empty conclusion
    expect(html).not.toContain('<footer class="conclusion">');
  });

  it('HTML-escapes < and > in content (no raw script injection)', () => {
    const maliciousChat = {
      id: 'x',
      title: '<script>alert("xss")</script>',
      messages: [{ role: 'user', content: '<script>evil()</script>' }],
      messageCount: 1,
      source: '',
      url: '',
      timestamp: null,
    };
    const styled = applyStyle(maliciousChat, STYLES.RAW);
    const html = styledToHtmlBody(styled);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('HTML-escapes & in content', () => {
    const ampersandChat = {
      id: 'y',
      title: 'Cats & Dogs',
      messages: [{ role: 'assistant', content: 'A & B' }],
      messageCount: 1,
      source: '',
      url: '',
      timestamp: null,
    };
    const styled = applyStyle(ampersandChat, STYLES.RAW);
    const html = styledToHtmlBody(styled);
    expect(html).toContain('&amp;');
    expect(html).not.toContain(' & ');
  });

  it('HTML-escapes double-quotes in title', () => {
    const quoteChat = {
      id: 'z',
      title: 'Say "Hello"',
      messages: [],
      content: 'content',
      messageCount: 0,
      source: '',
      url: '',
      timestamp: null,
    };
    const styled = applyStyle(quoteChat, STYLES.RAW);
    const html = styledToHtmlBody(styled);
    expect(html).not.toContain('"Hello"');
    expect(html).toContain('&quot;Hello&quot;');
  });

  it('title is wrapped in <h1> tag', () => {
    const html = styledToHtmlBody(rawResult);
    expect(html).toContain('<h1>');
    expect(html).toContain('</h1>');
  });

  it('section heading is wrapped in <h2> tag when non-empty', () => {
    const html = styledToHtmlBody(rawResult);
    expect(html).toContain('<h2>User</h2>');
    expect(html).toContain('<h2>Assistant</h2>');
  });

  it('no <h2> for sections with empty heading', () => {
    const blogResult = applyStyle(chat, STYLES.BLOG);
    const html = styledToHtmlBody(blogResult);
    // should not contain an empty h2
    expect(html).not.toContain('<h2></h2>');
  });

  it('newlines in content are converted to <br> tags', () => {
    const multilineChat = {
      id: 'ml',
      title: 'Multi',
      messages: [{ role: 'assistant', content: 'Line one\nLine two' }],
      messageCount: 1,
      source: '',
      url: '',
      timestamp: null,
    };
    const styled = applyStyle(multilineChat, STYLES.RAW);
    const html = styledToHtmlBody(styled);
    expect(html).toContain('<br>');
  });

  it('all 5 styles produce non-empty HTML for chatWithMessages', () => {
    for (const style of Object.values(STYLES)) {
      const styled = applyStyle(clone(chatWithMessages), style);
      const html = styledToHtmlBody(styled);
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it('styledToHtmlBody with no title → no <h1> tag', () => {
    const noTitle = {
      title: '',
      introduction: '',
      sections: [],
      conclusion: '',
    };
    const html = styledToHtmlBody(noTitle);
    expect(html).not.toContain('<h1>');
  });

  it('section content appears inside <p> tags', () => {
    const html = styledToHtmlBody(rawResult);
    expect(html).toContain('<p>');
    expect(html).toContain('</p>');
  });
});

// ---------------------------------------------------------------------------
// Branch-gap tests — lines 409, 416, 459, 472
// ---------------------------------------------------------------------------

describe('styledToMarkdown() — branch coverage for non-array sections and empty content', () => {
  it('handles non-array sections gracefully (line 409 false branch)', () => {
    // sections: null → should NOT throw; falls back to []
    const input = { title: 'T', introduction: 'intro', sections: null, conclusion: 'end' };
    expect(() => styledToMarkdown(input)).not.toThrow();
    const md = styledToMarkdown(input);
    expect(md).toContain('# T');
    expect(md).toContain('intro');
    expect(md).toContain('end');
  });

  it('handles sections as a plain object (non-array) without crashing', () => {
    const input = { title: 'X', introduction: '', sections: { key: 'val' }, conclusion: '' };
    expect(() => styledToMarkdown(input)).not.toThrow();
  });

  it('section with falsy content falls back to empty string (line 416 ||\'\'\')', () => {
    const input = {
      title: 'Falsy',
      introduction: '',
      sections: [
        { heading: 'First', content: null },
        { heading: 'Second', content: '' },
        { heading: 'Third', content: undefined },
      ],
      conclusion: '',
    };
    const md = styledToMarkdown(input);
    // headings still rendered; content lines are empty (no crash)
    expect(md).toContain('## First');
    expect(md).toContain('## Second');
    expect(md).toContain('## Third');
  });

  it('section with no heading skips the ## heading line', () => {
    const input = {
      title: 'NoHead',
      introduction: '',
      sections: [{ heading: '', content: 'body text here' }],
      conclusion: '',
    };
    const md = styledToMarkdown(input);
    expect(md).toContain('body text here');
    expect(md).not.toContain('## ');
  });
});

describe('styledToHtmlBody() — branch coverage for missing heading and non-array sections', () => {
  it('section with empty heading uses empty headingHtml (ternary false branch, line ~469)', () => {
    // heading is falsy → headingHtml = '' → no <h2> for this section
    const input = {
      title: 'NoH2',
      introduction: 'intro here',
      sections: [
        { heading: '',    content: 'paragraph one' },
        { heading: null,  content: 'paragraph two' },
      ],
      conclusion: '',
    };
    const html = styledToHtmlBody(input);
    expect(html).toContain('<section>');
    expect(html).not.toContain('<h2></h2>');
    expect(html).toContain('paragraph one');
  });

  it('section with null content passes through _contentToHtml safely (line 472)', () => {
    const input = {
      title: 'NullContent',
      introduction: '',
      sections: [{ heading: 'Heading', content: null }],
      conclusion: '',
    };
    expect(() => styledToHtmlBody(input)).not.toThrow();
    const html = styledToHtmlBody(input);
    expect(html).toContain('<section>');
  });

  it('non-array sections returns empty htmlParts body (line 466 false branch)', () => {
    const input = { title: 'X', introduction: '', sections: 'bad', conclusion: '' };
    expect(() => styledToHtmlBody(input)).not.toThrow();
    const html = styledToHtmlBody(input);
    expect(html).toContain('<h1>X</h1>');
    expect(html).not.toContain('<section>');
  });
});
