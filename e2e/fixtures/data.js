/**
 * e2e/fixtures/data.js
 *
 * Fabricated but realistic bAInder data used to seed chrome.storage.local
 * in E2E tests. Mimics real sessions from bAInder users across all supported
 * AI platforms.
 *
 * Storage keys used:
 *   topicTree        — serialised TopicTree (topics map + rootTopicIds)
 *   chatIndex        — metadata-only array (no content field)
 *   chatSearchIndex  — search index array
 *   chat:<id>        — individual full chat objects
 */

// ---------------------------------------------------------------------------
// Fixed IDs — deterministic for assertions in tests
// ---------------------------------------------------------------------------

export const TOPIC_IDS = {
  programming:   'topic-prog-001',
  react:         'topic-react-002',
  python:        'topic-python-003',
  aiml:          'topic-aiml-004',
  health:        'topic-health-005',
  philosophy:    'topic-phil-006',
  travel:        'topic-travel-007',
  asia:          'topic-asia-008',
  science:       'topic-sci-009',
};

export const CHAT_IDS = {
  reactHooks:      'chat-react-hooks-001',
  pandasTutorial:  'chat-pandas-002',
  mediterranean:   'chat-med-003',
  existentialism:  'chat-exist-004',
  japanTravel:     'chat-japan-005',
  quantumComputing:'chat-quantum-006',
  mlPipeline:      'chat-mlpipe-007',
};

// ---------------------------------------------------------------------------
// Topic tree
// ---------------------------------------------------------------------------

const NOW = 1746000000000; // 2025-04-30 (fixed for determinism)

export const TOPIC_TREE = {
  version: 1,
  rootTopicIds: [
    TOPIC_IDS.programming,
    TOPIC_IDS.health,
    TOPIC_IDS.philosophy,
    TOPIC_IDS.travel,
    TOPIC_IDS.science,
  ],
  topics: {
    [TOPIC_IDS.programming]: {
      id:            TOPIC_IDS.programming,
      name:          'Programming',
      parentId:      null,
      children:      [TOPIC_IDS.react, TOPIC_IDS.python, TOPIC_IDS.aiml],
      chatIds:       [],
      createdAt:     NOW - 30 * 86400000,
      updatedAt:     NOW - 1  * 86400000,
      firstChatDate: NOW - 20 * 86400000,
      lastChatDate:  NOW - 1  * 86400000,
    },
    [TOPIC_IDS.react]: {
      id:            TOPIC_IDS.react,
      name:          'React',
      parentId:      TOPIC_IDS.programming,
      children:      [],
      chatIds:       [CHAT_IDS.reactHooks],
      createdAt:     NOW - 25 * 86400000,
      updatedAt:     NOW - 5  * 86400000,
      firstChatDate: NOW - 5  * 86400000,
      lastChatDate:  NOW - 5  * 86400000,
    },
    [TOPIC_IDS.python]: {
      id:            TOPIC_IDS.python,
      name:          'Python',
      parentId:      TOPIC_IDS.programming,
      children:      [],
      chatIds:       [CHAT_IDS.pandasTutorial],
      createdAt:     NOW - 25 * 86400000,
      updatedAt:     NOW - 3  * 86400000,
      firstChatDate: NOW - 3  * 86400000,
      lastChatDate:  NOW - 3  * 86400000,
    },
    [TOPIC_IDS.aiml]: {
      id:            TOPIC_IDS.aiml,
      name:          'AI/ML',
      parentId:      TOPIC_IDS.programming,
      children:      [],
      chatIds:       [CHAT_IDS.mlPipeline],
      createdAt:     NOW - 20 * 86400000,
      updatedAt:     NOW - 1  * 86400000,
      firstChatDate: NOW - 1  * 86400000,
      lastChatDate:  NOW - 1  * 86400000,
    },
    [TOPIC_IDS.health]: {
      id:            TOPIC_IDS.health,
      name:          'Health & Wellness',
      parentId:      null,
      children:      [],
      chatIds:       [CHAT_IDS.mediterranean],
      createdAt:     NOW - 15 * 86400000,
      updatedAt:     NOW - 7  * 86400000,
      firstChatDate: NOW - 7  * 86400000,
      lastChatDate:  NOW - 7  * 86400000,
    },
    [TOPIC_IDS.philosophy]: {
      id:            TOPIC_IDS.philosophy,
      name:          'Philosophy',
      parentId:      null,
      children:      [],
      chatIds:       [CHAT_IDS.existentialism],
      createdAt:     NOW - 10 * 86400000,
      updatedAt:     NOW - 10 * 86400000,
      firstChatDate: NOW - 10 * 86400000,
      lastChatDate:  NOW - 10 * 86400000,
    },
    [TOPIC_IDS.travel]: {
      id:            TOPIC_IDS.travel,
      name:          'Travel',
      parentId:      null,
      children:      [TOPIC_IDS.asia],
      chatIds:       [],
      createdAt:     NOW - 12 * 86400000,
      updatedAt:     NOW - 2  * 86400000,
      firstChatDate: NOW - 2  * 86400000,
      lastChatDate:  NOW - 2  * 86400000,
    },
    [TOPIC_IDS.asia]: {
      id:            TOPIC_IDS.asia,
      name:          'Asia',
      parentId:      TOPIC_IDS.travel,
      children:      [],
      chatIds:       [CHAT_IDS.japanTravel],
      createdAt:     NOW - 12 * 86400000,
      updatedAt:     NOW - 2  * 86400000,
      firstChatDate: NOW - 2  * 86400000,
      lastChatDate:  NOW - 2  * 86400000,
    },
    [TOPIC_IDS.science]: {
      id:            TOPIC_IDS.science,
      name:          'Science',
      parentId:      null,
      children:      [],
      chatIds:       [CHAT_IDS.quantumComputing],
      createdAt:     NOW - 8  * 86400000,
      updatedAt:     NOW - 4  * 86400000,
      firstChatDate: NOW - 4  * 86400000,
      lastChatDate:  NOW - 4  * 86400000,
    },
  },
};

