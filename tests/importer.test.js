// Import heuristics: amounts, dates, emails and duplicate detection.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
  findDates,
  parseText,
  parseEmail,
  normalizeDraft,
  matchExisting,
} from "../src/importer.js";

test("parses European and English amount formats", () => {
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount("12,34"), 1234);
  assert.equal(parseAmount("13.99"), 1399);
  assert.equal(parseAmount("1,200"), 120000);
  assert.equal(parseAmount("75"), 7500);
  assert.equal(parseAmount("abc"), null);
});

test("finds ISO, day-first and written dates", () => {
  const values = findDates(
    "2026-12-05\n05/12/2026\n5 December 2026\nDec 5, 2026\n31.02.2026",
  ).map((d) => d.value);
  assert.deepEqual(values, [
    "2026-12-05",
    "2026-12-05",
    "2026-12-05",
    "2026-12-05",
  ]);
});

test("prefers the total and the due date over other numbers", () => {
  const raw = parseText(
    [
      "Electric Ireland",
      "Invoice date: 12/11/2026",
      "Standing charge €12,40",
      "Usage €70,00",
      "Amount due €82,40",
      "Payment due 05/12/2026",
    ].join("\n"),
  );
  assert.equal(raw.vendor, "Electric Ireland");
  assert.equal(raw.amount, 82.4);
  assert.equal(raw.currency, "EUR");
  assert.equal(raw.dueDate, "2026-12-05");
  assert.equal(raw.category, "Utilities");
  assert.equal(raw.repeat, "Monthly");
  assert.ok(raw.confidence.amount >= 0.7 && raw.confidence.date >= 0.7);
});

test("reads headers and a quoted-printable body from an .eml file", () => {
  const eml = [
    "From: Netflix <info@account.netflix.com>",
    "Subject: =?UTF-8?Q?Your_Netflix_receipt?=",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Total: =E2=82=AC13.99 per month",
    "Next billing date: December 10, 2026",
    "--b1--",
  ].join("\r\n");
  const { text, hints } = parseEmail(eml);
  assert.equal(hints.from, "Netflix");
  assert.equal(hints.subject, "Your Netflix receipt");
  const raw = parseText(text, hints);
  assert.equal(raw.amount, 13.99);
  assert.equal(raw.repeat, "Monthly");
  assert.equal(raw.category, "Entertainment");
  assert.equal(raw.dueDate, "2026-12-10");
});

test("non-EUR or missing values become warnings, not guesses", () => {
  const { draft, warnings } = normalizeDraft(
    { vendor: "", amount: 70.1, currency: "GBP", dueDate: null },
    "2026-11-24",
  );
  assert.equal(draft.amountCents, 0);
  assert.equal(draft.startDate, "2026-11-24");
  assert.equal(draft.category, "Other");
  assert.deepEqual(warnings.map((w) => w.field).sort(), [
    "amount",
    "date",
    "name",
  ]);
});

test("matches an import to an existing active bill", () => {
  const bills = [
    { id: "a", name: "Electricity", amountCents: 7500, category: "Utilities" },
    { id: "n", name: "Netflix", amountCents: 1399, category: "Entertainment" },
    { id: "x", name: "Old Netflix", amountCents: 999, archived: true },
  ];
  const draft = (name, amountCents) => ({ name, amountCents });
  assert.equal(matchExisting(draft("Netflix Inc.", 1399), bills).id, "n");
  assert.equal(matchExisting(draft("Electric Ireland", 8240), bills).id, "a");
  assert.equal(matchExisting(draft("Dentist", 6000), bills), null);
});

test("vendor guess skips greetings and dates", () => {
  const raw = parseText(
    "Receipt\nThanks for your order 20/11/2026\nCharged $19.99",
  );
  assert.equal(raw.vendor, "");
  assert.equal(
    parseText("Invoice 2026-118\nCityGym Dublin 2026\nTotal €45").vendor,
    "CityGym Dublin",
  );
});
