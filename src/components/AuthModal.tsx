"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; email: string; username: string }) => void;
  initialMode?: "signup" | "login";
  title?: string;
}

type Mode = "signup" | "login" | "forgot" | "forgot_sent";

const EMAIL_KEY = "sv_last_email";

export default function AuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = "signup",
  title,
}: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill last used email (not password — browser handles that)
  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch (_) {}
    setMode(initialMode);
    setError(null);
    setPassword("");
  }, [open, initialMode]);

  if (!open) return null;

  const saveEmail = (value: string) => {
    try {
      localStorage.setItem(EMAIL_KEY, value.trim());
    } catch (_) {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "forgot") {
        const redirectTo = `${window.location.origin}/auth/reset-password`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo }
        );
        if (resetError) throw resetError;
        saveEmail(email);
        setMode("forgot_sent");
        setLoading(false);
        return;
      }

      if (mode === "signup") {
        if (!username.trim() || username.length < 3) {
          throw new Error("Username must be at least 3 characters");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim() },
          },
        });

        if (signUpError) throw signUpError;
        if (!data.user) throw new Error("Signup failed");

        saveEmail(email);
        await new Promise((r) => setTimeout(r, 400));

        onSuccess({
          id: data.user.id,
          email: data.user.email || email,
          username: username.trim(),
        });
      } else {
        // login
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (signInError) throw signInError;
        if (!data.user) throw new Error("Login failed");

        saveEmail(email);

        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.user.id)
          .single();

        onSuccess({
          id: data.user.id,
          email: data.user.email || email,
          username: profile?.username || email.split("@")[0],
        });
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const heading =
    mode === "forgot" || mode === "forgot_sent"
      ? "Reset Password"
      : title || (mode === "signup" ? "Create Account" : "Welcome Back");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">{heading}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {mode === "forgot"
            ? "Enter your account email. We’ll send a reset link."
            : mode === "forgot_sent"
            ? "Check your inbox for the reset link."
            : mode === "signup"
            ? "Sign up to buy numbers and manage your wallet."
            : "Log in to continue."}
        </p>

        {mode === "forgot_sent" ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
              If an account exists for <strong>{email}</strong>, a password
              reset link has been sent. Open it on this device to set a new
              password.
            </div>
            <p className="text-xs text-gray-500">
              Also check Spam / Promotions. The link expires after a short
              time.
            </p>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className="w-full border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Your username"
                  autoComplete="username"
                  minLength={3}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            {(mode === "login" || mode === "signup") && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setPassword("");
                      }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  name="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="••••••••"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={6}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading
                ? "Please wait…"
                : mode === "forgot"
                ? "Send Reset Link"
                : mode === "signup"
                ? "Create Account & Continue"
                : "Login & Continue"}
            </button>
          </form>
        )}

        {mode !== "forgot_sent" && (
          <p className="text-center text-sm text-gray-500 mt-4">
            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="text-red-600 font-medium hover:underline"
              >
                Back to Login
              </button>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-red-600 font-medium hover:underline"
                >
                  Login
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-red-600 font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
