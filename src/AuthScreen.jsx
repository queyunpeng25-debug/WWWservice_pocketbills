import React, { useState } from "react";
import { Wallet, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, configured } from "./firebase";

export const friendlyError = (error) =>
  ({
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use":
      "This email already has an account. Please sign in.",
    "auth/weak-password": "Use a password with at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed":
      "Could not connect. Check your internet connection.",
    "permission-denied":
      "Access denied. Check that your Firebase security rules are deployed.",
  })[error.code] ||
  error.message ||
  "Something went wrong. Please try again.";
/** Demo entry is deliberately separate from authenticated accounts. */
export default function AuthScreen({ onDemo }) {
  const [mode, setMode] = useState("signin"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, data.get("email"));
        setNotice(
          "If an account exists, a reset link will arrive in your inbox.",
        );
      } else if (mode === "signup")
        await createUserWithEmailAndPassword(
          auth,
          data.get("email"),
          data.get("password"),
        );
      else
        await signInWithEmailAndPassword(
          auth,
          data.get("email"),
          data.get("password"),
        );
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <a href="#" className="brand">
          <span className="brand-icon">
            <Wallet />
          </span>
          Pocket Bill
          <span className="brand-dot" />
        </a>
        <div>
          <h1>
            Bills and subscriptions,
            <br />
            <em>in one place.</em>
          </h1>
        </div>
      </section>
      <section className="auth-form">
        <h2>
          {mode === "signup"
            ? "Create account"
            : mode === "reset"
              ? "Reset password"
              : "Sign in"}
        </h2>
        {configured ? (
          <>
            <form onSubmit={submit}>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
              {mode !== "reset" && (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    minLength={mode === "signup" ? 8 : 1}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    required
                    placeholder={
                      mode === "signup"
                        ? "At least 8 characters"
                        : "Your password"
                    }
                  />
                </label>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign in"}
                <ArrowRight size={17} />
              </button>
            </form>
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError("");
              }}
            >
              {mode === "signup"
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "reset" ? "signin" : "reset");
                setError("");
              }}
            >
              {mode === "reset" ? "Back to sign in" : "Forgot password?"}
            </button>
          </>
        ) : (
          <div className="notice">
            <strong>Your local preview is ready.</strong>
            <p>
              Explore the workspace with sample bills. Connect Firebase using
              the README to enable personal accounts and cloud sync.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="divider">OR</div>
        <button className="secondary full" onClick={onDemo}>
          Explore demo workspace <ArrowUpRight size={17} />
        </button>
        <p className="privacy-note">
          Demo changes stay in this browser. Personal accounts use a private,
          separate workspace.
        </p>
      </section>
    </div>
  );
}
