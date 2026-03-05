/**
 * Claude conversation extractor.
 * Targets: claude.ai
 *
 * Uses the claude.ai internal API rather than DOM scraping, because
 * Claude's frontend React class names and data-testid attributes change
 * frequently and there are no stable selectors for message containers.
 *
 * API flow:
 *   1. GET /api/organizations              → pick first org UUID
 *   2. GET /api/organizations/:orgId/chat_conversations/:convId?tree=True&...
 *      → chat_messages[] with sender + content blocks
 *   3. Traverse current_leaf_message_uuid → parent_message_uuid to get
 *      the active branch in chronological order.
 */

import { formatMessage, generateTitle } from './message-utils.js';

/**
 * Extract messages from a Claude conversation via the claude.ai API.
 * Must be called from a context that has access to `window.location`
 * and can make credentialed fetch requests to claude.ai (i.e. a content script).
 *
 * @returns {Promise<{title: string, messages: Array, messageCount: number}>}
 */
export async function extractClaude() {
  const pathMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/i);
  if (!pathMatch) throw new Error('No conversation ID in URL');
  const conversationId = pathMatch[1];

  const API_HEADERS = {
    'Accept': 'application/json',
    'anthropic-client-type': 'web',
  };

  const orgsResp = await fetch('https://claude.ai/api/organizations', {
    credentials: 'include',
    headers: API_HEADERS,
  });
  if (!orgsResp.ok) throw new Error('Failed to fetch organizations');
  const orgs = await orgsResp.json();
  if (!orgs?.length) throw new Error('No organizations found');

  // Try each org until one returns the conversation (handles multi-org accounts)
  let data;
  let lastStatus = 0;
  for (const org of orgs) {
    const convResp = await fetch(
      `https://claude.ai/api/organizations/${org.uuid}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`,
      { credentials: 'include', headers: API_HEADERS }
    );
    if (convResp.ok) { data = await convResp.json(); break; }
    lastStatus = convResp.status;
  }
  if (!data) throw new Error(`Failed to fetch conversation (${lastStatus})`);
  if (!data?.chat_messages) throw new Error('Invalid conversation data');

  // Build a UUID → message map for branch traversal
  const msgMap = {};
  for (const msg of data.chat_messages) msgMap[msg.uuid] = msg;

  // Walk from current leaf back to root to get the active branch in order
  let ordered = [];
  let cur = msgMap[data.current_leaf_message_uuid];
  while (cur) {
    ordered.unshift(cur);
    cur = msgMap[cur.parent_message_uuid];
  }
  if (!ordered.length) ordered = data.chat_messages;

  const messages = [];
  for (const msg of ordered) {
    const role = msg.sender === 'human' ? 'user' : 'assistant';
    let content = '';
    if (Array.isArray(msg.content)) {
      content = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
    } else if (typeof msg.text === 'string') {
      content = msg.text;
    }
    if (content.trim()) messages.push(formatMessage(role, content.trim()));
  }

  const title = data.name || generateTitle(messages, window.location.href);
  return { title, messages, messageCount: messages.length };
}
