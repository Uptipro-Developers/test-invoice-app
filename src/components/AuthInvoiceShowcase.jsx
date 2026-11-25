import { motion as Motion } from "motion/react";
import styles from "./AuthInvoiceShowcase.module.css";

const ITEMS = [
  ["Brand identity", "$2,400"],
  ["Web development", "$3,000"],
  ["Art direction", "$1,350"],
];

export default function AuthInvoiceShowcase() {
  return (
    <div className={styles.panel}>
      <div className={styles.yellowBlock} aria-hidden="true" />
      <div className={styles.ring} aria-hidden="true" />

      <header className={styles.top}>
        <p className={styles.kicker}>Sabiquot</p>
        <h2 className={styles.headline}>
          <span>Invoices that</span>
          <span className={styles.headlineAccent}>get paid.</span>
        </h2>
      </header>

      <div className={styles.stage}>
        <Motion.div
          className={`${styles.paper} ${styles.paperBack}`}
          initial={{ opacity: 0, y: 30, rotate: -8 }}
          animate={{ opacity: 1, y: 0, rotate: -6 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.paperTop}>
            <span className={styles.paperLabel}>Invoice</span>
            <span className={styles.paperMuted}>INV-2042</span>
          </div>
          <div className={styles.paperLine}><span>Strategy sprint</span><span>$1,800</span></div>
          <div className={styles.paperLine}><span>UI design</span><span>$2,200</span></div>
          <div className={styles.paperTotal}><span>Total</span><span>$4,000</span></div>
        </Motion.div>

        <Motion.div
          className={`${styles.paper} ${styles.paperFront}`}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.paperTop}>
            <div>
              <p className={styles.paperBrand}>SABIQUOT</p>
              <p className={styles.paperTitle}>INV-2041</p>
            </div>
            <span className={styles.paid}>Paid</span>
          </div>
          <div className={styles.paperMeta}>
            <div><p className={styles.paperTag}>From</p><p className={styles.paperName}>Lumen Studio</p></div>
            <div><p className={styles.paperTag}>To</p><p className={styles.paperName}>Northwind Studio</p></div>
          </div>
          <div className={styles.paperLines}>
            {ITEMS.map(([label, amount]) => (
              <div key={label} className={styles.paperLine}>
                <span>{label}</span><span>{amount}</span>
              </div>
            ))}
          </div>
          <div className={styles.paperTotal}><span>Total</span><span>$6,750</span></div>
        </Motion.div>

        <Motion.div
          className={styles.stamp}
          initial={{ opacity: 0, scale: 0.8, rotate: 12 }}
          animate={{ opacity: 1, scale: 1, rotate: 10 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span>Sent in</span>
          <strong>2 min</strong>
        </Motion.div>
      </div>

      <p className={styles.footerNote}>
        Create, send, and track invoices in one calm workspace.
      </p>
    </div>
  );
}
