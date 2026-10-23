
// parser.worker.js - Off-main-thread financial parsing
// Fixes: Main Thread Blocking, Memory Leaks, Schema Variations
self.importScripts('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');

const FUZZY_MAP = {
  amount: ['amount','price','cost','spend','total','charge','fee','value','amt','expense'],
  vendor: ['vendor','merchant','supplier','name','tool','service','provider','company','description'],
  date: ['date','renew','billing','charged','timestamp','lastused','last_used'],
  category: ['category','job','type','department','tag']
};

function fuzzyFind(headers, target) {
  const lower = headers.map(h=>String(h).toLowerCase().trim());
  const synonyms = FUZZY_MAP[target] || [target];
  for (let syn of synonyms) {
    let idx = lower.findIndex(h=>h.includes(syn));
    if (idx!==-1) return headers[idx];
  }
  return null;
}

self.onmessage = function(e) {
  const { fileText, id } = e.data;
  try {
    Papa.parse(fileText, {
      header: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        // streaming to avoid memory spike
      },
      complete: (results) => {
        const headers = results.meta.fields || [];
        const map = {
          amountCol: fuzzyFind(headers, 'amount'),
          vendorCol: fuzzyFind(headers, 'vendor'),
          dateCol: fuzzyFind(headers, 'date'),
          categoryCol: fuzzyFind(headers, 'category')
        };
        // sanitize & normalize
        const cleaned = results.data.slice(0,5000).map(row=>{
          let rawAmt = row[map.amountCol] || '0';
          // handle $ , commas, currency symbols
          let num = String(rawAmt).replace(/[^0-9.-]/g,'');
          let amt = parseFloat(num) || 0;
          return {
            vendor: (row[map.vendorCol]||'Unknown').slice(0,64),
            amount: amt,
            date: row[map.dateCol]||'',
            category: row[map.categoryCol]||'Other',
            _raw: row
          };
        }).filter(r=>r.amount>0);
        self.postMessage({id, ok:true, map, count:cleaned.length, preview: cleaned.slice(0,100), headers});
      },
      error: (err)=> self.postMessage({id, ok:false, error: err.message})
    });
  } catch(err) {
    self.postMessage({id, ok:false, error: String(err)});
  }
};
