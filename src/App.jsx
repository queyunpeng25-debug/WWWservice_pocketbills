import React, { useState, useEffect, useRef } from "react";
import {
  Home,
  CalendarDays,
  List,
  Users,
  Settings,
  Plus,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Bell,
  Check,
  X,
  Wallet,
  Sun,
  Moon,
  CircleHelp,
  ScanLine,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, configured } from "./firebase";
import {
  demoData,
  emptyData,
  saveDemo,
  subscribe,
  saveRecord,
  deleteGroup,
  saveBill,
  deleteBill,
  saveSettings,
  ensureInvoice,
  setPayment,
  setPayer,
} from "./store";
import {
  today,
  money,
  monthLabel,
  shiftMonth,
  daysUntil,
  status,
  invoicesForMonth,
  missingInvoices,
  editedInvoice,
} from "./domain";
import AuthScreen, { friendlyError } from "./AuthScreen";
import {
  Modal,
  InvoiceList,
  SharedBillsSummary,
  Calendar,
  BillForm,
  GroupForm,
  ImportPanel,
  MatchBanner,
} from "./components";
import { matchExisting, findAmounts } from "./importer";
import { Bills, Groups, Preferences, Help } from "./views";

const pages = {
  home: ["Overview", Home],
  bills: ["My bills", List],
  calendar: ["Calendar", CalendarDays],
  groups: ["Shared Bills", Users],
  settings: ["Settings", Settings],
  help: ["Help & about", CircleHelp],
};
/** Central controller isolates account data and performs persistence before success feedback. */
export default function App() {
  const [user, setUser] = useState(null),
    [demo, setDemo] = useState(false),
    [authReady, setAuthReady] = useState(!configured),
    [data, setData] = useState(emptyData),
    [loaded, setLoaded] = useState(false),
    [page, setPage] = useState("home"),
    [month, setMonth] = useState(today().slice(0, 7)),
    [filter, setFilter] = useState("All"),
    [selectedDay, setSelectedDay] = useState(""),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [groupFilter, setGroupFilter] = useState("All"),
    [dragging, setDragging] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const pendingInvoices = useRef(new Set());
  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(auth, (u) => {
      // Clear the old workspace in the same render as an identity change.
      setLoaded(false);
      setData(emptyData());
      setModal(null);
      setUser(u);
      setAuthReady(true);
      setError("");
    });
  }, []);
  useEffect(() => {
    setLoaded(false);
    setData(emptyData());
    if (demo) {
      setData(demoData());
      setLoaded(true);
      return;
    }
    if (!user) return;
    const received = new Set();
    let active = true;
    const unsubscribe = subscribe(
      user.uid,
      (kind, value) => {
        if (!active) return;
        setData((d) => ({ ...d, [kind]: value }));
        received.add(kind);
        if (received.size === 4) setLoaded(true);
      },
      (err) => setError(friendlyError(err)),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user, demo]);
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.dark
      ? "dark"
      : "light";
  }, [data.settings.dark]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  // Generate only missing invoice snapshots; a transaction protects concurrent devices.
  useEffect(() => {
    if (!loaded) return;
    const next = missingInvoices(data.bills, data.invoices, month).filter(
      (i) => !pendingInvoices.current.has(`${user?.uid}:${i.id}`),
    );
    if (!next.length) return;
    if (demo) {
      const updated = { ...data, invoices: [...data.invoices, ...next] };
      try {
        saveDemo(updated);
        setData(updated);
      } catch {
        setError("Browser storage is unavailable. Changes could not be saved.");
      }
    } else {
      next.forEach((i) => pendingInvoices.current.add(`${user.uid}:${i.id}`));
      Promise.all(
        next.map((i) =>
          ensureInvoice(user.uid, i).finally(() =>
            pendingInvoices.current.delete(`${user.uid}:${i.id}`),
          ),
        ),
      ).catch((err) => setError(friendlyError(err)));
    }
  }, [loaded, month, data.bills, data.invoices, demo, user]);
  async function action(fn, success) {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (success) setMessage(success);
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function write(kind, record) {
    if (demo) {
      const current = dataRef.current;
      const updated = {
        ...current,
        [kind]:
          kind === "settings"
            ? record
            : [...current[kind].filter((r) => r.id !== record.id), record],
      };
      saveDemo(updated);
      dataRef.current = updated;
      setData(updated);
    } else if (kind === "settings") await saveSettings(user.uid, record);
    else await saveRecord(user.uid, kind, record);
  }
  function navigate(next) {
    setPage(next);
    setFilter("All");
    setGroupFilter("All");
    setSelectedDay("");
  }
  async function togglePaid(invoice) {
    await action(
      () =>
        demo
          ? write("invoices", { ...invoice, paid: !invoice.paid })
          : setPayment(user.uid, invoice, !invoice.paid),
      invoice.paid ? "Payment reopened" : "Payment marked as paid",
    );
  }
  const blankBill = () => ({
    id: crypto.randomUUID(),
    name: "",
    amountCents: 0,
    startDate: selectedDay || today(),
    repeat: "Monthly",
    category: "Utilities",
    groupId: "",
    archived: false,
  });
  /** `options.pending` is a file or text to import; `scan` focuses the import step. */
  function newBill(options = {}) {
    setModal({
      type: "bill",
      record: blankBill(),
      isNew: true,
      scan: !!options.scan || !!options.pending,
      pending: options.pending,
    });
  }
  // Imports pre-fill the ordinary form; saving still goes through validateBill + rules.
  function applyImport(result) {
    setModal((m) =>
      m?.type === "bill" && m.isNew
        ? {
            ...m,
            record: { ...m.record, ...result.draft },
            imported: { ...result, nonce: crypto.randomUUID() },
            match: matchExisting(result.draft, dataRef.current.bills),
          }
        : m,
    );
  }
  function clearImport() {
    setModal((m) =>
      m?.type === "bill" && m.isNew
        ? {
            ...m,
            record: { ...blankBill(), id: m.record.id },
            imported: null,
            match: null,
          }
        : m,
    );
  }
  /** Files dropped or pasted anywhere open (or feed) the import step. */
  function routeImport(input) {
    if (!loaded) return false;
    const pending = { input, nonce: crypto.randomUUID() };
    if (!modal) newBill({ pending });
    else if (modal.type === "bill" && modal.isNew && !modal.imported)
      setModal((m) => ({ ...m, pending }));
    else return false;
    return true;
  }
  const routeRef = useRef(routeImport);
  routeRef.current = routeImport;
  useEffect(() => {
    const hasFiles = (e) =>
      [...(e.dataTransfer?.types || [])].includes("Files");
    let depth = 0;
    const enter = (e) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e) => hasFiles(e) && e.preventDefault();
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // never navigate away to the dropped file
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) routeRef.current(file);
    };
    const paste = (e) => {
      const file = [...(e.clipboardData?.files || [])][0];
      const editing = e.target.closest?.(
        "input, textarea, select, [contenteditable]",
      );
      if (file && routeRef.current(file)) return e.preventDefault();
      if (editing) return;
      // Only treat pasted text as a bill when it contains a currency amount.
      const text = e.clipboardData?.getData("text") || "";
      if (findAmounts(text).length && routeRef.current(text))
        e.preventDefault();
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, []);
  const rows = invoicesForMonth(data.bills, data.invoices, month),
    visible = rows.filter(
      (i) =>
        (filter === "All" || status(i) === filter) &&
        (!selectedDay || i.dueDate === selectedDay),
    );
  const total = rows.reduce((s, i) => s + i.amountCents, 0),
    paid = rows.filter((i) => i.paid).reduce((s, i) => s + i.amountCents, 0);
  const reminders = data.invoices.filter(
    (i) =>
      !i.paid &&
      daysUntil(i.dueDate) <= data.settings.reminderDays &&
      (!data.bills.find((b) => b.id === i.billId)?.archived ||
        i.dueDate < today()),
  );
  const monthControl = (
    <div className="month-control">
      <button
        aria-label="Previous month"
        onClick={() => {
          setMonth(shiftMonth(month, -1));
          setSelectedDay("");
        }}
      >
        <ChevronLeft size={16} />
      </button>
      <span>{monthLabel(month)}</span>
      <button
        aria-label="Next month"
        onClick={() => {
          setMonth(shiftMonth(month, 1));
          setSelectedDay("");
        }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
  if (!authReady) return <div className="loading">Opening your workspace…</div>;
  if (!user && !demo)
    return (
      <AuthScreen
        onDemo={() => {
          setDemo(true);
          navigate("home");
        }}
      />
    );
  const name = data.settings.name || user?.email?.split("@")[0] || "Alex";
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => navigate("home")}>
          <span className="brand-icon">
            <Wallet />
          </span>
          Pocket Bill
          <span className="brand-dot" />
        </a>
        <span className="side-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {Object.entries(pages)
            .slice(0, 4)
            .map(([key, [label, Icon]]) => (
              <button
                key={key}
                className={`nav-item ${page === key ? "active" : ""}`}
                aria-current={page === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon size={19} />
                {label}
                {page === key && <i />}
              </button>
            ))}
        </nav>
        <button className="primary side-add" onClick={() => newBill()}>
          <Plus size={19} />
          New bill
        </button>
        <button
          className="secondary side-scan"
          onClick={() => newBill({ scan: true })}
        >
          <ScanLine size={18} />
          Scan a bill
        </button>
        <div className="side-bottom">
          <div className="little-note">
            <span>✳</span>
            <strong>
              A little organised.
              <br />A lot more at ease.
            </strong>
            <p>
              Your next payment doesn’t
              <br />
              have to be a surprise.
            </p>
          </div>
          {["settings", "help"].map((key) => {
            const [label, Icon] = pages[key];
            return (
              <button
                key={key}
                className={`nav-item ${page === key ? "active" : ""}`}
                onClick={() => navigate(key)}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
          <button className="side-profile" onClick={() => navigate("settings")}>
            <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{name}</strong>
              <small>{demo ? "Demo workspace" : "Personal workspace"}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your workspace <span>/</span>
            <strong>{pages[page][0]}</strong>
          </div>
          <div className="top-actions">
            <span className="mode-badge">
              {demo ? "DEMO · LOCAL ONLY" : "PRIVATE WORKSPACE"}
            </span>
            <button
              className="icon-button"
              aria-label={
                data.settings.dark ? "Use light theme" : "Use dark theme"
              }
              onClick={() =>
                action(() =>
                  write("settings", {
                    ...data.settings,
                    dark: !data.settings.dark,
                  }),
                )
              }
            >
              {data.settings.dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="notification-button"
              aria-label={`View ${reminders.length} payment reminders`}
              onClick={() => setModal({ type: "reminders" })}
            >
              <Bell size={20} />
              {data.settings.reminders && reminders.length > 0 && <i />}
            </button>
            <span className="avatar small">
              {name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "home"
                  ? "A LITTLE CLARITY FOR YOUR EVERYDAY"
                  : "EVERYTHING IN ITS PLACE"}
              </span>
              <h1>
                {page === "home"
                  ? `Let’s keep life in balance, ${name}.`
                  : pages[page][0]}
              </h1>
              <p>
                {
                  {
                    home: "A clear view of your bills. A little more peace of mind.",
                    bills:
                      "All your bills and subscriptions, neatly in one place.",
                    calendar: "See what’s coming. Make room for what matters.",
                    groups: "Manage groups, shared expenses, and balances.",
                    settings: "Make PocketBill feel a little more like you.",
                    help: "Simple answers for a calmer financial routine.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {["home", "calendar"].includes(page) && monthControl}
              {page === "bills" && (
                <div className="button-pair">
                  <button
                    className="secondary"
                    onClick={() => newBill({ scan: true })}
                  >
                    <ScanLine size={17} />
                    Scan a bill
                  </button>
                  <button className="primary" onClick={() => newBill()}>
                    <Plus size={17} />
                    New bill
                  </button>
                </div>
              )}
              {page === "groups" && (
                <button
                  className="primary"
                  onClick={() =>
                    setModal({
                      type: "group",
                      record: {
                        id: crypto.randomUUID(),
                        name: "",
                        members: ["You"],
                      },
                    })
                  }
                >
                  <Plus size={17} />
                  Create group
                </button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!loaded ? (
            <div className="panel empty">
              {error
                ? "Workspace could not load. Check your connection and Firebase configuration."
                : "Loading your bills…"}
            </div>
          ) : (
            <>
              {page === "home" && (
                <>
                  <div className="home-top">
                    <section className="total-card">
                      <ArrowUpRight
                        className="total-card-decoration"
                        size={200}
                        aria-hidden="true"
                      />
                      <div className="total-top">
                        <span>Your month at a glance</span>
                        <span>EUR · {monthLabel(month).split(" ")[0]}</span>
                      </div>
                      <div className="total-amount">{money(total)}</div>
                      <div className="total-sub">Total planned this month</div>
                      <div
                        className="progress"
                        role="progressbar"
                        aria-label="Paid portion of monthly bills"
                        aria-valuenow={
                          total ? Math.round((paid / total) * 100) : 0
                        }
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <i
                          style={{
                            width: `${total ? (paid / total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="total-bottom">
                        <span>
                          <b>{money(paid)}</b> paid
                        </span>
                        <span>
                          <b>{money(total - paid)}</b> to go
                        </span>
                      </div>
                    </section>
                    <div className="status-zone">
                      <div className="status-cards">
                        {[
                          ["Overdue", "☹", "Needs a little attention"],
                          ["Upcoming", "◔", "Coming up next"],
                          ["Paid", "☺", "All taken care of"],
                        ].map(([s, face, label]) => (
                          <button
                            key={s}
                            className={`status-card ${s.toLowerCase()} ${filter === s ? "selected" : ""}`}
                            onClick={() => setFilter(filter === s ? "All" : s)}
                            aria-pressed={filter === s}
                          >
                            <span className="count">
                              {rows.filter((i) => status(i) === s).length}
                            </span>
                            <span className="face">{face}</span>
                            <strong>{s}</strong>
                            <small>{label}</small>
                          </button>
                        ))}
                      </div>
                      <p className="status-note">
                        A small check-in today. A lighter mind tomorrow.
                      </p>
                    </div>
                  </div>
                  {data.settings.reminders && reminders.length > 0 && (
                    <div className="alert">
                      <Bell size={17} />
                      <span>
                        <strong>A friendly heads-up.</strong> {reminders.length}{" "}
                        payments overdue or due within{" "}
                        {data.settings.reminderDays} days.
                      </span>
                      <button onClick={() => setModal({ type: "reminders" })}>
                        Take a look →
                      </button>
                    </div>
                  )}
                  <div className="home-grid">
                    <section className="panel">
                      <div className="panel-header">
                        <div>
                          <h2>Your payments</h2>
                          <small>
                            {filter === "All"
                              ? "One payment at a time. You’ve got this."
                              : `${filter} payments this month`}
                          </small>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("bills")}
                        >
                          Manage bills <ArrowUpRight size={14} />
                        </button>
                      </div>
                      <InvoiceList
                        groups={data.groups}
                        rows={visible}
                        busy={busy}
                        onPay={togglePaid}
                      />
                      {filter !== "All" && (
                        <button
                          className="text-button padded"
                          onClick={() => setFilter("All")}
                        >
                          Show all payments
                        </button>
                      )}
                    </section>
                    <div className="right-column">
                      <section className="panel mini-calendar">
                        <Calendar
                          month={month}
                          rows={rows}
                          selected={selectedDay}
                          onSelect={(d) =>
                            setSelectedDay(selectedDay === d ? "" : d)
                          }
                          compact
                        />
                        {selectedDay && (
                          <button
                            className="text-button"
                            onClick={() => setSelectedDay("")}
                          >
                            Clear selected day
                          </button>
                        )}
                      </section>
                      <SharedBillsSummary
                        groups={data.groups}
                        bills={data.bills}
                        invoices={data.invoices}
                        onView={() => navigate("groups")}
                      />
                    </div>
                  </div>
                </>
              )}
              {page === "calendar" && (
                <>
                  <div className="panel calendar-panel">
                    <Calendar
                      month={month}
                      rows={rows}
                      selected={selectedDay}
                      onSelect={(d) =>
                        setSelectedDay(selectedDay === d ? "" : d)
                      }
                    />
                  </div>
                  <section className="panel calendar-payments">
                    <div className="panel-header">
                      <h2>
                        {selectedDay
                          ? `Payments on ${selectedDay}`
                          : "This month’s payments"}
                      </h2>
                      {selectedDay && (
                        <button
                          className="text-button"
                          onClick={() => setSelectedDay("")}
                        >
                          Show whole month
                        </button>
                      )}
                      <button className="secondary" onClick={() => newBill()}>
                        <Plus size={16} />
                        Add bill
                      </button>
                    </div>
                    <InvoiceList
                      groups={data.groups}
                      rows={visible}
                      busy={busy}
                      onPay={togglePaid}
                    />
                  </section>
                </>
              )}
              {page === "bills" && (
                <Bills
                  bills={data.bills}
                  groups={data.groups}
                  initialGroup={groupFilter}
                  busy={busy}
                  onNew={() => newBill()}
                  onEdit={(record) => setModal({ type: "bill", record })}
                  onDelete={(bill) => {
                    if (busy || !bill.archived) return;
                    action(async () => {
                      if (demo) {
                        const current = dataRef.current;
                        const updated = {
                          ...current,
                          bills: current.bills.filter((b) => b.id !== bill.id),
                          invoices: current.invoices.filter(
                            (i) => i.billId !== bill.id,
                          ),
                        };
                        saveDemo(updated);
                        dataRef.current = updated;
                        setData(updated);
                      } else await deleteBill(user.uid, bill.id);
                    }, "Bill deleted");
                  }}
                  onArchive={(b) =>
                    action(
                      () => write("bills", { ...b, archived: !b.archived }),
                      b.archived
                        ? "Bill restored"
                        : "Bill archived; payment history retained",
                    )
                  }
                />
              )}
              {page === "groups" && (
                <Groups
                  groups={data.groups}
                  bills={data.bills}
                  invoices={data.invoices}
                  busy={busy}
                  onAssign={(invoice, paidBy) =>
                    action(
                      () =>
                        demo
                          ? write("invoices", { ...invoice, paidBy })
                          : setPayer(user.uid, invoice, paidBy),
                      "Payer saved",
                    )
                  }
                  onEdit={(record) => setModal({ type: "group", record })}
                  onArchive={(group) =>
                    action(
                      () =>
                        write("groups", {
                          ...group,
                          archived: !group.archived,
                        }),
                      group.archived
                        ? "Group restored"
                        : "Group archived; bills and payment history retained",
                    )
                  }
                  onDelete={(group) => {
                    if (busy || !group.archived) return;
                    action(async () => {
                      if (demo) {
                        const current = dataRef.current;
                        const detach = (record) =>
                          record.groupId === group.id
                            ? { ...record, groupId: "", paidBy: "" }
                            : record;
                        const updated = {
                          ...current,
                          groups: current.groups.filter(
                            (g) => g.id !== group.id,
                          ),
                          bills: current.bills.map(detach),
                          invoices: current.invoices.map(detach),
                        };
                        saveDemo(updated);
                        dataRef.current = updated;
                        setData(updated);
                      } else await deleteGroup(user.uid, group.id);
                    }, "Group deleted; bills kept as personal bills");
                  }}
                  onView={(id) => {
                    navigate("bills");
                    setGroupFilter(id);
                  }}
                />
              )}
              {page === "settings" && (
                <Preferences
                  settings={data.settings}
                  demo={demo}
                  user={user}
                  busy={busy}
                  onSave={(s) =>
                    action(() => write("settings", s), "Preferences saved")
                  }
                  onLeave={() => {
                    setDemo(false);
                    setData(emptyData());
                    navigate("home");
                  }}
                />
              )}
              {page === "help" && <Help />}
            </>
          )}
        </main>
        <footer>
          <span>Pocket Bill</span>
          <span>A little organised. A lot more at ease.</span>
          <button onClick={() => navigate("help")}>Help & about ↗</button>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {Object.entries(pages)
          .slice(0, 5)
          .map(([key, [label, Icon]]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
      </nav>
      {dragging && !modal && loaded && (
        <div className="drop-overlay" aria-hidden="true">
          <ScanLine size={34} />
          Drop to import a bill
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {modal?.type === "bill" && (
        <Modal
          title={
            modal.imported
              ? "Review imported bill"
              : modal.isNew
                ? "Add a new bill"
                : "Edit bill"
          }
          onClose={() => !busy && setModal(null)}
        >
          {modal.isNew && (
            <ImportPanel
              pending={modal.pending}
              result={modal.imported}
              dragging={dragging}
              autoFocus={modal.scan}
              onResult={applyImport}
              onClear={clearImport}
            />
          )}
          {modal.match &&
            (() => {
              const bill = modal.match,
                month = modal.record.startDate.slice(0, 7);
              const invoice =
                data.invoices.find(
                  (i) => i.billId === bill.id && i.dueDate.startsWith(month),
                ) ||
                data.invoices.find(
                  (i) =>
                    i.billId === bill.id &&
                    i.dueDate.startsWith(today().slice(0, 7)),
                );
              return (
                <MatchBanner
                  bill={bill}
                  invoice={invoice}
                  draft={modal.record}
                  busy={busy}
                  onPaid={async () => {
                    await togglePaid(invoice);
                    setModal(null);
                  }}
                  onUpdate={() =>
                    setModal({
                      type: "bill",
                      record: {
                        ...bill,
                        amountCents: modal.record.amountCents,
                      },
                    })
                  }
                  onDismiss={() => setModal((m) => ({ ...m, match: null }))}
                />
              );
            })()}
          <BillForm
            key={modal.imported?.nonce || modal.record.id}
            imported={modal.imported}
            autoFocusName={!modal.scan}
            record={modal.record}
            groups={data.groups}
            busy={busy}
            onSave={async (record) => {
              setBusy(true);
              try {
                if (demo) {
                  const current = dataRef.current;
                  const updated = {
                    ...current,
                    bills: [
                      ...current.bills.filter((b) => b.id !== record.id),
                      record,
                    ],
                    invoices: current.invoices
                      .map((i) => editedInvoice(record, i))
                      .filter(Boolean),
                  };
                  saveDemo(updated);
                  dataRef.current = updated;
                  setData(updated);
                } else await saveBill(user.uid, record);
                setMessage("Bill saved");
                setModal(null);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
      {modal?.type === "group" && (
        <Modal
          title={modal.record.name ? "Edit group" : "Create a group"}
          onClose={() => !busy && setModal(null)}
        >
          <GroupForm
            record={modal.record}
            knownMembers={[...new Set(data.groups.flatMap((g) => g.members))]}
            lockedMembers={[
              ...new Set(
                [...data.bills, ...data.invoices]
                  .filter((i) => i.groupId === modal.record.id)
                  .map((i) => i.paidBy)
                  .filter(Boolean),
              ),
            ]}
            busy={busy}
            onSave={async (record) => {
              setBusy(true);
              try {
                await write("groups", record);
                setMessage("Group saved");
                setModal(null);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
      {modal?.type === "reminders" && (
        <Modal title="A friendly heads-up" onClose={() => setModal(null)}>
          <p className="muted">
            Unpaid invoices overdue or due within {data.settings.reminderDays}{" "}
            days.
          </p>
          <InvoiceList
            groups={data.groups}
            rows={reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate))}
            busy={busy}
            onPay={togglePaid}
          />
        </Modal>
      )}
    </>
  );
}
