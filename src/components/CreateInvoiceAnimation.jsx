import { useEffect, useState } from "react";
import { motion as Motion } from "motion/react";
import { Save } from "lucide-react";
import styles from "./CreateInvoiceAnimation.module.css";

const STEPS = ["Enter details", "Add items", "Saved"];

const INDUSTRIES = ["Design", "Development", "Marketing", "Consulting", "Etc"];

const INITIAL_INVOICE = {
  number: "INV-2041",
  senderCompanyName: "",
  senderCompanyAddress: "",
  senderEmail: "",
  clientName: "",
  clientCompanyName: "",
  clientEmail: "",
  date: "",
  dueDate: "",
  currency: "USD",
};

const TYPE_MS = 65;
const DETAILS_SEQUENCE = [
  { field: "senderCompanyName", text: "Lumen Studio" },
  { field: "senderCompanyAddress", text: "12 Marina Boulevard, Lagos" },
  { field: "senderEmail", text: "hello@lumen.studio" },
  { field: "clientName", text: "Daniel Okafor" },
  { field: "clientCompanyName", text: "Northwind Studio" },
  { field: "clientEmail", text: "daniel@northwind.io" },
  { field: "date", text: "Nov 23, 2026" },
  { field: "dueDate", text: "Dec 23, 2026" },
];

const ITEM_LINES = [
  { description: "Brand identity design", quantity: "1", unitPrice: "2,400" },
  { description: "Website development", quantity: "2", unitPrice: "1,500" },
  { description: "Marketing strategy", quantity: "1", unitPrice: "1,200" },
  { description: "Consulting session", quantity: "3", unitPrice: "450" },
];

function formatMoney(n) {
  return `$${Number(n).toLocaleString("en-US")}`;
}

function lineTotal(qty, price) {
  const q = Number(String(qty).replace(/,/g, ""));
  const p = Number(String(price).replace(/,/g, ""));
  if (!q || !p) return "";
  return formatMoney(q * p);
}

