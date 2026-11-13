"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireMember } from "@/lib/auth";
import { getAuth } from "@/lib/auth/server";
import { dbErrorMessage, withUser } from "@/lib/db";
import { isEmailConfigured, sendInvitationEmail } from "@/lib/email";
import { hasV2Schema, SCHEMA_PENDING_MESSAGE } from "@/lib/schema";
import { siteUrl } from "@/lib/utils";
import {
  companyNameSchema,
  firstError,
  lunchMinutesSchema,
  MAX_INVITES_PER_BATCH,
  parseEmailList,
  profileSchema,
  uuidSchema,
  validateWorkWeek,
  type WorkDayInput,
} from "@/lib/validations";
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

// --- Munkaidő és ebédszünet ----------------------------------------------------

export async function saveWorkHoursAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireMember();
  if (!(await hasV2Schema())) return { error: SCHEMA_PENDING_MESSAGE };
  const days: WorkDayInput[] = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    enabled: formData.get(`d${weekday}_enabled`) === "on",
    start: String(formData.get(`d${weekday}_start`) ?? ""),
    end: String(formData.get(`d${weekday}_end`) ?? ""),
    lunch: String(formData.get(`d${weekday}_lunch`) ?? ""),
  }));
  const checked = validateWorkWeek(days, ctx.company.lunch_minutes);
  if (!checked.ok) return { error: checked.error };

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.query("delete from work_hours where user_id = $1", [ctx.userId]);
      if (checked.rows.length > 0) {
        await tx.query(
          `insert into work_hours (user_id, company_id, weekday, start_time, end_time, lunch_start)
           select $1, $2, d.weekday, d.start_time, d.end_time, d.lunch_start
             from jsonb_to_recordset($3::jsonb) as d(weekday smallint, start_time time, end_time time, lunch_start time)`,
          [
            ctx.userId,
            ctx.company.id,
            JSON.stringify(
              checked.rows.map((r) => ({ weekday: r.weekday, start_time: r.start, end_time: r.end, lunch_start: r.lunch })),
            ),
          ],
        );
      }
    });
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: "Munkaidő elmentve." };
}

export async function updateLunchMinutesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = lunchMinutesSchema.safeParse({ minutes: formData.get("minutes") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await requireAdmin();
  if (!(await hasV2Schema())) return { error: SCHEMA_PENDING_MESSAGE };
  const res = await run(ctx.userId, "update companies set lunch_minutes = $1 where id = $2", [
    parsed.data.minutes,
    ctx.company.id,
  ]);
  if (!res.ok) return { error: res.error };

  revalidatePath("/", "layout");
  return { success: "Ebédszünet hossza elmentve." };
}

// --- Meghívók ----------------------------------------------------------------

const INVITE_VALID_DAYS = 14;

export type InviteResult = {
  email: string;
  status: "sent" | "link" | "member" | "failed";
  url?: string;
};

export type InviteState = { error?: string; success?: string; results?: InviteResult[] } | null;

function inviteUrl(token: string) {
  return `${siteUrl()}/invite/${token}`;
}

export async function sendInvitationsAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { emails, invalid } = parseEmailList(String(formData.get("emails") ?? ""));
  if (invalid.length > 0) return { error: `Érvénytelen email cím: ${invalid.slice(0, 3).join(", ")}` };
  if (emails.length === 0) return { error: "Adj meg legalább egy email címet." };
  if (emails.length > MAX_INVITES_PER_BATCH) {
    return { error: `Egyszerre legfeljebb ${MAX_INVITES_PER_BATCH} címre küldhetsz meghívót.` };
  }

  const ctx = await requireAdmin();
  if (!(await hasV2Schema())) return { error: SCHEMA_PENDING_MESSAGE };
  let created: { email: string; token: string; member: boolean }[];
  try {
    created = await withUser(ctx.userId, async (tx) => {
      const members = await tx.query<{ email: string }>(
        "select lower(email) as email from profiles where company_id = $1 and lower(email) = any($2::text[])",
        [ctx.company.id, emails],
      );
      const memberSet = new Set(members.map((m) => m.email));
      const out: { email: string; token: string; member: boolean }[] = [];
      for (const email of emails) {
        if (memberSet.has(email)) {
          out.push({ email, token: "", member: true });
          continue;
        }
        // Nyitott meghívó esetén csak meghosszabbítjuk és újraküldjük.
        const row = await tx.one<{ token: string }>(
          `insert into company_invitations (company_id, email, invited_by, expires_at)
           values ($1, $2, $3, now() + make_interval(days => $4))
           on conflict (company_id, email) where accepted_at is null
           do update set expires_at = excluded.expires_at
           returning token`,
          [ctx.company.id, email, ctx.userId, INVITE_VALID_DAYS],
        );
        out.push({ email, token: row!.token, member: false });
      }
      return out;
    });
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  // Az emailek párhuzamosan mennek ki
  const results: InviteResult[] = await Promise.all(
    created.map(async (c): Promise<InviteResult> => {
      if (c.member) return { email: c.email, status: "member" };
      const url = inviteUrl(c.token);
      const mail = await sendInvitationEmail({
        to: c.email,
        companyName: ctx.company.name,
        inviterName: ctx.profile.full_name,
        url,
        expiresInDays: INVITE_VALID_DAYS,
      });
      return { email: c.email, status: mail.sent ? "sent" : mail.reason === "not_configured" ? "link" : "failed", url };
    }),
  );

  revalidatePath("/settings");
  const sent = results.filter((r) => r.status === "sent").length;
  return {
    results,
    success: isEmailConfigured()
      ? `${sent} meghívó elküldve.`
      : "A meghívók elkészültek. Az emailküldés még nincs beállítva, ezért másold ki és küldd el a linkeket.",
  };
}

export async function resendInvitationAction(id: string): Promise<{ ok: boolean; message: string; url?: string }> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Érvénytelen azonosító." };

  const ctx = await requireAdmin();
  let row: { email: string; token: string } | null;
  try {
    row = await withUser(ctx.userId, (tx) =>
      tx.one<{ email: string; token: string }>(
        `update company_invitations set expires_at = now() + make_interval(days => $2)
          where id = $1 and accepted_at is null
          returning email, token`,
        [parsed.data, INVITE_VALID_DAYS],
      ),
    );
  } catch (error) {
    return { ok: false, message: dbErrorMessage(error) };
  }
  if (!row) return { ok: false, message: "A meghívó nem található, vagy már elfogadták." };

  const url = inviteUrl(row.token);
  const mail = await sendInvitationEmail({
    to: row.email,
    companyName: ctx.company.name,
    inviterName: ctx.profile.full_name,
    url,
    expiresInDays: INVITE_VALID_DAYS,
  });
  revalidatePath("/settings");
  if (mail.sent) return { ok: true, message: `Újraküldve: ${row.email}` };
  if (mail.reason === "not_configured") return { ok: true, message: "Meghosszabbítva. Másold ki a linket.", url };
  return { ok: false, message: "Az emailt nem sikerült elküldeni. Próbáld újra később, vagy másold ki a linket.", url };
}

export async function revokeInvitationAction(id: string): Promise<Result> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Érvénytelen azonosító." };
  const ctx = await requireAdmin();
  const res = await run(ctx.userId, "delete from company_invitations where id = $1 and accepted_at is null", [parsed.data]);
  if (res.ok) revalidatePath("/settings");
  return res;
}
