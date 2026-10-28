# STACKCUT Homepage and App Audit

**Status:** Local working-tree changes only. Nothing was committed, merged, or deployed.
**Tested:** 2026-10-28, using Chromium against the local static preview and a read-only Chromium pass against production.

## Source and deployment

| Check | Result |
|---|---|
| Checkout | `main`, HEAD `0becd2086b81f1d76755725c43f18e2ff153a797` (`Document deployment authentication blocker`) |
| Working tree | Already contained substantial uncommitted changes when this audit began. They were preserved and extended; no reset or commit was performed. |
| Latest GitHub production deployment | Deployment `7398156448`, successful, SHA `0becd2086b81f1d76755725c43f18e2ff153a797`; target `https://stackcut-8dxaerjfh-almoqri.vercel.app` |
| Production host | `https://stackcut.site` redirects to `https://www.stackcut.site`. `/`, `/app`, `/pro`, `/privacy`, and `/vs/rocket-money` returned HTTP 200. |
| Live-source comparison | The deployed homepage, app HTML, homepage CSS/JS, and parser worker match the files at the deployment commit. The live homepage matches public `main`; the visible difference is against the newer, uncommitted local homepage changes, not a different deployed commit. |
| Existing security work | `api/pro-status.js`, `.env.example`, and `docs/IMPLEMENTATION_AUDIT.md` existed on `main`. The prior signed-token/allowlist work was retained and tightened; the prior audit was marked historical rather than replaced. |

### Production defects reproduced

- Chromium loaded the live homepage successfully. Its stylesheet and menu script returned HTTP 200, and the homepage had no horizontal overflow at the six requested widths.
- The live `/app` still serves the older HTML from the deployed commit. It requests Tailwind from `cdn.tailwindcss.com`; Chromium reported a CORS block and `net::ERR_FAILED`. The layout consequently rendered unstyled. The live page's `scrollWidth` was **1,431 px** at viewport widths 320, 375, 430, 768, and 1024 px.
- The deployed app references external Chart.js and Decimal.js scripts and Google Fonts. The Tailwind failure was observed; no CSP error was observed in the live Chromium pass.
- The new local app files `/app.css` and `/app-runtime.js`, and the new local Pro-page assets `/pro.css` and `/pro.js`, returned HTTP 404 in production because these changes have not been deployed.
- The production `/api/pro-status` returned `active:false`, `status:inactive`, `source:none` without an entitlement. A fake subscription-ID header also did not activate access on the deployed endpoint; the live code is the older implementation and does not contain this audit's PayPal verification path.
- Live network/browser inspection used no customer records and did not initiate a payment. Vercel environment secrets could not be inspected from this workspace.

## Homepage buttons and links

| Control | Expected destination or action | Result |
|---|---|---|
| Features | Opens a menu; outside click and Escape close it; `aria-expanded` stays synchronized | **PASS** — mouse and keyboard tested |
| Features menu: Overview, Subscription audit, Duplicate detection, Transparent savings | Navigate to the matching section and close the menu | **PASS** — keyboard and mouse tested |
| Header Open app; header, hero, and mobile Start free audit | Open `/app` | **PASS** — every visible CTA tested; app vault screen loaded |
| See how it works; How it works navigation | Navigate to `#how-it-works` | **PASS** — keyboard tested |
| Pricing navigation and footer Pricing | Navigate to `#pricing` | **PASS** — target enters viewport |
| Open free app | Open `/app` | **PASS** |
| Go Pro | Open `/pro` | **PASS** — destination now states checkout is unavailable until configured |
| Compare and Rocket Money comparison | Open `/vs/rocket-money` | **PASS** — real comparison page and heading verified |
| Privacy navigation and footer Privacy | Open `/privacy` | **PASS** — privacy-policy heading verified |
| Mobile menu | Open, update accessible label/ARIA, close with Escape, and navigate to comparison and `/app` | **PASS** |
| Contact | `mailto:almoqri2019@gmail.com` | **PASS** — target and keyboard focus verified; external mail-client delivery is not testable here |
| All other visible internal homepage links | Activate the stated in-page anchor or internal route | **PASS** — keyboard activation and route/anchor resolution tested |

## `/app` buttons and workflows

