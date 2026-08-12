"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; email: string; username: string }) => void;
  initialMode?: "signup" | "login";
  title?: string;
}

export default function AuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = "signup",
  title,
}: AuthModalProps) {
  const [mode, setMode] = useState<"signup" | "login">(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    try {
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

        // Profile is created by trigger. Wait a moment for it.
        await new Promise((r) => setTimeout(r, 400));

        onSuccess({
          id: data.user.id,
          email: data.user.email || email,
          username: username.trim(),
        });
      } else {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (signInError) throw signInError;
        if (!data.user) throw new Error("Login failed");

        // Fetch username from profile
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
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold text-center mb-1">
          {title || (mode === "signup" ? "Quick Signup" : "Login")}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          {mode === "signup"
            ? "Create an account to buy your number instantly"
            : "Welcome back"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="johndoe"
                autoComplete="username"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
            />
          </div>

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
              : mode === "signup"
              ? "Create Account & Continue"
              : "Login & Continue"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === "signup" ? (
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
      </div>
    </div>
  );
}
