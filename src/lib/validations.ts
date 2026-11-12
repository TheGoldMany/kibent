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
