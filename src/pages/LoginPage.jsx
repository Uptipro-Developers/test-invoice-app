import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import styles from "./LoginPage.module.css";
import { postJson } from "../utils/apiClient";

export default function LoginPage({ onLogin, onRegister, onGuest, onForgotPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const data = await postJson("/api/auth/login", { email, password });
      onLogin(data);
    } catch (err) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign In</h1>
        <p className={styles.subtitle}>Access your account</p>

        {error && <p className={styles.error}>{error}</p>}

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

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label}>Password</label>
              <a
                href="/?view=forgot-password"
                className={styles.forgot}
                onClick={(e) => {
                  if (onForgotPassword) {
                    e.preventDefault();
                    onForgotPassword();
                  }
                }}
              >
                Forgot password?
              </a>
            </div>
            <div className={styles.passwordWrap}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
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

          <button type="submit" className={styles.submit} disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign In"}
          </button>

          <div className={styles.divider}>
            <span>OR</span>
          </div>

          <button type="button" className={styles.guest} onClick={onGuest}>
            Continue as Guest
          </button>
        </form>

        <p className={styles.footer}>
          New user?{" "}
          <button onClick={onRegister} className={styles.register}>
            Create an account
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
