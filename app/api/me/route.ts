import { NextResponse } from "next/server";
import { CURRENT_STUDENT_ID, formatSlot } from "@/lib/campusbite";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabase();
    const [walletResult, ordersResult] = await Promise.all([
      supabase
        .from("wallets")
        .select("student_id, name, balance")
        .eq("student_id", CURRENT_STUDENT_ID)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(
          "id, status, total, created_at, pickup_slots!orders_slot_id_fkey(slot_time), order_items!order_items_order_id_fkey(menu_items!order_items_menu_item_id_fkey(name))"
        )
        .eq("student_id", CURRENT_STUDENT_ID)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (walletResult.error) {
      console.error("[me:wallet]", walletResult.error.message);
      return NextResponse.json({ error: walletResult.error.message }, { status: 500 });
    }
    if (ordersResult.error) {
      console.error("[me:orders]", ordersResult.error.message);
      return NextResponse.json({ error: ordersResult.error.message }, { status: 500 });
    }

    const orders = ordersResult.data.map(({ id, status, total, created_at, pickup_slots, order_items }) => {
      const pickupSlot = firstRelation(pickup_slots);
      return {
        id,
        status,
        total,
        created_at,
        pickup_time:
          typeof pickupSlot?.slot_time === "string" ? formatSlot(pickupSlot.slot_time) : null,
        item_names: relationList(order_items).flatMap((item) => {
          const menuItem = firstRelation(item.menu_items);
          return typeof menuItem?.name === "string" ? [menuItem.name] : [];
        }),
      };
    });

    return NextResponse.json({ wallet: walletResult.data, orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load student details";
    console.error("[me]", message);
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
