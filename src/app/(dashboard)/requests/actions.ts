"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireMember, type MemberContext } from "@/lib/auth";
import { deletePrivate, signedReadUrl, uploadPrivate } from "@/lib/blob";
import { dbErrorMessage, withUser } from "@/lib/db";
import { todayISO, workdaysBetween } from "@/lib/dates";
import {
  firstError,
  leaveRequestSchema,
  reviewSchema,
  safeFileName,
  uuidSchema,
  validateUpload,
} from "@/lib/validations";
import type { FormState } from "@/components/ui/form-message";

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

  // Útvonal: {company_id}/{user_id}/{request_group_id}/{uuid}-{fájlnév}
  const path = `${ctx.company.id}/${ctx.userId}/${groupId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

  // Előbb a metaadat (RLS ellenőrzi: saját betegszabadság), csak utána a fájl.
  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.query(
        `insert into medical_documents (company_id, user_id, request_group_id, storage_path, file_name, mime_type)
         values ($1, $2, $3, $4, $5, $6)`,
        [ctx.company.id, ctx.userId, groupId, path, file.name.slice(0, 200), file.type],
      );
      // Ha a feltöltés elbukik, a kivétel visszagörgeti a metaadatot is.
      await uploadPrivate(path, file);
    });
  } catch (error) {
    if ((error as { code?: string })?.code) return dbErrorMessage(error);
    console.error("[blob] upload", error);
    return "A fájl feltöltése nem sikerült. Próbáld újra később.";
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
  const { type, startDate, endDate, note } = parsed.data;
  const days = workdaysBetween(startDate, endDate);

  const isAdmin = ctx.profile.role === "admin";
  const approval = type === "sick" || isAdmin ? "approved" : "pending";
  const groupId = crypto.randomUUID();

  let conflict: string | null = null;
  try {
    await withUser(ctx.userId, async (tx) => {
      // Ütközés meglévő (nem elutasított) szabadsággal / betegszabadsággal
      const hit = await tx.one<{ date: string }>(
        `select date from schedules
          where user_id = $1 and date = any($2::date[])
            and status in ('vacation', 'sick') and approval_status <> 'rejected'
          order by date limit 1`,
        [ctx.userId, days],
      );
      if (hit) {
        conflict = hit.date;
        return;
      }
      await tx.query(
        `insert into schedules (company_id, user_id, date, status, approval_status, request_group_id, note)
         select $1, $2, d, $4, $5, $6, $7 from unnest($3::date[]) as d
         on conflict (user_id, date) do update
           set status = excluded.status, approval_status = excluded.approval_status,
               request_group_id = excluded.request_group_id, note = excluded.note`,
        [ctx.company.id, ctx.userId, days, type, approval, groupId, note],
      );
    });
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }
  if (conflict) {
    return {
      error: `Az időszak ütközik egy meglévő kérelmeddel (${conflict}). Előbb vond vissza azt a Kérelmek oldalon.`,
    };
  }

  let uploadWarning: string | null = null;
  if (file) uploadWarning = await uploadMedicalDoc(ctx, groupId, file);

  revalidateAll();

  const base =
    type === "sick"
      ? `Betegszabadság rögzítve (${days.length} munkanap). Jobbulást!`
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
  let updated: { id: string }[] = [];
  try {
    updated = await withUser(ctx.userId, (tx) =>
      tx.query<{ id: string }>(
        `update schedules set approval_status = $1
          where company_id = $2 and request_group_id = $3
            and status = 'vacation' and approval_status = 'pending'
          returning id`,
        [parsed.data.decision, ctx.company.id, parsed.data.groupId],
      ),
    );
  } catch (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (updated.length === 0) return { ok: false, error: "A kérelmet már elbírálták vagy visszavonták." };

  revalidateAll();
  return { ok: true };
}

export async function cancelRequestAction(groupId: string): Promise<Result> {
  const parsedId = uuidSchema.safeParse(groupId);
  if (!parsedId.success) return { ok: false, error: firstError(parsedId.error) };

  const ctx = await requireMember();
  type Outcome = { error: string } | { paths: string[] };
  let outcome: Outcome;
  try {
    outcome = await withUser(ctx.userId, async (tx): Promise<Outcome> => {
      const rows = await tx.query<{ date: string; approval_status: string }>(
        "select date, approval_status from schedules where user_id = $1 and request_group_id = $2 for update",
        [ctx.userId, parsedId.data],
      );
      if (rows.length === 0) return { error: "A kérelem nem található." };
      const lastDay = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0]!.date);
      const isPending = rows.some((r) => r.approval_status === "pending");
      if (lastDay < todayISO() && !isPending) return { error: "Lezárult távollét már nem vonható vissza." };

      const docs = await tx.query<{ storage_path: string }>(
        "delete from medical_documents where request_group_id = $1 and user_id = $2 returning storage_path",
        [parsedId.data, ctx.userId],
      );
      await tx.query("delete from schedules where user_id = $1 and request_group_id = $2", [ctx.userId, parsedId.data]);
      return { paths: docs.map((d) => d.storage_path) };
    });
  } catch (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
  if ("error" in outcome) return { ok: false, error: outcome.error };
  await deletePrivate(outcome.paths).catch((e) => console.error("[blob] delete", e));

  revalidateAll();
  return { ok: true };
}

export async function uploadMedicalDocAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsedId = uuidSchema.safeParse(formData.get("groupId"));
  if (!parsedId.success) return { error: firstError(parsedId.error) };
  const file = readFile(formData);
  if (!file) return { error: "Válassz ki egy fájlt." };

  const ctx = await requireMember();

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

  const ctx = await requireMember();
  // RLS: csak a feltöltő és a cég adminja kap vissza sort.
  const doc = await withUser(ctx.userId, (tx) =>
    tx.one<{ storage_path: string; mime_type: string; file_name: string }>(
      "select storage_path, mime_type, file_name from medical_documents where id = $1",
      [parsedId.data],
    ),
  );
  if (!doc) return { ok: false, error: "A dokumentum nem található, vagy nincs hozzá jogosultságod." };

  try {
    const url = await signedReadUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    return { ok: true, url, mimeType: doc.mime_type, fileName: doc.file_name };
  } catch (error) {
    console.error("[blob] presign", error);
    return { ok: false, error: "Nem sikerült megnyitni a dokumentumot." };
  }
}

export async function deleteMedicalDocAction(docId: string): Promise<Result> {
  const parsedId = uuidSchema.safeParse(docId);
  if (!parsedId.success) return { ok: false, error: firstError(parsedId.error) };

  const ctx = await requireMember();
  let path: string | null;
  try {
    path = await withUser(ctx.userId, async (tx) => {
      const row = await tx.one<{ storage_path: string }>(
        "delete from medical_documents where id = $1 returning storage_path",
        [parsedId.data],
      );
      return row?.storage_path ?? null;
    });
  } catch (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!path) return { ok: false, error: "A dokumentum nem található." };
  await deletePrivate([path]).catch((e) => console.error("[blob] delete", e));

  revalidatePath("/requests");
  return { ok: true };
}
