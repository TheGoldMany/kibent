import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseUrl } from "@/lib/env";

/**
 * Service Role kliens – megkerüli az RLS-t!
 * KIZÁRÓLAG az iCal feed route használhatja, ahol nincs felhasználói süti,
 * és a hozzáférést az ical_token azonosítja.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Hiányzó környezeti változó: SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
