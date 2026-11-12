"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireMember } from "@/lib/auth";
import { getAuth } from "@/lib/auth/server";
import { dbErrorMessage, withUser } from "@/lib/db";
import { companyNameSchema, firstError, profileSchema, uuidSchema } from "@/lib/validations";
import type { Role } from "@/lib/database.types";
import type { FormState } from "@/components/ui/form-message";

type Result = { ok: true } | { ok: false; error: string };

async function run(userId: string, sql: string, params: unknown[]): Promise<Result> {
  try {
    await withUser(userId, (tx) => tx.query(sql, params));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await requireMember();
  const res = await run(ctx.userId, "update profiles set full_name = $1 where id = $2", [parsed.data.fullName, ctx.userId]);
  if (!res.ok) return { error: res.error };
  // A Neon Auth felhasználói nevét is frissítjük (nem kritikus, ha nem sikerül).
  await getAuth()
    .updateUser({ name: parsed.data.fullName })
    .catch((e: unknown) => console.error("[auth] updateUser", e));

  revalidatePath("/", "layout");
  return { success: "Profil elmentve." };
}

export async function regenerateIcalTokenAction(): Promise<Result> {
  const ctx = await requireMember();
  const res = await run(ctx.userId, "select public.regenerate_ical_token()", []);
  if (res.ok) revalidatePath("/settings");
  return res;
}

export async function updateCompanyNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = companyNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await requireAdmin();
  const res = await run(ctx.userId, "update companies set name = $1 where id = $2", [parsed.data.name, ctx.company.id]);
  if (!res.ok) return { error: res.error };

  revalidatePath("/", "layout");
  return { success: "Cégnév elmentve." };
}

export async function regenerateInviteCodeAction(): Promise<Result> {
  const ctx = await requireAdmin();
  const res = await run(ctx.userId, "select public.regenerate_invite_code()", []);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function setMemberRoleAction(userId: string, role: Role): Promise<Result> {
  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success || (role !== "admin" && role !== "member")) return { ok: false, error: "Érvénytelen adatok." };

  const ctx = await requireAdmin();
  const res = await run(ctx.userId, "select public.set_member_role($1, $2)", [parsed.data, role]);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function removeMemberAction(userId: string): Promise<Result> {
  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, error: "Érvénytelen azonosító." };

  const ctx = await requireAdmin();
  const res = await run(ctx.userId, "select public.remove_member($1)", [parsed.data]);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
