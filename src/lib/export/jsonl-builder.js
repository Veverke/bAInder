/**
 * jsonl-builder.js
 *
 * Serialises ChatEntry objects to OpenAI fine-tuning JSONL format.
 * Each line is a self-contained JSON object with a `messages` array
 * compatible with the OpenAI chat fine-tuning specification.
 *
 * No external dependencies — pure JS.
 */

/**
 * Serialise a single ChatEntry to an OpenAI fine-tuning JSONL line.
 *
 * One JSONL line = the full conversation (all user + assistant turns),
 * optionally preceded by a system message.
 *
 * Rules:
 *  - Only include messages with role === 'user' or 'assistant'; skip all others.
 *  - If options.systemMessage is a non-empty string, prepend
 *    { role: 'system', content: systemMessage } to the messages array.
 *  - If the filtered messages array is empty, return '' (empty string, no line).
 *  - Return a single JSON line (no trailing newline).
 *
 * @param {Object} chat — ChatEntry ({ id, title, messages: [{role,content}] })
 * @param {{ systemMessage?: string, prettyPrint?: boolean }} [options]
 * @returns {string}
 */
export const buildFineTuningJsonl = (chat, options = {}) => {
  if (!chat) return '';

  const rawMessages = Array.isArray(chat.messages) ? chat.messages : [];
  const filtered = rawMessages.filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant'),
  );

  if (filtered.length === 0) return '';

  const messages = [];

  if (options.systemMessage && typeof options.systemMessage === 'string') {
    messages.push({ role: 'system', content: options.systemMessage });
  }

  for (const m of filtered) {
    messages.push({ role: m.role, content: m.content });
  }

  return options.prettyPrint
    ? JSON.stringify({ messages }, null, 2)
    : JSON.stringify({ messages });
};

/**
 * Serialise multiple ChatEntry objects to a JSONL document (one line per chat).
 *
 * Rules:
 *  - Call buildFineTuningJsonl() for each chat; collect non-empty results.
 *  - Join with '\n'.
 *  - Return '' when there are no valid lines.
 *
 * @param {Object[]} chats
 * @param {{ systemMessage?: string, prettyPrint?: boolean }} [options]
 * @returns {string}
 */
export const buildFineTuningJsonlMulti = (chats, options = {}) => {
  if (!Array.isArray(chats)) return '';

  const lines = chats
    .map((chat) => buildFineTuningJsonl(chat, options))
    .filter((line) => line !== '');

  return options.prettyPrint
    ? lines.join('\n\n')
    : lines.join('\n');
};