export default function CreateInvoiceAnimation() {
  const [step, setStep] = useState(0);
  const [invoice, setInvoice] = useState(INITIAL_INVOICE);
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState(false);
  const [saveClicked, setSaveClicked] = useState(false);

  useEffect(() => {
    const timeouts = [];
    const intervals = [];
    let cancelled = false;

    const later = (fn, ms) => {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(t);
    };

    const typeField = (rowIndex, field, text, onDone, speed = 55) => {
      let i = 0;
      const id = setInterval(() => {
        i += 1;
        const val = text.slice(0, i);
        setRows((prev) => {
          const next = prev.map((r) => ({ ...r }));
          if (next[rowIndex]) next[rowIndex][field] = val;
          return next;
        });
        if (i >= text.length) {
          clearInterval(id);
          later(onDone, 220);
        }
      }, speed);
      intervals.push(id);
    };

    const typeNextDetail = (index) => {
      if (index >= DETAILS_SEQUENCE.length) {
        later(() => setStep(1), 700);
        return;
      }
      const { field, text } = DETAILS_SEQUENCE[index];
      let i = 0;
      const id = setInterval(() => {
        i += 1;
        setInvoice((p) => ({ ...p, [field]: text.slice(0, i) }));
        if (i >= text.length) {
          clearInterval(id);
          later(() => typeNextDetail(index + 1), 220);
        }
      }, TYPE_MS);
      intervals.push(id);
    };

    const typeRow = (index) => {
      if (index >= ITEM_LINES.length) {
        later(() => setStep(2), 1200);
        return;
      }
      const item = ITEM_LINES[index];
      setRows((prev) => [...prev, { description: "", quantity: "", unitPrice: "", total: "" }]);
      later(() => {
        typeField(index, "description", item.description, () => {
          typeField(index, "quantity", item.quantity, () => {
            typeField(index, "unitPrice", item.unitPrice, () => {
              setRows((prev) => {
                const next = prev.map((r) => ({ ...r }));
                if (next[index]) next[index].total = lineTotal(item.quantity, item.unitPrice);
                return next;
              });
              later(() => typeRow(index + 1), 550);
            }, 85);
          }, 110);
        }, 45);
      }, 250);
    };

    if (step === 0) {
      later(() => {
        setRows([]);
        setSaved(false);
        setSaveClicked(false);
        setInvoice(INITIAL_INVOICE);
        typeNextDetail(0);
      }, 0);
    } else if (step === 1) {
      later(() => {
        setRows([]);
        typeRow(0);
      }, 0);
    } else if (step === 2) {
      // wait for save click
    }

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [step]);

  useEffect(() => {
    if (step === 2 && saveClicked && !saved) {
      const t = setTimeout(() => setSaved(true), 900);
      return () => clearTimeout(t);
    }
  }, [step, saveClicked, saved]);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => {
        setStep(0);
        setRows([]);
        setSaved(false);
        setSaveClicked(false);
        setInvoice(INITIAL_INVOICE);
      }, 4200);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const total = rows.reduce((sum, r) => {
    const q = Number(String(r.quantity).replace(/,/g, ""));
    const p = Number(String(r.unitPrice).replace(/,/g, ""));
    if (!q || !p || !r.total) return sum;
    return sum + q * p;
  }, 0);

  return (
    <div className={styles.stage}>
      <div className={styles.actStack}>
        {step === 0 && (
          <Motion.section
            className={`${styles.act} ${styles.actDetails}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
          >
            <p className={styles.actLabel}>Details</p>
            <div className={styles.actBox}>
              <span className={styles.actTag}>Sender</span>
              <strong className={styles.actValue}>{invoice.senderCompanyName || "\u00A0"}</strong>
              <span className={styles.actSmall}>{invoice.senderCompanyAddress || "\u00A0"}</span>
              <span className={styles.actSmall}>{invoice.senderEmail || "\u00A0"}</span>
              <div className={styles.actDivider} />
              <span className={styles.actTag}>Client</span>
              <strong className={styles.actValue}>{invoice.clientCompanyName || "\u00A0"}</strong>
              <span className={styles.actSmall}>{invoice.clientName || "\u00A0"}</span>
              <span className={styles.actSmall}>{invoice.clientEmail || "\u00A0"}</span>
              <span className={styles.actSmall}>
                {[invoice.date, invoice.dueDate].filter(Boolean).join("  ·  ") || "\u00A0"}
              </span>
            </div>
          </Motion.section>
        )}

        {step === 1 && (
          <Motion.section
            className={`${styles.act} ${styles.actItems}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className={styles.actLabel}>Add items</p>
            <div className={styles.tabs}>
              {INDUSTRIES.map((ind, i) => (
                <span key={ind} className={`${styles.tab} ${i === 0 ? styles.tabActive : ""}`}>
                  {ind}
                </span>
              ))}
            </div>
            <div className={styles.tableWrap}>
              <div className={styles.tableHead}>
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>Line total</span>
              </div>
              {rows.map((row, i) => {
                const isActive = i === rows.length - 1 && !row.total;
                const inDesc = isActive && !row.quantity;
                const inQty = isActive && row.quantity !== "" && !row.unitPrice;
                const inPrice = isActive && row.unitPrice !== "" && !row.total;
                return (
                  <div key={i} className={styles.tableRow}>
                    <span className={styles.cellDesc}>
                      {row.description}
                      {inDesc ? <span className={styles.cursor} /> : null}
                    </span>
                    <span>
                      {row.quantity}
                      {inQty ? <span className={styles.cursor} /> : null}
                    </span>
                    <span>
                      {row.unitPrice ? `$${row.unitPrice}` : ""}
                      {inPrice ? <span className={styles.cursor} /> : null}
                    </span>
                    <span className={styles.cellTotal}>{row.total}</span>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <div className={styles.tableRowEmpty}>
                  <span className={styles.cursor} />
                </div>
              )}
            </div>
          </Motion.section>
        )}

        {step === 2 && (
          <Motion.section
            className={styles.act}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Motion.div
              className={styles.receipt}
              initial={{ opacity: 0, y: -36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              <div className={styles.receiptHead}>
                <div>
                  <p className={styles.receiptBrand}>Sabiquot</p>
                  <p className={styles.receiptMeta}>Invoice {invoice.number}</p>
                </div>
                <div className={styles.receiptMetaRight}>
                  <p>{invoice.date}</p>
                  <p>Due {invoice.dueDate}</p>
                </div>
              </div>
              <div className={styles.receiptParties}>
                <div>
                  <p className={styles.receiptTag}>From</p>
                  <p className={styles.receiptName}>{invoice.senderCompanyName}</p>
                  <p className={styles.receiptSmall}>{invoice.clientCompanyName ? invoice.senderEmail : ""}</p>
                </div>
                <div>
                  <p className={styles.receiptTag}>To</p>
                  <p className={styles.receiptName}>{invoice.clientCompanyName}</p>
                  <p className={styles.receiptSmall}>{invoice.clientName}</p>
                </div>
              </div>
              <div className={styles.receiptLines}>
                {ITEM_LINES.map((item) => (
                  <div key={item.description} className={styles.receiptLine}>
                    <span>{item.description}</span>
                    <span>{formatMoney(Number(item.unitPrice.replace(/,/g, "")) * Number(item.quantity))}</span>
                  </div>
                ))}
              </div>
              <div className={styles.receiptTotal}>
                <span>Total</span>
                <span>{formatMoney(total || 10650)}</span>
              </div>
            </Motion.div>

            <div className={styles.actSaveWrap}>
              <Motion.button
                type="button"
                className={styles.actSave}
                onClick={() => setSaveClicked(true)}
                animate={saveClicked ? { scale: 0.96 } : { scale: [1, 1.04, 1] }}
                transition={saveClicked ? { duration: 0.15 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <Save size={18} />
                {saved ? "Invoice created" : "Create Invoice"}
              </Motion.button>
            </div>
          </Motion.section>
        )}
      </div>

      <div className={styles.stageCaption}>
        <Motion.span
          className={styles.stageDot}
          animate={{ scale: step === 0 ? [1, 1.35, 1] : 1 }}
          transition={{ duration: 1.6, repeat: step === 0 ? Infinity : 0 }}
        />
        <Motion.span
          className={styles.stageCaptionText}
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          {STEPS[step]}
        </Motion.span>
      </div>
    </div>
  );
}
