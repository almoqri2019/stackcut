# Stackcut / Stackcutify

Local AI-subscription overlap audit. The `/app` tracker does not require an account, API key, or bank connection. Subscription data stays in this browser; see [privacy.html](./privacy.html) for the app and extension details.

Open `index.html` for the site and `/app` (or `app.html`) for the tracker. The app can browse the original 100+ entry reference catalog in `data/catalog.json`, categorize and simulate subscriptions, flag trials, check upcoming renewals while the page is open, export redacted or full data, and locally parse usage CSV files.

Catalog prices are estimates and may be inaccurate or out of date. Confirm actual vendor pricing and enter what you pay.

The tracker stores subscriptions (`stack_tools`), completed audit count (`audit_count`), and Pro status (`isPro`) in localStorage. Free accounts can track up to three tools and complete one audit; the launch-week flag in `app-local.js` keeps that first audit fully open. Pro checkout enables unlimited tools and audits, with audit snapshots stored locally.

## Deploy

This is a static site with no build step. Deploy the folder as-is.

- **Cloudflare Pages / Netlify:** drag the folder in. No build command, output directory is the root.
- **GitHub Pages:** push the folder to a repo, Settings > Pages > Deploy from branch > `/ (root)`.

## Before you announce it

1. **Check the prices.** `CATALOG` in `app.js` and the footer in `index.html` claim list prices "as of 4 Oct 2026". Verify each against the vendor's own pricing page, and update both when they change.
2. **Check the cancel links.** The `cancel` URLs in `CATALOG` are best guesses at each vendor's account page. Click every one.
3. **Add a domain and a social image** if you want link previews: set `og:url` and `og:image` in `index.html`.

## Notes

- Tracker data is stored in browser local storage (web app) or Chrome local extension storage (extension). Browser notifications are checked only while the app is open.
- The AI usage CSV parser operates in the page and does not persist the uploaded file.
- Free JSON/CSV exports omit names, exact prices, and renewal dates. Pro exports include full records.
- The extension checks hostnames on supported AI-service domains to identify tools; it does not read page content or connect to banks.
