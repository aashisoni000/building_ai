import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health  -> shows which settings are missing (never shows the values). */
export async function GET() {
  // GEMINI_MODEL is optional (it has a default), so it is not checked here.
  const names = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_PASSCODE"];
  const settings = Object.fromEntries(names.map((n) => [n, Boolean(process.env[n]?.trim())]));

  let menuTable = false;
  let databaseError: string | undefined;
  try {
    const { error } = await getSupabase().from("menu_items").select("id").limit(1);
    if (error) {
      databaseError = error.message;
      console.error("[health:menu_items]", error.message);
    } else {
      menuTable = true;
    }
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Could not check menu_items table";
    console.error("[health:menu_items]", databaseError);
  }

  return NextResponse.json({
    ok: Object.values(settings).every(Boolean) && menuTable,
    settings,
    database: { menu_items: menuTable, ...(databaseError ? { error: databaseError } : {}) },
  });
}
