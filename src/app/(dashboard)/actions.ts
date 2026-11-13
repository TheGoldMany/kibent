"use server";

import { revalidatePath } from "next/cache";
import { requireMember, withMember } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db";
import { firstError, recurringPatternSchema, setDayStatusSchema } from "@/lib/validations";
import type { WorkStatus } from "@/lib/database.types";
import type { FormState } from "@/components/ui/form-message";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Gyors váltás a saját cellán: iroda / home office, vagy null = vissza a heti rutinra. */
export async function setDayStatusAction(date: string, status: WorkStatus | null): Promise<ActionResult> {
  const parsed = setDayStatusSchema.safeParse({ date, status });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const ctx = await requireMember();
  const { date: day, status: next } = parsed.data;

  let blocked = false;
  try {
    await withMember(ctx, async (tx) => {
      const existing = await tx.one<{ status: string; approval_status: string }>(
        "select status, approval_status from schedules where user_id = $1 and date = $2 and company_id = $3 for update",
        [ctx.userId, day, ctx.company.id],
      );
      if (
        existing &&
        (existing.status === "vacation" || existing.status === "sick") &&
        existing.approval_status !== "rejected"
      ) {
        blocked = true;
        return;
      }
      if (next === null) {
        await tx.query("delete from schedules where user_id = $1 and date = $2 and company_id = $3", [ctx.userId, day, ctx.company.id]);
      } else {
        await tx.query(
          `insert into schedules (company_id, user_id, date, status, approval_status, request_group_id, note)
           values ($1, $2, $3, $4, 'approved', null, null)
           on conflict (user_id, company_id, date) do update
             set status = excluded.status, approval_status = 'approved', request_group_id = null, note = null`,
          [ctx.company.id, ctx.userId, day, next],
        );
      }
    });
  } catch (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }

  if (blocked) {
    return {
      ok: false,
      error: "Erre a napra szabadság vagy betegszabadság van rögzítve. Előbb vond vissza a Kérelmek oldalon.",
    };
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
  const p = parsed.data;
  try {
    await withMember(ctx, (tx) =>
      tx.query(
        `insert into recurring_patterns (user_id, company_id, mon, tue, wed, thu, fri)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, company_id) do update
           set mon = excluded.mon, tue = excluded.tue, wed = excluded.wed, thu = excluded.thu, fri = excluded.fri`,
        [ctx.userId, ctx.company.id, p.mon, p.tue, p.wed, p.thu, p.fri],
      ),
    );
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: "Heti rutin elmentve." };
}
