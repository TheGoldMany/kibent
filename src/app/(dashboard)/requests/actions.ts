"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireMember, type MemberContext } from "@/lib/auth";
import { todayISO, workdaysBetween } from "@/lib/dates";
import { friendlyError } from "@/lib/utils";
import {
  firstError,
  leaveRequestSchema,
  reviewSchema,
  safeFileName,
  uuidSchema,
  validateUpload,
} from "@/lib/validations";
import type { FormState } from "@/components/ui/form-message";

const BUCKET = "medical-docs";
const SIGNED_URL_TTL_SECONDS = 60;

type Result = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/requests");
}

function readFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

async function uploadMedicalDoc(ctx: MemberContext, groupId: string, file: File): Promise<string | null> {
  const validationError = validateUpload(file);
  if (validationError) return validationError;

  const supabase = await createClient();
  // Útvonal: {company_id}/{user_id}/{request_group_id}/{uuid}-{fájlnév}
  const path = `${ctx.company.id}/${ctx.userId}/${groupId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return `A fájl feltöltése nem sikerült: ${uploadError.message}`;

  const { error: insertError } = await supabase.from("medical_documents").insert({
    company_id: ctx.company.id,
    user_id: ctx.userId,
    request_group_id: groupId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: file.type as "application/pdf" | "image/jpeg" | "image/png",
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return friendlyError(insertError);
  }
  return null;
}

export async function createLeaveRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = leaveRequestSchema.safeParse({
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const file = readFile(formData);
  if (file && parsed.data.type !== "sick") return { error: "Igazolás csak betegszabadsághoz tölthető fel." };
  if (file) {
    const fileError = validateUpload(file);
    if (fileError) return { error: fileError };
  }

  const ctx = await requireMember();
  const supabase = await createClient();
  const { type, startDate, endDate, note } = parsed.data;
  const days = workdaysBetween(startDate, endDate);

  // Ütközés meglévő (nem elutasított) szabadsággal / betegszabadsággal
  const { data: conflicts, error: conflictError } = await supabase
    .from("schedules")
    .select("date")
    .eq("user_id", ctx.userId)
    .in("date", days)
    .in("status", ["vacation", "sick"])
    .neq("approval_status", "rejected")
    .order("date")
    .limit(1);
  if (conflictError) return { error: friendlyError(conflictError) };
  if (conflicts.length > 0) {
    return {
      error: `Az időszak ütközik egy meglévő kérelmeddel (${conflicts[0]!.date}). Előbb vond vissza azt a Kérelmek oldalon.`,
    };
  }

  const isAdmin = ctx.profile.role === "admin";
  const approval = type === "sick" || isAdmin ? "approved" : "pending";
  const groupId = crypto.randomUUID();

  const { error } = await supabase.from("schedules").upsert(
    days.map((date) => ({
      company_id: ctx.company.id,
      user_id: ctx.userId,
      date,
      status: type,
      approval_status: approval,
      request_group_id: groupId,
      note,
    })),
    { onConflict: "user_id,date" },
  );
  if (error) return { error: friendlyError(error) };

  let uploadWarning: string | null = null;
  if (file) uploadWarning = await uploadMedicalDoc(ctx, groupId, file);

  revalidateAll();

  const base =
    type === "sick"
      ? `Betegszabadság rögzítve (${days.length} munkanap). Jobbulást! 🍵`
      : approval === "pending"
        ? `Szabadságkérelem elküldve (${days.length} munkanap). Az adminisztrátor hamarosan elbírálja.`
        : `Szabadság rögzítve (${days.length} munkanap).`;

  if (uploadWarning) return { error: `${base} Az igazolás feltöltése azonban nem sikerült: ${uploadWarning}` };
  return { success: base };
}

export async function reviewRequestAction(groupId: string, decision: "approved" | "rejected"): Promise<Result> {
  const parsed = reviewSchema.safeParse({ groupId, decision });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const ctx = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ approval_status: parsed.data.decision })
    .eq("company_id", ctx.company.id)
    .eq("request_group_id", parsed.data.groupId)
    .eq("status", "vacation")
    .eq("approval_status", "pending")
    .select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data || data.length === 0) return { ok: false, error: "A kérelmet már elbírálták vagy visszavonták." };

  revalidateAll();
  return { ok: true };
}

export async function cancelRequestAction(groupId: string): Promise<Result> {
  const parsedId = uuidSchema.safeParse(groupId);
  if (!parsedId.success) return { ok: false, error: firstError(parsedId.error) };

  const ctx = await requireMember();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("schedules")
    .select("date, approval_status")
    .eq("user_id", ctx.userId)
    .eq("request_group_id", parsedId.data);
  if (!rows || rows.length === 0) return { ok: false, error: "A kérelem nem található." };
  const lastDay = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0]!.date);
  const isPending = rows.some((r) => r.approval_status === "pending");
  if (lastDay < todayISO() && !isPending) {
    return { ok: false, error: "Lezárult távollét már nem vonható vissza." };
  }

  const { data: docs } = await supabase
    .from("medical_documents")
    .select("id, storage_path")
    .eq("request_group_id", parsedId.data)
    .eq("user_id", ctx.userId);

  if (docs && docs.length > 0) {
    await supabase.storage.from(BUCKET).remove(docs.map((d) => d.storage_path));
    await supabase.from("medical_documents").delete().in("id", docs.map((d) => d.id));
  }

  const { error } = await supabase
    .from("schedules")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("request_group_id", parsedId.data);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidateAll();
  return { ok: true };
}

export async function uploadMedicalDocAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsedId = uuidSchema.safeParse(formData.get("groupId"));
  if (!parsedId.success) return { error: firstError(parsedId.error) };
  const file = readFile(formData);
  if (!file) return { error: "Válassz ki egy fájlt." };

  const ctx = await requireMember();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("schedules")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("request_group_id", parsedId.data)
    .eq("status", "sick")
    .limit(1);
  if (!rows || rows.length === 0) return { error: "Igazolás csak saját betegszabadsághoz tölthető fel." };

  const uploadError = await uploadMedicalDoc(ctx, parsedId.data, file);
  if (uploadError) return { error: uploadError };

  revalidatePath("/requests");
  return { success: "Igazolás feltöltve." };
}

/** 60 másodpercig érvényes, aláírt URL – RLS miatt csak a feltöltő és az adminok kapnak választ. */
export async function getMedicalDocUrlAction(
  docId: string,
): Promise<{ ok: true; url: string; mimeType: string; fileName: string } | { ok: false; error: string }> {
  const parsedId = uuidSchema.safeParse(docId);
  if (!parsedId.success) return { ok: false, error: firstError(parsedId.error) };

  await requireMember();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("medical_documents")
    .select("storage_path, mime_type, file_name")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (!doc) return { ok: false, error: "A dokumentum nem található, vagy nincs hozzá jogosultságod." };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return { ok: false, error: "Nem sikerült megnyitni a dokumentumot." };

  return { ok: true, url: data.signedUrl, mimeType: doc.mime_type, fileName: doc.file_name };
}

export async function deleteMedicalDocAction(docId: string): Promise<Result> {
  const parsedId = uuidSchema.safeParse(docId);
  if (!parsedId.success) return { ok: false, error: firstError(parsedId.error) };

  await requireMember();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("medical_documents")
    .select("id, storage_path")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (!doc) return { ok: false, error: "A dokumentum nem található." };

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (storageError) return { ok: false, error: "Nem sikerült törölni a fájlt." };
  const { error } = await supabase.from("medical_documents").delete().eq("id", doc.id);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/requests");
  return { ok: true };
}
