const engine = require('../shared/tax-engine');
const VATCOMPLY_URL = 'https://api.vatcomply.com/vat_rates';
const FRESH_MS = 55 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const euCountries = new Set(engine.euVatCountries);
let cachedRates;
let retrievedAt = 0;

function respond(res, status, body, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function parseRates(body) {
  if (!Array.isArray(body)) throw new Error('Rate provider returned an invalid dataset.');
  const rates = body.filter((row) =>
    row && typeof row.country_code === 'string' && row.member_state === true &&
    (typeof row.standard_rate === 'number' || (typeof row.standard_rate === 'string' && row.standard_rate.trim())) &&
    Number.isFinite(Number(row.standard_rate)) && Number(row.standard_rate) >= 0 && Number(row.standard_rate) <= 100,
  );
  if (!rates.length) throw new Error('Rate provider returned no valid member-state rates.');
  return rates;
}

async function loadRates(fetcher, now) {
  if (cachedRates && now - retrievedAt < FRESH_MS) {
    return { rates: cachedRates, retrievedAt: new Date(retrievedAt).toISOString(), stale: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(VATCOMPLY_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`VATcomply returned HTTP ${response.status}.`);
      cachedRates = parseRates(await response.json());
      retrievedAt = now;
      return { rates: cachedRates, retrievedAt: new Date(retrievedAt).toISOString(), stale: false };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (cachedRates && now - retrievedAt <= MAX_STALE_MS) {
      return { rates: cachedRates, retrievedAt: new Date(retrievedAt).toISOString(), stale: true };
    }
    throw error;
  }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return respond(res, 405, { status: 'unavailable', reason: 'Use GET to request a tax rate.' });
  }
  const url = new URL(req.url, 'https://stackcut.site');
  const country = engine.normalizeCountryCode(url.searchParams.get('country'));
  if (!/^[A-Z]{2}$/.test(country) || !engine.countries.some((item) => item.code === country)) {
    return respond(res, 400, { status: 'unavailable', reason: 'Provide a valid two-letter country code.' });
  }
  if (!euCountries.has(country)) {
    return respond(res, 200, {
      status: 'unsupported', jurisdiction: country,
      reason: 'Automated reference rates currently cover EU standard VAT only. No rate was assumed.',
    }, 'public, max-age=300, s-maxage=300');
  }
  try {
    const data = await loadRates(global.fetch, Date.now());
    const providerCode = country === 'GR' ? 'EL' : country;
    const row = data.rates.find((item) => item.country_code.toUpperCase() === providerCode);
    if (!row) return respond(res, 502, {
      status: 'unavailable', jurisdiction: country, reason: 'Provider omitted this jurisdiction. No rate was assumed.',
    });
    return respond(res, 200, {
      status: data.stale ? 'stale' : 'verified',
      taxType: 'vat', jurisdiction: country, jurisdictionName: row.country_name || country,
      providerJurisdiction: providerCode, rate: Number(row.standard_rate), rateKind: 'standard',
      currency: row.currency || null,
      source: {
        provider: 'VATcomply',
        url: VATCOMPLY_URL,
        documentation: 'https://www.vatcomply.com/api/vat-rates/',
        basis: 'EU member-state standard VAT rate reference; applicability is not guaranteed.',
      },
      retrievedAt: data.retrievedAt,
      updatedAt: row.updated_at || row.last_updated || null,
      effectiveDate: row.effective_date || row.effectiveDate || null,
      stale: data.stale,
      reason: data.stale ? 'Provider unavailable; the cached rate is stale and must not be used automatically.' : null,
    }, 'public, max-age=0, s-maxage=300');
  } catch {
    return respond(res, 502, {
      status: 'unavailable', jurisdiction: country,
      reason: 'Verified rate data is unavailable. Try again or enter a rate independently verified by you.',
    });
  }
}

handler.__resetCache = () => { cachedRates = undefined; retrievedAt = 0; };
handler.__loadRates = loadRates;
module.exports = handler;
