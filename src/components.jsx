import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  X,
  ArrowRight,
  Wallet,
  House,
  Lightbulb,
  Music,
  HeartPulse,
  GraduationCap,
  Receipt,
  ArrowUpRight,
} from "lucide-react";
import {
  today,
  money,
  monthLabel,
  daysUntil,
  status,
  categories,
  validateBill,
  validDate,
  sharedInvoices,
  settlement,
} from "./domain";

export const marks = {
  Housing: "⌂",
  Utilities: "ϟ",
  Entertainment: "♫",
  "Health & fitness": "+",
  Education: "✎",
  Other: "↗",
};
const invoiceIcons = {
  Housing: House,
  Utilities: Lightbulb,
  Entertainment: Music,
  "Health & fitness": HeartPulse,
  Education: GraduationCap,
  Other: Receipt,
};
// Derive the hue from the group ID so renaming or filtering never changes its color.
function groupColor(id) {
  let hash = 2166136261;
  for (const character of id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `hsl(${((hash >>> 0) / 4294967296) * 360} 58% 60%)`;
}
export function SharedBillsSummary({ groups, bills, invoices, onView }) {
  const [selected, setSelected] = useState("");
  const group = groups.find((g) => g.id === selected) || groups[0];
  const result = group
    ? settlement(group.members, sharedInvoices(group, bills, invoices))
    : null;
  const share = result?.participants.find((p) => p.name === "You")?.share || 0;
  return (
    <section className="panel shared-summary">
      <div className="shared-summary-heading">
        <h2>Shared Bills</h2>
        <button className="text-button" onClick={onView}>
          View all <ArrowUpRight size={14} />
        </button>
      </div>
      {group ? (
        <>
          <div className="shared-summary-group">
            <span className="invoice-group">
              <span
                className="invoice-group-dot"
                style={{ backgroundColor: groupColor(group.id) }}
                aria-hidden="true"
              />
              {group.name}
            </span>
            {groups.length > 1 && (
              <select
                aria-label="Choose shared group"
                value={group.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="shared-summary-members">
            <div className="member-list">
              {group.members.slice(0, 4).map((name) => (
                <span key={name} title={name}>
                  {name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
            <small>{group.members.length} members</small>
          </div>
          <strong className="shared-summary-amount">{money(share)}</strong>
          <p className="shared-summary-caption">Your share this cycle</p>
          <small className="shared-summary-note">
            Paid bills only
            {group.deadline
              ? ` · Through ${group.deadline}`
              : " · Set a deadline to calculate"}
          </small>
          <button className="shared-summary-button" onClick={onView}>
            View balances <ArrowRight size={16} />
          </button>
        </>
      ) : (
        <>
          <p className="shared-summary-caption">
            Create a group to split bills with friends or family.
          </p>
          <button className="shared-summary-button" onClick={onView}>
            Get started <ArrowRight size={16} />
          </button>
        </>
      )}
    </section>
  );
}
/** Native dialogs trap focus and support Escape; focus returns to the trigger. */
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
/** Every payment button targets a single invoice, never the recurring bill. */
export function InvoiceList({ rows, groups = [], onPay, busy }) {
  return rows.length ? (
    <div className="invoice-list">
      <div className="list-head">
        <span>BILL / PAYMENT</span>
        <span>DUE DATE</span>
        <span>AMOUNT</span>
        <span />
      </div>
      {rows.map((i) => {
        const group = groups.find((g) => g.id === i.groupId);
        const Icon = invoiceIcons[i.category] || Receipt;
        const count = group?.members.length || 0;
        const remainder = count ? i.amountCents % count : 0;
        const splitDescription = count
          ? `${count} members · ${group.members.map((name, index) => `${name}: ${money(Math.floor(i.amountCents / count) + (index < remainder ? 1 : 0))}`).join(" · ")}`
          : "Group details unavailable";
        return (
          <div className={`invoice-row ${i.paid ? "is-paid" : ""}`} key={i.id}>
            <div className="bill-info">
              <span className="bill-icon" aria-hidden="true">
                <Icon size={23} strokeWidth={1.7} />
              </span>
              <div>
                <strong>{i.name}</strong>
                {i.groupId && (
                  <span className="invoice-group">
                    <span
                      className="invoice-group-dot"
                      style={{ backgroundColor: groupColor(i.groupId) }}
                      aria-hidden="true"
                    />
                    {group?.name || "Unknown group"}
                    <span className="invoice-payer">
                      {i.paidBy
                        ? ` · ${i.paid ? "Paid by" : "Payer:"} ${i.paidBy}`
                        : " · Payer not set"}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div
              className={`due-cell ${status(i) === "Overdue" ? "urgent" : ""}`}
            >
              <strong>
                {new Date(`${i.dueDate}T12:00:00`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </strong>
              <small>
                {i.paid
                  ? "Paid"
                  : daysUntil(i.dueDate) < 0
                    ? `${-daysUntil(i.dueDate)}d overdue`
                    : daysUntil(i.dueDate) === 0
                      ? "Due today"
                      : `In ${daysUntil(i.dueDate)} days`}
              </small>
            </div>
            <div className="amount-cell">
              <strong>{money(i.amountCents)}</strong>
              {!!count && (
                <small title={splitDescription}>
                  {remainder ? "≈" : ""}
                  {money(Math.round(i.amountCents / count))} each
                </small>
              )}
            </div>
            <button
              className={`pay-check ${i.paid ? "paid" : ""}`}
              aria-label={`${i.paid ? "Reopen" : "Mark paid"}: ${i.name}, ${i.dueDate}`}
              aria-pressed={i.paid}
              disabled={busy}
              onClick={() => onPay(i)}
            >
              {i.paid && <Check size={14} />}
            </button>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="empty">
      <Check />
      <h3>A little breathing room.</h3>
      <p>No payments to show for this selection.</p>
    </div>
  );
}
/** Monday-first calendar uses the same invoice data as the dashboard. */
export function Calendar({ month, rows, selected, onSelect, compact = false }) {
  const [year, m] = month.split("-").map(Number),
    offset = (new Date(year, m - 1, 1).getDay() + 6) % 7,
    count = new Date(year, m, 0).getDate();
  return (
    <>
      <div className="calendar-heading">
        <h2>{monthLabel(month)}</h2>
        <small>{compact ? "" : `${rows.length} payments`}</small>
      </div>
      <div className={`calendar-grid ${compact ? "compact" : ""}`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="weekday">
            {compact ? d[0] : d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`empty-${i}`} className="blank-day" />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`,
            items = rows.filter((r) => r.dueDate === date);
          return (
            <button
              key={date}
              aria-label={`${date}, ${items.length} payments`}
              aria-pressed={selected === date}
              className={`day ${date === today() ? "today" : ""} ${selected === date ? "selected" : ""} ${items.length ? "has-bills" : ""}`}
              onClick={() => onSelect(date)}
            >
              <span>{i + 1}</span>
              {!compact &&
                items.slice(0, 2).map((item) => (
                  <small
                    key={item.id}
                    className={
                      item.paid
                        ? "paid-event"
                        : status(item) === "Overdue"
                          ? "late-event"
                          : ""
                    }
                  >
                    {item.name}
                  </small>
                ))}
              {!compact && items.length > 2 && (
                <small>+{items.length - 2} more</small>
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-key">
        <i /> Payment scheduled <span>○ Today</span>
      </div>
    </>
  );
}
/** Native form constraints complement domain validation and Firestore rules. */
export function BillForm({ record, groups, onSave, busy }) {
  const [error, setError] = useState("");
  const [groupId, setGroupId] = useState(record.groupId || "");
  const group = groups.find((g) => g.id === groupId);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const bill = {
          ...record,
          name: f.get("name").trim(),
          amountCents: Math.round(Number(f.get("amount")) * 100),
          startDate: f.get("date"),
          repeat: f.get("repeat"),
          category: f.get("category"),
          groupId: f.get("group"),
          paidBy: groupId ? f.get("paidBy") : "",
        };
        try {
          validateBill(bill);
          if (groupId && !group?.members.includes(bill.paidBy))
            throw new Error("Choose who paid this bill.");
          setError("");
          await onSave(bill);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <label>
        Bill name
        <input
          autoFocus
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={record.name}
          placeholder="e.g. House rent"
        />
      </label>
      <div className="form-grid">
        <label>
          Amount (€)
          <input
            name="amount"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            defaultValue={record.amountCents ? record.amountCents / 100 : ""}
            placeholder="0.00"
          />
        </label>
        <label>
          First due date
          <input
            name="date"
            type="date"
            required
            min="2000-01-01"
            max="2100-12-31"
            defaultValue={record.startDate}
          />
        </label>
        <label>
          Repeats
          <select name="repeat" defaultValue={record.repeat}>
            <option value="Once">One-time</option>
            <option>Monthly</option>
            <option>Yearly</option>
          </select>
        </label>
        <label>
          Category
          <select name="category" defaultValue={record.category}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Organise in a group
        <select
          name="group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">Personal bill</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {group && (
        <label>
          Who paid?
          <select
            name="paidBy"
            key={groupId}
            required
            defaultValue={
              group.members.includes(record.paidBy) ? record.paidBy : ""
            }
          >
            <option value="" disabled>
              Select a member
            </option>
            {group.members.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      <p className="form-note">
        Only you can view this bill. Existing invoices keep their original
        details; edits apply to months not yet generated.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? "Saving…" : "Save bill"}
        <Check size={17} />
      </button>
    </form>
  );
}
export function GroupForm({
  record,
  knownMembers = [],
  lockedMembers = [],
  onSave,
  busy,
}) {
  const [error, setError] = useState("");
  const [members, setMembers] = useState(record.members);
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState([]);
  const options = [
    ...new Set(["You", ...knownMembers, ...record.members, ...added]),
  ];
  function addMember() {
    const name = draft.trim();
    if (!name || name.length > 60) {
      setError("Enter a member name (1–60 characters).");
      return;
    }
    const existing =
      options.find((n) => n.toLowerCase() === name.toLowerCase()) || name;
    setAdded((a) => [...new Set([...a, existing])]);
    setMembers((a) => [...new Set([...a, existing])]);
    setDraft("");
    setError("");
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (draft.trim()) {
          setError("Add the typed member using + first.");
          return;
        }
        if (members.length < 2 || members.length > 20) {
          setError("Select 2–20 members, including you.");
          return;
        }
        if (!f.get("name").trim() || !validDate(f.get("deadline"))) {
          setError("Enter a group name and valid deadline.");
          return;
        }
        try {
          await onSave({
            ...record,
            name: f.get("name").trim(),
            members,
            deadline: f.get("deadline"),
            createdAt: record.createdAt || today(),
          });
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <label>
        Group name
        <input
          autoFocus
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={record.name}
          placeholder="e.g. Our home"
        />
      </label>
      <label>
        Completing at (settle-up deadline)
        <input
          name="deadline"
          type="date"
          required
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={record.deadline || today()}
        />
      </label>
      <label htmlFor="member-name">Members</label>
      <div className="member-picker">
        {options.map((name) => (
          <button
            type="button"
            key={name}
            className={`member-chip ${members.includes(name) ? "selected" : ""}`}
            aria-pressed={members.includes(name)}
            disabled={name === "You" || lockedMembers.includes(name)}
            onClick={() =>
              setMembers((a) =>
                a.includes(name) ? a.filter((n) => n !== name) : [...a, name],
              )
            }
          >
            {members.includes(name) ? "✓ " : "+ "}
            {name}
          </button>
        ))}
      </div>
      <div className="member-add">
        <input
          type="text"
          id="member-name"
          value={draft}
          maxLength={60}
          placeholder="Add a new member"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMember();
            }
          }}
        />
        <button type="button" className="secondary" onClick={addMember}>
          + Add
        </button>
      </div>
      <p className="form-note">
        You are included automatically. Select saved names to reuse them.
        Members who have paid a bill cannot be removed.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? "Saving…" : "Save group"}
        <Check size={17} />
      </button>
    </form>
  );
}
