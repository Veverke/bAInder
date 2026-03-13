/**
 * chat-turns.js — C.18
 *
 * Pure utility: extract only the assistant (non-user) turn content strings
 * from a ChatEntry. Shared across all analysis modules.
 */

/**
 * Extract only the assistant (non-user) turn content strings from a ChatEntry.
 * @param {{ messages?: Array<{ role?: string, content?: string }> }} chat
 * @returns {string[]}
 */
export function extractAssistantTurns(chat) {
  if (!chat || !Array.isArray(chat.messages)) return [];
  return chat.messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content ?? '');
}
