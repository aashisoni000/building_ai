import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "./defineTool";
import { CURRENT_STUDENT_ID, formatSlot } from "../campusbite";
import { getSupabase } from "../supabase";

const getMenu = defineTool({
  name: "getMenu",
  description:
    "Use this when the student wants to browse available canteen food or find items by category, vegetarian status, or price.",
  schema: z.object({
    category: z.enum(["meal", "snack", "drink", "sweet"]).optional(),
    veg_only: z.boolean().optional(),
    max_price: z.number().int().optional(),
  }),
  run: async ({ category, veg_only, max_price }) => {
    let query = getSupabase()
      .from("menu_items")
      .select("id, name, category, price, is_veg, stock, description")
      .gt("stock", 0)
      .order("category", { ascending: true })
      .order("price", { ascending: true });

    if (category) query = query.eq("category", category);
    if (veg_only) query = query.eq("is_veg", true);
    if (max_price !== undefined) query = query.lte("price", max_price);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data };
  },
});

const getWalletBalance = defineTool({
  name: "getWalletBalance",
  description: "Use this when the student asks how much money is available in their CampusBite wallet.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
      .from("wallets")
      .select("name, balance")
      .eq("student_id", CURRENT_STUDENT_ID)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("No CampusBite wallet found for this student");
    return data;
  },
});

const getPickupSlots = defineTool({
  name: "getPickupSlots",
  description: "Use this when the student wants to see available canteen order pickup times.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
      .from("pickup_slots")
      .select("id, slot_time, capacity, booked")
      .order("slot_time", { ascending: true });

    if (error) throw new Error(error.message);

    return {
      slots: data
        .map(({ id, slot_time, capacity, booked }) => ({
          slot_id: id,
          time: formatSlot(slot_time),
          free: capacity - booked,
        }))
        .filter((slot) => slot.free > 0),
    };
  },
});

const getMyOrders = defineTool({
  name: "getMyOrders",
  description: "Use this when the student asks to see their recent CampusBite orders or their order status.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
      .from("orders")
      .select(
        "id, status, total, pickup_slots!orders_slot_id_fkey(slot_time), created_at, order_items(menu_items!order_items_menu_item_id_fkey(name))"
      )
      .eq("student_id", CURRENT_STUDENT_ID)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    return {
      orders: data.map(({ id, status, total, pickup_slots, order_items }) => ({
        id,
        status,
        total,
        pickup_time: pickup_slots[0]?.slot_time ? formatSlot(pickup_slots[0].slot_time) : null,
        item_names: order_items.flatMap((item) =>
          item.menu_items.map((menuItem) => menuItem.name)
        ),
      })),
    };
  },
});

const placeOrder = defineTool({
  name: "placeOrder",
  description:
    "Use this when the student has chosen their canteen items and pickup slot and wants to place the order.",
  writes: true,
  schema: z.object({
    items: z
      .array(
        z.object({
          menu_item_id: z.number().int().positive(),
          quantity: z.number().int().min(1).max(5),
        })
      )
      .min(1),
    slot_id: z.number().int().positive(),
  }),
  run: async ({ items, slot_id }) => {
    const { data, error } = await getSupabase().rpc("place_order", {
      p_student_id: CURRENT_STUDENT_ID,
      p_slot_id: slot_id,
      p_items: items,
    });

    if (error) throw new Error(error.message);
    return data;
  },
});

const cancelOrder = defineTool({
  name: "cancelOrder",
  description: "Use this when the student asks to cancel one of their orders.",
  writes: true,
  schema: z.object({
    order_id: z.number().int().positive(),
  }),
  run: async ({ order_id }) => {
    const { data, error } = await getSupabase().rpc("cancel_order", {
      p_student_id: CURRENT_STUDENT_ID,
      p_order_id: order_id,
    });

    if (error) throw new Error(error.message);
    return data;
  },
});

export const tools: AgentTool[] = [
  getMenu,
  getWalletBalance,
  getPickupSlots,
  getMyOrders,
  placeOrder,
  cancelOrder,
];
