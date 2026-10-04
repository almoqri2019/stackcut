# Stackcut

Local AI-subscription overlap audit. No account, no server, no API key, no third-party requests.

Open `index.html`. Use **Typical stack** to see a $195/month example. Your stack stays in `localStorage` (`stackcut-v2`). **Export** writes `stackcut.json`; **Import** reads it back (validated, so a bad file is rejected).

## Deploy

It is three static files. Deploy the folder as-is.

- **Cloudflare Pages / Netlify:** drag the folder in. No build command, output directory is the root.
- **GitHub Pages:** push the folder to a repo, Settings > Pages > Deploy from branch > `/ (root)`.

## Before you announce it

1. **Check the prices.** `CATALOG` in `app.js` and the footer in `index.html` claim list prices "as of 4 Oct 2026". Verify each against the vendor's own pricing page, and update both when they change.
2. **Check the cancel links.** The `cancel` URLs in `CATALOG` are best guesses at each vendor's account page. Click every one.
3. **Add a domain and a social image** if you want link previews: set `og:url` and `og:image` in `index.html`.

## Notes

- Fonts are the system stack, so nothing loads from outside. To use a custom font, put the `.woff2` in this folder and add an `@font-face` in `styles.css`. Don't link to Google Fonts: it breaks the "nothing leaves this browser" claim.
- Tool decisions: the keeper in each job is a tool you marked Keep, else the one you use most often (cheapest on a tie). An explicit **Cut** is always honoured. Everything else not used weekly is cut.
