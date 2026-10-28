# Stackcutify Extension

Local-first AI subscription tracker for browser sessions.

## Features
- Track tool subscriptions in Chrome storage
- Show monthly burn and waste
- Detect common AI sites and add them automatically
- Export JSON backups
- Estimate subscription tax with the bundled local calculation engine
- Works in a browser extension environment

## Notes
This extension is intentionally lightweight and stores data locally.
The tax estimate sends only the selected country code to StackCut for EU standard VAT reference lookup. The entered amount and currency are calculated locally. Other tax types require an independently verified manual rate. Estimates are not tax advice or confirmation of a vendor invoice. See [the tax calculator documentation](../docs/INTERNATIONAL_TAX_CALCULATOR.md).
