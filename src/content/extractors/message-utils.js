/**
 * Message utility functions for chat extraction.
 * Handles title generation and message object normalisation.
 */

/**
 * Generate a chat title from the message array or fall back to URL / default.
 * @param {Array<{role:string, content:string}>} messages
 * @param {string} [url]
 * @returns {string}
 */
export function generateTitle(messages, url) {
  // Strategy 1: first complete sentence (ending with . ? !) from the user's first message.
  // Strip markdown artefacts since content is stored as markdown after htmlToMarkdown.
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser && firstUser.content) {
    // Role labels (e.g. "You said:") that survive extraction are meaningless as titles.
    const ROLE_LABEL_RE = /^(you said|i said|copilot said|copilot):?\s*$/i;
    const firstLine = firstUser.content
      .split('\n')
      .map(l => l
        .replace(/^#{1,6}\s+/, '')          // strip ATX heading markers
        .replace(/\*\*(.+?)\*\*/g, '$1')    // strip bold
        .replace(/\*(.+?)\*/g, '$1')        // strip italic
        .replace(/`([^`]*)`/g, '$1')        // strip inline code
        .trim()
      )
      .filter(l => l.length > 0 && !ROLE_LABEL_RE.test(l))
      [0] || '';
    if (firstLine) {
      // Try to extract the first complete sentence
      const sentenceMatch = firstLine.match(/^(.+?[.?!])\s/);
      if (sentenceMatch && sentenceMatch[1].length >= 8) return sentenceMatch[1].trim();
      // Otherwise return the full cleaned first line
      return firstLine;
    }
  }

  // Strategy 3: URL-derived name
  if (url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last && last !== 'c' && last.length > 3) {
          return `Chat ${last.slice(0, 40)}`;
        }
      }
    } catch (_) { /* ignore invalid URLs */ }
  }

  return 'Untitled Chat';
}

/**
 * Create a normalised message object.
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content
 * @returns {{role: string, content: string}}
 */
export function formatMessage(role, content) {
  return {
    role: role || 'unknown',
    content: (content || '').trim()
  };
}
