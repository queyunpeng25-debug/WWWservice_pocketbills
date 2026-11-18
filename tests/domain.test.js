// Business-rule regression tests: real month boundaries and independent invoices.
import test from "node:test";
import assert from "node:assert/strict";
import {
  occurrence,
  invoicesForMonth,
  validateBill,
  status,
  daysUntil,
  shiftMonth,
  missingInvoices,
  editedInvoice,
} from "../src/domain.js";
const bill = {
  id: "rent",
  name: "Rent",
  amountCents: 120099,
  startDate: "2024-01-31",
  repeat: "Monthly",
  category: "Housing",
  groupId: "",
  archived: false,
};
test("month-end recurrence does not drift after February", () => {
  assert.equal(occurrence(bill, "2024-02").dueDate, "2024-02-29");
  assert.equal(occurrence(bill, "2025-02").dueDate, "2025-02-28");
  assert.equal(occurrence(bill, "2025-03").dueDate, "2025-03-31");
});
test("one-time, yearly and pre-start dates", () => {
  assert.equal(occurrence(bill, "2023-12"), null);
  assert.equal(occurrence({ ...bill, repeat: "Once" }, "2024-02"), null);
  assert.equal(occurrence({ ...bill, repeat: "Yearly" }, "2025-02"), null);
  assert.equal(
    occurrence(
      { ...bill, startDate: "2024-02-29", repeat: "Yearly" },
      "2025-02",
    ).dueDate,
    "2025-02-28",
  );
});
test("payment status remains independent across months", () => {
  const january = { ...occurrence(bill, "2024-01"), paid: true };
  assert.equal(invoicesForMonth([bill], [january], "2024-02")[0].paid, false);
  assert.equal(invoicesForMonth([bill], [january], "2024-01")[0].paid, true);
});
test("editing a bill updates unpaid overview details without duplicating invoices", () => {
  const original = occurrence(bill, "2024-02");
  const edited = {
    ...bill,
    name: "New rent",
    amountCents: 200000,
    startDate: "2024-01-15",
    category: "Other",
    groupId: "shared",
    paidBy: "You",
  };
  const results = invoicesForMonth(
    [edited],
    [editedInvoice(edited, original)],
    "2024-02",
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].amountCents, 200000);
  assert.equal(results[0].dueDate, "2024-02-15");
  assert.equal(results[0].name, "New rent");
  assert.equal(results[0].category, "Other");
  assert.equal(results[0].groupId, "shared");
  assert.equal(results[0].paidBy, "You");
  assert.equal(results[0].id, original.id);
});
test("bill edits preserve paid history and unrelated invoices", () => {
  const paid = { ...occurrence(bill, "2024-02"), paid: true };
  assert.deepEqual(editedInvoice({ ...bill, amountCents: 1 }, paid), paid);
  assert.deepEqual(editedInvoice({ ...bill, id: "other" }, paid), paid);
});
test("schedule edits remove unpaid occurrences that no longer apply", () => {
  const original = occurrence(bill, "2024-02");
  assert.equal(editedInvoice({ ...bill, repeat: "Once" }, original), null);
  assert.equal(editedInvoice({ ...bill, repeat: "Yearly" }, original), null);
  assert.equal(
    editedInvoice({ ...bill, startDate: "2024-03-01" }, original),
    null,
  );
});
test("archival stops new invoices but preserves paid history", () => {
  assert.equal(occurrence({ ...bill, archived: true }, "2024-03"), null);
  const paid = { ...occurrence(bill, "2099-01"), paid: true };
  const unpaid = occurrence(bill, "2099-02");
  assert.equal(
    invoicesForMonth([{ ...bill, archived: true }], [paid], "2099-01").length,
    1,
  );
  assert.equal(
    invoicesForMonth([{ ...bill, archived: true }], [unpaid], "2099-02").length,
    0,
  );
});
test("invalid amounts and impossible dates are rejected", () => {
  for (const amountCents of [0, -1, NaN, Infinity, 1.5, 100000001])
    assert.throws(() => validateBill({ ...bill, amountCents }));
  assert.throws(() => validateBill({ ...bill, startDate: "2025-02-30" }));
  assert.throws(() => validateBill({ ...bill, name: "  " }));
  assert.doesNotThrow(() => validateBill(bill));
});
test("status and day deltas are independent of DST", () => {
  assert.equal(daysUntil("2026-03-30", "2026-03-28"), 2);
  assert.equal(
    status({ paid: false, dueDate: "2026-11-17" }, "2026-11-18"),
    "Overdue",
  );
  assert.equal(
    status({ paid: true, dueDate: "2026-11-17" }, "2026-11-18"),
    "Paid",
  );
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
test("returning users receive missed invoices and next-month reminders", () => {
  const generated = missingInvoices([bill], [], "2024-03", "2024-03");
  assert.deepEqual(generated.map((i) => i.dueDate).sort(), [
    "2024-01-31",
    "2024-02-29",
    "2024-03-31",
    "2024-04-30",
  ]);
  assert.equal(
    missingInvoices([bill], generated, "2024-03", "2024-03").length,
    0,
  );
});
