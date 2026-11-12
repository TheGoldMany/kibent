import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Függő szabadságkérelmek (csoportok) száma a cégben. */
export async function countPendingRequests(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedules")
    .select("request_group_id, user_id")
    .eq("company_id", companyId)
    .eq("approval_status", "pending");
  if (!data) return 0;
  return new Set(data.map((r) => r.request_group_id ?? `${r.user_id}`)).size;
}
