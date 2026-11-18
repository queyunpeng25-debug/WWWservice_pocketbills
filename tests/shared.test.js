import test from "node:test";
import assert from "node:assert/strict";
import { settlement, sharedInvoices, occurrence } from "../src/domain.js";
const group = {
  id: "g",
  members: ["You", "Alex", "Steven"],
  deadline: "2026-03-15",
};
const bill = {
  id: "b",
  name: "Rent",
  groupId: "g",
  paidBy: "You",
  amountCents: 120000,
  startDate: "2026-01-15",
  repeat: "Monthly",
  category: "Housing",
};
test("deadline includes all earlier months and the deadline day, excludes later bills and personal bills", () => {
  const rows = sharedInvoices(
    group,
    [
      bill,
      { ...bill, id: "late", startDate: "2026-03-16" },
      { ...bill, id: "personal", groupId: "" },
    ],
    [
      ...["2026-01", "2026-02", "2026-03", "2026-04"].map((month) => ({
        ...occurrence(bill, month),
        paid: true,
      })),
      {
        ...occurrence(
          { ...bill, id: "late", startDate: "2026-03-16" },
          "2026-03",
        ),
        paid: true,
      },
      {
        ...occurrence({ ...bill, id: "personal", groupId: "" }, "2026-03"),
        paid: true,
      },
    ],
  );
  assert.deepEqual(
    rows.map((i) => i.dueDate),
    ["2026-01-15", "2026-02-15", "2026-03-15"],
  );
  assert.equal(settlement(group.members, rows).total, 360000);
});
test("shared totals retain invoice snapshots without double counting", () => {
  const saved = {
    ...occurrence(bill, "2026-02"),
    amountCents: 10000,
    paidBy: "Alex",
    paid: true,
  };
  const rows = sharedInvoices(group, [bill], [saved]);
  assert.equal(rows.length, 1);
  assert.equal(settlement(group.members, rows).participants[1].paid, 10000);
});
test("shared totals only count paid invoices and reverse when payment is unchecked", () => {
  const invoice = occurrence(bill, "2026-03");
  const calculate = (stored) =>
    settlement(group.members, sharedInvoices(group, [bill], stored));
  assert.equal(calculate([]).total, 0);
  assert.equal(calculate([invoice]).total, 0);
  const paid = calculate([{ ...invoice, paid: true }]);
  assert.equal(paid.total, bill.amountCents);
  assert.equal(paid.participants[0].paid, bill.amountCents);
  assert.equal(paid.transfers.length, 2);
  const reopened = calculate([{ ...invoice, paid: false }]);
  assert.equal(reopened.total, 0);
  assert.deepEqual(reopened.transfers, []);
  assert.ok(
    reopened.participants.every(
      (p) => p.paid === 0 && p.share === 0 && p.balance === 0,
    ),
  );
});
test("settlement reproduces the requested example", () => {
  const result = settlement(group.members, [
    { amountCents: 120000, paidBy: "You" },
    { amountCents: 6000, paidBy: "Alex" },
    { amountCents: 12000, paidBy: "Steven" },
  ]);
  assert.deepEqual(
    result.participants.map((p) => p.balance),
    [74000, -40000, -34000],
  );
  assert.deepEqual(result.transfers, [
    { from: "Alex", to: "You", amount: 40000 },
    { from: "Steven", to: "You", amount: 34000 },
  ]);
});
test("remainder cents balance exactly and transfers settle every member", () => {
  for (let total = 1; total < 1500; total++) {
    const r = settlement(group.members, [
      { amountCents: total, paidBy: "You" },
    ]);
    assert.equal(
      r.participants.reduce((s, p) => s + p.share, 0),
      total,
    );
    for (const p of r.participants) {
      const received = r.transfers
        .filter((t) => t.to === p.name)
        .reduce((s, t) => s + t.amount, 0);
      const sent = r.transfers
        .filter((t) => t.from === p.name)
        .reduce((s, t) => s + t.amount, 0);
      assert.equal(p.balance - received + sent, 0);
    }
  }
});
test("legacy missing payers block misleading transfers", () => {
  const r = settlement(group.members, [{ amountCents: 10000 }]);
  assert.equal(r.unassigned.length, 1);
  assert.deepEqual(r.transfers, []);
  assert.deepEqual(
    sharedInvoices({ ...group, deadline: undefined }, [bill], []),
    [],
  );
});
