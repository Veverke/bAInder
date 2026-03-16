# Release & CWS Publishing Work Plan

## Status: Pre-submission

---

## Phase 1 — Code cleanup before submission

### 1.1 Strip audio entity (Option A)
**Decision:** Remove the audio capture feature for v1.0. The pipeline is architecturally correct but too unreliable to ship — the MAIN-world injection also attracts CWS reviewer scrutiny.

**Steps:**
- [ ] Remove the `audio-interceptor.js` entry from `manifest.json` `content_scripts` (the `document_start` / `MAIN` world block)
- [ ] Remove `_collectDocAudio` / `collectShadowAudio` / `_captureAudioSrc` from `src/content/content.js`
- [ ] Remove the `[🔊 Generated audio …]` marker rendering block from `src/reader/reader.js`
- [ ] Remove `.audio-card` and `.audio-card--unavailable` CSS rules from `src/reader/reader.css`
- [ ] Remove `src/content/audio-interceptor.js` from the repo (or keep with a clear `// NOT SHIPPED` comment)
- [ ] Remove `host_permissions` entries that were only needed for audio CDN fetching:
  - `https://files.oaiusercontent.com/*`
  - `https://oaidalleapiprodscus.blob.core.windows.net/*`
  - `https://oaidalleaeuropeprodscus.blob.core.windows.net/*`
  - `https://lh3.google.com/*`
  - `https://lh3.googleusercontent.com/*`
  - `https://storage.googleapis.com/*`
  - Only remove the ones **not** needed by any other feature (image capture, etc.) — verify first
- [ ] Update tests: remove or skip any audio-entity tests
- [ ] Run `npm run test:run` — all tests green

**Future (v1.1):** Re-implement audio capture using a MutationObserver that proactively fetches the signed URL as soon as the ChatGPT download chip appears, rather than on `.click()`. Ship when the capture success rate is consistently high.

---

### 1.2 Verify remaining host_permissions are justified
After audio cleanup, audit every remaining `host_permissions` entry and confirm it maps to a shipped feature. Prepare a one-line justification for each (needed for CWS submission form):

| Origin | Justification |
|---|---|
| `https://chat.openai.com/*` | Content script — save button, chat extraction |
| `https://chatgpt.com/*` | Content script — save button, chat extraction |
| `https://claude.ai/*` | Content script — save button, chat extraction |
| `https://gemini.google.com/*` | Content script — save button, chat extraction |
| `https://copilot.microsoft.com/*` | Content script — save button, chat extraction |
| `https://m365.cloud.microsoft/*` | Content script — Copilot enterprise variant |
| `https://www.perplexity.ai/*` | Compare Mode — `scripting.executeScript` on open tab |
| `https://perplexity.ai/*` | Compare Mode — bare-domain variant |
| `https://th.bing.com/*` | Copilot image thumbnails (verify still needed after audio cut) |
| `https://www.bing.com/*` | Copilot image thumbnails (verify still needed after audio cut) |

---

## Phase 2 — Store assets

### 2.1 Privacy Policy (required)
CWS mandates a hosted privacy policy for extensions with broad host_permissions.

- [ ] Write the policy — key points to cover:
  - No data leaves the browser; all storage is `chrome.storage.local`
  - No analytics, no telemetry, no accounts
  - Purpose of each host_permission group
- [ ] Host it at a public URL (options: GitHub Pages, a `/privacy` section of a project site, or a plain GitHub raw file served via a Pages redirect)
- [ ] Record the URL — needed in the CWS dashboard

### 2.2 Promotional tile images (required / strongly recommended)
Screenshots in `assets/screenshots/` are for the listing gallery. The store also needs standalone artwork:

- [ ] **Small promo tile** — 440×280 px PNG (required for featured placement)
- [ ] **Large promo tile** — 920×680 px PNG (optional)
- [ ] **Marquee image** — 1400×560 px PNG (optional, used if the extension is featured)

