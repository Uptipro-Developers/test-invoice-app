import { useState, useEffect } from "react";
import { Plus, FileText, Inbox, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import styles from "./Homepage.module.css";
import { API_BASE_URL } from "../utils/apiClient";

export default function Homepage({
  onCreateInvoice,
  onViewInvoices,
  onViewRequests,
  profile,
}) {
  const [stats, setStats] = useState({
    invoiceCount: 0,
    draftCount: 0,
    pendingCount: 0,
  });

  useEffect(() => {
    if (!profile?.id) return;
    fetch(`${API_BASE_URL}/api/profile/${profile.id}/stats`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setStats((s) => ({ ...s, ...data })))
      .catch(() => {});
  }, [profile?.id]);

  const firstName = profile?.name?.trim()?.split(/\s+/)[0] || "there";

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Dashboard</p>
          <h1 className={styles.title}>
            Good to see you, <span className={styles.nameAccent}>{firstName}</span>.
          </h1>
          <p className={styles.subtitle}>
            Create invoices, track drafts, and manage requests from one calm workspace.
          </p>
        </div>
        <button className={styles.primaryBtn} onClick={onCreateInvoice}>
          <Plus size={18} />
          Create invoice
        </button>
      </header>

      <section className={styles.statsGrid} aria-label="Quick stats">
        <div className={styles.statCard}>
          <div className={styles.statIcon}><FileText size={18} /></div>
          <div>
            <p className={styles.statValue}>{stats.invoiceCount || 0}</p>
            <p className={styles.statLabel}>Total invoices</p>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Clock size={18} /></div>
          <div>
            <p className={styles.statValue}>{stats.draftCount || 0}</p>
            <p className={styles.statLabel}>Drafts</p>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><CheckCircle2 size={18} /></div>
          <div>
            <p className={styles.statValue}>{stats.pendingCount || 0}</p>
            <p className={styles.statLabel}>Pending requests</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Quick actions</h2>
          <p className={styles.sectionSub}>Jump straight into what you need.</p>
        </div>
        <div className={styles.actionGrid}>
          <button className={styles.actionCard} onClick={onCreateInvoice}>
            <div className={styles.actionTop}>
              <span className={styles.actionIcon}><Plus size={20} /></span>
              <ArrowRight size={18} className={styles.actionArrow} />
            </div>
            <h3 className={styles.actionTitle}>Create invoice</h3>
            <p className={styles.actionText}>Build a professional invoice with line items, tax, and signature.</p>
          </button>

          <button className={styles.actionCard} onClick={onViewInvoices}>
            <div className={styles.actionTop}>
              <span className={styles.actionIcon}><FileText size={20} /></span>
              <ArrowRight size={18} className={styles.actionArrow} />
            </div>
            <h3 className={styles.actionTitle}>My invoices</h3>
            <p className={styles.actionText}>View, edit, and manage saved invoices and drafts.</p>
          </button>

          <button className={styles.actionCard} onClick={onViewRequests}>
            <div className={styles.actionTop}>
              <span className={styles.actionIcon}><Inbox size={20} /></span>
              <ArrowRight size={18} className={styles.actionArrow} />
            </div>
            <h3 className={styles.actionTitle}>Requests</h3>
            <p className={styles.actionText}>Review incoming requests and turn them into quotes or invoices.</p>
          </button>
        </div>
      </section>

      <section className={styles.tipBand}>
        <div>
          <p className={styles.tipKicker}>Getting started</p>
          <h2 className={styles.tipTitle}>Keep your invoicing simple.</h2>
          <p className={styles.tipText}>
            Start with a draft, add your client details, then export or send when it&apos;s ready. Your drafts and invoices stay organized in one place.
          </p>
        </div>
        <button className={styles.secondaryBtn} onClick={onCreateInvoice}>
          Start a draft
        </button>
      </section>
    </div>
  );
}
