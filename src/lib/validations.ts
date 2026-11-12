import { z } from "zod";
import { isISODate, workdaysBetween } from "@/lib/dates";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_LEAVE_WORKDAYS = 60;

const isoDate = z.string().refine(isISODate, { message: "Érvénytelen dátum." });

export const companyNameSchema = z.object({
  name: z.string().trim().min(2, "A cég neve legalább 2 karakter legyen.").max(120, "Túl hosszú név."),
});

export const inviteCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, "A meghívókód 8 karakterből áll."),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "A név legalább 2 karakter legyen.").max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Érvénytelen email cím."),
  password: z.string().min(8, "A jelszó legalább 8 karakter legyen."),
});

export const signupSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, "Add meg a teljes neved.").max(120),
});

export const magicLinkSchema = z.object({
  email: z.string().trim().email("Érvénytelen email cím."),
});

const workStatus = z.enum(["office", "remote"]).nullable();

export const recurringPatternSchema = z.object({
  mon: workStatus,
  tue: workStatus,
  wed: workStatus,
  thu: workStatus,
  fri: workStatus,
});

export const setDayStatusSchema = z.object({
  date: isoDate,
  status: z.enum(["office", "remote"]).nullable(), // null = explicit bejegyzés törlése (vissza a rutinra)
});

export const leaveRequestSchema = z
  .object({
    type: z.enum(["vacation", "sick"]),
    startDate: isoDate,
    endDate: isoDate,
    note: z
      .string()
      .trim()
      .max(500, "A megjegyzés legfeljebb 500 karakter.")
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((val, ctx) => {
    if (val.endDate < val.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "A záró dátum nem lehet a kezdő előtt." });
      return;
    }
    const days = workdaysBetween(val.startDate, val.endDate);
    if (days.length === 0) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "A kiválasztott időszakban nincs munkanap." });
    } else if (days.length > MAX_LEAVE_WORKDAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `Egy kérelem legfeljebb ${MAX_LEAVE_WORKDAYS} munkanapot tartalmazhat.`,
      });
    }
  });

// Általános UUID formátum (verziótól függetlenül – a Zod 4 uuid() csak RFC változatot fogad el).
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Érvénytelen azonosító.");

export const reviewSchema = z.object({
  groupId: uuidSchema,
  decision: z.enum(["approved", "rejected"]),
});

export function validateUpload(file: File): string | null {
  if (file.size === 0) return "A fájl üres.";
  if (file.size > MAX_UPLOAD_BYTES) return "A fájl mérete legfeljebb 10 MB lehet.";
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Csak PDF, JPG vagy PNG fájl tölthető fel.";
  }
  return null;
}

/** Biztonságos fájlnév a storage útvonalhoz (ékezetek, speciális karakterek nélkül). */
export function safeFileName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-100);
  return base || "igazolas";
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Érvénytelen adatok.";
}

// --- Munkaidő -------------------------------------------------------------------

/** „HH:MM” → percek éjfél óta (null, ha érvénytelen). */
export function timeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Percek → „H:MM” (pl. 9:05). */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** „09:00:00” → „9:00”. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const m = timeToMinutes(value);
  return m === null ? value : minutesToTime(m);
}

export const LUNCH_MINUTE_OPTIONS = [0, 15, 20, 30, 45, 60, 90] as const;

export const lunchMinutesSchema = z.object({
  minutes: z.coerce
    .number()
    .int()
    .refine((v) => (LUNCH_MINUTE_OPTIONS as readonly number[]).includes(v), "Válassz a megadott hosszak közül."),
});

const DAY_LABELS = ["", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek"];

export type WorkDayInput = { weekday: number; enabled: boolean; start: string; end: string; lunch: string };

/**
 * Egy hét munkaidejének ellenőrzése. A lunchMinutes a cég ebédszünet-hossza:
 * az ebédnek bele kell férnie a munkaidőbe.
 */
export function validateWorkWeek(
  days: WorkDayInput[],
  lunchMinutes: number,
): { ok: true; rows: { weekday: number; start: string; end: string; lunch: string | null }[] } | { ok: false; error: string } {
  const rows: { weekday: number; start: string; end: string; lunch: string | null }[] = [];
  for (const d of days) {
    if (!d.enabled) continue;
    const label = DAY_LABELS[d.weekday] ?? "Nap";
    const start = timeToMinutes(d.start);
    const end = timeToMinutes(d.end);
    if (start === null || end === null) return { ok: false, error: `${label}: add meg a munkaidő kezdetét és végét.` };
    if (end <= start) return { ok: false, error: `${label}: a munkaidő vége legyen később, mint a kezdete.` };
    let lunch: string | null = null;
    if (d.lunch.trim()) {
      const l = timeToMinutes(d.lunch);
      if (l === null) return { ok: false, error: `${label}: érvénytelen ebédidő.` };
      if (l < start || l + lunchMinutes > end) {
        return { ok: false, error: `${label}: az ebédszünetnek (${lunchMinutes} perc) bele kell férnie a munkaidőbe.` };
      }
      lunch = minutesToTime(l);
    }
    rows.push({ weekday: d.weekday, start: minutesToTime(start), end: minutesToTime(end), lunch });
  }
  return { ok: true, rows };
}

// --- Meghívók -------------------------------------------------------------------

export const MAX_INVITES_PER_BATCH = 20;

/** Vesszővel, pontosvesszővel, szóközzel vagy új sorral elválasztott email címek. */
export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (z.string().email().safeParse(p).success) {
      if (!emails.includes(p)) emails.push(p);
    } else {
      invalid.push(p);
    }
  }
  return { emails, invalid };
}
