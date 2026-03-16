# Release & CWS Publishing Work Plan

## Status: Pre-submission

---

## Phase 1 — Code cleanup before submission

### ~~1.1 Strip audio entity (Option A)~~
**Superseded:** v1.0 keeps audio entities via Option B. When capture is unavailable, the reader shows an "Open in original" fallback instead of stripping the feature.

---

### 1.2 Verify remaining host_permissions are justified
Audit every remaining `host_permissions` entry and confirm it maps to a shipped feature. Prepare a one-line justification for each (needed for CWS submission form).

Audit result:
- `https://storage.googleapis.com/*` was removed from `manifest.json`; it only mapped to legacy audio-capture selectors and is not required by the shipped image or Compare Mode flows.

| Origin | Justification |
|---|---|
| `https://chat.openai.com/*` | Content script on the legacy ChatGPT domain for save button injection and chat extraction |
| `https://chatgpt.com/*` | Content script on the current ChatGPT domain for save button injection, chat extraction, and Compare Mode target matching |
| `https://files.oaiusercontent.com/*` | Background fetch proxy for ChatGPT-generated images that would otherwise fail CORP from the content script |
| `https://oaidalleapiprodscus.blob.core.windows.net/*` | Background fetch proxy for ChatGPT / DALL-E generated images served from Azure Blob storage |
| `https://oaidalleaeuropeprodscus.blob.core.windows.net/*` | Background fetch proxy for ChatGPT / DALL-E generated images served from the EU Azure Blob variant |
| `https://claude.ai/*` | Content script for save button and extraction, plus Claude conversation API fetches from the page context |
| `https://gemini.google.com/*` | Content script for save button and chat extraction |
| `https://lh3.google.com/*` | Background fetch proxy for Gemini images on Google-hosted asset URLs that are blocked by CORP from the content script |
| `https://lh3.googleusercontent.com/*` | Background fetch proxy for Gemini image variants served from Googleusercontent hosts |
| `https://copilot.microsoft.com/*` | Content script for save button and chat extraction, plus Compare Mode prompt injection target |
| `https://m365.cloud.microsoft/*` | Content script for the Microsoft 365 Copilot enterprise variant and redirect target |
| `https://th.bing.com/*` | Background fetch proxy for Copilot image thumbnails and inline images served from Bing CDN hosts |
| `https://www.bing.com/*` | Background fetch proxy for Copilot image assets served from Bing hosts |
| `https://www.perplexity.ai/*` | Content script for save button and extraction, plus Compare Mode execution on the `www` host |
| `https://perplexity.ai/*` | Content script and Compare Mode execution on the bare-domain Perplexity host |

---

## Phase 2 — Store assets

### 2.1 Privacy Policy (required)
CWS mandates a hosted privacy policy for extensions with broad host_permissions.

- [x] Write the policy — key points to cover:
  - No data leaves the browser; all storage is `chrome.storage.local`
  - No analytics, no telemetry, no accounts
  - Purpose of each host_permission group
- [ ] Host it at a public URL (options: GitHub Pages, a `/privacy` section of a project site, or a plain GitHub raw file served via a Pages redirect)
- [ ] Record the URL — needed in the CWS dashboard

Implemented in repo:
- `docs/privacy-policy.md`
- `docs/privacy/index.html` (ready for GitHub Pages hosting)

### 2.2 Promotional tile images (required / strongly recommended)
Screenshots in `assets/screenshots/` are for the listing gallery. The store also needs standalone artwork:

- [x] **Small promo tile** — 440×280 px PNG (required for featured placement)
- [x] **Large promo tile** — 920×680 px PNG (optional)
- [x] **Marquee image** — 1400×560 px PNG (optional, used if the extension is featured)

Generated files:
- `assets/store/small-promo-tile-440x280.png`
- `assets/store/large-promo-tile-920x680.png`
- `assets/store/marquee-1400x560.png`

### 2.3 Verify screenshot dimensions
CWS requires exactly **1280×800** or **640×400** pixels per screenshot (up to 5).

- [x] Check current screenshots:
  ```powershell
  Add-Type -AssemblyName System.Drawing
  Get-Item "assets\screenshots\*.png" | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    "$($_.Name): $($img.Width)x$($img.Height)"
    $img.Dispose()
  }
  ```
- [x] Resize or re-export any that don't match

Result:
- Original screenshots in `assets/screenshots/` are not CWS-compliant dimensions.
- CWS-ready screenshots were created in `assets/screenshots-cws/`:
  - `cws-screenshot-1-1280x800.png`
  - `cws-screenshot-2-1280x800.png`
  - `cws-screenshot-3-1280x800.png`
  - `cws-screenshot-5-1280x800.png`

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
| 1 | Audio entity handled via Option B (`Open in original` fallback); Option A cleanup not needed | ☑ |
| 2 | Audit and justify all remaining host_permissions | ☑ |
| 3 | Write and host Privacy Policy | ☐ |
| 4 | Create promo tile artwork (440×280 minimum) | ☑ |
| 5 | Verify screenshot dimensions (1280×800) | ☑ |
| 6 | Build Chrome zip (`npm run package:chrome`) | ☐ |
| 7 | Smoke-test zip locally | ☐ |
| 8 | Register CWS developer account ($5) | ☐ |
| 9 | Upload, fill listing, justify permissions, submit | ☐ |
| 10 | Scaffold release GitHub Actions workflow | ☐ |
