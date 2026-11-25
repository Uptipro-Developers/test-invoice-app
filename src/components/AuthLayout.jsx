import AuthInvoiceShowcase from "./AuthInvoiceShowcase";
import styles from "./AuthLayout.module.css";

export default function AuthLayout({ children }) {
  return (
    <div className={styles.shell}>
      <div className={styles.left}>
        <AuthInvoiceShowcase />
      </div>
      <div className={styles.right}>
        <div className={styles.rightInner}>
          <a href="/" className={styles.brandLink} aria-label="Sabiquot home">
            <img src="/logo-full.png" alt="sabiquot" className={styles.brandLogo} />
          </a>
          {children}
        </div>
      </div>
    </div>
  );
}
