"use client";

import { useState } from "react";
import Link from "next/link";
import AgentChat from "@/components/AgentChat";
import MenuPanel from "@/components/MenuPanel";
import WalletOrders from "@/components/WalletOrders";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">CampusBite · SRM canteen ordering agent</h1>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/kitchen" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
            Open kitchen screen
          </Link>
          <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-900">
            Log out
          </button>
        </nav>
      </header>
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <AgentChat onDataChanged={() => setRefreshKey((key) => key + 1)} />
        </section>
        <aside className="space-y-4 lg:col-span-2">
          <WalletOrders refreshKey={refreshKey} />
          <MenuPanel refreshKey={refreshKey} />
        </aside>
      </div>
    </main>
  );
}