### 2.3 Verify screenshot dimensions
CWS requires exactly **1280×800** or **640×400** pixels per screenshot (up to 5).

- [ ] Check current screenshots:
  ```powershell
  Add-Type -AssemblyName System.Drawing
  Get-Item "assets\screenshots\*.png" | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    "$($_.Name): $($img.Width)x$($img.Height)"
    $img.Dispose()
  }
  ```
- [ ] Resize or re-export any that don't match

---

## Phase 3 — Build the Chrome package

- [ ] Run:
  ```powershell
  npm run package:chrome
  ```
  Produces `releases/bainder-chrome-v1.0.0.zip`
- [ ] Load the zip into Chrome via `chrome://extensions` → "Load packed" to smoke-test
- [ ] Confirm the zip does **not** contain source maps, test files, or dev-only assets

---

## Phase 4 — CWS Developer Dashboard

### 4.1 One-time setup
- [ ] Register as a Chrome Web Store developer (one-time $5 USD fee) at https://chrome.google.com/webstore/devconsole
- [ ] Verify the Google account you'll publish under

### 4.2 Upload and configure the listing

- [ ] New Item → upload `releases/bainder-chrome-v1.0.0.zip`
- [ ] Fill in store listing fields:

| Field | Value |
|---|---|
| Short description (≤132 chars) | Adapt from manifest description |
| Detailed description | Adapt from README Features section |
| Category | Productivity |
| Language | English |
| Screenshots (1–5) | Upload 1280×800 PNGs from `assets/screenshots/` |
| Small promo tile | Upload 440×280 PNG |
| Privacy policy URL | URL from Phase 2.1 |

- [ ] In the **Permissions justification** section, paste the table from Phase 1.2
- [ ] Set visibility: **Public** (or Unlisted for soft launch)
- [ ] Select distribution regions if needed

### 4.3 Submit for review
- [ ] Click **Submit for review**
- [ ] Await confirmation email (review typically 1–3 business days)

---

## Phase 5 — Release automation (post-v1.0)

Add a GitHub Actions workflow so that tagging a version is the only manual step needed for future releases.

### Workflow: `.github/workflows/release.yml`
Triggers on `git tag v*` push.

**Steps the workflow performs:**
1. `npm ci`
2. `npm run package:chrome` (and optionally `package:edge`)
3. Create a GitHub Release for the tag, attaching the zip as a downloadable asset
4. (Optional) Publish to CWS via `chrome-webstore-upload-cli` using OAuth credentials stored as GitHub secrets

**Secrets needed for CWS auto-publish:**
- `CWS_EXTENSION_ID`
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`

**Developer workflow after automation is in place:**
```bash
# 1. Bump version in both package.json and manifest.json
# 2. Commit and push
git tag v1.0.1
git push --tags
# → zip is built, GitHub Release created, CWS draft updated automatically
```

- [ ] Scaffold `.github/workflows/release.yml`
- [ ] Set up CWS API credentials and store as GitHub secrets
- [ ] Test with a pre-release tag (e.g. `v1.0.1-rc.1`) before going live

---

## Checklist summary

| # | Item | Done |
|---|---|---|
| 1 | Remove audio entity (manifest, content.js, reader.js, css) | ☐ |
| 2 | Audit and justify all remaining host_permissions | ☐ |
| 3 | Write and host Privacy Policy | ☐ |
| 4 | Create promo tile artwork (440×280 minimum) | ☐ |
| 5 | Verify screenshot dimensions (1280×800) | ☐ |
| 6 | Build Chrome zip (`npm run package:chrome`) | ☐ |
| 7 | Smoke-test zip locally | ☐ |
| 8 | Register CWS developer account ($5) | ☐ |
| 9 | Upload, fill listing, justify permissions, submit | ☐ |
| 10 | Scaffold release GitHub Actions workflow | ☐ |
