/** Storage adapter: private per-user collections, realtime updates, atomic invoice creation. */
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  runTransaction,
  getDocs,
  query,
  where,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { sampleData, editedInvoice } from "./domain";
import { collectionSnapshotHandler } from "./snapshots.js";
const key = "pocketbill-demo-v2";
export const emptyData = () => ({
  bills: [],
  invoices: [],
  groups: [],
  settings: { name: "", reminders: true, reminderDays: 7, dark: false },
});
export function demoData() {
  try {
    return JSON.parse(localStorage.getItem(key)) || sampleData();
  } catch {
    return sampleData();
  }
}
export function saveDemo(data) {
  localStorage.setItem(key, JSON.stringify(data));
}
export function subscribe(uid, update, fail) {
  const unsub = ["bills", "invoices", "groups"].map((kind) =>
    onSnapshot(
      collection(db, "users", uid, kind),
      // Acknowledgement may change only metadata, not document contents.
      { includeMetadataChanges: true },
      collectionSnapshotHandler(kind, update),
      fail,
    ),
  );
  unsub.push(
    onSnapshot(
      doc(db, "users", uid),
      (snap) =>
        update("settings", snap.exists() ? snap.data() : emptyData().settings),
      fail,
    ),
  );
  return () => unsub.forEach((fn) => fn());
}
export const saveRecord = (uid, kind, record) =>
  setDoc(doc(db, "users", uid, kind, record.id), record);
export async function saveBill(uid, bill) {
  const invoices = await getDocs(
    query(
      collection(db, "users", uid, "invoices"),
      where("billId", "==", bill.id),
    ),
  );
  await runTransaction(db, async (tx) => {
    // Re-read payment status so a concurrent payment is never overwritten.
    const snapshots = await Promise.all(
      invoices.docs.map((i) => tx.get(i.ref)),
    );
    tx.set(doc(db, "users", uid, "bills", bill.id), bill);
    for (const snap of snapshots) {
      if (!snap.exists() || snap.data().paid) continue;
      const next = editedInvoice(bill, { ...snap.data(), id: snap.id });
      if (next) tx.set(snap.ref, next);
      else tx.delete(snap.ref);
    }
  });
}
export const saveSettings = (uid, settings) =>
  setDoc(doc(db, "users", uid), settings);
export async function deleteGroup(uid, groupId) {
  // Detach rules first so newly generated invoices no longer reference the group.
  for (const kind of ["bills", "invoices"]) {
    const records = await getDocs(
      query(
        collection(db, "users", uid, kind),
        where("groupId", "==", groupId),
      ),
    );
    for (let offset = 0; offset < records.docs.length; offset += 400) {
      const batch = writeBatch(db);
      records.docs.slice(offset, offset + 400).forEach((record) => {
        batch.update(record.ref, { groupId: "", paidBy: "" });
      });
      await batch.commit();
    }
  }
  await deleteDoc(doc(db, "users", uid, "groups", groupId));
}
/** Remove invoice snapshots before the archived rule, allowing failed cleanup to be retried. */
export async function deleteBill(uid, billId) {
  const invoices = await getDocs(
    query(
      collection(db, "users", uid, "invoices"),
      where("billId", "==", billId),
    ),
  );
  for (let offset = 0; offset < invoices.docs.length; offset += 400) {
    const batch = writeBatch(db);
    invoices.docs
      .slice(offset, offset + 400)
      .forEach((invoice) => batch.delete(invoice.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "users", uid, "bills", billId));
}
/** A transaction prevents two devices from resetting an already-paid invoice. */
export async function ensureInvoice(uid, invoice) {
  const ref = doc(db, "users", uid, "invoices", invoice.id);
  await runTransaction(db, async (tx) => {
    if (!(await tx.get(ref)).exists()) tx.set(ref, invoice);
  });
}
export async function setPayment(uid, invoice, paid) {
  const ref = doc(db, "users", uid, "invoices", invoice.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    tx.set(ref, { ...(snap.exists() ? snap.data() : invoice), paid });
  });
}

export async function setPayer(uid, invoice, paidBy) {
  const ref = doc(db, "users", uid, "invoices", invoice.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    tx.set(ref, { ...(snap.exists() ? snap.data() : invoice), paidBy });
  });
}
