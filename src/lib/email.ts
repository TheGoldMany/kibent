import "server-only";
import { siteUrl } from "@/lib/utils";

/**
 * Tranzakciós emailek a Resend API-val (https://resend.com), egységes Kibent-dizájnnal.
 * Beállítás: RESEND_API_KEY és EMAIL_FROM (pl. „Kibent <meghivo@kibent.hu>”; a feladó
 * domainjét a Resendben hitelesíteni kell). Ha nincs beállítva, nem küld semmit.
 */
export type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// --- Márka ---------------------------------------------------------------------
const C = { ink: "#000000", cotton: "#FCFAFF", butter: "#FFE27A", pink: "#FFB9DA", lilac: "#F1EAFF", muted: "#5B5866" };
// Webes betűk helyett biztonságos tartalék: a legtöbb levelező nem tölt be webfontot.
const SERIF = "'Bodoni Moda', Didot, 'Bodoni 72', Georgia, 'Times New Roman', serif";
const SANS = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";

type LayoutInput = {
  /** A levelezőlista-előnézetben megjelenő rövid szöveg. */
  preheader: string;
  title: string;
  /** Már escape-elt HTML. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Kiemelt kód (pl. 6 jegyű OTP). */
  code?: string;
  /** Apró betűs megjegyzés a kártya alján (escape-elt HTML). */
  footnoteHtml?: string;
};

/** Közös, táblázatos (levelezőkompatibilis) keret a Kibent arculatával. */
export function emailLayout({ preheader, title, bodyHtml, cta, code, footnoteHtml }: LayoutInput): string {
  const base = siteUrl();
  const button = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px"><tr><td style="border-radius:999px;background:${C.ink}">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;margin:0 4px 4px 0;padding:14px 28px;border:2px solid ${C.ink};border-radius:999px;background:${C.butter};color:${C.ink};font-family:${SANS};font-weight:700;font-size:16px;letter-spacing:.2px;text-decoration:none">${escapeHtml(cta.label)}</a>
      </td></tr></table>`
    : "";
  const codeBlock = code
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 6px"><tr><td style="border-radius:16px;background:${C.ink}">
        <div style="margin:0 5px 5px 0;padding:16px 26px;border:2px solid ${C.ink};border-radius:16px;background:${C.butter};font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${C.ink}">${escapeHtml(code)}</div>
      </td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cotton};color:${C.ink}">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.cotton}">
    <tr><td align="center" style="padding:36px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
        <tr><td style="padding:0 0 22px">
          <a href="${base}" style="text-decoration:none"><img src="${base}/brand/kibent-logo.png" width="190" height="32" alt="Kibent" style="display:block;border:0;height:32px;width:190px"></a>
        </td></tr>
        <tr><td style="border-radius:22px;background:${C.ink}">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 7px 7px 0;border:2px solid ${C.ink};border-radius:20px;background:#ffffff">
            <tr><td style="padding:0;border-bottom:2px solid ${C.ink};border-radius:18px 18px 0 0;background:${C.pink};height:12px;line-height:12px;font-size:0">&nbsp;</td></tr>
            <tr><td style="padding:30px 30px 28px">
              <h1 style="margin:0 0 14px;font-family:${SERIF};font-size:32px;line-height:1.1;font-weight:800;color:${C.ink}">${escapeHtml(title)}</h1>
              <div style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink}">${bodyHtml}</div>
              ${codeBlock}
              ${button}
              ${footnoteHtml ? `<p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.muted}">${footnoteHtml}</p>` : ""}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">
          <span style="font-family:${SERIF};font-style:italic;font-weight:700;color:${C.ink}">Kibent</span> – ki van bent ma? Csapatnaptár hibrid és remote csapatoknak.<br>
          Ha nem számítottál erre a levélre, nyugodtan hagyd figyelmen kívül.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// --- Küldés --------------------------------------------------------------------
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    });
    if (!res.ok) {
      console.error("[email] Resend hiba", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email] küldési hiba", error);
    return { sent: false, reason: "failed" };
  }
}

// --- Sablonok ------------------------------------------------------------------
export type EmailContent = { subject: string; html: string; text: string };

