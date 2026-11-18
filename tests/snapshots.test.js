import test from "node:test";
import assert from "node:assert/strict";
import { collectionSnapshotHandler } from "../src/snapshots.js";
import { missingInvoices } from "../src/domain.js";

const bill = {
  id: "rent",
  name: "Rent",
  amountCents: 60000,
  startDate: "2026-11-18",
  repeat: "Once",
  category: "Housing",
  groupId: "",
  archived: false,
};
const snapshot = (metadata, records = [bill]) => ({
  metadata,
  docs: records.map((record) => ({ id: record.id, data: () => record })),
});

test("invoice generation waits for server acknowledgement of a new bill", () => {
  const generated = [];
  const receive = collectionSnapshotHandler("bills", (kind, bills) => {
    generated.push(...missingInvoices(bills, [], "2026-11", "2026-11"));
  });
  receive(snapshot({ hasPendingWrites: true, fromCache: false }));
  assert.equal(generated.length, 0);
  // Same documents, only metadata changes after the server commits the bill.
  receive(snapshot({ hasPendingWrites: false, fromCache: false }));
  assert.equal(generated.length, 1);
  assert.equal(generated[0].billId, bill.id);
});

test("cached or rejected bills never trigger invoice creation", () => {
  const updates = [];
  const receive = collectionSnapshotHandler("bills", (_, bills) =>
    updates.push(bills),
  );
  receive(snapshot({ hasPendingWrites: false, fromCache: true }));
  receive(snapshot({ hasPendingWrites: true, fromCache: true }));
  assert.equal(updates.length, 0);
  receive(snapshot({ hasPendingWrites: false, fromCache: false }, []));
  assert.deepEqual(updates, [[]]);
});

test("invoice listeners retain optimistic payment updates", () => {
  const updates = [];
  const receive = collectionSnapshotHandler("invoices", (_, rows) =>
    updates.push(rows),
  );
  receive(
    snapshot({ hasPendingWrites: true, fromCache: false }, [
      { id: "invoice", paid: true },
    ]),
  );
  assert.deepEqual(updates, [[{ id: "invoice", paid: true }]]);
});
