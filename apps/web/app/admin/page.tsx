"use client";

import { useState } from "react";
import { AdminLogin } from "../../components/AdminLogin";
import { VideoLibrary } from "../../components/VideoLibrary";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);

  return (
    <main className="min-h-screen px-4 py-8">
      {token ? <VideoLibrary token={token} /> : <AdminLogin onToken={setToken} />}
    </main>
  );
}
