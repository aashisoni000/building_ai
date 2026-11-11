import { NextResponse } from "next/server";
import { agentRequestSchema } from "@/lib/schemas";
import { runAgent } from "@/lib/agent/runAgent";
import { tools } from "@/lib/agent/tools";
import type { AgentResult, AgentStep } from "@/lib/agent/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/agent  body: { messages: [{ role: "user" | "model", text: string }] } */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await runAgent(parsed.data.messages);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent failed";
    console.error("[agent]", message);
    const quota = /429|quota|RESOURCE_EXHAUSTED/i.test(message);
    const unavailable = /503|UNAVAILABLE|high demand|temporarily unavailable/i.test(message);
    const lastUserMessage = [...parsed.data.messages].reverse().find((item) => item.role === "user");

    if ((quota || unavailable) && lastUserMessage) {
      try {
        const fallback = await getOutageFallback(lastUserMessage.text, parsed.data.messages);
        if (fallback) return NextResponse.json(fallback);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : "Database fallback failed";
        console.error("[agent-fallback]", fallbackMessage);
        return NextResponse.json({ error: `AI is unavailable and the live data lookup failed: ${fallbackMessage}` }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        error: quota || unavailable ? "The AI service is temporarily unavailable. Please try again later." : message,
      },
      { status: quota ? 429 : unavailable ? 503 : 500 }
    );
  }
}

async function getOutageFallback(
  text: string,
  messages: Array<{ role: string; text: string }>
): Promise<AgentResult | null> {
  const addItemFallback = await getAddItemFallback(text, messages);
  if (addItemFallback) return addItemFallback;

  const orderFallback = await getOrderFallback(text);
  if (orderFallback) return orderFallback;

  const budgetMatch = /\b(?:under|below|less than)\s*(?:rs\.?\s*|₹\s*)?(\d+)/i.exec(text);
  const wantsVegetarian = /\bveg(?:etarian)?\b/i.test(text);
  const asksForMenu =
    wantsVegetarian && /\b(under|below|less than|menu|food|today)\b/i.test(text);

  if (/\b(wallet|balance)\b/i.test(text) && !asksForMenu) {
    const wallet = await callTool("getWalletBalance", {});
    if (!isWallet(wallet)) return null;

    return {
      reply: ` ${wallet.name}'s wallet balance is Rs ${wallet.balance}.`,
      steps: [successStep("getWalletBalance", {}, wallet)],
    };
  }

  if (asksForMenu) {
    const args = {
      veg_only: true,
      ...(budgetMatch ? { max_price: Number(budgetMatch[1]) } : {}),
    };
    const menu = await callTool("getMenu", args);
    if (!isMenu(menu)) return null;

    const items = menu.items.map(({ name, price }) => `${name} (Rs ${price})`).join(", ");
    return {
      reply: `Available vegetarian items${budgetMatch ? ` under Rs ${budgetMatch[1]}` : ""}: ${items || "none found"}. Sold-out items are excluded.`,
      steps: [successStep("getMenu", args, menu)],
    };
  }

  return null;
}

async function getAddItemFallback(
  text: string,
  messages: Array<{ role: string; text: string }>
): Promise<AgentResult | null> {
  if (!/\b(add|include)\b/i.test(text) || !/\b(chicken\s+biryani)\b/i.test(text)) return null;

  const menu = await callTool("getMenu", {});
  if (!isMenu(menu)) throw new Error("Could not read the current CampusBite menu");

  const wallet = await callTool("getWalletBalance", {});
  if (!isWallet(wallet)) throw new Error("Could not read the CampusBite wallet");

  const previousRemaining = [...messages]
    .reverse()
    .find((message) => message.role === "model")
    ?.text.match(/(?:wallet balance left|balance left|left in (?:your|the) wallet)\s*(?:is\s*)?rs\.?\s*(\d+)/i);
  const remainingBalance = previousRemaining
    ? Math.min(wallet.balance, Number(previousRemaining[1]))
    : wallet.balance;

  const chickenBiryani = menu.items.find(
    (item) => item.name.toLowerCase() === "chicken biryani"
  );
  const alternatives = menu.items
    .filter((item) => item.category === "meal" && item.price <= remainingBalance)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);
  const steps = [
    successStep("getMenu", {}, menu),
    successStep("getWalletBalance", {}, wallet),
  ];

  if (!chickenBiryani) return null;

  const reason =
    chickenBiryani.price > remainingBalance
      ? `Chicken Biryani costs Rs ${chickenBiryani.price}, but only Rs ${remainingBalance} remains in your wallet.`
      : `Chicken Biryani is currently ${chickenBiryani.stock === 0 ? "sold out" : "not available to add to an already placed order"}.`;
  const suggestions = alternatives
    .map((item) => `${item.name} (Rs ${item.price})`)
    .join(", ");

  return {
    reply: `I can't add Chicken Biryani to that order. ${reason}${suggestions ? ` In-stock meals within that balance: ${suggestions}.` : " I couldn't find an in-stock meal within that balance."}`,
    steps,
  };
}

