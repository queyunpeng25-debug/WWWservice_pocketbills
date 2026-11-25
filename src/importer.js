/**
 * Pure bill-import helpers. Text from OCR, PDFs or emails becomes a *draft* that
 * pre-fills the normal bill form; nothing here writes data. Every value is
 * untrusted and still passes validateBill before saving.
 */
import { categories, today, validDate } from "./domain.js";

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}; // prettier-ignore
const CURRENCIES = {
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
  $: "USD",
  usd: "USD",
};
const AMOUNT_WORDS =
  /(amount due|total due|balance due|to pay|total|amount|betrag|gesamt|montant|totale|importe|合计|应付|总计|金额)/i;
const DUE_WORDS =
  /(due|pay by|payable|next (billing|payment|charge)|renews? on|payment date|debit(ed)? on|fällig|échéance|scadenza|vencimiento|到期|截止|还款日)/i;
/** Known vendors give a better category and repeat guess than generic text. */
const VENDORS = [
  [/netflix|disney|spotify|youtube|prime video|hbo|apple music|deezer|twitch/, "Entertainment", "Monthly"],
  [/electric|energy|power|gas networks|bord g[aá]is|water|utility|utilities/, "Utilities", "Monthly"],
  [/vodafone|three|eir|virgin|sky|broadband|internet|mobile|telecom|o2|t-mobile/, "Utilities", "Monthly"],
  [/rent|landlord|letting|property|mortgage|apartment|housing|miete|hausverwaltung|wohnung|loyer|affitto|alquiler/, "Housing", "Monthly"],
  [/gym|fitness|dental|dentist|doctor|clinic|pharmacy|health|insurance/, "Health & fitness", "Once"],
  [/tuition|university|college|school|course|udemy|coursera/, "Education", "Once"],
]; // prettier-ignore

/** Parse "1.234,56", "1,234.56", "12,34" or "12.34" into cents. */
export function parseAmount(value) {
  let s = String(value).replace(/[\s ']/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const comma = s.lastIndexOf(","),
    dot = s.lastIndexOf(".");
  if (comma > -1 && dot > -1) {
    // Both present: the later one is the decimal mark.
    const decimal = comma > dot ? "," : ".";
    s = s.replaceAll(decimal === "," ? "." : ",", "").replace(",", ".");
  } else if (comma > -1 || dot > -1) {
    const sep = comma > -1 ? "," : ".";
    const repeated = s.split(sep).length > 2;
    // "1,234" or "1.234.567" are thousands marks; "12,34" / "12.5" are decimals.
    if (repeated || s.length - s.lastIndexOf(sep) - 1 === 3)
      s = s.replaceAll(sep, "");
    else s = s.replace(sep, ".");
  }
  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/** Every currency-marked amount, with the line it came from. */
export function findAmounts(text) {
  const result = [];
  const re =
    /(€|£|\$|\b(?:eur|gbp|usd)\b)\s*(\d[\d.,\s]*\d|\d)|(\d[\d.,\s]*\d|\d)\s*(€|£|\b(?:eur|gbp|usd)\b)/gi;
  for (const line of text.split(/\n/)) {
    for (const m of line.matchAll(re)) {
      const symbol = (m[1] || m[4]).toLowerCase();
      const cents = parseAmount((m[2] || m[3]).trim());
      if (cents) result.push({ cents, currency: CURRENCIES[symbol], line });
    }
  }
  return result;
}

const iso = (y, m, d) => {
  const v = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return validDate(v) ? v : null;
};
/** Dates in ISO, European numeric (day first) or written-month formats. */
export function findDates(text) {
  const result = [];
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
  const patterns = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => iso(m[1], m[2], m[3])],
    [/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g, (m) => iso(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1])],
    [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${month},?\\s+(\\d{4})`, "gi"), (m) => iso(m[3], MONTHS[m[2].toLowerCase()], m[1])],
    [new RegExp(`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "gi"), (m) => iso(m[3], MONTHS[m[1].toLowerCase()], m[2])],
    [/(\d{4})年(\d{1,2})月(\d{1,2})日/g, (m) => iso(m[1], m[2], m[3])],
  ]; // prettier-ignore
  for (const line of text.split(/\n/))
    for (const [re, toDate] of patterns)
      for (const m of line.matchAll(re)) {
        const value = toDate(m);
        if (value) result.push({ value, line });
      }
  return result;
}

