/** Pure calendar and money helpers. Local calendar dates never pass through UTC. */
export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const today = () => dateKey();
export const money = (cents) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const monthLabel = (month) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
export function shiftMonth(month, offset) {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + offset);
  return dateKey(d).slice(0, 7);
}
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dateKey(new Date(`${value}T12:00:00`)) === value
  );
}
export const status = (invoice, day = today()) =>
  invoice.paid ? "Paid" : invoice.dueDate < day ? "Overdue" : "Upcoming";
// Support records saved before payment method and automatic debit were separated.
export const isAutomaticPayment = (record) =>
  record.autoPay ?? record.paymentMethod === "automatic";
export const paymentMethodName = (record) =>
  record.autoPay === undefined &&
  ["manual", "automatic"].includes(record.paymentMethod)
    ? ""
    : record.paymentMethod || "";
export const automaticPaymentDue = (invoice, day = today()) =>
  !invoice.paid &&
  isAutomaticPayment(invoice) &&
  validDate(invoice.dueDate) &&
  invoice.dueDate <= day;
export function daysUntil(value, day = today()) {
  return Math.round(
    (Date.parse(`${value}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) /
      86400000,
  );
}
export const categories = [
  "Housing",
  "Utilities",
  "Entertainment",
  "Health & fitness",
  "Education",
  "Other",
];
/** Integer cents avoid cumulative floating point errors in totals. */
export function validateBill(bill) {
  if (
    bill.paymentMethod !== undefined &&
    (typeof bill.paymentMethod !== "string" || bill.paymentMethod.length > 80)
  )
    throw new Error("Enter a payment method of up to 80 characters.");
  if (bill.autoPay !== undefined && typeof bill.autoPay !== "boolean")
    throw new Error("Choose whether automatic debit is enabled.");
  if (!bill.name?.trim() || bill.name.length > 80)
    throw new Error("Enter a bill name (1–80 characters).");
  if (
    !Number.isInteger(bill.amountCents) ||
    bill.amountCents < 1 ||
    bill.amountCents > 100000000
  )
    throw new Error("Enter an amount between €0.01 and €1,000,000.00.");
  if (
    !validDate(bill.startDate) ||
    bill.startDate < "2000-01-01" ||
    bill.startDate > "2100-12-31"
  )
    throw new Error("Choose a valid date between 2000 and 2100.");
  if (
    !["Once", "Monthly", "Yearly"].includes(bill.repeat) ||
    !categories.includes(bill.category)
  )
    throw new Error("Choose a valid frequency and category.");
}
/** Clamp short months independently, so Jan 31 → Feb 28 → Mar 31. */
export function occurrence(bill, month) {
  if (bill.archived || month < bill.startDate.slice(0, 7)) return null;
  if (bill.repeat === "Once" && month !== bill.startDate.slice(0, 7))
    return null;
  if (bill.repeat === "Yearly" && month.slice(5) !== bill.startDate.slice(5, 7))
    return null;
  const [year, m] = month.split("-").map(Number);
  const day = Math.min(
    Number(bill.startDate.slice(8)),
    new Date(year, m, 0).getDate(),
  );
  const dueDate = `${month}-${String(day).padStart(2, "0")}`;
  return {
    id: `${bill.id}_${dueDate}`,
    billId: bill.id,
    name: bill.name,
    amountCents: bill.amountCents,
    dueDate,
    category: bill.category,
    groupId: bill.groupId,
    paidBy: bill.paidBy || "",
    paymentMethod: paymentMethodName(bill),
    autoPay: isAutomaticPayment(bill),
    paid: false,
  };
}
/** Refresh unpaid occurrences while retaining their identity and paid history. */
export function editedInvoice(bill, invoice) {
  if (invoice.billId !== bill.id || invoice.paid) return invoice;
  const next = occurrence(
    { ...bill, archived: false },
    invoice.dueDate.slice(0, 7),
  );
  return next ? { ...next, id: invoice.id } : null;
}
/** Stored invoices reflect edits; paid snapshots retain their original values. */
export function invoicesForMonth(bills, stored, month) {
  const rows = new Map(
    stored.filter((i) => i.dueDate.startsWith(month)).map((i) => [i.id, i]),
  );
  for (const bill of bills) {
    const existing = [...rows.values()].some((i) => i.billId === bill.id);
    const next = occurrence(bill, month);
    if (next && !existing) rows.set(next.id, next);
  }
  return [...rows.values()]
    .filter(
      (i) =>
        !bills.find((b) => b.id === i.billId)?.archived ||
        i.paid ||
        i.dueDate < today(),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
/** Catch up missed months on return, and include next month for boundary reminders. */
export function missingInvoices(
  bills,
  stored,
  viewedMonth,
  currentMonth = today().slice(0, 7),
) {
  const known = new Set(
    stored.map((i) => `${i.billId}_${i.dueDate.slice(0, 7)}`),
  );
  const result = [];
  for (const bill of bills.filter((b) => !b.archived)) {
    const months = new Set([viewedMonth, shiftMonth(currentMonth, 1)]);
    for (
      let m = bill.startDate.slice(0, 7);
      m <= currentMonth;
      m = shiftMonth(m, 1)
    )
      months.add(m);
    for (const month of months) {
      if (known.has(`${bill.id}_${month}`)) continue;
      const invoice = occurrence(bill, month);
      if (invoice) result.push(invoice);
    }
  }
  return result;
}
export function sampleData() {
  const month = today().slice(0, 7);
  const make = (
    id,
    name,
    amountCents,
    day,
    category,
    repeat = "Monthly",
    groupId = "",
  ) => ({
    id,
    name,
    amountCents,
    startDate: `${month}-${day}`,
    category,
    repeat,
    groupId,
    archived: false,
    paidBy: groupId ? (id === "rent" ? "You" : "Alex") : "",
  });
  const bills = [
    make("rent", "House rent", 120000, "07", "Housing", "Monthly", "home"),
    make("electric", "Electricity", 7500, "03", "Utilities", "Monthly", "home"),
    make("netflix", "Netflix", 1399, "10", "Entertainment"),
    make("mobile", "Mobile plan", 1590, "15", "Utilities"),
    make("spotify", "Spotify", 1199, "25", "Entertainment"),
    make("dentist", "Dentist check-up", 6000, "28", "Health & fitness", "Once"),
  ];
  return {
    bills,
    invoices: bills.map((b) => ({
      ...occurrence(b, month),
      paid: b.id === "mobile" || b.id === "netflix",
    })),
    groups: [
      {
        id: "home",
        name: "Our home",
        members: ["You", "Alex", "Steven"],
        deadline: dateKey(
          new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
        ),
        createdAt: `${month}-01`,
      },
    ],
    settings: { name: "Alex", reminders: true, reminderDays: 7, dark: false },
  };
}

/** Only recorded payments through the inclusive deadline count toward settlement. */
export function sharedInvoices(group, _bills, stored) {
  if (!validDate(group.deadline)) return [];
  return stored
    .filter(
      (i) =>
        i.paid === true &&
        i.groupId === group.id &&
        i.dueDate <= group.deadline,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
export function settlement(members, invoices) {
  const total = invoices.reduce((sum, i) => sum + i.amountCents, 0);
  const unassigned = invoices.filter((i) => !members.includes(i.paidBy));
  const participants = members.map((name, index) => {
    const paid = invoices
      .filter((i) => i.paidBy === name)
      .reduce((sum, i) => sum + i.amountCents, 0);
    const share =
      Math.floor(total / members.length) +
      (index < total % members.length ? 1 : 0);
    return { name, paid, share, balance: paid - share };
  });
  const transfers = [];
  if (!unassigned.length) {
    const debtors = participants
      .filter((p) => p.balance < 0)
      .map((p) => ({ ...p, left: -p.balance }));
    const creditors = participants
      .filter((p) => p.balance > 0)
      .map((p) => ({ ...p, left: p.balance }));
    for (const debtor of debtors)
      for (const creditor of creditors) {
        const amount = Math.min(debtor.left, creditor.left);
        if (amount)
          transfers.push({ from: debtor.name, to: creditor.name, amount });
        debtor.left -= amount;
        creditor.left -= amount;
      }
  }
  return { total, participants, transfers, unassigned };
}
