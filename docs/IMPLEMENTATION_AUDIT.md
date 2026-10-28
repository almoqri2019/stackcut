# Implementation Audit

## Verified findings

- Browser-controlled `localStorage` values were being treated as authoritative for paid access in `app-local.js` and `app.js`. The app used values such as `isPro`, `stackcut_pro`, and `stackcut-license` as direct authorization signals. This is not a valid entitlement check because any user can mutate that data in DevTools or a script. The secure fix is to treat local state as display-only and verify access on a trusted server-side boundary.
- The vault implementation in `app.html` used a static Web Crypto key derived from the string `stackcut-v3-local-2026`. A constant key is not suitable for any security claim because the same key is reused across users and sessions; it also makes migration and rotation difficult.
- The app did not have a real payment entitlement provider or server-side verification endpoint. Without that, the UI could only display a Pro state, not enforce it.

## Unverified hypotheses

- The repository does not include a live payment provider integration or webhook listener, so no real billing state can be verified here. Any claims about PayPal or subscription status beyond the code present in the app are unverified and should be treated as marketing copy until a backend and provider webhook configuration are added.
- The project is static-only in this checkout. No server-side secret or real subscription database is available in the repository snapshot.

## File paths and relevant functions

- `app-local.js`: `isPro()`, `load()`, `checkPro()`, `requirePro()`, `render()`, and the localStorage-based entitlement migrations.
- `app.js`: top-level `isPro` flag and entitlement gating logic.
- `app.html`: browser vault encryption helpers and local license activation flow.
- `api/pro-status.js`: new server-side entitlement endpoint that verifies a signed token or allowlisted license on the server.
- `.env.example`: placeholders for the server-side secret and allowlist.

## Severity and business impact

- Medium: the app could be bypassed by editing local storage or script state; paying customers could be granted access without a valid entitlement.
- Medium: a statically defined encryption key does not provide real protection if a browser session or storage is compromised; it can also cause data loss or cross-session decryption errors.
- Low: the site’s marketing copy was stronger than the actual implementation, creating a false sense of security for users and stakeholders.

## Proposed remediation

1. Keep local browser values for display only.
2. Validate Pro access via a server-side endpoint with a signed token or allowlist, using `STACKCUT_PRO_SECRET` and `STACKCUT_PRO_LICENSE_ALLOWLIST` from environment variables.
3. Derive the local vault key from a session-bound random seed or a user-provided passphrase rather than a constant string. If the app needs true protection, the key must live in a trusted server or secure device keychain rather than the browser.
4. Add migration and documentation for vault handling, and reserve the encryption claim only for scenarios where the key is managed securely.

## Dependencies and blockers

- A production payment provider or verified subscription service is still required for real billing enforcement.
- A deployed host with serverless support (such as Vercel) is required to use `api/pro-status.js`.
- Real entitlement issuance and refund/cancellation handling still need a backend API or payment provider webhook integration before the app can safely enforce paid access in production.
