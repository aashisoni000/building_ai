import { NextResponse } from "next/server";
import { z } from "zod";
import { formatSlot } from "@/lib/campusbite";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateOrderSchema = z.object({
  order_id: z.number().int().positive(),
  status: z.enum(["placed", "preparing", "ready", "collected"]),
});

const nextStatus: Record<string, string | undefined> = {
  placed: "preparing",
  preparing: "ready",
  ready: "collected",
};

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("orders")
      .select(
        "id, status, total, created_at, wallets!orders_student_id_fkey(name), pickup_slots!orders_slot_id_fkey(slot_time), order_items!order_items_order_id_fkey(quantity, menu_items!order_items_menu_item_id_fkey(name))"
      )
      .in("status", ["placed", "preparing", "ready"])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[kitchen:get]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = data.map(({ id, status, total, created_at, wallets, pickup_slots, order_items }) => {
      const wallet = firstRelation(wallets);
      const pickupSlot = firstRelation(pickup_slots);
      return {
        id,
        status,
        total,
        created_at,
        student_name: typeof wallet?.name === "string" ? wallet.name : null,
        pickup_time:
          typeof pickupSlot?.slot_time === "string" ? formatSlot(pickupSlot.slot_time) : null,
        items: relationList(order_items).flatMap((item) => {
          const menuItem = firstRelation(item.menu_items);
          return typeof menuItem?.name === "string"
            ? [{ name: menuItem.name, quantity: item.quantity }]
            : [];
        }),
      };
    });

    return NextResponse.json({ orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load kitchen orders";
    console.error("[kitchen:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid order update", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { order_id, status } = parsed.data;

  try {
    const supabase = getSupabase();
    const { data: currentOrder, error: readError } = await supabase
      .from("orders")
      .select("status")
      .eq("id", order_id)
      .maybeSingle();

    if (readError) {
      console.error("[kitchen:post:read]", readError.message);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!currentOrder) {
      return NextResponse.json({ error: `Order ${order_id} was not found` }, { status: 404 });
    }

    if (nextStatus[currentOrder.status] !== status) {
      return NextResponse.json(
        { error: `Order status can only move from ${currentOrder.status} to ${nextStatus[currentOrder.status] ?? "no further status"}` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", order_id)
      .eq("status", currentOrder.status)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("[kitchen:post:update]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Order status changed concurrently; refresh the kitchen queue and try again" },
        { status: 409 }
      );
    }

    return NextResponse.json({ order: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update order";
    console.error("[kitchen:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? (relation as Record<string, unknown>) : null;
}

function relationList(value: unknown): Array<Record<string, unknown>> {
  const relations = Array.isArray(value) ? value : value ? [value] : [];
  return relations.filter(
    (relation): relation is Record<string, unknown> =>
      Boolean(relation) && typeof relation === "object"
  );
}
