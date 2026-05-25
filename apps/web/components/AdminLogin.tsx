"use client";

import { useState } from "react";
import { adminLogin } from "../lib/apiClient";

export function AdminLogin({ onToken }: { onToken: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      const token = await adminLogin(password);
      onToken(token);
      setError(null);
    } catch {
      setError("管理员密码不正确");
    }
  }

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold">管理页</h1>
      <input
        className="mt-6 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
        type="password"
        name="shareus-admin-password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="管理员密码"
      />
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <button className="mt-4 w-full rounded-md bg-white px-4 py-2 text-slate-950" onClick={submit}>进入</button>
    </section>
  );
}