// ---------------------------------------------------------------------------
// Full chat objects
// ---------------------------------------------------------------------------

export const CHATS = {
  [CHAT_IDS.reactHooks]: {
    id:           CHAT_IDS.reactHooks,
    title:        'React Hooks Deep Dive',
    url:          'https://chatgpt.com/c/01920000-react-hooks-2026',
    source:       'chatgpt',
    timestamp:    NOW - 5 * 86400000,
    topicId:      TOPIC_IDS.react,
    messageCount: 4,
    tags:         ['react', 'hooks', 'javascript'],
    metadata:     {},
    messages: [
      {
        role:    'user',
        content: 'Can you explain how React\'s useEffect hook works? When should I use it and what are the common pitfalls?',
      },
      {
        role:    'assistant',
        content: `React's \`useEffect\` is one of the most powerful hooks — and also one of the most misunderstood. Here's the full picture.

## What it does

\`useEffect\` lets you run **side effects** after a component renders:

\`\`\`javascript
useEffect(() => {
  document.title = \`You clicked \${count} times\`;
}, [count]);
\`\`\`

## When to use it

- Fetching data from an API
- Setting up subscriptions or event listeners
- Manually manipulating the DOM

## Common pitfalls

1. **Missing dependencies** — forgetting to add all deps causes stale closures
2. **Infinite loops** — updating state inside \`useEffect\` without proper deps causes re-render loops
3. **Not cleaning up** — always return a cleanup function for subscriptions and timers`,
      },
      {
        role:    'user',
        content: 'What\'s the difference between useEffect with no dependency array vs an empty [] array?',
      },
      {
        role:    'assistant',
        content: `Great question — this is the most common source of confusion:

| Dependency array | Behavior |
|---|---|
| No array | Runs after **every** render |
| \`[]\` (empty) | Runs only **once** after mount |
| \`[dep1, dep2]\` | Runs after mount and when any dep changes |

**No array — runs every render (usually a mistake):**
\`\`\`javascript
useEffect(() => {
  fetchUser(userId); // called on EVERY render — expensive!
});
\`\`\`

**Empty array — runs once on mount:**
\`\`\`javascript
useEffect(() => {
  initAnalytics(); // like componentDidMount
}, []);
\`\`\`

In most API call scenarios, \`[]\` is what you want, but be careful about stale closures.`,
      },
    ],
    content: `---
title: "React Hooks Deep Dive"
source: chatgpt
url: https://chatgpt.com/c/01920000-react-hooks-2026
date: 2026-04-25T14:30:00.000Z
messageCount: 4
contentFormat: markdown-v1
---

# React Hooks Deep Dive

🙋 Can you explain how React's useEffect hook works? When should I use it and what are the common pitfalls?

---

🤖 React's \`useEffect\` is one of the most powerful hooks — and also one of the most misunderstood. Here's the full picture.

## What it does

\`useEffect\` lets you run **side effects** after a component renders:

\`\`\`javascript
useEffect(() => {
  document.title = \`You clicked \${count} times\`;
}, [count]);
\`\`\`

## When to use it

- Fetching data from an API
- Setting up subscriptions or event listeners
- Manually manipulating the DOM

## Common pitfalls

1. **Missing dependencies** — forgetting to add all deps causes stale closures
2. **Infinite loops** — updating state inside \`useEffect\` without proper deps
3. **Not cleaning up** — always return a cleanup function for subscriptions

---

🙋 What's the difference between useEffect with no dependency array vs an empty [] array?

---

🤖 Great question — this is the most common source of confusion:

| Dependency array | Behavior |
|---|---|
| No array | Runs after **every** render |
| \`[]\` (empty) | Runs only **once** after mount |
| \`[dep1, dep2]\` | Runs after mount and when any dep changes |

**No array — runs every render:**
\`\`\`javascript
useEffect(() => {
  fetchUser(userId); // called on EVERY render!
});
\`\`\`

**Empty array — runs once on mount:**
\`\`\`javascript
useEffect(() => {
  initAnalytics(); // like componentDidMount
}, []);
\`\`\`
`,
  },

  [CHAT_IDS.pandasTutorial]: {
    id:           CHAT_IDS.pandasTutorial,
    title:        'Python Pandas GroupBy Tutorial',
    url:          'https://chatgpt.com/c/01920001-pandas-groupby-2026',
    source:       'chatgpt',
    timestamp:    NOW - 3 * 86400000,
    topicId:      TOPIC_IDS.python,
    messageCount: 4,
    tags:         ['python', 'pandas', 'data-analysis'],
    metadata:     {},
    messages: [
      { role: 'user',      content: 'How do I use pandas groupby to compute per-group statistics?' },
      { role: 'assistant', content: 'Pandas `groupby` splits your DataFrame by unique values in one or more columns, then lets you apply aggregation functions.\n\n```python\nimport pandas as pd\n\ndf = pd.DataFrame({\n    "dept":   ["Engineering", "Marketing", "Engineering", "Marketing"],\n    "salary": [90000, 70000, 95000, 72000]\n})\n\n# Average salary per department\ndf.groupby("dept")["salary"].mean()\n```\n\nThis outputs a **Series** with department names as the index.' },
      { role: 'user',      content: 'How do I compute multiple aggregations at once?' },
      { role: 'assistant', content: 'Use `.agg()` with a dict or list:\n\n```python\ndf.groupby("dept")["salary"].agg(["mean", "min", "max", "count"])\n```\n\nOr per-column with a dict:\n\n```python\ndf.groupby("dept").agg({\n    "salary":  ["mean", "std"],\n    "tenure":  "max",\n})\n```\n\nThe result is a **MultiIndex DataFrame** — call `.reset_index()` to flatten it for export.' },
    ],
    content: `---
title: "Python Pandas GroupBy Tutorial"
source: chatgpt
url: https://chatgpt.com/c/01920001-pandas-groupby-2026
date: 2026-04-27T09:15:00.000Z
messageCount: 4
contentFormat: markdown-v1
---

# Python Pandas GroupBy Tutorial

🙋 How do I use pandas groupby to compute per-group statistics?

---

🤖 Pandas \`groupby\` splits your DataFrame by unique values in one or more columns, then lets you apply aggregation functions.

\`\`\`python
import pandas as pd

df = pd.DataFrame({
    "dept":   ["Engineering", "Marketing", "Engineering", "Marketing"],
    "salary": [90000, 70000, 95000, 72000]
})

# Average salary per department
df.groupby("dept")["salary"].mean()
\`\`\`

This outputs a **Series** with department names as the index.

---

🙋 How do I compute multiple aggregations at once?

---

🤖 Use \`.agg()\` with a dict or list:

\`\`\`python
df.groupby("dept")["salary"].agg(["mean", "min", "max", "count"])
\`\`\`

Or per-column with a dict:

\`\`\`python
df.groupby("dept").agg({
    "salary":  ["mean", "std"],
    "tenure":  "max",
})
\`\`\`

The result is a **MultiIndex DataFrame** — call \`.reset_index()\` to flatten it for export.
`,
  },

  [CHAT_IDS.mediterranean]: {
    id:           CHAT_IDS.mediterranean,
    title:        'Mediterranean Diet Benefits',
    url:          'https://claude.ai/chat/b1920002-mediterranean-diet',
    source:       'claude',
    timestamp:    NOW - 7 * 86400000,
    topicId:      TOPIC_IDS.health,
    messageCount: 2,
    tags:         ['nutrition', 'diet', 'health'],
    metadata:     {},
    messages: [
      { role: 'user',      content: 'What are the scientifically proven health benefits of the Mediterranean diet?' },
      { role: 'assistant', content: 'The Mediterranean diet has one of the strongest evidence bases of any dietary pattern. Key proven benefits include:\n\n**Cardiovascular health**\n- Reduces LDL cholesterol and triglycerides\n- The landmark PREDIMED trial showed a **30% reduction** in major cardiovascular events\n\n**Metabolic health**\n- Lowers risk of type 2 diabetes by improving insulin sensitivity\n- Supports healthy weight maintenance without calorie restriction\n\n**Brain health**\n- Associated with slower cognitive decline and reduced Alzheimer\'s risk\n- Rich in omega-3s (oily fish) and antioxidants (olive oil, vegetables)\n\n**Longevity**\n- Populations following this diet (Sardinia, Greece) show exceptional longevity\n\n**Core foods:** olive oil, legumes, whole grains, fish (2×/week), vegetables, fruit, nuts. Red meat and processed foods are minimal.' },
    ],
    content: `---
title: "Mediterranean Diet Benefits"
source: claude
url: https://claude.ai/chat/b1920002-mediterranean-diet
date: 2026-04-23T16:45:00.000Z
messageCount: 2
contentFormat: markdown-v1
---

# Mediterranean Diet Benefits

🙋 What are the scientifically proven health benefits of the Mediterranean diet?

---

🤖 The Mediterranean diet has one of the strongest evidence bases of any dietary pattern. Key proven benefits include:

**Cardiovascular health**
- Reduces LDL cholesterol and triglycerides
- The landmark PREDIMED trial showed a **30% reduction** in major cardiovascular events

**Metabolic health**
- Lowers risk of type 2 diabetes by improving insulin sensitivity
- Supports healthy weight maintenance without calorie restriction

**Brain health**
- Associated with slower cognitive decline and reduced Alzheimer's risk
- Rich in omega-3s (oily fish) and antioxidants (olive oil, vegetables)

**Core foods:** olive oil, legumes, whole grains, fish (2×/week), vegetables, fruit, nuts.
`,
  },

  [CHAT_IDS.existentialism]: {
    id:           CHAT_IDS.existentialism,
    title:        'Existentialism vs Absurdism',
    url:          'https://gemini.google.com/app/c1920003',
    source:       'gemini',
    timestamp:    NOW - 10 * 86400000,
    topicId:      TOPIC_IDS.philosophy,
    messageCount: 2,
    tags:         ['philosophy', 'existentialism', 'camus', 'sartre'],
    metadata:     {},
    messages: [
      { role: 'user',      content: 'What is the core difference between existentialism (Sartre) and absurdism (Camus)?' },
      { role: 'assistant', content: 'Both philosophies start from the same premise — the universe has no inherent meaning — but they diverge sharply in their response:\n\n**Existentialism (Sartre)**\n- "Existence precedes essence" — humans create their own meaning through choices\n- Radical freedom is both liberating and terrifying (the "burden" of freedom)\n- Bad faith = pretending you have no choice to escape responsibility\n- Solution: **authentic engagement** — embrace your freedom and create meaning\n\n**Absurdism (Camus)**\n- The conflict between humans *craving* meaning and the universe\'s *silence* is the Absurd\n- Existentialism\'s "solution" (creating meaning) is a **leap of faith** that Camus rejects as dishonest\n- Camus wants us to face the Absurd head-on without fleeing into false hope\n- Solution: **revolt, freedom, passion** — live fully *despite* the meaninglessness\n\nThe key divergence: Sartre says "create meaning"; Camus says "there is no meaning — and that\'s fine, keep living anyway."' },
    ],
    content: `---
title: "Existentialism vs Absurdism"
source: gemini
url: https://gemini.google.com/app/c1920003
date: 2026-04-20T11:00:00.000Z
messageCount: 2
contentFormat: markdown-v1
---

# Existentialism vs Absurdism

🙋 What is the core difference between existentialism (Sartre) and absurdism (Camus)?

---

🤖 Both philosophies start from the same premise — the universe has no inherent meaning — but they diverge sharply in their response:

**Existentialism (Sartre)**
- "Existence precedes essence" — humans create their own meaning through choices
- Radical freedom is both liberating and terrifying
- Solution: **authentic engagement** — embrace your freedom and create meaning

**Absurdism (Camus)**
- The conflict between humans *craving* meaning and the universe's *silence* is the Absurd
- Camus rejects the existentialist "leap of faith" as dishonest
- Solution: **revolt, freedom, passion** — live fully *despite* the meaninglessness

The key divergence: Sartre says "create meaning"; Camus says "there is no meaning — and that's fine, keep living anyway."
`,
  },

  [CHAT_IDS.japanTravel]: {
    id:           CHAT_IDS.japanTravel,
    title:        'Japan 2-Week Itinerary Planning',
    url:          'https://copilot.microsoft.com/c/d1920004-japan-trip',
    source:       'copilot',
    timestamp:    NOW - 2 * 86400000,
    topicId:      TOPIC_IDS.asia,
    messageCount: 4,
    tags:         ['travel', 'japan', 'itinerary'],
    metadata:     {},
    messages: [
      { role: 'user',      content: 'I want to plan a 2-week trip to Japan in late October. I love food, history and hiking. Where should I go?' },
      { role: 'assistant', content: 'Late October is ideal — autumn foliage (*koyo*) peaks then. A classic route for food + history + hiking:\n\n**Days 1–3: Tokyo**\n- Tsukiji outer market (fresh sushi breakfast)\n- Senso-ji temple, Akihabara for tech culture\n- Day hike: Takao-san (1 hour from Shinjuku)\n\n**Days 4–6: Nikko & Nasu Highlands**\n- Tosho-gu shrine complex (UNESCO)\n- Nasu hiking trails — spectacular autumn colours\n\n**Days 7–9: Kyoto**\n- Fushimi Inari torii gates (go at sunrise)\n- Arashiyama bamboo grove + Tenryu-ji garden\n- Nishiki Market ("Kyoto\'s kitchen") for local food\n\n**Days 10–11: Osaka**\n- Dotonbori street food (takoyaki, okonomiyaki, kushikatsu)\n- Osaka-jo castle\n\n**Days 12–14: Hiroshima & Miyajima**\n- Peace Memorial Museum (moving, important)\n- Miyajima Island — floating torii gate, Mt Misen hike\n\nBuy a **JR Pass** before you leave — it covers Shinkansen between all these cities.' },
      { role: 'user',      content: 'What are the best foods I must try?' },
      { role: 'assistant', content: 'Japan\'s food scene is unmatched. Must-tries by region:\n\n**Tokyo**\n- *Tsukemen* — thick dipping ramen (try Fuunji in Shinjuku)\n- *Monjayaki* — Tokyo\'s version of savory pancakes (Tsukishima district)\n- Fresh sushi omakase if budget allows\n\n**Kyoto**\n- *Kaiseki* — multi-course traditional cuisine\n- *Yudofu* — silken tofu hot pot (Arashiyama has famous spots)\n- *Matcha* everything — Uji nearby is the matcha capital\n\n**Osaka**\n- *Takoyaki* — octopus balls with bonito flakes\n- *Okonomiyaki* — savory cabbage pancake\n- *Kushikatsu* — battered and fried skewers (never double-dip!)\n\n**Hiroshima**\n- *Hiroshima-style okonomiyaki* — layered with noodles, very different from Osaka\'s\n- Fresh oysters from Miyajima\n\n*Pro tip:* Download Google Translate with Japanese offline pack — it can read menus with your camera.' },
    ],
    content: `---
title: "Japan 2-Week Itinerary Planning"
source: copilot
url: https://copilot.microsoft.com/c/d1920004-japan-trip
date: 2026-04-28T08:00:00.000Z
messageCount: 4
contentFormat: markdown-v1
---

# Japan 2-Week Itinerary Planning

🙋 I want to plan a 2-week trip to Japan in late October. I love food, history and hiking. Where should I go?

---

🤖 Late October is ideal — autumn foliage (*koyo*) peaks then. A classic route for food + history + hiking:

**Days 1–3: Tokyo** — Tsukiji market, Senso-ji, day hike Mt Takao

**Days 4–6: Nikko & Nasu** — Tosho-gu shrine (UNESCO), autumn hiking trails

**Days 7–9: Kyoto** — Fushimi Inari, Arashiyama, Nishiki Market

**Days 10–11: Osaka** — Dotonbori street food, Osaka-jo castle

**Days 12–14: Hiroshima & Miyajima** — Peace Memorial, floating torii, Mt Misen hike

Buy a **JR Pass** before you leave — it covers Shinkansen between all these cities.

---

🙋 What are the best foods I must try?

---

🤖 Japan's food scene is unmatched. Must-tries by region:

**Tokyo:** *Tsukemen* (dipping ramen), fresh sushi omakase

**Kyoto:** *Kaiseki* (multi-course), *Yudofu* (tofu hot pot), matcha desserts

**Osaka:** *Takoyaki*, *Okonomiyaki*, *Kushikatsu* (never double-dip!)

**Hiroshima:** layered okonomiyaki with noodles, fresh oysters from Miyajima
`,
  },

  [CHAT_IDS.quantumComputing]: {
    id:           CHAT_IDS.quantumComputing,
    title:        'Quantum Computing Fundamentals',
    url:          'https://chat.deepseek.com/a/chat/s/e1920005-quantum',
    source:       'deepseek',
    timestamp:    NOW - 4 * 86400000,
    topicId:      TOPIC_IDS.science,
    messageCount: 2,
    tags:         ['quantum', 'physics', 'computing'],
    metadata:     {},
    messages: [
      { role: 'user',      content: 'Explain quantum superposition and entanglement in simple terms, and how they enable quantum computing.' },
      { role: 'assistant', content: '**Superposition** — a qubit can be 0, 1, or *both at once*\n\nA classical bit is a light switch: either ON or OFF. A qubit is like a coin *spinning in the air* — it\'s simultaneously heads and tails until you look at it (measure it). This means a quantum computer with *n* qubits can represent 2ⁿ states simultaneously.\n\n**Entanglement** — qubits can be correlated regardless of distance\n\nTwo entangled qubits share a quantum state. Measuring one instantly determines the other\'s state, no matter how far apart they are. Einstein called this "spooky action at a distance" (he didn\'t like it, but experiments have proven it real).\n\n**Why this enables computing**\n\n| Classical | Quantum |\n|---|---|\n| Tries solutions one at a time | Explores all solutions in parallel |\n| 300 bits = 300 states | 300 qubits = 2³⁰⁰ states simultaneously |\n\nQuantum algorithms like **Shor\'s algorithm** (factoring) and **Grover\'s search** exploit superposition to find answers exponentially faster than classical computers for *specific problem types*. Quantum computers are not universally faster — they excel at optimisation, cryptography, and quantum simulation.' },
    ],
    content: `---
title: "Quantum Computing Fundamentals"
source: deepseek
url: https://chat.deepseek.com/a/chat/s/e1920005-quantum
date: 2026-04-26T19:30:00.000Z
messageCount: 2
contentFormat: markdown-v1
---

# Quantum Computing Fundamentals

🙋 Explain quantum superposition and entanglement in simple terms, and how they enable quantum computing.

---

🤖 **Superposition** — a qubit can be 0, 1, or *both at once*

A classical bit is a light switch: ON or OFF. A qubit is like a coin *spinning in the air* — simultaneously heads and tails until measured.

**Entanglement** — qubits can be correlated regardless of distance

Two entangled qubits share a quantum state. Measuring one instantly determines the other's state — Einstein called this "spooky action at a distance."

| Classical | Quantum |
|---|---|
| Tries solutions one at a time | Explores all solutions in parallel |
| 300 bits = 300 states | 300 qubits = 2³⁰⁰ states simultaneously |

Quantum algorithms like **Shor's algorithm** and **Grover's search** exploit superposition to solve specific problems exponentially faster.
`,
  },

  [CHAT_IDS.mlPipeline]: {
    id:           CHAT_IDS.mlPipeline,
    title:        'scikit-learn ML Pipeline Best Practices',
    url:          'https://www.perplexity.ai/search/f1920006-sklearn-pipeline',
    source:       'perplexity',
    timestamp:    NOW - 1 * 86400000,
    topicId:      TOPIC_IDS.aiml,
    messageCount: 2,
    tags:         ['python', 'machine-learning', 'scikit-learn'],
    metadata:     {},
    messages: [
      { role: 'user',      content: 'What is the best way to structure a scikit-learn Pipeline to avoid data leakage?' },
      { role: 'assistant', content: 'Data leakage is the most common mistake in ML — the Pipeline class is your primary defence.\n\n## The rule\n\nEvery preprocessing step that "learns" from data (scaling, imputation, encoding) **must** be inside the Pipeline so it\'s fit only on training data.\n\n## Correct structure\n\n```python\nfrom sklearn.pipeline import Pipeline\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.impute import SimpleImputer\nfrom sklearn.ensemble import RandomForestClassifier\n\npipe = Pipeline([\n    ("imputer",   SimpleImputer(strategy="median")),\n    ("scaler",    StandardScaler()),\n    ("classifier", RandomForestClassifier(n_estimators=200)),\n])\n\n# fit_transform on train, transform on test — automatically\npipe.fit(X_train, y_train)\nscore = pipe.score(X_test, y_test)\n```\n\n## Why this prevents leakage\n\n- `StandardScaler.fit()` computes mean/std **only from X_train**\n- When `pipe.score(X_test)` runs, the scaler uses the *train* statistics to transform test data — no information from X_test leaks into the scaler\n\n## Cross-validation\n\nUse `cross_val_score(pipe, X, y)` — sklearn refits the entire pipeline on each fold\'s training split automatically.' },
    ],
    content: `---
title: "scikit-learn ML Pipeline Best Practices"
source: perplexity
url: https://www.perplexity.ai/search/f1920006-sklearn-pipeline
date: 2026-04-29T13:00:00.000Z
messageCount: 2
contentFormat: markdown-v1
---

# scikit-learn ML Pipeline Best Practices

🙋 What is the best way to structure a scikit-learn Pipeline to avoid data leakage?

---

🤖 Data leakage is the most common mistake in ML — the Pipeline class is your primary defence.

## The rule

Every preprocessing step that "learns" from data (scaling, imputation, encoding) **must** be inside the Pipeline so it's fit only on training data.

## Correct structure

\`\`\`python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier

pipe = Pipeline([
    ("imputer",    SimpleImputer(strategy="median")),
    ("scaler",     StandardScaler()),
    ("classifier", RandomForestClassifier(n_estimators=200)),
])

pipe.fit(X_train, y_train)
score = pipe.score(X_test, y_test)
\`\`\`

Use \`cross_val_score(pipe, X, y)\` — sklearn refits the entire pipeline on each fold automatically.
`,
  },
};

