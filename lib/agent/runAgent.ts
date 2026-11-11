import "server-only";
import type { Content, Part } from "@google/genai";
import { getGemini } from "../gemini";
import { GEMINI_MODEL } from "../env";
import type { ChatMessage } from "../schemas";
import { tools } from "./tools";
import { toFunctionDeclarations } from "./defineTool";
import { buildSystemPrompt } from "./systemPrompt";
import type { AgentResult, AgentStep } from "./types";

/** Stops the agent from looping forever and using up your Gemini quota. */
const MAX_ROUNDS = 8;

/**
 * THE AGENT LOOP
 * 1. Send the chat + the tool list to Gemini.
 * 2. If Gemini asks for tools, check the arguments with Zod and run them.
 * 3. Send the results back to Gemini.
 * 4. Repeat until Gemini gives a final text answer (or MAX_ROUNDS is reached).
 */
export async function runAgent(messages: ChatMessage[]): Promise<AgentResult> {
  const ai = getGemini();
  const steps: AgentStep[] = [];
  const functionDeclarations = toFunctionDeclarations(tools);

  const contents: Content[] = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(),
          tools: [{ functionDeclarations }],
          temperature: 0.2,
        },
      });
    } catch (error) {
      const placedOrder = steps.find((step) => step.tool === "placeOrder" && step.ok);
      if (placedOrder) {
        return {
          reply: summarizePlacedOrder(placedOrder.result),
          steps,
        };
      }
      throw error;
    }

    const calls = response.functionCalls ?? [];

    // No tool requested: this is the final answer.
    if (calls.length === 0) {
      return { reply: response.text?.trim() || "Sorry, I could not answer that.", steps };
    }

    // Keep Gemini's own turn (it carries the tool request) in the history.
    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    const responseParts: Part[] = [];
    for (const call of calls) {
      const step = await runTool(call.name ?? "", call.args ?? {});
      steps.push(step);
      responseParts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: step.ok ? { result: step.result } : { error: step.error },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    reply: "I needed too many steps for this request. Please try a simpler or more specific question.",
    steps,
  };
}

function summarizePlacedOrder(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "Your order was placed successfully.";
  }

  const order = result as Record<string, unknown>;
  const items = Array.isArray(order.items)
    ? order.items
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const line = item as Record<string, unknown>;
          return typeof line.item === "string" ? line.item : "";
        })
        .filter(Boolean)
        .join(", ")
    : "";
  const total = typeof order.total === "number" ? ` Total: Rs ${order.total}.` : "";
  const pickup =
    typeof order.pickup_time === "string"
      ? ` Pickup: ${formatPickupTime(order.pickup_time)}.`
      : "";
  const balance =
    typeof order.wallet_balance_after === "number"
      ? ` Wallet balance left: Rs ${order.wallet_balance_after}.`
      : "";

  return `Your order was placed successfully${items ? `: ${items}.` : "."}${total}${pickup}${balance}`;
}

function formatPickupTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "am" : "pm"}`;
}

async function runTool(name: string, rawArgs: unknown): Promise<AgentStep> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { tool: name, args: rawArgs, ok: false, writes: false, error: `Unknown tool: ${name}` };
  }

  // Never trust the model's arguments: check them with Zod first.
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
    return { tool: name, args: rawArgs, ok: false, writes: tool.writes, error: `Invalid arguments: ${message}` };
  }

  try {
    const result = await tool.run(parsed.data);
    return { tool: name, args: parsed.data, ok: true, writes: tool.writes, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    return { tool: name, args: parsed.data, ok: false, writes: tool.writes, error: message };
  }
}
