# International tax calculator

StackCut provides an estimate of indirect tax on a recurring software-subscription price. The public calculator is available at `/tax-calculator`; the same calculation engine is integrated into the local subscription app and browser extension.

## Rate coverage and source

Automatic lookup is deliberately limited to EU member-state **standard VAT reference rates**. The Vercel function at `/api/tax-rates` retrieves VATcomply's public `vat_rates` dataset server-side, normalizes Greece's provider code `EL` to `GR`, and returns the selected rate with its provider, retrieval time, and available update/effective-date metadata.

The function keeps a fresh in-memory copy for 55 minutes. When the provider is unavailable, a cached rate may be returned as `stale` for up to seven days; clients must not calculate with stale rates. If no valid rate is available, the response is explicitly unavailable rather than a zero rate. Countries outside the EU standard VAT coverage, and GST or sales-tax lookups, are unsupported and require the user to enter a rate they independently verified. A manual rate is visibly labeled as user-supplied and is not represented as externally verified.

The API does not provide legal or invoice advice. A standard rate may not apply to a specific product or buyer. Applicability can depend on exact location, customer status, product classification, exemptions, and supplier obligations. Retrieval time is not a legal effective date.

## Calculation

`shared/tax-engine.js` is the canonical implementation. `extension/tax-engine.js` is its browser-extension copy; `tests/tax-engine.spec.js` asserts that the files remain byte-for-byte identical.

- Exclusive price: `tax = round(subtotal × rate / 100)` and `total = subtotal + tax`.
- Inclusive price: `total = entered price`, `tax = round(total × rate / (100 + rate))`, and `subtotal = total - tax`.
- Amounts are rounded to the selected currency's minor-unit precision per billing period.
- Monthly equivalents use 52 weeks and 12 months per year; annual equivalents use the corresponding 12-month, 52-week, or four-quarter factor.
- No currency conversion is attempted.

## Data handling and operational notes

The public calculator sends only the selected country code to StackCut's rate endpoint. Amount, currency, billing period, and other form inputs are calculated locally. The app persists tax selections in its existing encrypted local vault. Unknown legacy tax values remain unknown; imported transaction rows do not acquire guessed tax or usage metadata.

The extension uses the bundled local engine and calls the StackCut tax endpoint only for EU VAT lookups. Its popup asks the user to confirm the amount and currency before calculating. No extension permissions for remote executable code are required.

No VATcomply credentials or new environment variables are required. The deployment must include `api/tax-rates.js`, `shared/tax-engine.js`, the public calculator HTML/JS/CSS, and the app and extension assets. The Vercel project must allow outbound HTTPS from the function to `api.vatcomply.com`.

The calculator is an estimate, not tax advice or proof of a vendor's tax treatment. Preserve the source and retrieval metadata when presenting automated estimates.
