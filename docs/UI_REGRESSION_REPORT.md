# STACKCUT Homepage UI Regression Report

## Confirmed root cause

The production homepage response at `https://www.stackcut.site/` was HTTP 200 and its bytes matched `index.html` in the checked-out `main` commit. The latest successful GitHub production deployment also points to that same commit (`a68aa6e1a42d77d56fc627d577479684c7680a12`). Its deployment URL returned `/styles.css` as HTTP 200 (`text/css`) and `/scripts.js` as HTTP 404 (`text/plain`):

- `https://stackcut.site/` redirects to `https://www.stackcut.site/`.
- The deployed Vercel configuration redirects `www.stackcut.site` back to `stackcut.site`.
- On the custom domain, requests for either asset alternate between the two hosts until the browser stops following redirects. They do not reach a normal asset response. This is a host-redirect loop, not a missing CSS file or a CSP block.
- On the direct deployment URL, the CSS file is present and the browser applies it; the referenced JavaScript file is genuinely absent. Chromium logged the script 404 and strict MIME-type error.

The source also had two independent issues:

- `styles.css` exists at the deployment root and is tracked in Git, but `scripts.js` did not exist even though `index.html` referenced it.
- The mobile panel had `display: none` at every viewport, including after the menu's `hidden` class was removed.

No `.vercelignore` or secondary Vercel config excludes the root assets. The GitHub production deployment record reports success for the checked-out `main` commit, which also matched `origin/main`. The direct deployment's `/app`, `/pro`, `/privacy`, and `/vs/rocket-money` routes returned their expected pages; their existing Vercel rewrites are retained.

## Changes made

- Updated the root `styles.css` with the missing responsive mobile-panel visibility, keyboard focus styling, reduced-motion support, improved small-screen header fit, and a higher-contrast pricing accent.
- Added root `scripts.js` for the mobile menu. It synchronizes `aria-expanded` and the accessible label, closes on Escape or link selection, and returns focus to the toggle on Escape.
- Updated `index.html` to use the external menu script and its accessible open-menu label; removed duplicate inline menu code.
- Removed the conflicting `www.stackcut.site` to apex redirect from `vercel.json`. This lets Vercel's existing apex-to-www redirect settle on one host instead of looping asset requests.
- Preserved the existing app, Pro, privacy, and comparison route configuration.
- Captured and visually inspected [homepage-repaired.png](./homepage-repaired.png).

Application, payment, and entitlement source files were not changed.

## Tests performed

- Chromium local preview with the repository's production CSP header:
  - `/styles.css`: HTTP 200, `text/css`.
  - `/scripts.js`: HTTP 200, `text/javascript`.
  - `/app`, `/pro`, and `/privacy`: HTTP 200 and expected page content.
  - No browser console errors or failed network requests.
- Direct current Vercel deployment inspection:
  - Homepage matched the source commit; `/styles.css` returned HTTP 200 and `/scripts.js` returned HTTP 404.
  - Chromium confirmed the deployed stylesheet was applied and reported the missing script/MIME errors.
  - `/app`, `/pro`, `/privacy`, and `/vs/rocket-money` returned their intended pages.
- Checked widths 320, 375, 430, 768, 1024, 1440, and 1920 pixels. All had no horizontal overflow.
- Verified the mobile menu opens, closes on Escape and link selection, and updates its ARIA state and accessible name.
- Verified all nine in-page anchors resolve, keyboard focus indicators render, and reduced-motion preferences are respected.
- `node --check scripts.js`, `python -m json.tool vercel.json`, and `git diff --check` passed.
- Confirmed `app.html`, `app-local.js`, `app.js`, `app-local.css`, and `api/pro-status.js` have no changes versus the tested base commit.

## Remaining issues and release status

- **Not deployed.** Production still serves the pre-fix configuration. The fix is committed locally as `a0db2f8`, but pushing to GitHub failed because this environment has no GitHub credentials (`unable to get password from user`).
- The Vercel project currently redirects the apex host to `www`. The repository change stops the reverse redirect loop, so the deployed site will settle on `www.stackcut.site`. To keep the apex URL as the final canonical host, change the Vercel project domain setting to make `stackcut.site` primary and redirect `www` to the apex.
- The custom-domain asset responses must be rechecked after deployment; the direct deployment URL currently proves the stylesheet exists and the JavaScript file is missing in the deployed source.
- The production entitlement/payment backend was not exercised; its code was intentionally left unchanged.

## Commit tested

Baseline source commit: `a68aa6e1a42d77d56fc627d577479684c7680a12` (`main`, equal to `origin/main`). The tested fix is committed locally as `a0db2f8`; it has not been pushed or deployed.
