import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import styles from "./LoginPage.module.css";
import { postJson } from "../utils/apiClient";

export default function ForgotPasswordPage({ onBack }) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await postJson("/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send reset link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className={styles.card}>
        <h1 className={styles.title}>Forgot password</h1>
        <p className={styles.subtitle}>
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {error && <p className={styles.error}>{error}</p>}
        {sent ? (
          <div className={styles.success}>
            If an account exists for that email, a password reset link has been sent.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={styles.input}
              />
            </div>

            <button type="submit" className={styles.submit} disabled={isLoading}>
              {isLoading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className={styles.footer}>
          <button onClick={onBack} className={styles.register}>
            Back to sign in
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