// ---------------------------------------------------------------------------
// Storage payloads — ready to pass to chrome.storage.local.set()
// ---------------------------------------------------------------------------

/** Build the chatIndex array (metadata only, no content field). */
export function buildChatIndex() {
  return Object.values(CHATS).map(({ content: _, ...meta }) => meta);
}

/** Build the chatSearchIndex array. */
export function buildChatSearchIndex() {
  return Object.values(CHATS).map(chat => ({
    id:             chat.id,
    title:          chat.title,
    tags:           chat.tags ?? [],
    timestamp:      chat.timestamp,
    searchableText: (chat.content ?? '').replace(/data:[^,]+,[A-Za-z0-9+/=\r\n]+/g, '').trim(),
  }));
}

/** Build per-chat storage entries: { 'chat:<id>': fullChatObject, ... }. */
export function buildChatEntries() {
  const entries = {};
  for (const chat of Object.values(CHATS)) {
    entries[`chat:${chat.id}`] = chat;
  }
  return entries;
}

/**
 * Return the full storage payload (topicTree + chatIndex + chatSearchIndex
 * + per-chat entries) ready for `chrome.storage.local.set()`.
 */
export function buildFullStoragePayload() {
  return {
    topicTree:       TOPIC_TREE,
    chatIndex:       buildChatIndex(),
    chatSearchIndex: buildChatSearchIndex(),
    ...buildChatEntries(),
  };
}
