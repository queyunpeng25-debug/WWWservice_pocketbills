import React, { useState } from "react";
import {
  Search,
  Pencil,
  Archive,
  Users,
  ArrowRight,
  LogOut,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import {
  money,
  monthLabel,
  categories,
  sharedInvoices,
  settlement,
  paymentMethodName,
  isAutomaticPayment,
} from "./domain";
import { marks } from "./components";

/** Bill filters operate on rules; the calendar operates on individual invoices. */
export function Bills({
  bills,
  groups,
  initialGroup,
  busy,
  onNew,
  onEdit,
  onArchive,
  onDelete,
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [group, setGroup] = useState(initialGroup),
    [filter, setFilter] = useState("All");
  const visible = bills.filter(
    (b) =>
      (filter === "Archived" ? b.archived : !b.archived) &&
      (filter === "All" || filter === "Archived" || b.repeat === filter) &&
      b.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === "All" || b.category === category) &&
      (group === "All" || b.groupId === group),
  );
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search bills"
            type="search"
            placeholder="Search your bills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="All">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filter group"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="All">All groups</option>
          <option value="">Personal bills</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="tabs">
        {["All", "Monthly", "Yearly", "Once", "Archived"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "All" ? "Active bills" : f === "Once" ? "One-time" : f}
          </button>
        ))}
      </div>
      <div className="bill-grid">
        {visible.map((b) => (
          <article className="panel bill-card" key={b.id}>
            <div className="bill-card-top">
              <span className="bill-icon">{marks[b.category]}</span>
              <span className="pill">
                {b.repeat === "Once" ? "One-time" : b.repeat}
              </span>
              {b.archived && (
                <button
                  className="icon-button bill-delete"
                  aria-label={`Delete ${b.name}`}
                  title="Delete bill"
                  disabled={busy}
                  onClick={() => onDelete(b)}
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <h2>{b.name}</h2>
            <p className="muted bill-category">
              {b.category}
              {b.groupId &&
                ` · ${groups.find((g) => g.id === b.groupId)?.name || "Group"}`}
            </p>
            <p className="muted bill-payment-details">
              {[
                paymentMethodName(b).trim(),
                isAutomaticPayment(b) ? "Automatic debit" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <strong className="bill-amount">{money(b.amountCents)}</strong>
            <p className="muted">
              {b.repeat === "Once" ? "Due" : "Starts"} {b.startDate}
            </p>
            <div className="bill-card-footer">
              <button className="text-button" onClick={() => onEdit(b)}>
                <Pencil size={14} />
                Edit bill
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onArchive(b)}
              >
                <Archive size={14} />
                {b.archived ? "Restore" : "Archive"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="panel empty">
          <Wallet />
          <h2>No bills here yet.</h2>
          <p>Add a bill, or try another filter.</p>
          <button className="primary" onClick={onNew}>
            Add a bill
          </button>
        </div>
      )}
    </>
  );
}
/** Shared costs are calculated through each group's deadline, in integer cents. */
export function Groups({
  groups,
  bills,
  invoices,
  onEdit,
  onView,
  onAssign,
  onDelete,
  onArchive,
  busy,
}) {
  const [filter, setFilter] = useState("Active");
  const visible = groups.filter((g) =>
    filter === "Archived" ? g.archived : !g.archived,
  );
  return (
    <>
      <div className="tabs">
        {["Active", "Archived"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "Active" ? "Active groups" : f}
          </button>
        ))}
      </div>
      <div className="shared-grid">
        {visible.map((g) => {
          const rows = sharedInvoices(g, bills, invoices);
          const result = settlement(g.members, rows);
          const shares = result.participants.map((p) => p.share);
          return (
            <article className="panel group-card" key={g.id}>
              <div className="group-card-top">
                <h2>{g.name}</h2>
                <div className="group-card-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${g.name}`}
                    disabled={busy}
                    onClick={() => onEdit(g)}
                  >
                    <Pencil size={17} />
                  </button>
                  {g.archived && (
                    <button
                      className="icon-button group-delete"
                      aria-label={`Delete ${g.name}`}
                      title="Delete group; keep bills as personal bills"
                      disabled={busy}
                      onClick={() => onDelete(g)}
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
              <p className="muted">
                Completing at · {g.deadline || "Set a settle-up deadline"}
              </p>
              <h3 className="shared-label">Paid invoices</h3>
              <div className="invoice-tags">
                {rows.map((i) => (
                  <span
                    className="pill"
                    key={i.id}
                    title={`${i.dueDate} · ${money(i.amountCents)} · ${i.paidBy || "Payer needed"}`}
                  >
                    {i.name} · {money(i.amountCents)}
                  </span>
                ))}
                {!rows.length && (
                  <span className="muted">
                    No paid bills within this deadline yet.
                  </span>
                )}
              </div>
              <h3 className="shared-label">Members</h3>
              <div className="member-list">
                {g.members.map((n) => (
                  <span title={n} key={n}>
                    {n.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
              <p>{g.members.join(", ")}</p>
              <div className="shared-total">
                <span>
                  Total <strong>{money(result.total)}</strong>
                </span>
                <span>
                  {money(Math.min(...shares))}
                  {Math.min(...shares) !== Math.max(...shares)
                    ? `–${money(Math.max(...shares))}`
                    : ""}{" "}
                  per person
                </span>
              </div>
              {!!result.unassigned.length && (
                <div className="payer-needed">
                  <p>Choose who paid each bill to calculate transfers.</p>
                  {result.unassigned.map((i) => (
                    <label key={i.id}>
                      {i.name} · {i.dueDate}
                      <select
                        aria-label={`Who paid ${i.name} on ${i.dueDate}`}
                        value=""
                        disabled={busy}
                        onChange={(e) => onAssign(i, e.target.value)}
                      >
                        <option value="" disabled>
                          Select payer
                        </option>
                        {g.members.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <div className="balance-scroll">
                <table className="balance-table">
                  <thead>
                    <tr>
                      <th scope="col">Participant</th>
                      <th scope="col">Paid</th>
                      <th scope="col">Share</th>
                      <th scope="col">Net balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.participants.map((p) => (
                      <tr key={p.name}>
                        <th scope="row">{p.name}</th>
                        <td>{money(p.paid)}</td>
                        <td>{money(p.share)}</td>
                        <td
                          className={
                            p.balance > 0
                              ? "positive"
                              : p.balance < 0
                                ? "negative"
                                : ""
                          }
                        >
                          {result.unassigned.length
                            ? "—"
                            : `${p.balance > 0 ? "+" : ""}${money(p.balance)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="shared-label">Settle up</h3>
              {!result.unassigned.length &&
                result.transfers.map((t, index) => (
                  <div className="transfer-row" key={index}>
                    <span>
                      {t.from} → {t.to}
                    </span>
                    <strong>{money(t.amount)}</strong>
                  </div>
                ))}
              {!result.unassigned.length && !result.transfers.length && (
                <p className="muted">
                  {rows.length
                    ? "Everyone is balanced."
                    : "Mark a shared bill as paid to see transfers."}
                </p>
              )}
              <p className="form-note">
                Includes only paid bills dated on or before{" "}
                {g.deadline || "your deadline"}. Any extra cents are assigned in
                member order.
              </p>
              <div className="group-card-footer">
                <button className="text-button" onClick={() => onView(g.id)}>
                  View group bills
                  <ArrowRight size={15} />
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => onArchive(g)}
                >
                  <Archive size={14} />
                  {g.archived ? "Restore" : "Archive"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="panel empty">
          <Users />
          <h2>
            {filter === "Archived"
              ? "No archived groups yet."
              : "A place for shared costs."}
          </h2>
          <p>
            {filter === "Archived"
              ? "Archived groups keep their bills and payment history."
              : "Create a group, add your friends and set a settle-up deadline."}
          </p>
        </div>
      )}
    </>
  );
}
/** User settings are stored independently from credentials managed by Firebase Auth. */
export function Preferences({ settings, demo, user, busy, onSave, onLeave }) {
  const [error, setError] = useState("");
  return (
    <section className="panel settings-panel">
      <h2>Your profile</h2>
      <p className="muted">
        {demo ? "You are exploring a local demo." : user.email}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            ...settings,
            name: f.get("name").trim(),
            reminderDays: Number(f.get("days")),
            reminders: f.has("reminders"),
          });
        }}
      >
        <label>
          Display name
          <input
            key={settings.name}
            type="text"
            name="name"
            maxLength={40}
            defaultValue={settings.name}
            placeholder="What should we call you?"
          />
        </label>
        <div className="settings-divider" />
        <h2>Stay a step ahead</h2>
        <label className="checkbox-label">
          <input
            key={String(settings.reminders)}
            type="checkbox"
            name="reminders"
            defaultChecked={settings.reminders}
          />
          Show reminders when I open PocketBill
        </label>
        <label>
          Remind me before a payment
          <select
            key={settings.reminderDays}
            name="days"
            defaultValue={settings.reminderDays}
          >
            {[1, 2, 3, 7, 14].map((n) => (
              <option key={n} value={n}>
                {n} days before
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Reminders appear inside the app. Automatic email reminders are not
          enabled.
        </p>
        <button className="primary" disabled={busy}>
          Save preferences
        </button>
      </form>
      <div className="settings-divider" />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          try {
            if (!demo) await signOut(auth);
            onLeave();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <LogOut size={17} />
        {demo ? "Leave demo" : "Sign out"}
      </button>
    </section>
  );
}
export function Help() {
  return (
    <section className="panel help-panel">
      <span className="eyebrow">A LITTLE LESS TO KEEP IN YOUR HEAD</span>
      <h2>Life has enough moving parts.</h2>
      <p>
        PocketBill brings recurring subscriptions and one-time bills into one
        private workspace. See what you owe, when it’s due, and what’s already
        taken care of — without a spreadsheet or a banking connection.
      </p>
      {[
        [
          "How do recurring bills work?",
          "A bill is a payment rule. Each month or year has its own invoice and payment status. Short months use their last day: a bill due on the 31st falls on February 28 or 29, then returns to March 31.",
        ],
        [
          "What happens when I edit a bill?",
          "Changes update unpaid invoices, including their name, amount, due date and category. Paid invoices keep their original details. Changing the schedule removes unpaid occurrences that no longer apply. Opening the app generates past and current invoices and next month; viewing another month generates its invoices.",
        ],
        [
          "What happens when I archive a bill?",
          "Archiving stops new invoices and hides unpaid future payments. Paid invoices and overdue payments stay in your history. Restore the bill from the Archived tab to resume it.",
        ],
        [
          "Can group members see my bills?",
          "Shared Bills counts only invoices marked as paid and dated on or before the group’s deadline. Mark a bill as paid on Overview to include it; uncheck it to remove it from totals and transfers. Only the account owner can access this workspace; adding a name does not send an invitation.",
        ],
        [
          "Does PocketBill pay bills for me?",
          "No. Marking a payment as paid only records that you have paid it elsewhere. PocketBill does not connect to your bank or transfer money.",
        ],
        [
          "Where are my records saved?",
          "Signed-in accounts use Firebase Authentication and Cloud Firestore with owner-only security rules. Demo data is stored separately in this browser. All amounts currently use euros.",
        ],
        [
          "Can I get email reminders or upload an invoice?",
          "These are planned extensions. This version provides in-app reminders and manual entry.",
        ],
      ].map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  );
}
