# bAInder Privacy Policy

Last updated: 2026-03-16

bAInder is a browser extension that helps you organize AI chat conversations in your browser.

## Summary

- bAInder does not sell your data.
- bAInder does not transmit your chat data to our servers.
- bAInder does not use analytics or telemetry.
- bAInder does not require user accounts.
- Data is stored locally in your browser using `chrome.storage.local`.

## What data bAInder accesses

bAInder reads conversation content from supported AI chat websites only so you can save, organize, search, and compare chats inside the extension.

Data may include:
- Chat titles and messages
- Metadata needed to render and sort conversations
- Image URLs and images needed for saved artifacts

## Where data is stored

All saved data is stored locally in your browser via `chrome.storage.local`.

bAInder does not upload your saved chat content to external servers operated by bAInder.

## Permissions and why they are used

### Extension permissions

- `storage`, `unlimitedStorage`: Save and manage your local chat library.
- `tabs`, `activeTab`, `scripting`: Interact with supported chat tabs for capture and compare features.
- `sidePanel`: Render the extension UI in the browser side panel.
- `contextMenus`: Add right-click actions for quick capture and organization.
- `alarms`: Schedule local maintenance tasks (for example, cleanup or retries).

### Host permissions

bAInder requests host permissions only for supported chat providers and related image hosts:

- `chat.openai.com`, `chatgpt.com`: Save button injection and chat extraction.
- `files.oaiusercontent.com`, `oaidalleapiprodscus.blob.core.windows.net`, `oaidalleaeuropeprodscus.blob.core.windows.net`: Fetch OpenAI/ChatGPT image assets through the extension background context when page-level fetch is blocked by browser policies.
- `claude.ai`: Save button injection, extraction, and conversation access from page context.
- `gemini.google.com`: Save button injection and extraction.
- `lh3.google.com`, `lh3.googleusercontent.com`: Fetch Gemini image assets when direct page access is restricted.
- `copilot.microsoft.com`, `m365.cloud.microsoft`: Save button injection, extraction, and compare-mode interactions.
- `th.bing.com`, `www.bing.com`: Fetch Microsoft Copilot image assets.
- `www.perplexity.ai`, `perplexity.ai`: Save button injection, extraction, and compare-mode interactions.

## Data sharing

bAInder does not sell or rent personal data.

bAInder does not share your chat content with third parties except when your own browser directly accesses the supported sites as part of normal extension functionality.

## Security

bAInder follows least-privilege principles in requested permissions and limits access to hosts required for implemented features.

## Children's privacy

bAInder is not intended for children under 13.

## Changes to this policy

This policy may be updated to reflect product or legal changes. The latest version will be published at the same URL used in the Chrome Web Store listing.

## Contact

For privacy questions, open an issue in the project repository.
