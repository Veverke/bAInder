/**
 * C.19 — Review-by Date / Expiry Flag
 * Stale-check logic: scans all saved chats for overdue review dates
 * and sets flaggedAsStale = true on any that have passed.
 *
 * Extracted into its own module for testability — background.js imports
 * and calls this on extension startup and via a daily chrome.alarms event.
 */

/**
 * Scan the chats array and flag any whose reviewDate is on or before `today`.
 *
 * @param {Object} storage  browser.storage.local-like API ({ get, set })
 * @param {string} [today]  ISO date string YYYY-MM-DD; defaults to actual today.
 * @returns {Promise<number>} Number of chats newly flagged (0 if nothing changed).
 */
export async function checkStaleChats(storage, today = null) {
  const todayStr = today || new Date().toISOString().slice(0, 10);

  const result = await storage.get(['chats']);
  const chats  = Array.isArray(result.chats) ? result.chats : [];

  let flaggedCount = 0;
  const updated = chats.map(chat => {
    // Only act on chats with a reviewDate that has been reached or passed
    // and that haven't already been flagged.
    if (chat.reviewDate && chat.reviewDate <= todayStr && !chat.flaggedAsStale) {
      flaggedCount++;
      return { ...chat, flaggedAsStale: true };
    }
    return chat;
  });

  if (flaggedCount > 0) {
    await storage.set({ chats: updated });
  }

  return flaggedCount;
}