| Control or workflow | Expected action | Result |
|---|---|---|
| Create/unlock vault | Encrypt new local data; restore existing data; reject wrong passphrase; preserve unrecoverable legacy ciphertext | **PASS** |
| Upload CSV / Close CSV import | Open and close the upload dialog | **PASS** |
| Import selected file | Reject unsupported extensions, files over 10 MB, empty files, malformed CSV, missing/invalid amounts, and over-cap input with a visible message | **PASS** |
| Valid and unusual-header CSV | Parse quoted fields and map amount/vendor/category/date headers | **PASS** |
| Negative/refund/zero values | Skip refunds and zero values rather than converting them to positive spend | **PASS** |
| Import batches and row limits | Import all parsed batches up to the 5,000-positive-row cap; reject over-limit files atomically | **PASS** — 501-row multi-batch import and 5,001-row rejection tested |
| Load sample data | Add deterministic example rows within the Free limit; label them as sample, not verified usage | **PASS** |
| Add subscription | Validate name and price; permit valid additions; block a fourth Free item | **PASS** |
| Run audit | Increment and persist audit count; block a second Free audit | **PASS** |
| Keep, Mark cut, Clear decision | Save each decision and update displayed savings | **PASS** |
| Manage / Save changes / Cancel | Open an edit dialog, save edits without deleting the item, or cancel | **PASS** |
| Remove | Require confirmation; cancellation preserves the item and confirmation removes it | **PASS** |
| Export JSON | Download parseable, accurate JSON marked as plaintext; no entitlement data included | **PASS** |
| Reset | Confirmation cancel preserves data; confirmation clears records and audit usage | **PASS** |
| View Pro access / close / Escape / Continue with Free | Open and dismiss the paywall without data loss | **PASS** |
| View Pro options / Open free app | Navigate to `/pro` and return to `/app` | **PASS** |
| Verify subscription | Only a server response marked active for the configured PayPal plan enables Pro in the current app session; no browser flag or entered ID is persisted | **PASS** with a local mocked provider |
| Worker failure and malformed input | Show a useful import error and keep unrelated app controls usable | **PASS** |
| External script/CSS failure | App and Pro page remain styled with external CDNs blocked; entitlement endpoint failure leaves Free app controls usable | **PASS** |
| App navigation | Home and Privacy links reach their pages | **PASS** |

The worker distinguishes progress, batch, completion, and error messages. It sends rows in batches of 250 and enforces a 10 MB file limit plus a 5,000 positive-row limit; imports are applied only after completion and count validation. Missing usage data remains unknown. The UI does not fabricate usage, project counts, or verification status.

The vault uses a user passphrase, random salt, PBKDF2-SHA-256, and AES-GCM. This protects saved data at rest from someone who only has a copy of browser storage; it does not protect an unlocked or compromised device. JSON export is explicitly plaintext.

## Responsive, visual, and runtime checks

- Playwright ran Chromium at **320, 375, 430, 768, 1024, and 1440 px** for the homepage and app, and the same widths for `/pro`.
- Automated checks passed for horizontal overflow, clipped text, dialog bounds, dialog control overlap, and modal scrolling. The app's upload and paywall dialogs fit within the viewport at each width.
- The app runtime's referenced DOM IDs were checked against `app.html`.
- Local homepage and app loaded without browser console errors, page errors, CSP errors, failed requests, or third-party CSS/script requests.
- Worker-load failure and entitlement-server failure were injected in the local preview. Both surfaced errors without freezing unrelated functionality.
- Screenshots were captured from the local preview at 1440 px and visually inspected:
  - [Homepage screenshot](./screenshots/homepage-audit.png)
  - [App screenshot with sample data](./screenshots/app-audit.png)

## Automated test output

`npm test` — **46 passed** (Playwright, Chromium; local preview at `127.0.0.1:4173`).

Coverage includes homepage mouse/keyboard navigation, all six responsive widths, app vault migration and persistence, import validation and batching, limits, sample data, add/edit/keep/cut/remove/reset/export, paywall controls, server entitlement success/failure/expiry, worker failure, external dependency failure, and screenshots.

PayPal responses in the automated suite are deterministic local mocks. No real payment, customer record, or live PayPal subscription was used. The production `/api/pro-status` was probed only for its default-deny response and with a fake subscription ID.

## Changes and remaining limitations

- Replaced the CDN-dependent app page with local CSS and a standalone runtime; retained local-only data and added explicit worker failure handling, row-count validation, and truthful import/export labels.
- Fixed homepage routes and controls, added accessible Features/mobile menus, and made the comparison and privacy destinations real.
- Replaced browser-only Pro activation with server-side PayPal subscription lookup. The server requires an active subscription on the configured plan; tokens require a valid signature and expiry; query-string credentials are ignored.
- Replaced the Pro page's live checkout form and client-written entitlement flags with a disabled checkout notice and server verification form. No payment is accepted by this build.
- Updated `.env.example` with PayPal server configuration placeholders and removed the example allowlist code.

**Payment setup is still required.** Configure `STACKCUT_PAYPAL_ENV`, `STACKCUT_PAYPAL_CLIENT_ID`, `STACKCUT_PAYPAL_CLIENT_SECRET`, and `STACKCUT_PAYPAL_PLAN_ID` in the hosting provider's secret settings, then verify the plan and active/cancelled/error cases against PayPal Sandbox before enabling checkout. This session did not have PayPal credentials and did not test a real provider response. Checkout remains disabled.

Free subscription and audit limits are consistent browser-side UX guards, not server-enforced quotas. This static, local-data app has no authenticated account or server-side subscription storage; client-side limits cannot be a security boundary. Server enforcement for data or features would require authenticated server-backed operations.

The legacy `app.js`, `app-local.js`, and standalone Chrome extension are not loaded by the current homepage or `/app` route and were not part of this workflow test. They should be separately reviewed before being advertised as sharing the new entitlement behavior.

**Release status:** all local changes are uncommitted and production still serves commit `0becd2086b81f1d76755725c43f18e2ff153a797`. No commit, merge, or deployment was performed.
