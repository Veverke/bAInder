# Edge Porting Plan — bAInder

## Should you use the same repo?

**Yes.** Industry-standard practice (uBlock Origin, Bitwarden, 1Password, etc.) is a **single codebase with browser-specific build targets**. Separate repos create divergence, double the maintenance burden, and make cross-browser bug fixes error-prone.

The approach: shared source → Vite build configs per browser → separate output packages.

---

## Why Edge is a low-friction target

bAInder is already well-positioned for Edge:

| Factor | Status |
|---|---|
| Manifest V3 | Already used — Edge supports MV3 natively |
| Chromium engine | Edge is Chromium-based; Chrome extensions run on Edge with minimal changes |
| `sidePanel` API | Supported in Edge 114+ |
| `copilot.microsoft.com` host | Microsoft's own AI service — Edge is the primary browser for it |
| `m365.cloud.microsoft` host | Microsoft 365 — a natural Edge use case |

---

## Action Plan

### Phase 1 — Compatibility Audit

**1.1 — Audit all `chrome.*` API calls**

Search the codebase for raw `chrome.*` usage:

```
grep -r "chrome\." src/
```

Edge exposes the same APIs under both `chrome.*` (for compatibility) and `browser.*`. However, as a cross-browser hygiene step, wrap API access through a thin compatibility shim or adopt [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) from Mozilla, which normalises `chrome.*` / `browser.*` differences and makes future Firefox porting trivial.

**1.2 — Verify `sidePanel` availability**

Edge has supported `chrome.sidePanel` since Edge 114 (May 2023). No changes needed, but add a minimum Edge version note to the store listing (Edge 114+).

**1.3 — Check `contextMenus` behaviour**

Edge supports `chrome.contextMenus` identically. No changes expected.

**1.4 — Validate host permissions**

All five host permissions (`chat.openai.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`, `m365.cloud.microsoft`) work the same on Edge. No changes needed.

---

### Phase 2 — Build System

**2.1 — Add a `BROWSER` environment variable**

Parameterise the build so a single command produces a browser-specific package:

```js
// vite.config.js
const browser = process.env.BROWSER || 'chrome';
```

**2.2 — Add browser-specific manifest merging**

Create a manifest override file for Edge. Edge requires no structural changes to the MV3 manifest, but store submission benefits from explicit `browser_specific_settings`:

Create `src/manifests/manifest.edge.json`:

```json
{
  "browser_specific_settings": {
    "edge": {
      "browser_action_next_to_address_bar": false
    }
  }
}
```

Add a merge step in `vite.config.js` (or a `scripts/build.js` helper) that deep-merges the base `manifest.json` with the browser-specific override, then writes the result into `dist/`.

**2.3 — Add build scripts to `package.json`**

```json
"scripts": {
  "build": "vite build",
  "build:chrome": "BROWSER=chrome vite build",
  "build:edge": "BROWSER=edge vite build",
  "package:chrome": "npm run build:chrome && node scripts/package.js chrome",
  "package:edge": "npm run build:edge && node scripts/package.js edge"
}
```

**2.4 — Add a packaging script**

Create `scripts/package.js` that zips the `dist/` directory into `releases/bainder-chrome-{version}.zip` or `releases/bainder-edge-{version}.zip` for store submission.

---

### Phase 3 — Edge-Specific Testing

**3.1 — Load as unpacked extension in Edge**

1. Open `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist/`
4. Smoke-test all five AI host sites

**3.2 — Run existing test suite targeting Edge**

The current Vitest suite is browser-agnostic (happy-dom/jsdom). No changes required to run tests. Add an Edge-specific E2E pass following the existing [e2e-test-plan](e2e-test-plan.md).

**3.3 — Test Microsoft-specific hosts with priority**

Since `copilot.microsoft.com` and `m365.cloud.microsoft` are Microsoft properties, users are more likely to encounter them via Edge. Give these hosts extra attention in the Edge test pass.

---

### Phase 4 — Store Submission

**4.1 — Create a Microsoft Partner Center account**

Submit via the [Microsoft Edge Add-ons Developer Portal](https://partner.microsoft.com/dashboard/microsoftedge/).

**4.2 — Prepare store assets**

| Asset | Requirement |
|---|---|
| Extension package | `.zip` of `dist/` (same format as Chrome) |
| Icons | Already present at 16/32/48/128px |
| Screenshots | 1280×800 or 640×400 — reuse Chrome screenshots if compliant |
| Short description | ≤ 250 characters |
| Detailed description | Markdown not supported in Edge store |
| Privacy policy URL | Required if using `storage` permission |
| Category | Productivity |

**4.3 — Review Microsoft's extension policies**

Microsoft's content policies are broadly aligned with Chrome Web Store policies. Key differences:
- Microsoft may require a privacy policy URL due to `storage`/`unlimitedStorage` permissions
- Extensions targeting Microsoft 365 properties may receive a featured placement

---

### Phase 5 — CI/CD Integration

**5.1 — Add a multi-browser build job**

Extend the CI pipeline (GitHub Actions or equivalent) to produce both browser artifacts on every tag:

```yaml
- name: Build Chrome package
  run: npm run package:chrome

- name: Build Edge package
  run: npm run package:edge

- uses: actions/upload-artifact@v4
  with:
    name: browser-packages
    path: releases/
```

**5.2 — Consider automated submission (optional)**

- Chrome: [`chrome-webstore-upload`](https://github.com/fregante/chrome-webstore-upload-action)
- Edge: [`edge-addon-upload`](https://github.com/nicerobot/edge-addon-upload-action) (community-maintained)

---

## What does NOT need to change

- `manifest.json` structure — MV3 is fully supported
- All JavaScript source files — no browser-specific APIs are used that Edge lacks
- Content scripts logic — identical Chromium engine
- The Vite build pipeline — only configuration additions required
- All existing tests — Vitest suite requires no modification

---

## Estimated effort

| Phase | Effort |
|---|---|
| Phase 1 — Audit | 1–2 hours |
| Phase 2 — Build system | 2–3 hours |
| Phase 3 — Testing | 2–4 hours |
| Phase 4 — Store submission | 1–2 hours (+ review wait time: typically 3–5 business days) |
| Phase 5 — CI/CD | 1–2 hours |
| **Total** | **~1–2 days of work** |

---

## Future browsers (Firefox)

Once the build system from Phase 2 is in place, adding Firefox becomes straightforward:
- Replace `chrome.*` with the `webextension-polyfill` shim (or adopt it now in Phase 1 as recommended)
- Add a `manifest.firefox.json` override with `browser_specific_settings.gecko`
- `sidePanel` requires a Firefox-specific alternative (`browser.sidebarAction`) — this is the only significant API difference
