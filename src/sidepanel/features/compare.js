/**
 * compare.js — C.18
 *
 * Responsibility: handle the Compare button click in multi-select mode.
 * Reads the selected chats from the renderer, serialises their IDs into the
 * URL query string, and opens the compare page in a new tab.
 */

import { state } from '../app-context.js';
import browser from '../../lib/vendor/browser.js';

export async function handleCompare() {
  const chats = state.renderer?.getSelectedChats();
  if (!chats || chats.length < 2) return;
  const ids = chats.map(c => encodeURIComponent(c.id)).join(',');
  const url = browser.runtime.getURL(`src/compare/compare.html?ids=${ids}`);
  await browser.tabs.create({ url });
}
