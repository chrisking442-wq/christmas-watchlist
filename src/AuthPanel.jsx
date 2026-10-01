import React, { useState } from "react";

export default function AuthPanel({ supabase, session }) {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const signUp = async (e) => {
    e.preventDefault();

    if (!supabase) return;

    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName.trim(),
        },
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(
        "Account created. Check your email if confirmation is required."
      );
    }

    setBusy(false);
  };

  const signIn = async (e) => {
    e.preventDefault();

    if (!supabase) return;

    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    }

    setBusy(false);
  };

  const signOut = async () => {
    if (!supabase) return;

    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  };

  if (session?.user) {
    const name =
      session.user.user_metadata?.display_name ||
      session.user.email?.split("@")[0] ||
      "Account";

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 14 }}>
          Signed in as <strong>{name}</strong>
        </span>

        <button
          onClick={signOut}
          disabled={busy}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            padding: "7px 12px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 14,
        background: "#fff",
        maxWidth: 420,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => {
            setMode("login");
            setMessage("");
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: mode === "login" ? "#f3f4f6" : "#fff",
            cursor: "pointer",
          }}
        >
          Sign in
        </button>

        <button
          onClick={() => {
            setMode("signup");
            setMessage("");
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: mode === "signup" ? "#f3f4f6" : "#fff",
            cursor: "pointer",
          }}
        >
          Create account
        </button>
      </div>

      <form onSubmit={mode === "signup" ? signUp : signIn}>
        {mode === "signup" && (
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 8,
              padding: 9,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          />
        )}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 8,
            padding: 9,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 10,
            padding: 9,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        />

        <button
          type="submit"
          disabled={busy}
          style={{
            border: 0,
            background: "#166534",
            color: "#fff",
            padding: "9px 14px",
            borderRadius: 8,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy
            ? "Please wait…"
            : mode === "signup"
            ? "Create account"
            : "Sign in"}
        </button>
      </form>

      {message && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "#555",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}