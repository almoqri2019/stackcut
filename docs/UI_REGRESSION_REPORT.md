# UI Regression Report

## Confirmed root cause

The deployed homepage regression was caused by a combination of:

1. A stale alternate landing page artifact (`index-landing.html`) and a runtime dependency on the Tailwind CDN in the main marketing page.
2. The homepage being designed around a large utility-class system that is not reliably generated in production when the CDN is unavailable or when a stale alternate entry point is served.

This meant the site could render as a mostly unstyled HTML document even though the repo contains a polished landing page intended for production use.

## Evidence from the repository

- `index.html` loads `https://cdn.tailwindcss.com` directly and relies on a large set of generated utility classes.
- `index-landing.html` contains a different artifact with a generated CSS block and a generic `React Artifact` title, suggesting a stale or fallback build artifact rather than the active product landing page.
- `styles.css` contains a local, version-controlled design system that is suitable for a production static landing page.
- `vercel.json` allows the Tailwind CDN origin, but the app should not rely on a third-party runtime CSS generator for essential layout.

## Fix applied

- Replaced the runtime-Tailwind homepage with a static local stylesheet design system.
- Added a lightweight mobile menu and responsive layout to keep the page styled without the CDN.
- Redirected the stale `index-landing.html` artifact back to `/` so it stops serving an obsolete layout.
- Kept the app’s existing product and pricing flow intact while removing the untrusted dependency on third-party CSS generation.

## Follow-up recommendations

- Keep the canonical marketing content in `index.html` and avoid alternate landing-page artifacts in the repository root.
- Prefer local, version-controlled styles for all static marketing pages and only use network-hosted assets for optional non-essential enhancements.
- Verify the deployed route and canonical site in Vercel while checking both `/` and `/index.html` to ensure the correct HTML entry point is served.
