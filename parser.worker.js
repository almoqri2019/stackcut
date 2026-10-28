"use strict";

const BATCH_SIZE = 250;
const MAX_ROWS = 5000;
const AMOUNT_HEADERS = [
  "amount",
  "price",
  "cost",
  "spend",
  "total",
  "charge",
  "fee",
  "value",
  "amt",
  "expense",
  "debit",
  "credit",
  "open balance",
  "home currency amount",
  "annual",
  "monthly",
  "mrr",
  "arr",
];
const VENDOR_HEADERS = [
  "vendor",
  "merchant",
  "supplier",
  "name",
  "tool",
  "service",
  "provider",
  "company",
  "description",
  "account",
  "payee",
  "memo",
  "product",
  "item",
  "software",
  "subscription",
];
const CATEGORY_HEADERS = [
  "category",
  "job",
  "type",
  "department",
  "tag",
  "account type",
  "product type",
  "class",
  "team",
  "owner",
];
const DATE_HEADERS = [
  "date",
  "renew",
  "billing",
  "charged",
  "timestamp",
  "transaction date",
  "last billing",
  "next billing",
];

function normalizedHeader(value) {
  return String(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findHeader(headers, candidates) {
  const normalized = headers.map(normalizedHeader);
  for (const candidate of candidates) {
    const index = normalized.findIndex((header) => header === candidate);
    if (index >= 0) return headers[index];
  }
  for (const candidate of candidates) {
    const index = normalized.findIndex((header) => header.includes(candidate));
    if (index >= 0) return headers[index];
  }
  return null;
}

function parseAmount(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return null;
  const isParenthesized = /^\(.*\)$/.test(raw);
  if (isParenthesized) raw = raw.slice(1, -1);
  raw = raw.replace(/(?:USD|EUR|GBP|CAD|AUD)\s*/gi, "");
  raw = raw.replace(/[$€£¥,\s]/g, "");
  if (isParenthesized) raw = `-${raw}`;
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function parseCsv(text, onHeaders, onRow) {
  const headers = [];
  let fields = [];
  let field = "";
  let quoted = false;
  let rowNumber = 1;
  let firstRow = true;

  function emitRow() {
    fields.push(field);
    field = "";
    const row = fields;
    fields = [];
    rowNumber += 1;
    if (row.every((value) => value.trim() === "")) return;
    if (firstRow) {
      firstRow = false;
      headers.push(...row.map((value) => value.trim().replace(/^\uFEFF/, "")));
      if (headers.every((header) => !header)) {
        throw new Error("The CSV header row is empty.");
      }
      onHeaders(headers);
      return;
    }
    onRow(row, rowNumber - 1);
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length !== 0) {
        throw new Error(`Unexpected quote in row ${rowNumber}.`);
      }
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      emitRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error(`Unclosed quoted field near row ${rowNumber}.`);
  if (field.length || fields.length) emitRow();
  return headers;
}

function parseFile(message) {
  const { id, text } = message;
  if (typeof text !== "string" || !text.trim()) {
    self.postMessage({ id, type: "error", message: "The selected file is empty." });
    return;
  }

  let headers = [];
  let mapping = null;
  let count = 0;
  let refundCount = 0;
  let invalidCount = 0;
  let scannedRows = 0;
  let batch = [];
  const started = Date.now();

  try {
    headers = parseCsv(text, (detectedHeaders) => {
      headers = detectedHeaders;
    }, (cells, rowNumber) => {
      scannedRows += 1;
      if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim())) {
        throw new Error(`Row ${rowNumber} contains more fields than the header.`);
      }
      const row = Object.create(null);
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });

      if (!mapping) {
        const amount = findHeader(headers, AMOUNT_HEADERS);
        if (!amount) {
          throw new Error("Could not identify an amount column. Add a header such as Amount, Price, Cost, or Charge.");
        }
        const vendor = findHeader(headers, VENDOR_HEADERS);
        mapping = {
          amount,
          vendor: vendor || headers.find((header) => header !== amount) || null,
          category: findHeader(headers, CATEGORY_HEADERS),
          date: findHeader(headers, DATE_HEADERS),
        };
      }

      const amount = parseAmount(row[mapping.amount]);
      if (amount === null) {
        invalidCount += 1;
      } else if (amount <= 0) {
        refundCount += 1;
      } else {
        count += 1;
        if (count > MAX_ROWS) {
          throw new Error(`This file has more than ${MAX_ROWS.toLocaleString()} positive rows. Split it into smaller files; no rows were imported.`);
        }
        const vendor = String(
          mapping.vendor ? row[mapping.vendor] : "",
        ).trim();
        const category = String(
          mapping.category ? row[mapping.category] : "",
        ).trim();
        const date = String(mapping.date ? row[mapping.date] : "").trim();
        batch.push({
          vendor: (vendor || "Unknown vendor").slice(0, 64),
          amount,
          category: (category || "Unknown").slice(0, 32),
          date: date.slice(0, 32),
        });
        if (batch.length >= BATCH_SIZE) {
          self.postMessage({ id, type: "batch", rows: batch });
          batch = [];
        }
      }

      if (scannedRows % 500 === 0) {
        self.postMessage({
          id,
          type: "progress",
          count,
          scannedRows,
          elapsed: Date.now() - started,
        });
      }
    });

    if (!mapping) {
      const amount = findHeader(headers, AMOUNT_HEADERS);
      if (!amount) {
        throw new Error("Could not identify an amount column. Add a header such as Amount, Price, Cost, or Charge.");
      }
      mapping = {
        amount,
        vendor: findHeader(headers, VENDOR_HEADERS),
        category: findHeader(headers, CATEGORY_HEADERS),
        date: findHeader(headers, DATE_HEADERS),
      };
    }
    if (batch.length) self.postMessage({ id, type: "batch", rows: batch });
    self.postMessage({
      id,
      type: "complete",
      count,
      refundCount,
      invalidCount,
      headers,
      map: mapping,
      elapsed: Date.now() - started,
    });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

self.onmessage = (event) => {
  if (event.data?.type !== "parse" || typeof event.data.id !== "string") {
    self.postMessage({
      id: event.data?.id,
      type: "error",
      message: "Invalid parser request.",
    });
    return;
  }
  parseFile(event.data);
};
