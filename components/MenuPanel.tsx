"use client";

import { useEffect, useState } from "react";

type MenuItem = {
  id: number;
  name: string;
  category: "meal" | "snack" | "sweet" | "drink";
  price: number;
  is_veg: boolean;
  stock: number;
};

const groups: Array<{ key: MenuItem["category"]; label: string }> = [
  { key: "meal", label: "Meals" },
  { key: "snack", label: "Snacks" },
  { key: "sweet", label: "Sweets" },
  { key: "drink", label: "Drinks" },
];

export default function MenuPanel({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    const controller = new AbortController();

    async function load() {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/menu", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load today's menu");
        if (!active) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setError("");
      } catch (loadError) {
        if (!active || (loadError instanceof Error && loadError.name === "AbortError")) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load today's menu");
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
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">Today&apos;s menu</h2>
        <p className="text-xs text-slate-500">Live availability and pricing</p>
      </header>
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      <div className="space-y-4 p-4">
        {groups.map((group) => {
          const groupItems = items.filter((item) => item.category === group.key);
          if (!groupItems.length) return null;
          return (
            <div key={group.key}>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">{group.label}</h3>
              <ul className="divide-y divide-slate-100">
                {groupItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-label={item.is_veg ? "Vegetarian" : "Non-vegetarian"}
                        title={item.is_veg ? "Vegetarian" : "Non-vegetarian"}
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          item.is_veg ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                      {item.stock === 0 ? (
                        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                          Sold out
                        </span>
                      ) : item.stock <= 3 ? (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          Only {item.stock} left
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-medium">Rs {item.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!error && items.length === 0 && (
          <p className="text-sm text-slate-500">No menu items available.</p>
        )}
      </div>
    </section>
  );
}