function guessVendor(text, hints) {
  const candidate = [hints.from, hints.subject]
    .map((s) =>
      (s || "")
        .replace(/<[^>]*>|"|\b(no-?reply|billing|invoices?|noreply)\b/gi, "")
        .trim(),
    )
    .find((s) => /[a-z]{3}/i.test(s));
  if (candidate) return candidate.replace(/^(re|fwd?):\s*/i, "").slice(0, 80);
  // OCR: the first line with real words is usually the company letterhead.
  return (
    text
      .split(/\n/)
      .filter(
        (l) =>
          !AMOUNT_WORDS.test(l) &&
          !DUE_WORDS.test(l) &&
          !findAmounts(l).length &&
          !/invoice|receipt|bill\b|rechnung|facture|\b(thanks?|thank you|dear|hello|hi|order|date|page|customer|account|reference)\b/i.test(
            l,
          ),
      )
      .map((l) =>
        l
          .replace(/\d+[./-]\d+(?:[./-]\d+)?|\d{4,}/g, "")
          .replace(/[^\p{L}\p{N}&.' -]/gu, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find((l) => /\p{L}{3}/u.test(l)) || ""
  ).slice(0, 80);
}

/**
 * Heuristic extraction for the local (no server) importer.
 * Returns raw fields plus a 0–1 confidence per form field.
 */
export function parseText(text, hints = {}) {
  const clean = String(text || "").replace(/\r/g, "");
  const amounts = findAmounts(clean);
  const keyed = amounts.filter((a) => AMOUNT_WORDS.test(a.line));
  // Prefer the last "total" style amount (totals come after line items).
  const amount =
    keyed.at(-1) || [...amounts].sort((a, b) => b.cents - a.cents)[0];
  const dates = findDates(clean);
  const due = dates.find((d) => DUE_WORDS.test(d.line));
  const date =
    due || [...dates].sort((a, b) => b.value.localeCompare(a.value))[0];
  const vendor = guessVendor(clean, hints);
  const haystack = `${vendor}\n${clean}`.toLowerCase();
  const known = VENDORS.find(([re]) => re.test(haystack));
  let repeat = known?.[2] || "Once";
  if (
    /\b(monthly|per month|each month|every month|\/\s?mo(nth)?)\b|每月|monatlich|mensuel/i.test(
      clean,
    )
  )
    repeat = "Monthly";
  if (
    /\b(annual(ly)?|yearly|per year|every year|\/\s?y(ea)?r)\b|每年|jährlich|annuel/i.test(
      clean,
    )
  )
    repeat = "Yearly";
  return {
    vendor,
    amount: amount ? amount.cents / 100 : null,
    currency: amount?.currency || null,
    dueDate: date?.value || null,
    repeat,
    category: known?.[1] || "Other",
    confidence: {
      name: vendor ? (hints.from || known ? 0.85 : 0.55) : 0,
      amount: amount ? (keyed.length ? 0.85 : 0.5) : 0,
      date: date ? (due ? 0.85 : 0.45) : 0,
      repeat: known || repeat !== "Once" ? 0.7 : 0.4,
      category: known ? 0.8 : 0.3,
    },
  };
}

function decodeQuotedPrintable(s) {
  const bytes = s
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
  return new TextDecoder().decode(
    Uint8Array.from(bytes, (c) => c.charCodeAt(0)),
  );
}
function decodeBase64(s) {
  try {
    const bin = atob(s.replace(/\s/g, ""));
    return new TextDecoder().decode(
      Uint8Array.from(bin, (c) => c.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}
function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
}
const header = (head, name) =>
  head
    .match(new RegExp(`^${name}:\\s*(.*(?:\\n[ \\t].*)*)`, "im"))?.[1]
    .replace(/\n[ \t]+/g, " ")
    .trim() || "";
/** Decode RFC 2047 "=?utf-8?B?...?=" words used in Subject/From headers. */
function decodeWords(s) {
  return s.replace(/=\?[^?]+\?([BQ])\?([^?]*)\?=/gi, (_, enc, data) =>
    enc.toUpperCase() === "B"
      ? decodeBase64(data)
      : decodeQuotedPrintable(data.replace(/_/g, " ")),
  );
}
function decodePart(head, body) {
  const encoding = header(head, "Content-Transfer-Encoding").toLowerCase();
  const text =
    encoding === "base64"
      ? decodeBase64(body)
      : encoding === "quoted-printable"
        ? decodeQuotedPrintable(body)
        : body;
  return /text\/html/i.test(header(head, "Content-Type"))
    ? htmlToText(text)
    : text;
}
/** Read a pasted email or .eml file: headers become hints, body becomes text. */
export function parseEmail(raw) {
  const source = String(raw || "").replace(/\r\n/g, "\n");
  const split = source.indexOf("\n\n");
  const head = split > -1 ? source.slice(0, split) : "";
  if (
    !/^(from|subject|date|to|content-type|mime-version|received|return-path|delivered-to):/im.test(
      head,
    )
  )
    return {
      text: /<\/?[a-z][^>]*>/i.test(source) ? htmlToText(source) : source,
      hints: {},
    };
  let text = source.slice(split + 2);
  const boundary = header(head, "Content-Type").match(
    /boundary="?([^";]+)"?/i,
  )?.[1];
  if (boundary) {
    const parts = text
      .split(`--${boundary}`)
      .map((p) => p.replace(/^\n/, ""))
      .filter((p) => p.includes("\n\n") && !p.startsWith("--"))
      .map((p) => {
        const i = p.indexOf("\n\n");
        return { head: p.slice(0, i), body: p.slice(i + 2) };
      });
    const plain = parts.find((p) =>
      /text\/plain/i.test(header(p.head, "Content-Type")),
    );
    const html = parts.find((p) =>
      /text\/html/i.test(header(p.head, "Content-Type")),
    );
    const pick = plain || html;
    text = pick ? decodePart(pick.head, pick.body) : "";
  } else text = decodePart(head, text);
  const from = decodeWords(header(head, "From"));
  return {
    text,
    hints: {
      from:
        from.replace(/<[^>]*>/, "").trim() ||
        from.match(/@([\w-]+)\./)?.[1] ||
        "",
      subject: decodeWords(header(head, "Subject")),
    },
  };
}

/** Extraction → bill draft + per-field warnings. Unknown values fall back to safe defaults. */
export function normalizeDraft(raw, day = today()) {
  const warnings = [];
  let amountCents = Number.isFinite(raw.amount)
    ? Math.round(raw.amount * 100)
    : 0;
  if (amountCents < 1 || amountCents > 100000000) {
    amountCents = 0;
    warnings.push({
      field: "amount",
      text: "No amount found — please enter it.",
    });
  } else if (raw.currency && raw.currency !== "EUR") {
    warnings.push({
      field: "amount",
      text: `Found ${raw.currency} ${(amountCents / 100).toFixed(2)} — PocketBill stores EUR, so convert it.`,
    });
    amountCents = 0;
  }
  const dateOk =
    validDate(raw.dueDate || "") &&
    raw.dueDate >= "2000-01-01" &&
    raw.dueDate <= "2100-12-31";
  if (!dateOk)
    warnings.push({
      field: "date",
      text: "No due date found — we used today.",
    });
  const name = (raw.vendor || "").trim().slice(0, 80);
  if (!name)
    warnings.push({ field: "name", text: "Add a name for this bill." });
  return {
    draft: {
      name,
      amountCents,
      startDate: dateOk ? raw.dueDate : day,
      repeat: ["Once", "Monthly", "Yearly"].includes(raw.repeat)
        ? raw.repeat
        : "Once",
      category: categories.includes(raw.category) ? raw.category : "Other",
    },
    confidence: raw.confidence || {},
    warnings,
  };
}

const tokens = (s) =>
  new Set(
    String(s)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (t) =>
          t.length >= 3 &&
          !["the", "and", "ltd", "inc", "bill", "plan", "your"].includes(t),
      ),
  );
/** Find an active bill that this import most likely belongs to (shared name token). */
export function matchExisting(draft, bills) {
  const words = tokens(draft.name);
  if (!words.size) return null;
  let best = null;
  for (const bill of bills.filter((b) => !b.archived)) {
    const shared = [...tokens(bill.name)].filter(
      (t) =>
        words.has(t) ||
        [...words].some((w) => w.startsWith(t) || t.startsWith(w)),
    );
    if (!shared.length) continue;
    const close =
      draft.amountCents &&
      Math.abs(bill.amountCents - draft.amountCents) <= bill.amountCents * 0.25;
    const score =
      shared.length +
      (close ? 1 : 0) +
      (bill.category === draft.category ? 0.5 : 0);
    if (!best || score > best.score) best = { bill, score };
  }
  return best?.bill || null;
}

/** Confidence below this is highlighted for the user to check. */
export const CHECK_BELOW = 0.7;
