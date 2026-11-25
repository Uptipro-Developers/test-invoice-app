import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { API_BASE_URL } from "../utils/apiClient";
import styles from "./ProfilePage.module.css";

export default function ProfilePage({ profile, onBack, onProfileChange }) {
  const [form, setForm] = useState({ name: "", phone: "", company: "", buildos_supplier_ref: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [syncState, setSyncState] = useState("idle"); // idle | connecting | connected | error
  const [syncMsg, setSyncMsg] = useState("");
  const manualSyncRef = useRef(false);

  useEffect(() => {
    setForm({
      name: profile?.name ?? "",
      phone: profile?.phone ?? "",
      company: profile?.company ?? "",
      buildos_supplier_ref: profile?.buildos_supplier_ref ?? "",
    });
  }, [profile]);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  useEffect(() => {
    if (profile?.buildos_supplier_id || profile?.buildos_sync_status === "linked") {
      setSyncState("connected");
      setSyncMsg(profile?.buildos_supplier_id ? `Connected to BuildOS supplier ${profile.buildos_supplier_id}` : "Connected to BuildOS");
    } else if (profile?.buildos_sync_status === "failed") {
      setSyncState("error");
      setSyncMsg(profile?.buildos_sync_error || "Connection failed");
    } else if (!manualSyncRef.current) {
      setSyncState("idle");
      setSyncMsg("");
    }
  }, [profile?.buildos_supplier_id, profile?.buildos_sync_status, profile?.buildos_sync_error]);

  async function handleBuildosSync() {
    if (!profile?.id) return;
    const ref = form.buildos_supplier_ref.trim();
    if (!ref && !profile?.buildos_supplier_id) {
      manualSyncRef.current = true;
      setSyncState("error");
      setSyncMsg("Enter a BuildOS Connection ID first.");
      return;
    }
    manualSyncRef.current = true;
    setSyncState("connecting");
    setSyncMsg("Connecting to BuildOS...");
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/${profile.id}/buildos-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildosSupplierRef: ref }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not connect to BuildOS.");
      if (body.ok || body.status === "linked") {
        setSyncState("connected");
        setSyncMsg(body.buildosSupplierId ? `Connected to BuildOS supplier ${body.buildosSupplierId}` : "Connected to BuildOS");
      } else {
        setSyncState("error");
        setSyncMsg(body.buildosSyncError || "Could not verify connection. Please check the ID and try again.");
      }
      if (body.profile) onProfileChange?.({ ...profile, ...body.profile });
    } catch (err) {
      setSyncState("error");
      setSyncMsg(err.message || "Connection failed.");
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!profile?.id || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        company: form.company.trim(),
        buildos_supplier_ref: form.buildos_supplier_ref.trim() || null,
      };
      const res = await fetch(`${API_BASE_URL}/api/profile/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save your profile.");
      onProfileChange?.({ ...profile, ...body });
      setStatus({ tone: "ok", message: "Profile saved." });
    } catch (err) {
      setStatus({ tone: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }



  return (
    <div className={styles.container}>
      <button onClick={onBack} className={styles.backBtn}>← Back</button>
      <header className={styles.header}>
        <p className={styles.kicker}>Account</p>
        <h1 className={styles.title}>My profile</h1>
        <p className={styles.subtitle}>Manage your personal details and BuildOS connection.</p>
      </header>

      <form className={styles.card} onSubmit={save}>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input className={styles.input} value={form.name} onChange={set("name")} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input className={`${styles.input} ${styles.readOnly}`} value={profile?.email ?? ""} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Phone</span>
            <input className={styles.input} value={form.phone} onChange={set("phone")} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Company name</span>
            <input className={styles.input} value={form.company} onChange={set("company")} placeholder="Your company name" />
          </label>
        </div>

        <hr className={styles.divider} />
        <h2 className={styles.sectionTitle}>BuildOS connection</h2>
        <div className={styles.grid}>
          <label className={`${styles.field} ${styles.full}`}>
            <span className={styles.label}>BuildOS Connection ID (optional)</span>
            <div className={styles.connectRow}>
              <input className={styles.input} value={form.buildos_supplier_ref} onChange={(e) => { manualSyncRef.current = false; setSyncState("idle"); setSyncMsg(""); set("buildos_supplier_ref")(e); }} placeholder="Paste your BuildOS connection ID" autoComplete="off" />
              <button type="button" className={styles.connectBtn} onClick={handleBuildosSync} disabled={syncState === "connecting"}>
                {syncState === "connecting" ? <><Loader2 size={16} className={styles.spin} /> Connecting</> : <><Link2 size={16} /> Connect</>}
              </button>
            </div>
            <p className={styles.hint}>If your company name differs from BuildOS, the name you add here will be used and can be updated in BuildOS.</p>
          </label>
        </div>

        <div className={`${styles.syncBox} ${syncState === "connected" ? styles.syncConnected : syncState === "error" ? styles.syncError : syncState === "connecting" ? styles.syncConnecting : ""}`}>
          <div className={styles.syncIcon}>
            {syncState === "connecting" && <Loader2 size={20} className={styles.spin} />}
            {syncState === "connected" && <CheckCircle2 size={20} />}
            {syncState === "error" && <AlertCircle size={20} />}
            {syncState === "idle" && <Link2 size={20} />}
          </div>
          <div className={styles.syncBody}>
            <p className={styles.syncTitle}>
              {syncState === "connecting" ? "Connecting to BuildOS…" :
               syncState === "connected" ? "Connected to BuildOS" :
               syncState === "error" ? "Connection issue" :
               "Not connected"}
            </p>
            <p className={styles.syncText}>
              {syncMsg || "Enter your BuildOS Connection ID and click Connect."}
            </p>
            {syncState === "connected" && (
              <div className={styles.syncMeta}>
                {profile?.buildos_supplier_id && <span className={styles.syncPill}>Supplier ID: {profile.buildos_supplier_id}</span>}
                {form.company?.trim() && <span className={styles.syncPill}>Company: {form.company.trim()}</span>}
                {form.buildos_supplier_ref?.trim() && <span className={styles.syncPill}>Connection ID: {form.buildos_supplier_ref.trim()}</span>}
              </div>
            )}
          </div>
        </div>

        {status && <p className={styles.status} style={{ color: status.tone === "error" ? "#b91c1c" : "#166534" }}>{status.message}</p>}
        <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </form>
    </div>
  );
}
