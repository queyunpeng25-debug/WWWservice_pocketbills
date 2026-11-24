/** Validate real rendered HTML fragments and parse the complete stylesheet. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { HtmlValidate } from "html-validate";
import { parse } from "css-tree";
const validator = new HtmlValidate({
  extends: ["html-validate:recommended"],
  rules: {
    // These are legal HTML serialization choices made by React/Prettier.
    "doctype-style": "off",
    "attr-case": "off",
    "attribute-boolean-style": "off",
    "void-style": "off",
    "no-inline-style": "off",
    "require-sri": "off",
    "prefer-button": "off",
    "no-implicit-button-type": "off",
    "heading-level": "off",
    "svg-focusable": "off",
  },
});
let failed = false;
async function check(name, source) {
  const result = await validator.validateString(source);
  if (!result.valid) {
    failed = true;
    console.error(
      name,
      JSON.stringify(
        result.results.flatMap((r) => r.messages),
        null,
        2,
      ),
    );
  } else console.log(`HTML valid: ${name}`);
}
await check("index.html", await fs.readFile("index.html", "utf8"));
const server = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { default: Auth } = await server.ssrLoadModule("/src/AuthScreen.jsx");
  const { Calendar, InvoiceList, BillForm, GroupForm, SharedBillsSummary } =
    await server.ssrLoadModule("/src/components.jsx");
  const { Bills, Groups, Preferences, Help } =
    await server.ssrLoadModule("/src/views.jsx");
  const { sampleData, today } = await server.ssrLoadModule("/src/domain.js");
  const data = sampleData(),
    month = today().slice(0, 7),
    noop = () => {};
  const groupArchivePreview = renderToStaticMarkup(
    React.createElement(Groups, {
      groups: [
        { id: "active", name: "Active household", members: ["You", "Alex"] },
        {
          id: "archived",
          name: "Archived household",
          members: ["You", "Alex"],
          archived: true,
        },
      ],
      bills: [],
      invoices: [],
      onArchive: noop,
      onDelete: noop,
      onEdit: noop,
      onView: noop,
      onAssign: noop,
    }),
  );
  assert.match(groupArchivePreview, /Active household/);
  assert.doesNotMatch(groupArchivePreview, /Archived household/);
  assert.match(groupArchivePreview, />Archive<\/button>/);
  assert.doesNotMatch(
    groupArchivePreview,
    /aria-label="Delete Active household"/,
  );
  await check("group archive controls", groupArchivePreview);
  const sharedRow = {
    id: "shared-preview",
    name: "Internet",
    category: "Utilities",
    dueDate: today(),
    amountCents: 1000,
    groupId: "preview",
    paidBy: "Alex",
    paid: false,
  };
  const previewGroups = [
    { id: "preview", name: "Family", members: ["You", "Alex", "Sam"] },
  ];
  const preview = (row, groups = previewGroups) =>
    renderToStaticMarkup(
      React.createElement(InvoiceList, { rows: [row], groups, onPay: noop }),
    );
  const unpaidPreview = preview(sharedRow);
  assert.match(unpaidPreview, /Family/);
  assert.match(unpaidPreview, /Payer: Alex/);
  assert.doesNotMatch(unpaidPreview, /Estimated split|Utilities/);
  assert.match(unpaidPreview, /≈€3.33 each/);
  assert.match(unpaidPreview, /You: €3.34/);
  const paidPreview = preview({ ...sharedRow, paid: true });
  assert.match(paidPreview, /Paid by Alex/);
  assert.doesNotMatch(paidPreview, /Estimated split/);
  const personalPreview = preview({ ...sharedRow, groupId: "" });
  assert.match(personalPreview, /invoice-group/);
  assert.match(personalPreview, /Personal/);
  assert.doesNotMatch(personalPreview, /Payer:|Paid by|Payer not set|each/);
  await check("personal invoice details", personalPreview);
  assert.match(preview(sharedRow, []), /Unknown group/);
  await check("shared invoice details", unpaidPreview);
  const cases = [
    ["shared summary", SharedBillsSummary, { ...data, onView: noop }],
    [
      "empty shared summary",
      SharedBillsSummary,
      { groups: [], bills: [], invoices: [], onView: noop },
    ],
    ["entry", Auth, { onDemo: noop }],
    ["calendar", Calendar, { month, rows: data.invoices, onSelect: noop }],
    ["invoices", InvoiceList, { rows: data.invoices, onPay: noop }],
    [
      "bill form",
      BillForm,
      { record: data.bills[0], groups: data.groups, onSave: noop },
    ],
    ["group form", GroupForm, { record: data.groups[0], onSave: noop }],
    [
      "bills",
      Bills,
      { bills: data.bills, groups: data.groups, initialGroup: "All" },
    ],
    ["groups", Groups, { ...data, rows: data.invoices, month }],
    ["settings", Preferences, { settings: data.settings, demo: true }],
    ["help", Help, {}],
  ];
  for (const [name, Component, props] of cases)
    await check(
      name,
      `<!doctype html><html lang="en"><head><title>Validation</title></head><body>${renderToStaticMarkup(React.createElement(Component, props))}</body></html>`,
    );
} finally {
  await server.close();
}
parse(await fs.readFile("src/styles.css", "utf8"), {
  onParseError(error) {
    failed = true;
    console.error(error.message);
  },
});
console.log(
  "CSS syntax parsed. Use the W3C validator for an independent standards report.",
);
if (failed) process.exitCode = 1;
