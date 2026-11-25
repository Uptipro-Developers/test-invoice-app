import { useState, useEffect } from "react";
import { FileText, Plus, Search, CheckCircle2, Edit, Clock, XCircle } from "lucide-react";
import styles from "./InvoicesPage.module.css";
import { API_BASE_URL } from "../utils/apiClient";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "saved", label: "Saved" },
  { id: "submitted", label: "Submitted" },
];

const statusConfig = {
  saved: { label: "Saved", className: "saved", icon: CheckCircle2 },
  draft: { label: "Draft", className: "draft", icon: Edit },
  negotiating: { label: "Negotiating", className: "negotiating", icon: Clock },
  accepted: { label: "Approved", className: "accepted", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "rejected", icon: XCircle },
  quote_submitted: { label: "Submitted", className: "submitted", icon: Clock },
  finalized: { label: "Finalized", className: "accepted", icon: CheckCircle2 },
};

export default function InvoicesPage({ profile, onNavigate }) {
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!profile?.id) { queueMicrotask(() => setLoading(false)); return; }
    queueMicrotask(() => setLoading(true));
    fetch(`${API_BASE_URL}/api/invoices/by-profile/${profile.id}`)
      .then((res) => { if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`); return res.json(); })
      .then((data) => { setInvoices(Array.isArray(data) ? data : (data.invoices ?? [])); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [profile?.id]);

  function openInvoice(id) {
    window.history.pushState({}, "", `/?id=${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function formatAmount(amount, currency) {
    if (amount == null) return "—";
    try { return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount); }
    catch { return `${currency || ""} ${Number(amount).toLocaleString()}`; }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    try { return new Date(dateStr).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return dateStr; }
  }

  const filtered = invoices.filter((inv) => {
    const matchesFilter =
      filter === "all" ? true :
      filter === "saved" ? (inv.status === "saved" || !inv.status) :
      filter === "drafts" ? inv.status === "draft" :
      filter === "submitted" ? inv.status === "quote_submitted" : true;
    const q = search.toLowerCase();
    const matchesSearch = !q || [inv.invoice_number, inv.client_email, inv.sender_company_name, inv.payload?.clientName, inv.payload?.clientCompanyName]
      .some((v) => String(v || "").toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.id] = invoices.filter((inv) =>
      f.id === "all" ? true :
      f.id === "saved" ? (inv.status === "saved" || !inv.status) :
      f.id === "drafts" ? inv.status === "draft" :
      f.id === "submitted" ? inv.status === "quote_submitted" : true
    ).length;
    return acc;
  }, {});

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Invoices</p>
          <h1 className={styles.title}>My invoices</h1>
          <p className={styles.subtitle}>Track drafts, saved invoices, and submissions in one place.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => onNavigate?.("main")}>
          <Plus size={18} /> New invoice
        </button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button key={f.id} className={`${styles.filterBtn} ${filter === f.id ? styles.filterActive : ""}`} onClick={() => setFilter(f.id)}>
              {f.label} <span className={styles.filterCount}>{counts[f.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input className={styles.searchInput} placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {!profile && <Empty icon="🔐" title="Sign in to view invoices" text="Create an account or sign in to access your invoices." />}
      {profile && loading && <div className={styles.loading}><div className={styles.loader} /><p>Loading invoices...</p></div>}
      {profile && error && <Empty icon="⚠️" title="Couldn't load invoices" text={error} />}
      {profile && !loading && !error && filtered.length === 0 && (
        <Empty
          icon="📄"
          title={search ? "No matching invoices" : "No invoices yet"}
          text={search ? `No results for "${search}". Try a different search.` : "Create your first invoice and it will show up here."}
          action={!search && <button className={styles.primaryBtn} onClick={() => onNavigate?.("main")}><Plus size={18} />Create invoice</button>}
        />
      )}

      {profile && !loading && !error && filtered.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice</th><th>Client</th><th>Amount</th><th>Status</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const st = statusConfig[inv.status] || statusConfig.saved;
                const Icon = st.icon;
                return (
                  <tr key={inv.id} onClick={() => openInvoice(inv.id)} className={styles.row}>
                    <td><span className={styles.invoiceNum}>{inv.invoice_number || "—"}</span></td>
                    <td>
                      <div className={styles.clientCell}>
                        <span className={styles.clientName}>{inv.payload?.clientName || inv.client_email || "—"}</span>
                        <span className={styles.clientCompany}>{inv.payload?.clientCompanyName || inv.sender_company_name || ""}</span>
                      </div>
                    </td>
                    <td className={styles.amount}>{formatAmount(inv.total, inv.currency)}</td>
                    <td><span className={`${styles.badge} ${styles[st.className]}`}><Icon size={13} />{st.label}</span></td>
                    <td className={styles.date}>{formatDate(inv.created_at)}</td>
                    <td><span className={styles.viewLink}>View</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({ icon, title, text, action }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>{icon}</div>
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyText}>{text}</p>
      {action}
    </div>
  );
}