export function invitationEmail(input: {
  companyName: string;
  inviterName: string;
  url: string;
  expiresInDays: number;
}): EmailContent {
  const company = escapeHtml(input.companyName);
  const inviter = escapeHtml(input.inviterName);
  return {
    subject: `Meghívó: ${input.companyName} csapatnaptára`,
    html: emailLayout({
      preheader: `${input.inviterName} meghívott a(z) ${input.companyName} csapatába.`,
      title: `Gyere, a(z) ${input.companyName} csapata vár`,
      bodyHtml: `<p style="margin:0">${inviter} meghívott a Kibentbe, ahol a(z) <strong>${company}</strong> csapata látja, ki dolgozik az irodában, ki otthonról, és ki van szabadságon.</p>`,
      cta: { label: "Csatlakozom a csapathoz", url: input.url },
      footnoteHtml: `Regisztrálj vagy lépj be ezzel az email címmel, és automatikusan bekerülsz a csapatba. A meghívó ${input.expiresInDays} napig érvényes.<br>Ha a gomb nem működik: <a href="${escapeHtml(input.url)}" style="color:${C.ink};word-break:break-all">${escapeHtml(input.url)}</a>`,
    }),
    text: `${input.inviterName} meghívott a(z) ${input.companyName} csapatnaptárába a Kibentben.

Csatlakozás: ${input.url}

Regisztrálj vagy lépj be ezzel az email címmel, és automatikusan bekerülsz a csapatba. A meghívó ${input.expiresInDays} napig érvényes.`,
  };
}

const OTP_COPY: Record<string, { subject: string; title: string; lead: string }> = {
  "email-verification": {
    subject: "Erősítsd meg az email címed",
    title: "Már csak egy kód kell",
    lead: "Írd be ezt a kódot a Kibentben, és kész is a fiókod.",
  },
  "sign-in": {
    subject: "A belépő kódod",
    title: "Itt a belépő kódod",
    lead: "Írd be ezt a kódot a belépéshez. Jelszó nem kell hozzá.",
  },
  "forget-password": {
    subject: "Jelszó visszaállítása",
    title: "Új jelszót kértél",
    lead: "Ezzel a kóddal állíthatsz be új jelszót.",
  },
  "change-email": {
    subject: "Email cím módosítása",
    title: "Megerősítés kell",
    lead: "Ezzel a kóddal erősítheted meg az új email címedet.",
  },
};

export function otpEmail(input: { code: string; type: string; expiresAt?: string | null }): EmailContent {
  const copy = OTP_COPY[input.type] ?? OTP_COPY["sign-in"]!;
  const minutes = input.expiresAt
    ? Math.max(1, Math.round((new Date(input.expiresAt).getTime() - Date.now()) / 60_000))
    : null;
  const validity = minutes ? `A kód ${minutes} percig érvényes.` : "A kód néhány percig érvényes.";
  return {
    subject: `${copy.subject}: ${input.code}`,
    html: emailLayout({
      preheader: `${copy.lead} Kód: ${input.code}`,
      title: copy.title,
      bodyHtml: `<p style="margin:0">${escapeHtml(copy.lead)}</p>`,
      code: input.code,
      footnoteHtml: `${validity} Senkinek ne add tovább – a Kibent soha nem kéri el tőled a kódot.`,
    }),
    text: `${copy.title}\n\n${copy.lead}\n\nKód: ${input.code}\n\n${validity}`,
  };
}

export function magicLinkEmail(input: { url: string; type?: string | null }): EmailContent {
  const reset = !!input.type && /reset|password/i.test(input.type);
  const subject = reset ? "Jelszó visszaállítása" : "A belépő linked";
  const title = reset ? "Új jelszót kértél" : "Egy kattintás, és bent vagy";
  const lead = reset
    ? "Kattints a gombra, és állíts be új jelszót."
    : "Kattints a gombra a belépéshez. Jelszó nem kell hozzá.";
  return {
    subject,
    html: emailLayout({
      preheader: lead,
      title,
      bodyHtml: `<p style="margin:0">${escapeHtml(lead)}</p>`,
      cta: { label: reset ? "Új jelszó beállítása" : "Belépés a Kibentbe", url: input.url },
      footnoteHtml: `A link rövid ideig érvényes, és csak egyszer használható.<br>Ha a gomb nem működik: <a href="${escapeHtml(input.url)}" style="color:${C.ink};word-break:break-all">${escapeHtml(input.url)}</a>`,
    }),
    text: `${title}\n\n${lead}\n\n${input.url}`,
  };
}

/** Meghívó küldése (a meghívó funkció használja). */
export async function sendInvitationEmail(input: {
  to: string;
  companyName: string;
  inviterName: string;
  url: string;
  expiresInDays: number;
}): Promise<EmailResult> {
  return sendEmail({ to: input.to, ...invitationEmail(input) });
}
