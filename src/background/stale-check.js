/**
 * C.19 — Review-by Date / Expiry Flag
 * Stale-check logic: scans all saved chats for overdue review dates
 * and sets flaggedAsStale = true on any that have passed.
 *
 * Supports both the legacy monolithic 'chats' format and the new per-chat-key
 * format ('chatIndex' + 'chat:<id>' keys introduced by P1.1).
 *
 * Extracted into its own module for testability — background.js imports
 * and calls this on extension startup and via a daily chrome.alarms event.
 */

/**
 * Scan the chats index and flag any whose reviewDate is on or before `today`.
 *
 * @param {Object} storage  browser.storage.local-like API ({ get, set })
 * @param {string} [today]  ISO date string YYYY-MM-DD; defaults to actual today.
 * @returns {Promise<number>} Number of chats newly flagged (0 if nothing changed).
 */
export async function checkStaleChats(storage, today = null) {
  const todayStr = today || new Date().toISOString().slice(0, 10);

  // Support both new per-chat-key format (chatIndex) and legacy ('chats') format.
  const result      = await storage.get(['chatIndex', 'chats']);
  const isNewFormat = Array.isArray(result.chatIndex);
  const index       = isNewFormat
    ? result.chatIndex
    : (Array.isArray(result.chats) ? result.chats : []);

  const stale = index.filter(chat =>
    chat.reviewDate && chat.reviewDate <= todayStr && !chat.flaggedAsStale
  );

  if (stale.length === 0) return 0;

  if (isNewFormat) {
    // Update chatIndex entries and individual chat:<id> keys in a single set call.
    const newIndex = index.map(chat =>
      stale.some(s => s.id === chat.id) ? { ...chat, flaggedAsStale: true } : chat
    );
    const writes = { chatIndex: newIndex };
    for (const meta of stale) {
      const chatResult = await storage.get([`chat:${meta.id}`]);
      const fullChat   = chatResult[`chat:${meta.id}`];
      if (fullChat) {
        writes[`chat:${meta.id}`] = { ...fullChat, flaggedAsStale: true };
      }
    }
    await storage.set(writes);
  } else {
    // Legacy format: update the monolithic 'chats' array.
    const updated = index.map(chat =>
      stale.some(s => s.id === chat.id) ? { ...chat, flaggedAsStale: true } : chat
    );
    await storage.set({ chats: updated });
  }

  return stale.length;
}
