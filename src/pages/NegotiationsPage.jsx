import { useState, useEffect } from "react";
import { MessageSquare, CheckCircle2, XCircle, Clock, Eye } from "lucide-react";
import styles from "./NegotiationsPage.module.css";
import { API_BASE_URL } from "../utils/apiClient";

const NEGOTIATION_STATUSES = new Set(["negotiating", "accepted", "rejected", "quote_submitted"]);
const statusConfig = {
  negotiating: { label: "Negotiating", cls: "negotiating", icon: Clock },
  accepted: { label: "Accepted", cls: "accepted", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "rejected", icon: XCircle },
  quote_submitted: { label: "Submitted", cls: "submitted", icon: Clock },
};

export default function NegotiationsPage({ profile }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profile?.id) { queueMicrotask(() => setLoading(false)); return; }
    queueMicrotask(() => setLoading(true));
    fetch(`${API_BASE_URL}/api/invoices/by-profile/${profile.id}?limit=50`)
      .then((r) => { if (!r.ok) throw new Error(`Failed to load (${r.status})`); return r.json(); })
      .then(({ invoices: data }) => { setInvoices((data || []).filter((inv) => NEGOTIATION_STATUSES.has(inv.status))); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [profile?.id]);

  function openInvoice(id) { window.location.assign(`/negotiation/${id}`); }
  function formatAmount(amount, currency) {
    if (amount == null) return "—";
    try { return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount); }
    catch { return `${currency || ""} ${Number(amount).toLocaleString()}`; }
  }
  function formatDate(d) { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-NG", { year:"numeric", month:"short", day:"numeric" }); } catch { return d; } }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.kicker}>Negotiations</p>
        <h1 className={styles.title}>Negotiations</h1>
        <p className={styles.subtitle}>Track counter-offers and negotiation status for your invoices.</p>
      </header>

      {!profile && <Empty icon="🔐" title="Sign in to view negotiations" text="Sign in to access your invoice negotiations." />}
      {profile && loading && <div className={styles.loading}><div className={styles.loader} /><p>Loading negotiations...</p></div>}
      {profile && error && <Empty icon="⚠️" title="Couldn't load negotiations" text={error} />}
      {profile && !loading && !error && invoices.length === 0 && <Empty icon="💬" title="No negotiations yet" text="When invoices enter negotiation, they’ll appear here." />}

      {profile && !loading && invoices.length > 0 && (
        <div className={styles.grid}>
          {invoices.map((inv) => {
            const st = statusConfig[inv.status] || statusConfig.negotiating;
            const Icon = st.icon;
            return (
              <article key={inv.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.invNum}>{inv.invoice_number || "Invoice"}</span>
                  <span className={`${styles.badge} ${styles[st.cls]}`}><Icon size={13} />{st.label}</span>
                </div>
                <dl className={styles.meta}>
                  <div><dt>Client</dt><dd>{inv.payload?.clientName || inv.client_email || "—"}</dd></div>
                  <div><dt>Company</dt><dd>{inv.payload?.clientCompanyName || "—"}</dd></div>
                  <div><dt>Amount</dt><dd className={styles.amount}>{formatAmount(inv.total, inv.currency)}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(inv.created_at)}</dd></div>
                </dl>
                <button className={styles.viewBtn} onClick={() => openInvoice(inv.id)}><Eye size={16} /> View details</button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, title, text }) {
  return <div className={styles.empty}><div className={styles.emptyIcon}>{icon}</div><h3 className={styles.emptyTitle}>{title}</h3><p className={styles.emptyText}>{text}</p></div>;
}
