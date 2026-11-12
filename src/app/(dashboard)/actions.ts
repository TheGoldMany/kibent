"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { friendlyError } from "@/lib/utils";
import { firstError, recurringPatternSchema, setDayStatusSchema } from "@/lib/validations";
import type { WorkStatus } from "@/lib/database.types";
import type { FormState } from "@/components/ui/form-message";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Gyors váltás a saját cellán: iroda / home office, vagy null = vissza a heti rutinra. */
export async function setDayStatusAction(date: string, status: WorkStatus | null): Promise<ActionResult> {
  const parsed = setDayStatusSchema.safeParse({ date, status });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const ctx = await requireMember();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("schedules")
    .select("status, approval_status")
    .eq("user_id", ctx.userId)
    .eq("date", parsed.data.date)
    .maybeSingle();

  if (existing && (existing.status === "vacation" || existing.status === "sick") && existing.approval_status !== "rejected") {
    return {
      ok: false,
      error: "Erre a napra szabadság vagy betegszabadság van rögzítve. Előbb vond vissza a Kérelmek oldalon.",
    };
  }

  if (parsed.data.status === null) {
    const { error } = await supabase
      .from("schedules")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("date", parsed.data.date);
    if (error) return { ok: false, error: friendlyError(error) };
  } else {
    const { error } = await supabase.from("schedules").upsert(
      {
        company_id: ctx.company.id,
        user_id: ctx.userId,
        date: parsed.data.date,
        status: parsed.data.status,
        approval_status: "approved",
        request_group_id: null,
        note: null,
      },
      { onConflict: "user_id,date" },
    );
    if (error) return { ok: false, error: friendlyError(error) };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function saveRecurringPatternAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const read = (k: string) => {
    const v = formData.get(k);
    return v === "office" || v === "remote" ? v : null;
  };
  const parsed = recurringPatternSchema.safeParse({
    mon: read("mon"),
    tue: read("tue"),
    wed: read("wed"),
    thu: read("thu"),
    fri: read("fri"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await requireMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_patterns")
    .upsert({ user_id: ctx.userId, company_id: ctx.company.id, ...parsed.data }, { onConflict: "user_id" });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: "Heti rutin elmentve." };
}
