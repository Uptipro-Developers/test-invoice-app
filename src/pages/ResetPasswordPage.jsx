import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import styles from "./LoginPage.module.css";
import { postJson } from "../utils/apiClient";

export default function ResetPasswordPage({ token, onDone }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      await postJson("/api/auth/reset-password", { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.message || "Could not reset password. The link may have expired.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.subtitle}>Choose a new password for your account.</p>

        {error && <p className={styles.error}>{error}</p>}
        {done ? (
          <>
            <div className={styles.success}>Your password has been reset successfully.</div>
            <button type="button" className={styles.submit} onClick={onDone} style={{ marginTop: 16 }}>
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>New password</label>
              <div className={styles.passwordWrap}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  className={styles.input}
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
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirm password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                required
                className={styles.input}
              />
            </div>

            <button type="submit" className={styles.submit} disabled={isLoading || !token}>
              {isLoading ? "Resetting..." : "Reset password"}
            </button>
            {!token && <p className={styles.error}>Missing reset token. Please use the link from your email.</p>}
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
