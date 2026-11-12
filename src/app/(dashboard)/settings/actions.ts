"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMember } from "@/lib/auth";
import { friendlyError } from "@/lib/utils";
import { companyNameSchema, firstError, profileSchema, uuidSchema } from "@/lib/validations";
import type { Role } from "@/lib/database.types";
import type { FormState } from "@/components/ui/form-message";

type Result = { ok: true } | { ok: false; error: string };

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", ctx.userId);
  if (error) return { error: friendlyError(error) };

  revalidatePath("/", "layout");
  return { success: "Profil elmentve." };
}

export async function regenerateIcalTokenAction(): Promise<Result> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_ical_token");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateCompanyNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = companyNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ name: parsed.data.name }).eq("id", ctx.company.id);
  if (error) return { error: friendlyError(error) };

  revalidatePath("/", "layout");
  return { success: "Cégnév elmentve." };
}

export async function regenerateInviteCodeAction(): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_invite_code");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setMemberRoleAction(userId: string, role: Role): Promise<Result> {
  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success || (role !== "admin" && role !== "member")) return { ok: false, error: "Érvénytelen adatok." };

  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { target_user: parsed.data, new_role: role });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeMemberAction(userId: string): Promise<Result> {
  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, error: "Érvénytelen azonosító." };

  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { target_user: parsed.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
