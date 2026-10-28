(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  if (root) root.StackcutTax = engine;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
  const euVatCountries = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ");
  const currencies = new Set("AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL".split(" "));
  const zeroDigits = new Set("BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX VND VUV XAF XOF XPF".split(" "));
  const threeDigits = new Set("BHD IQD JOD KWD LYD OMR TND".split(" "));
  const countries = countryCodes.map((code) => ({
    code,
    name: new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code,
  })).sort((a, b) => a.name.localeCompare(b.name));

  function normalizeCountryCode(value) {
    const code = String(value || "").trim().toUpperCase();
    return code === "EL" ? "GR" : code;
  }

  function currencyDigits(value) {
    const currency = String(value || "").trim().toUpperCase();
    if (!currencies.has(currency)) throw new TypeError("Enter a supported three-letter currency code.");
    return zeroDigits.has(currency) ? 0 : threeDigits.has(currency) ? 3 : 2;
  }

  function roundCurrency(value, currency) {
    const factor = 10 ** currencyDigits(currency);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function toMonthlyEquivalent(amount, currency, interval) {
    const factors = { monthly: 1, annual: 1 / 12, weekly: 52 / 12, quarterly: 1 / 3 };
    if (!Object.hasOwn(factors, interval)) throw new TypeError("Choose a supported billing interval.");
    return roundCurrency(Number(amount) * factors[interval], currency);
  }

  function calculate(input, rateInfo) {
    if (!input || typeof input !== "object" || !["number", "string"].includes(typeof input.amount) ||
        (typeof input.amount === "string" && !input.amount.trim())) {
      throw new TypeError("Enter a valid amount.");
    }
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Amount must be finite and non-negative.");
    const currency = String(input.currency || "").trim().toUpperCase();
    currencyDigits(currency);
    const interval = String(input.interval || "");
    if (!["monthly", "annual", "weekly", "quarterly"].includes(interval)) throw new TypeError("Choose a supported billing interval.");
    const treatment = String(input.treatment || "");
    if (!["inclusive", "exclusive"].includes(treatment)) throw new TypeError("Choose a price tax treatment.");
    const taxType = String(input.taxType || "").toLowerCase();
    if (!["vat", "gst", "sales tax"].includes(taxType)) throw new TypeError("Choose VAT, GST, or sales tax.");
    const jurisdiction = normalizeCountryCode(input.jurisdiction);
    if (!countryCodes.includes(jurisdiction)) throw new TypeError("Choose a supported country code.");
    if (!rateInfo || !["verified", "manual"].includes(rateInfo.status)) {
      return {
        status: rateInfo?.status === "stale" ? "stale" : "unavailable",
        reason: rateInfo?.reason || "No verified rate is available. You may enter a rate you have independently verified.",
        currency, jurisdiction, taxType,
      };
    }
    if ((typeof rateInfo.rate !== "number" && typeof rateInfo.rate !== "string") ||
        (typeof rateInfo.rate === "string" && !rateInfo.rate.trim())) {
      throw new TypeError("A tax rate must be provided explicitly.");
    }
    const rate = Number(rateInfo.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new RangeError("Tax rate must be from 0 to 100%.");
    if (normalizeCountryCode(rateInfo.jurisdiction) !== jurisdiction) throw new TypeError("Rate jurisdiction does not match.");
    if (rateInfo.status === "manual" && rateInfo.userSupplied !== true) throw new TypeError("Manual rate must be identified as user supplied.");
    if (rateInfo.taxType && rateInfo.taxType.toLowerCase() !== taxType) throw new TypeError("Rate tax type does not match.");

    let subtotal;
    let tax;
    let total;
    if (treatment === "inclusive") {
      total = roundCurrency(amount, currency);
      tax = roundCurrency(total * (rate / 100) / (1 + rate / 100), currency);
      subtotal = roundCurrency(total - tax, currency);
    } else {
      subtotal = roundCurrency(amount, currency);
      tax = roundCurrency(subtotal * rate / 100, currency);
      total = roundCurrency(subtotal + tax, currency);
    }
    const monthlyEquivalent = toMonthlyEquivalent(total, currency, interval);
    const annualEquivalent = roundCurrency(total * ({ monthly: 12, annual: 1, weekly: 52, quarterly: 4 })[interval], currency);
    return {
      status: rateInfo.status, rate, ratePercent: rate,
      rateSource: rateInfo.status === "manual" ? "User-supplied manual rate" : rateInfo.source?.provider || "Verified rate provider",
      source: rateInfo.status === "manual" ? null : rateInfo.source || null,
      retrievedAt: rateInfo.retrievedAt || null,
      updatedAt: rateInfo.updatedAt || null,
      effectiveDate: rateInfo.effectiveDate || null,
      amount: roundCurrency(amount, currency), currency, interval, treatment, taxType, jurisdiction,
      subtotal, tax, total, monthlyEquivalent, annualEquivalent,
      warning: "Estimate only; vendor tax may differ based on location, customer and product classification, exemptions, and supplier obligations.",
    };
  }

  function formatMoney(value, currency, locale) {
    currencyDigits(currency);
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(value);
  }

  return { countries, euVatCountries, currencyDigits, roundCurrency, toMonthlyEquivalent, normalizeCountryCode, calculate, formatMoney };
});
