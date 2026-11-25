import styles from "./DraftsPage.module.css";

export default function DraftsPage({ profile }) {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.kicker}>Invoices</p>
        <h1 className={styles.title}>Drafts</h1>
        <p className={styles.subtitle}>Invoices you’ve started but haven’t sent yet.</p>
      </header>

      {!profile ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔐</div>
          <h3 className={styles.emptyTitle}>Sign in to view drafts</h3>
          <p className={styles.emptyText}>Sign in to save and manage your draft invoices.</p>
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📝</div>
          <h3 className={styles.emptyTitle}>No drafts yet</h3>
          <p className={styles.emptyText}>When you save an invoice as a draft, it will appear here.</p>
        </div>
      )}
    </div>
  );
}
