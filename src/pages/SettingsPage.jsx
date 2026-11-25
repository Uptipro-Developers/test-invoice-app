import { useEffect, useMemo, useState } from "react";
import styles from "./SettingsPage.module.css";
import { API_BASE_URL } from "../utils/apiClient";
import { withDefaults, saveSettings } from "../utils/settings";
import { getMyInvoices } from "../utils/invoiceApi";

const SUPPORT_EMAIL = "support@sabiquot.com";
const HELP_CENTRE_URL = "https://freeinvoice.app/help";
const VIDEO_TUTORIALS_URL = "https://freeinvoice.app/tutorials";

export default function SettingsPage({ profile, onBack, onRetakeTour, onStartTutorial, onProfileChange }) {
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState(() => withDefaults(profile?.settings));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => { setSettings(withDefaults(profile?.settings)); }, [profile?.settings]);

  const tabs = useMemo(() => [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "privacy", label: "Privacy", icon: "🔒" },
    { id: "help", label: "Help", icon: "❓" },
  ], []);

  function flash(message, tone = "ok") { setStatus({ message, tone }); setTimeout(() => setStatus(null), 4000); }

  async function update(key, value) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (!profile?.id) { flash("Sign in to save your settings.", "error"); return; }
    setSaving(true);
    try {
      const updated = await saveSettings(profile.id, next);
      onProfileChange?.({ ...profile, ...updated, settings: next });
      flash("Saved.");
    } catch (err) {
      setSettings(settings);
      flash(err.message || "Could not save your settings.", "error");
    } finally { setSaving(false); }
  }

  const handleRetakeTour = () => { localStorage.removeItem("onboardingComplete"); onRetakeTour?.(); };

  async function exportData() {
    if (!profile?.id) return flash("Sign in to export your data.", "error");
    setBusyAction("export");
    try {
      const { invoices = [] } = await getMyInvoices({ limit: 1000, profileId: profile.id });
      const blob = new Blob([JSON.stringify({ profile: { ...profile, password_hash: undefined }, invoices }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `sabiquot-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.style.display = "none"; document.body.appendChild(a); a.click();
      requestAnimationFrame(() => { document.body.removeChild(a); URL.revokeObjectURL(url); });
      flash(`Exported ${invoices.length} invoice(s).`);
    } catch (err) { flash(err.message || "Could not export your data.", "error"); }
    finally { setBusyAction(null); }
  }

  async function changePassword() {
    if (!profile?.id) return flash("Sign in to change your password.", "error");
    if (!pw.current || !pw.next) return flash("Enter your current and new password.", "error");
    if (pw.next.length < 8) return flash("New password must be at least 8 characters.", "error");
    if (pw.next !== pw.confirm) return flash("New passwords do not match.", "error");
    setBusyAction("password");
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, currentPassword: pw.current, newPassword: pw.next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not change your password.");
      setPw({ current: "", next: "", confirm: "" }); setShowPasswordForm(false); flash("Password changed.");
    } catch (err) { flash(err.message || "Could not change your password.", "error"); }
    finally { setBusyAction(null); }
  }

  async function deleteAccount() {
    if (!profile?.id) return;
    setBusyAction("delete");
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/${profile.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete your account.");
      localStorage.removeItem("profile"); window.location.reload();
    } catch (err) { flash(err.message || "Could not delete your account.", "error"); setConfirmDelete(false); }
    finally { setBusyAction(null); }
  }

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={onBack}>← Back</button>
      <header className={styles.header}>
        <p className={styles.kicker}>Account</p>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Manage preferences, notifications, and account security.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button key={tab.id} className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`} onClick={() => setActiveTab(tab.id)}>
              <span className={styles.tabIcon}>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        <div className={styles.panel}>
          {status && <p className={styles.statusMsg} style={{ color: status.tone === "error" ? "#b91c1c" : "#166534" }}>{status.message}</p>}

          {activeTab === "general" && (
            <section>
              <h2 className={styles.sectionTitle}>General</h2>
              <SettingRow name="Language" desc="Choose your preferred language">
                <select className={styles.select} value={settings.language} disabled={saving} onChange={(e) => update("language", e.target.value)}>
                  <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option>
                </select>
              </SettingRow>
              <SettingRow name="Currency" desc="Default currency for new invoices">
                <select className={styles.select} value={settings.currency} disabled={saving} onChange={(e) => update("currency", e.target.value)}>
                  <option value="NGN">Nigerian Naira (₦)</option><option value="USD">US Dollar ($)</option><option value="EUR">Euro (€)</option><option value="GBP">British Pound (£)</option>
                </select>
              </SettingRow>
              <SettingRow name="Timezone" desc="Your local timezone">
                <select className={styles.select} value={settings.timezone} disabled={saving} onChange={(e) => update("timezone", e.target.value)}>
                  <option value="Africa/Lagos">West Africa Time</option><option value="UTC">UTC</option><option value="Europe/London">London</option><option value="America/New_York">New York</option>
                </select>
              </SettingRow>
            </section>
          )}

          {activeTab === "notifications" && (
            <section>
              <h2 className={styles.sectionTitle}>Notifications</h2>
              {[
                { key: "emailNotifications", name: "Email notifications", desc: "Receive invoice updates by email. Turning this off stops all notification emails." },
                { key: "invoiceReminders", name: "Invoice reminders", desc: "Get reminded about unpaid invoices." },
                { key: "negotiationAlerts", name: "Negotiation alerts", desc: "Emails when a counter-offer is made, accepted, or declined." },
              ].map((row) => (
                <SettingRow key={row.key} name={row.name} desc={row.desc}>
                  <label className={styles.toggle}>
                    <input type="checkbox" checked={settings[row.key] !== false}
                      disabled={saving || (row.key !== "emailNotifications" && settings.emailNotifications === false)}
                      onChange={(e) => update(row.key, e.target.checked)} />
                    <span className={styles.slider}></span>
                  </label>
                </SettingRow>
              ))}
              <p className={styles.settingDesc}>In-app notifications are always recorded — these control email delivery only.</p>
            </section>
          )}

          {activeTab === "privacy" && (
            <section>
              <h2 className={styles.sectionTitle}>Privacy &amp; security</h2>
              <SettingRow name="Two-factor authentication" desc="Not available yet — accounts are secured by password and email reset.">
                <button className={styles.btn} disabled>Coming soon</button>
              </SettingRow>
              <SettingRow name="Change password" desc="Update your password regularly">
                {!showPasswordForm ? (
                  <button className={styles.btn} onClick={() => setShowPasswordForm(true)}>Change</button>
                ) : (
                  <div className={styles.btnRow}>
                    <button className={styles.btn} onClick={() => { setShowPasswordForm(false); setPw({ current:"", next:"", confirm:"" }); }} disabled={busyAction==="password"}>Cancel</button>
                    <button className={styles.btnPrimary} onClick={changePassword} disabled={busyAction==="password"}>{busyAction==="password" ? "Saving…" : "Save"}</button>
                  </div>
                )}
              </SettingRow>
              {showPasswordForm && (
                <div className={styles.pwForm}>
                  {[["current","Current password"],["next","New password"],["confirm","Confirm new password"]].map(([key,label]) => (
                    <input key={key} type="password" className={styles.pwInput} placeholder={label} aria-label={label}
                      autoComplete={key==="current" ? "current-password":"new-password"} value={pw[key]}
                      onChange={(e) => setPw((p) => ({ ...p, [key]: e.target.value }))} />
                  ))}
                </div>
              )}
              <SettingRow name="Data export" desc="Download your profile and invoices as JSON">
                <button className={styles.btn} onClick={exportData} disabled={busyAction==="export"}>{busyAction==="export" ? "Exporting…" : "Export"}</button>
              </SettingRow>
              <div className={styles.cardDanger}>
                <div>
                  <h3 className={styles.settingNameDanger}>Delete account</h3>
                  <p className={styles.settingDesc}>{confirmDelete ? "This permanently deletes your account and invoices. This cannot be undone." : "Permanently delete your account and all data."}</p>
                </div>
                {confirmDelete ? (
                  <div className={styles.btnRow}>
                    <button className={styles.btn} onClick={() => setConfirmDelete(false)} disabled={busyAction==="delete"}>Cancel</button>
                    <button className={styles.btnDanger} onClick={deleteAccount} disabled={busyAction==="delete"}>{busyAction==="delete" ? "Deleting…" : "Confirm"}</button>
                  </div>
                ) : <button className={styles.btnDanger} onClick={() => setConfirmDelete(true)}>Delete</button>}
              </div>
            </section>
          )}

          {activeTab === "help" && (
            <section>
              <h2 className={styles.sectionTitle}>Help &amp; tutorials</h2>
              <div className={styles.helpCard}>
                <div>
                  <h3 className={styles.helpTitle}>Interactive tutorial</h3>
                  <p className={styles.settingDesc}>Retake the guided tour to learn how to use Sabiquot.</p>
                </div>
                <button className={styles.btnPrimary} onClick={onStartTutorial || handleRetakeTour}>Start tutorial</button>
              </div>
              <SettingRow name="Help Center" desc="Browse articles and guides">
                <a className={styles.btn} href={HELP_CENTRE_URL} target="_blank" rel="noopener noreferrer">Visit</a>
              </SettingRow>
              <SettingRow name="Video tutorials" desc="Watch step-by-step videos">
                <a className={styles.btn} href={VIDEO_TUTORIALS_URL} target="_blank" rel="noopener noreferrer">Watch</a>
              </SettingRow>
              <SettingRow name="Contact support" desc={`Email our team at ${SUPPORT_EMAIL}`}>
                <a className={styles.btn} href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("sabiquot support request")}`}>Contact</a>
              </SettingRow>
              <p className={styles.version}><strong>Version:</strong> 2.1.0</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingRow({ name, desc, children }) {
  return (
    <div className={styles.card}>
      <div>
        <h3 className={styles.settingName}>{name}</h3>
        <p className={styles.settingDesc}>{desc}</p>
      </div>
      {children}
    </div>
  );
}