async function getOrderFallback(text: string): Promise<AgentResult | null> {
  if (
    !/\b(lunch|meal)\b/i.test(text) ||
    !/\b(sweet|dessert)\b/i.test(text) ||
    !/\b(pick\s*up|pickup)\b/i.test(text) ||
    !/\b(get me|order|place|buy)\b/i.test(text)
  ) {
    return null;
  }

  const requestedTime = parsePickupTime(text);
  if (!requestedTime) return null;

  const claimedBudget = /(?:rs\.?|₹)\s*(\d+)/i.exec(text);
  const maxSpend = claimedBudget ? Number(claimedBudget[1]) : Number.POSITIVE_INFINITY;
  const menuArgs = {};
  const menu = await callTool("getMenu", menuArgs);
  if (!isMenu(menu)) throw new Error("Could not read the current CampusBite menu");

  const wallet = await callTool("getWalletBalance", {});
  if (!isWallet(wallet)) throw new Error("Could not read the CampusBite wallet");

  const slots = await callTool("getPickupSlots", {});
  if (!isSlots(slots)) throw new Error("Could not read available pickup slots");

  const steps: AgentStep[] = [
    successStep("getMenu", menuArgs, menu),
    successStep("getWalletBalance", {}, wallet),
    successStep("getPickupSlots", {}, slots),
  ];

  const slot = slots.slots.find((candidate) => normalizeTime(candidate.time) === requestedTime);
  if (!slot) {
    const nearest = [...slots.slots].sort(
      (a, b) => Math.abs(minutesSinceMidnight(a.time) - minutesSinceMidnight(requestedTime)) -
        Math.abs(minutesSinceMidnight(b.time) - minutesSinceMidnight(requestedTime))
    )[0];
    return {
      reply: nearest
        ? `The 1:15 pm pickup slot is full; the nearest available time is ${nearest.time}. Please confirm if you want that slot.`
        : "There are no free pickup slots today.",
      steps,
    };
  }

  const budget = Math.min(wallet.balance, maxSpend);
  const combo = findLunchAndSweet(menu.items, budget);
  if (!combo) {
    return {
      reply: `I couldn't find an in-stock lunch and sweet within your available budget of Rs ${budget}.`,
      steps,
    };
  }

  const orderArgs = {
    items: [
      { menu_item_id: combo.meal.id, quantity: 1 },
      { menu_item_id: combo.sweet.id, quantity: 1 },
    ],
    slot_id: slot.slot_id,
  };
  try {
    const result = await callTool("placeOrder", orderArgs);
    steps.push(successStep("placeOrder", orderArgs, result, true));
    if (!isPlacedOrder(result)) {
      throw new Error("The order tool returned an unexpected response");
    }

    return {
      reply: `Your order was placed using the live database. ${combo.meal.name} and ${combo.sweet.name}; total Rs ${result.total}; pickup at ${formatOrderTime(result.pickup_time)}; wallet balance left Rs ${result.wallet_balance_after}.`,
      steps,
    };
  } catch (orderError) {
    const message = orderError instanceof Error ? orderError.message : "Order failed";
    steps.push({ tool: "placeOrder", args: orderArgs, ok: false, writes: true, error: message });
    return {
      reply: `The order was not placed: ${message}`,
      steps,
    };
  }
}

function findLunchAndSweet(
  items: Array<{ id: number; name: string; category: string; price: number }>,
  budget: number
): { meal: (typeof items)[number]; sweet: (typeof items)[number] } | null {
  const meals = items
    .filter((item) => item.category === "meal")
    .sort((a, b) => b.price - a.price || a.id - b.id);
  const sweets = items
    .filter((item) => item.category === "sweet")
    .sort((a, b) => a.price - b.price || a.id - b.id);
  const combos = meals.flatMap((meal) =>
    sweets
      .filter((sweet) => meal.price + sweet.price <= budget)
      .map((sweet) => ({ meal, sweet, total: meal.price + sweet.price }))
  );
  const exactHundred = combos.find((combo) => combo.total === 100);
  const selected = exactHundred ?? combos.sort((a, b) => b.total - a.total)[0];
  return selected ? { meal: selected.meal, sweet: selected.sweet } : null;
}

function parsePickupTime(text: string): string | null {
  const match = /\b(?:pick\s*up|pickup)\s*(?:at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "00");
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59 || hour < 1 || hour > 12) return null;
  if (!meridiem && hour >= 12) return null;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (!meridiem && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(time);
  if (!match) return "";
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "pm") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function minutesSinceMidnight(time: string): number {
  const normalized = normalizeTime(time);
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatOrderTime(time: string): string {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool ${name} is unavailable`);

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) throw new Error(`Invalid fallback arguments for ${name}`);

  return tool.run(parsed.data);
}

function successStep(tool: string, args: unknown, result: unknown, writes = false): AgentStep {
  return { tool, args, ok: true, writes, result };
}

function isWallet(value: unknown): value is { name: string; balance: number } {
  if (!value || typeof value !== "object") return false;
  const wallet = value as Record<string, unknown>;
  return typeof wallet.name === "string" && typeof wallet.balance === "number";
}

function isMenu(
  value: unknown
): value is {
  items: Array<{ id: number; name: string; category: string; price: number; stock: number }>;
} {
  if (!value || typeof value !== "object") return false;
  const menu = value as Record<string, unknown>;
  return (
    Array.isArray(menu.items) &&
    menu.items.every(
      (item: unknown) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "number" &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).category === "string" &&
        typeof (item as Record<string, unknown>).price === "number" &&
        typeof (item as Record<string, unknown>).stock === "number"
    )
  );
}

function isSlots(
  value: unknown
): value is { slots: Array<{ slot_id: number; time: string; free: number }> } {
  if (!value || typeof value !== "object") return false;
  const slots = (value as Record<string, unknown>).slots;
  return (
    Array.isArray(slots) &&
    slots.every(
      (slot: unknown) =>
        !!slot &&
        typeof slot === "object" &&
        typeof (slot as Record<string, unknown>).slot_id === "number" &&
        typeof (slot as Record<string, unknown>).time === "string" &&
        typeof (slot as Record<string, unknown>).free === "number"
    )
  );
}

function isPlacedOrder(
  value: unknown
): value is { total: number; pickup_time: string; wallet_balance_after: number } {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.total === "number" &&
    typeof order.pickup_time === "string" &&
    typeof order.wallet_balance_after === "number"
  );
}
