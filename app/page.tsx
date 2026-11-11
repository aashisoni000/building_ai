"use client";

import AgentChat from "@/components/AgentChat";
export default function HomePage() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">CampusBite</h1>
          <p className="text-sm text-slate-500">Your SRM canteen assistant.</p>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-900">
          Log out
        </button>
      </header>
      <section className="max-w-3xl">
        <AgentChat />
      </section>
    </main>
  );
}
