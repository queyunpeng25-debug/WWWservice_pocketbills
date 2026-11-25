// End-to-end parsing of realistic bill files in tests/fixtures/import.
// Images need OCR in a browser, so they are checked manually (see README there).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  parseEmail,
  parseText,
  normalizeDraft,
  matchExisting,
} from "../src/importer.js";
import { sampleData } from "../src/domain.js";

const dir = new URL("./fixtures/import/", import.meta.url);
const read = (name) => fs.readFile(new URL(name, dir), "utf8");
/** Same pipeline as extract.js for text sources. */
async function importText(name) {
  const { text, hints } = parseEmail(await read(name));
  return normalizeDraft(parseText(text, hints), "2026-11-24");
}
async function pdfText(name) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(new URL(name, dir)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  await doc.destroy();
  return content.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("");
}

const cases = [
  {
    file: "electricity-html-base64.eml",
    expect: {
      name: "Electric Ireland",
      amountCents: 8240,
      startDate: "2026-12-03",
      repeat: "Monthly",
      category: "Utilities",
    },
  },
  {
    file: "netflix-quoted-printable.eml",
    expect: {
      name: "Netflix",
      amountCents: 1399,
      startDate: "2026-12-10",
      repeat: "Monthly",
      category: "Entertainment",
    },
  },
  {
    file: "insurance-annual.txt",
    expect: {
      name: "VHI Healthcare",
      amountCents: 48000,
      startDate: "2027-02-01",
      repeat: "Yearly",
      category: "Health & fitness",
    },
  },
  {
    file: "rent-german.txt",
    expect: {
      name: "Hausverwaltung Müller GmbH",
      amountCents: 120000,
      startDate: "2026-12-01",
      repeat: "Monthly",
      category: "Housing",
    },
  },
];
for (const { file, expect } of cases)
  test(`imports ${file}`, async () => {
    const { draft, warnings } = await importText(file);
    assert.deepEqual(draft, expect);
    assert.deepEqual(warnings, []);
  });

test("GBP bill keeps the name but asks for a EUR amount", async () => {
  const { draft, warnings } = await importText("phone-gbp.txt");
  assert.equal(draft.name, "Vodafone UK");
  assert.equal(draft.amountCents, 0);
  assert.equal(draft.startDate, "2026-12-18");
  assert.match(warnings.find((w) => w.field === "amount").text, /GBP 34\.50/);
});

test("a letter with nothing due produces warnings, not invented values", async () => {
  const { draft, warnings } = await importText("no-amount-letter.txt");
  assert.equal(draft.amountCents, 0);
  assert.equal(draft.startDate, "2026-11-24");
  assert.deepEqual(warnings.map((w) => w.field).sort(), ["amount", "date"]);
});

test("Netflix receipt matches the demo Netflix bill", async () => {
  const { draft } = await importText("netflix-quoted-printable.eml");
  assert.equal(matchExisting(draft, sampleData().bills).id, "netflix");
});

test("reads the text layer of a PDF invoice", async () => {
  const text = await pdfText("tuition-text-layer.pdf");
  const { draft, warnings } = normalizeDraft(parseText(text), "2026-11-24");
  assert.deepEqual(draft, {
    name: "Trinity Summer School",
    amountCents: 125000,
    startDate: "2027-01-15",
    repeat: "Once",
    category: "Education",
  });
  assert.deepEqual(warnings, []);
});

test("an image-only PDF has no text layer", async () => {
  assert.equal((await pdfText("scanned-image-only.pdf")).trim(), "");
});

test("subscription wording counts as a due date", () => {
  const raw = parseText(
    "Spotify\nTotal €16.99\nNext payment: 28 December 2026",
  );
  assert.ok(raw.confidence.date >= 0.7);
});
