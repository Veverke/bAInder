/**
 * e2e/helpers/storage.js
 *
 * Chrome storage utilities for E2E tests.
 * All helpers require an extension-origin Page (chrome-extension://) or a
 * ServiceWorker handle so they can call the chrome.storage API.
 */

/**
 * Seed chrome.storage.local via an extension page or service worker.
 * @param {import('@playwright/test').Page|import('@playwright/test').Worker} target
 * @param {object} data
 */
export async function seedStorage(target, data) {
  await target.evaluate(async (d) => {
    await chrome.storage.local.set(d);
  }, data);
}

/**
 * Clear all chrome.storage.local data.
 * @param {import('@playwright/test').Page|import('@playwright/test').Worker} target
 */
export async function clearStorage(target) {
  await target.evaluate(async () => {
    await chrome.storage.local.clear();
  });
}

/**
 * Read one or more keys from chrome.storage.local.
 * @param {import('@playwright/test').Page|import('@playwright/test').Worker} target
 * @param {string|string[]} keys
 * @returns {Promise<object>}
 */
export async function readStorage(target, keys) {
  const keyArr = Array.isArray(keys) ? keys : [keys];
  return target.evaluate(async (ks) => {
    return chrome.storage.local.get(ks);
  }, keyArr);
}

/**
 * Convenience: get the current topicTree from storage.
 */
export async function getTopicTree(target) {
  const result = await readStorage(target, ['topicTree']);
  return result.topicTree ?? null;
}

/**
 * Convenience: get the chatIndex array from storage.
 */
export async function getChatIndex(target) {
  const result = await readStorage(target, ['chatIndex']);
  return result.chatIndex ?? [];
}

/**
 * Convenience: get a full chat entry by ID.
 * @param {import('@playwright/test').Page} target
 * @param {string} chatId
 */
export async function getChatById(target, chatId) {
  const result = await readStorage(target, [`chat:${chatId}`]);
  return result[`chat:${chatId}`] ?? null;
}
