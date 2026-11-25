import React, { useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { postJson } from "../utils/apiClient";
import AuthLayout from "../components/AuthLayout";
import styles from "./RegisterPage.module.css";

export default function RegisterPage({ onRegister, onLogin }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    company: "",
    buildosSupplierId: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connectStatus, setConnectStatus] = useState("idle"); // idle|connecting|connected|error
  const [connectInfo, setConnectInfo] = useState(null);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validateStep1() {
    if (!form.name.trim()) return "Full name is required.";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      return "A valid email is required.";
    if (form.password.length < 8)
      return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword)
      return "Passwords do not match.";
    return null;
  }

  function nextStep() {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const hasBuildos = Boolean(form.buildosSupplierId.trim());
    if (hasBuildos) setConnectStatus("connecting");
    try {
      const data = await postJson("/api/auth/register", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        category: "public",
        role: "public",
        company: form.company.trim() || undefined,
        buildosSupplierId: form.buildosSupplierId.trim() || undefined,
      });

      localStorage.setItem("profile", JSON.stringify(data));

      if (hasBuildos) {
        const linked = data.buildos_sync_status === "linked" || data.buildos_supplier_id;
        setConnectStatus(linked ? "connected" : "error");
        setConnectInfo({
          supplierId: data.buildos_supplier_id || null,
          company: data.company || form.company.trim(),
          ref: form.buildosSupplierId.trim(),
          error: data.buildos_sync_error || null,
        });
        setLoading(false);
        setTimeout(() => onRegister(data), linked ? 1800 : 2200);
        return;
      }

      onRegister(data);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
      setConnectStatus("idle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className={styles.card}>
        <h1 className={styles.heading}>Sign Up</h1>
        <p className={styles.subheading}>
          {step === 1
            ? "Create your account to get started"
            : "Add your company details (optional)"}
        </p>

        {/* Step indicator */}
        <div className={styles.stepRow}>
          {[1, 2].map((n) => (
            <React.Fragment key={n}>
              <div
                className={`${styles.stepDot} ${
                  step >= n ? styles.stepDotActive : ""
                }`}
              >
                {n}
              </div>
              {n < 2 && (
                <div
                  className={`${styles.stepLine} ${
                    step > 1 ? styles.stepLineActive : ""
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {step === 1 && (
          <div className={styles.form}>
            <div className={styles.grid}>
              <Field label="Full name">
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
              </Field>
              <Field label="Email address">
                <input
                  className={styles.input}
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <div className={styles.passwordWrap}>
                  <input
                    className={styles.input}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password">
                <div className={styles.passwordWrap}>
                  <input
                    className={styles.input}
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={set("confirmPassword")}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <Field label="Phone number (optional)" full>
                <input
                  className={styles.input}
                  type="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+234 800 000 0000"
                  autoComplete="tel"
                />
              </Field>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={nextStep}
                className={styles.primaryBtn}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.grid}>
              <Field label="BuildOS Connection ID (optional)" full>
                <input
                  className={styles.input}
                  value={form.buildosSupplierId}
                  onChange={set("buildosSupplierId")}
                  placeholder="Paste your BuildOS connection ID"
                  autoComplete="off"
                />
                <p className={styles.hint}>
                  If you have a BuildOS connection ID, add it here to link your account.
                </p>
              </Field>
              <Field label="Company name (optional)" full>
                <input
                  className={styles.input}
                  value={form.company}
                  onChange={set("company")}
                  placeholder="Your company name"
                  autoComplete="organization"
                />
                <p className={styles.hint}>
                  You can add or update your company name now. If it differs from BuildOS, we&apos;ll use the name you provide here.
                </p>
              </Field>
            </div>

            {(connectStatus !== "idle" || (loading && form.buildosSupplierId.trim())) && (
              <div className={`${styles.syncBox} ${connectStatus === "connected" ? styles.syncConnected : connectStatus === "error" ? styles.syncError : styles.syncConnecting}`}>
                <div className={styles.syncIcon}>
                  {(connectStatus === "connecting" || (loading && form.buildosSupplierId.trim() && connectStatus === "idle")) && <Loader2 size={20} className={styles.spin} />}
                  {connectStatus === "connected" && <CheckCircle2 size={20} />}
                  {connectStatus === "error" && <AlertCircle size={20} />}
                </div>
                <div className={styles.syncBody}>
                  <p className={styles.syncTitle}>
                    {connectStatus === "connected" ? "Connected to BuildOS" : connectStatus === "error" ? "Connection issue" : "Connecting to BuildOS…"}
                  </p>
                  <p className={styles.syncText}>
                    {connectStatus === "connected"
                      ? "Your account is linked and ready."
                      : connectStatus === "error"
                        ? (connectInfo?.error || "Account created, but BuildOS connection could not be verified. You can try again from Profile.")
                        : "Verifying your BuildOS connection ID…"}
                  </p>
                  {connectStatus === "connected" && connectInfo && (
                    <div className={styles.syncMeta}>
                      {connectInfo.supplierId && <span className={styles.syncPill}>Supplier ID: {connectInfo.supplierId}</span>}
                      {connectInfo.company && <span className={styles.syncPill}>Company: {connectInfo.company}</span>}
                      {connectInfo.ref && <span className={styles.syncPill}>Connection ID: {connectInfo.ref}</span>}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className={styles.backBtn}
                disabled={loading || connectStatus === "connected"}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || connectStatus === "connected"}
                className={styles.primaryBtn}
              >
                {loading ? (form.buildosSupplierId.trim() ? "Creating & connecting…" : "Creating account…") : "Create account"}
              </button>
            </div>
          </form>
        )}

        <p className={styles.loginPrompt}>
          Already have an account?{" "}
          <button onClick={onLogin} className={styles.linkBtn}>
            Sign in
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div className={`${styles.field} ${full ? styles.spanFull : ""}`}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  );
}
