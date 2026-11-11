"use client";

import { useEffect, useState } from "react";

type Wallet = { name: string; balance: number } | null;
type Order = {
  id: number;
  status: string;
  total: number;
  pickup_time: string | null;
  item_names: string[];
};

const statusStyles: Record<string, string> = {
  placed: "bg-sky-100 text-sky-800",
  preparing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  collected: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-800",
};

export default function WalletOrders({ refreshKey }: { refreshKey: number }) {
  const [wallet, setWallet] = useState<Wallet>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    const controller = new AbortController();

    async function load() {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/me", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load wallet and orders");
        if (!active) return;
        setWallet(data.wallet ?? null);
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setError("");
      } catch (loadError) {
        if (!active || (loadError instanceof Error && loadError.name === "AbortError")) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load wallet and orders");
      } finally {
        requestInFlight = false;
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  return (
    <section className="overflow-hidden rounded-xl bg-slate-900 text-white shadow-sm">
      <div className="border-b border-white/10 p-4">
        <p className="text-sm text-slate-300">{wallet?.name ?? "CampusBite wallet"}</p>
        <p className="mt-1 text-3xl font-semibold">
          Rs {wallet ? wallet.balance : "--"}
        </p>
        <p className="text-xs text-slate-400">Wallet balance</p>
      </div>
      <div className="p-4">
        <h2 className="mb-3 font-semibold">My orders today</h2>
        {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
        {!error && orders.length === 0 && (
          <p className="text-sm text-slate-300">No recent orders today.</p>
        )}
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Order #{order.id}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusStyles[order.status] ?? "bg-slate-200 text-slate-700"
                  }`}
                >
                  {order.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Pickup: {order.pickup_time ?? "Time unavailable"}
              </p>
              <p className="mt-1 text-sm text-slate-100">
                {order.item_names.length ? order.item_names.join(", ") : "Items unavailable"}
              </p>
              <p className="mt-1 text-sm font-medium">Total: Rs {order.total}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
