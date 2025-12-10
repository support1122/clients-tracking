// src/components/AdminLogin.jsx
import React, { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_BASE ;

export default function AdminLogin() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null); // shows role/abilities after login

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Login failed");
      localStorage.setItem("ff_admin_jwt", data.token);
      setMe(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <button disabled={loading} type="submit">
          {loading ? "Signing in..." : "Sign In"}
        </button>
        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}
      </form>

      {me && (
        <div style={{ marginTop: 24, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div><b>Welcome:</b> {me.name} ({me.email})</div>
          <div><b>Role:</b> {me.role}</div>
          <div style={{ marginTop: 8 }}>
            <b>Access:</b>{" "}
            {me.role === "Director"
              ? "Full access to all modules."
              : me.role === "DepartmentHead"
              ? "Manage assigned interns and view their clients."
              : me.role === "Intern"
              ? "View only your assigned clients."
              : "No access."}
          </div>
        </div>
      )}
    </div>
  );
}
