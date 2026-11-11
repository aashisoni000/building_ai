"use client";

import { useCallback, useEffect, useState } from "react";

type OrderStatus = "placed" | "preparing" | "ready";
type Order = {
  id: number;
  status: OrderStatus;
  pickup_time: string | null;
  student_name: string | null;
  items: Array<{ name: string; quantity: number }>;
  total: number;
};

const columns: Array<{
  status: OrderStatus;
  title: string;
  action: string;
  nextStatus: "preparing" | "ready" | "collected";
  accent: string;
}> = [
  {
    status: "placed",
    title: "New orders",
    action: "Start preparing",
    nextStatus: "preparing",
    accent: "border-sky-500",
  },
  {
    status: "preparing",
    title: "Preparing",
    action: "Mark ready",
    nextStatus: "ready",
    accent: "border-amber-400",
  },
  {
    status: "ready",
    title: "Ready for pickup",
    action: "Collected",
    nextStatus: "collected",
    accent: "border-emerald-500",
  },
];

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/kitchen", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load kitchen orders");
      setOrders(Array.isArray(data.orders) ? data.orders.map(normalizeOrder) : []);
      setError("");
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load kitchen orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let requestInFlight = false;
    const poll = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        await loadOrders(controller.signal);
      } finally {
        requestInFlight = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 3000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadOrders]);

  async function updateOrder(orderId: number, status: "preparing" | "ready" | "collected") {
    if (updating !== null) return;
    setUpdating(orderId);
    setError("");

    try {
      const response = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update order");
      await loadOrders();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update order");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <header className="mx-auto mb-8 flex max-w-7xl items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            CampusBite
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">Kitchen board</h1>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live
        </span>
      </header>

      <div className="mx-auto max-w-7xl">
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-900 bg-red-950/70 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {columns.map((column) => {
            const columnOrders = orders.filter((order) => order.status === column.status);
            return (
              <section key={column.status} className="min-w-0">
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{column.title}</h2>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
                    {columnOrders.length}
                  </span>
                </header>
                <div className="space-y-3">
                  {columnOrders.map((order) => (
                    <article
                      key={order.id}
                      className={`rounded-xl border-l-4 ${column.accent} bg-slate-900 p-4 shadow-lg shadow-black/10`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Order #{order.id}</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            Pickup {order.pickup_time ?? "time unavailable"}
                          </p>
                        </div>
                        <span className="rounded-md bg-slate-800 px-2 py-1 text-xs capitalize text-slate-300">
                          {order.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-300">
                        Student: <span className="text-slate-100">{order.student_name ?? "Unknown"}</span>
                      </p>
                      <ul className="mt-3 space-y-1 text-sm">
                        {order.items.map((item, index) => (
                          <li key={`${item.name}-${index}`} className="flex justify-between gap-2">
                            <span className="text-slate-200">{item.name}</span>
                            <span className="shrink-0 text-slate-400">× {item.quantity}</span>
                          </li>
                        ))}
                        {order.items.length === 0 && (
                          <li className="text-slate-500">Item details unavailable</li>
                        )}
                      </ul>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                        <span className="font-semibold">Rs {order.total}</span>
                        <button
                          type="button"
                          disabled={updating !== null}
                          onClick={() => updateOrder(order.id, column.nextStatus)}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
                        >
                          {updating === order.id ? "Updating..." : column.action}
                        </button>
                      </div>
                    </article>
                  ))}
                  {!loading && columnOrders.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                      No orders
                    </p>
                  )}
                  {loading && columnOrders.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                      Loading orders…
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function normalizeOrder(value: unknown): Order {
  const order = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawItems = asRelationList(order.items);
  const pickupRelation = firstRelation(order.pickup_time ?? order.pickup_slots);
  const studentRelation = firstRelation(order.student_name ?? order.wallets);
  const pickupTime =
    typeof order.pickup_time === "string"
      ? order.pickup_time
      : typeof pickupRelation?.slot_time === "string"
        ? pickupRelation.slot_time
        : null;
  return {
    id: typeof order.id === "number" ? order.id : 0,
    status: isOrderStatus(order.status) ? order.status : "placed",
    pickup_time: pickupTime,
    student_name:
      typeof order.student_name === "string"
        ? order.student_name
        : typeof studentRelation?.name === "string"
          ? studentRelation.name
          : null,
    total: typeof order.total === "number" ? order.total : 0,
    items: rawItems.flatMap((item) => {
      const menuItem = firstRelation(item.menu_items);
      const name = typeof item.name === "string" ? item.name : menuItem?.name;
      return typeof name === "string"
        ? [{ name, quantity: typeof item.quantity === "number" ? item.quantity : 1 }]
        : [];
    }),
  };
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? (relation as Record<string, unknown>) : null;
}

function asRelationList(value: unknown): Array<Record<string, unknown>> {
  const relations = Array.isArray(value) ? value : value ? [value] : [];
  return relations.filter(
    (relation): relation is Record<string, unknown> =>
      Boolean(relation) && typeof relation === "object"
  );
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return value === "placed" || value === "preparing" || value === "ready";
}
